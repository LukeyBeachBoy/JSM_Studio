"""Recover a native Cyborg layout from a reWASD Cyborg V2 export.

Only the type-25 rows are replaced. Other layouts remain byte-for-byte intact.
The caller chooses an output path; this script never edits the source export.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

# reWASD's Cyborg V2 physical positions, matched against the native hardware map.
# These are not the generic Xbox names in reWASD's mask descriptions.
POSITIONS = {1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8, 8: 9,
             9: 20, 10: 21, 11: 25, 12: 5, 13: 10, 14: 11, 15: 12,
             16: 13, 17: 14, 18: 15, 19: 16, 20: 17, 23: 23, 24: 24,
             25: 26, 26: 18, 27: 19, 28: 22}
SPECIAL = {33: 'UP', 34: 'DOWN', 35: 'LEFT', 36: 'RIGHT',
           40: 'LUP', 41: 'LDOWN', 42: 'LLEFT', 43: 'LRIGHT'}
KEYS = {'LCONTROL': 'LCONTROL', 'LSHIFT': 'LSHIFT', 'LMENU': 'LALT',
        'RETURN': 'ENTER', 'ESCAPE': 'ESC', 'APOSTROPHE': "'", 'SPACE': 'SPACE',
        'UP': 'UP', 'DOWN': 'DOWN', 'LEFT': 'LEFT', 'RIGHT': 'RIGHT', 'TAB': 'TAB'}
SCOPE = re.compile(r'^\s*#\s*@controller(?:-layout|-pad)?\s+type-25(?:\s|$)')


def convert(export, existing):
    if export['config']['appName'].lower() != 'cyberpunk':
        raise ValueError('Expected the Cyberpunk export')
    masks = {}
    for mask in export['masks']:
        if len(mask['set']) != 1:
            raise ValueError(f"Unsupported input combination: {mask['id']}")
        source = mask['set'][0]
        if source['deviceId'] == 23 and source['buttonId'] == 4:
            command = 'MOUSE_BACK'
        elif source['deviceId'] == 1:
            number = source['buttonId']
            command = SPECIAL.get(number) or f'JOY{POSITIONS[number]}'
        else:
            raise ValueError(f'Unsupported device: {source}')
        masks[mask['id']] = command

    def keys(macros):
        if all('keyboard' in macro for macro in macros):
            keyboard = [macro['keyboard'] for macro in macros]
            def key(item):
                name = item['description'].removeprefix('DIK_')
                if name in KEYS:
                    return KEYS[name]
                if len(name) == 1 and name.isalnum():
                    return name
                raise ValueError(f'Unsupported key: {name}')
            if len(keyboard) == 2 and keyboard[0].get('action') == 'down' and keyboard[1].get('action') == 'up' and key(keyboard[0]) == key(keyboard[1]):
                return '!' + key(keyboard[0]) + '\\'
            if any('action' in item for item in keyboard):
                raise ValueError(f'Unsupported macro sequence: {macros}')
            return key(keyboard[0]) if len(keyboard) == 1 else ' '.join(key(item) + '\\' for item in keyboard)
        if len(macros) == 1 and 'gamepad' in macros[0] and macros[0]['gamepad']['buttonId'] in (40, 41, 42, 43):
            return None  # Four direction assignments are recreated as one analog stick.
        raise ValueError(f'Unsupported macro: {macros}')

    layouts = {0: {}, 1: {}, 2: {}}
    labels = {0: {}, 1: {}, 2: {}}
    jumps, imported = [], []
    for mapping in export['mappings']:
        condition = mapping['condition']
        shift = condition.get('shiftId', 0)
        command = masks[condition['mask']['id']]
        activator = condition['mask']['activator']['type']
        if 'jumpToLayer' in mapping:
            jumps.append((shift, command, activator, mapping['jumpToLayer']['layer']))
            continue
        value = keys(mapping['macros'])
        if value is not None:
            if activator not in ('single', 'start'):
                raise ValueError(f'Unsupported activator: {activator}')
            layouts[shift][command] = value
            if mapping.get('description'):
                labels[shift][command] = mapping['description']
            imported.append({'shift': shift, 'input': command, 'output': value, 'label': mapping.get('description', '')})
    expected_jumps = {(0, 'JOY25', 'single', 1), (1, 'JOY25', 'single', 0),
                      (1, 'JOY9', 'long', 0), (0, 'MOUSE_BACK', 'single', 2),
                      (2, 'MOUSE_BACK', 'release', 0)}
    if set(jumps) != expected_jumps:
        raise ValueError(f'Layer transitions differ from the inspected export: {jumps}')

    rows = []
    def assignment(key, value):
        rows.append(f'{key} = {value}')
    # Eliminate profile-dependent joystick inputs and inherited menu/layer actions.
    for command in [*(f'JOY{n}' for n in range(1, 33)), *SPECIAL.values()]:
        assignment(command, 'NONE')
    for line in existing.splitlines():
        if line.startswith('# @layer '):
            layer = json.loads(line.removeprefix('# @layer '))
            rows.append('# @layer ' + json.dumps({**layer, 'overrides': {}, 'deleted': True}, separators=(',', ':')))
    defaults = {'VIRTUAL_CONTROLLER': 'XBOX', 'GYRO_SENS': '0', 'LEFT_STICK_MODE': 'NO_MOUSE',
                'RIGHT_STICK_MODE': 'NO_MOUSE', 'MOTION_STICK_MODE': 'NO_MOUSE', 'VIRTUAL_MENUS': 'HEX:'}
    # Keep the user's existing hardware fit; do not replace rotation/ring values.
    for key in ['LEFT_STICK_ROTATION', 'LEFT_STICK_RESTRICTOR_RING', 'LEFT_STICK_RESTRICTOR_RANGE',
                'LEFT_STICK_DEADZONE_INNER', 'LEFT_STICK_DEADZONE_OUTER', 'LEFT_STICK_CARDINAL_WIDTH',
                'LEFT_STICK_DIRECTION_HYSTERESIS', 'LEFT_STICK_DIRECTION_DEADZONE', 'LEFT_STICK_DIRECTION_RELEASE_MARGIN']:
        values = re.findall(r'^\s*#\s*@controller type-25 ' + key + r'\s*=\s*([^\r\n#]+)', existing, re.M)
        if values:
            defaults[key] = values[-1].strip()
    for key, value in {**defaults, **layouts[0]}.items():
        assignment(key, value)
    for key, value in labels[0].items():
        assignment('# @label ' + key, value)
    assignment('# @label JOY25', 'Toggle Driving')
    assignment('# @layer-action JOY25', 'toggle cyborg-driving')
    assignment('# @layer-action MOUSE_BACK', 'hold cyborg-weapons')
    assignment('# @layer-action MOUSE_BACK', 'remove cyborg-driving')
    driving = {**layouts[1], 'LEFT_STICK_MODE': 'LEFT_STICK', **{key: 'NONE' for key in ['LUP', 'LDOWN', 'LLEFT', 'LRIGHT']}}
    # Preserve reWASD's immediate F tap and its additional long-press return.
    driving['JOY9'] = '!F\\ "LAYER_REMOVE cyborg-driving"_'
    driving['# @label JOY9'] = 'Exit vehicle · hold to return to on foot'
    weapons = {**layouts[2], 'LEFT_STICK_MODE': 'NO_MOUSE', **{key: layouts[0][key] for key in ['LUP', 'LDOWN', 'LLEFT', 'LRIGHT']}}
    for layer in [{'id': 'cyborg-driving', 'name': 'Driving', 'overrides': driving},
                  {'id': 'cyborg-weapons', 'name': 'Weapons', 'overrides': weapons}]:
        rows.append('# @layer ' + json.dumps(layer, separators=(',', ':')))
    retained = ''.join(line for line in existing.splitlines(keepends=True) if not SCOPE.match(line))
    newline = '\r\n' if '\r\n' in existing else '\n'
    if retained and not retained.endswith(('\r', '\n')):
        retained += newline
    output = retained + '# @controller-layout type-25' + newline + newline.join('# @controller type-25 ' + row for row in rows) + newline
    report = {'importedKeyboardMappings': imported, 'layerTransitions': jumps,
              'sourceStickDefaults': next((hardware.get('default', {}).get('sticks', []) for hardware in export.get('devices', {}).get('hardware', []) if hardware.get('id') == 1), []),
              'physicalPositionMap': POSITIONS, 'notes': [
                  'Analog driving replaces the four virtual-stick direction macros.',
                  'The long F action uses the current JSM hold time; no duration was stored in this export.',
                  'Mouse Back enters Weapons and returns to On foot on release, including from Driving.',
                  'Existing Cyborg rotation and restrictor settings are retained.',
                  'Source stick sensitivity is recorded for reference; JSM retains its native fit and direction thresholds rather than guessing an equivalent reWASD curve.']}
    return output, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--existing', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = args.source.read_bytes()
    result, report = convert(json.loads(source.decode('utf-8-sig')), args.existing.read_bytes().decode('utf-8-sig'))
    report['sourceSha256'] = hashlib.sha256(source).hexdigest()
    report['previousConfigSha256'] = hashlib.sha256(args.existing.read_bytes()).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(result.encode('utf-8'))
    args.output.with_suffix('.import-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'Recreated {len(report["importedKeyboardMappings"])} keyboard mappings, analog Driving, and mouse-Back Weapons: {args.output}')
