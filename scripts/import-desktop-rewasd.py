"""Import the inspected reWASD Desktop Cyborg layout without changing other controllers."""
import importlib.util
import json
import re
from pathlib import Path

spec = importlib.util.spec_from_file_location('cyborg', Path(__file__).with_name('import-cyberpunk-rewasd.py'))
cyborg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cyborg)
KEYS = {**cyborg.KEYS, 'LWIN': 'LWINDOWS', 'SYSRQ': 'SCREENSHOT', 'F9': 'F9'}


def convert(export, existing):
    if export['config']['appName'].lower() != 'desktop':
        raise ValueError('Expected Desktop export')
    if re.search(r'#\s*@controller\s+type-25-device-', existing):
        raise ValueError('Review instance overrides before replacing the model layout')
    masks = {m['id']: m['set'] for m in export['masks']}
    bindings = {**{f'JOY{i}': 'NONE' for i in range(1, 33)},
                **{key: 'NONE' for key in cyborg.SPECIAL.values()}}
    labels, imported, skipped, empty = {}, [], [], []
    for item in export['mappings']:
        condition = item['condition']
        if condition.get('shiftId', 0) or 'jumpToLayer' in item:
            raise ValueError('Unexpected layer mapping')
        parts = masks[condition['mask']['id']]
        if len(parts) != 1 or parts[0]['deviceId'] != 1:
            raise ValueError('Unexpected device or chord')
        number = parts[0]['buttonId']
        command = cyborg.SPECIAL.get(number) or (f'JOY{cyborg.POSITIONS[number]}' if number in cyborg.POSITIONS else None)
        macros = item.get('macros', [])
        if command is None:
            if number not in {47,48,49,50,51,55,68,69,70,71,91,92,100,101,102,103}:
                raise ValueError(f'Unknown input {number}')
            skipped.append({'input': parts[0]['description'], 'reason': 'Not present on Cyborg'})
            continue
        if macros and all('command' in macro for macro in macros):
            if number != 17 or [macro['command']['id'] for macro in macros] not in ([1],[2]):
                raise ValueError('Unsupported command')
            skipped.append({'input': command, 'reason': 'Gyro on/off; Cyborg has no gyroscope'})
            continue
        activator = condition['mask']['activator']
        if activator['type'] != 'single' or activator['mode'] not in ('hold_until_release', 'onetime'):
            raise ValueError(f'Unsupported activator: {activator}')
        if not macros:
            empty.append({'input': command, 'label': item.get('description', '')})
        else:
            keys=[]
            for macro in macros:
                if set(macro) != {'keyboard'} or 'action' in macro['keyboard']:
                    raise ValueError(f'Unsupported macro: {macro}')
                key=macro['keyboard']['description'].removeprefix('DIK_')
                if key not in KEYS and not (len(key)==1 and key.isalnum()):
                    raise ValueError(f'Unsupported key: {key}')
                keys.append(KEYS.get(key,key))
            bindings[command] = keys[0] if len(keys)==1 else ' '.join(key+'\\' for key in keys)
            if activator['mode']=='onetime':
                bindings[command]=' '.join('!'+key+'\\' for key in keys)
            imported.append({'input':command,'output':bindings[command],'label':item.get('description','')})
        if item.get('description'):
            labels[command]=item['description']
    if {key:bindings[key] for key in ('LUP','LDOWN','LLEFT','LRIGHT')} != dict(zip(('LUP','LDOWN','LLEFT','LRIGHT'), 'WSAD')):
        raise ValueError('Unexpected stick mapping')
    settings={'VIRTUAL_CONTROLLER':'NONE','GYRO_SENS':'0','LEFT_STICK_MODE':'NO_MOUSE','RIGHT_STICK_MODE':'NO_MOUSE','MOTION_STICK_MODE':'NO_MOUSE','VIRTUAL_MENUS':'HEX:'}
    rows=[*(f'{key} = {value}' for key,value in settings.items()),*(f'{key} = {value}' for key,value in bindings.items()),*(f'# @label {key} = {label}' for key,label in labels.items())]
    # Hardware calibration is inherited from the existing global Cyborg preferences.
    # Preserve any explicit per-game geometry choices if this is a re-import.
    for line in existing.splitlines():
        match=re.match(r'^# @controller type-25 (LEFT_STICK_(?:ROTATION|RESTRICTOR_RING|RESTRICTOR_RANGE|CARDINAL_WIDTH|DIRECTION_[A-Z_]+)\s*=.*)$',line)
        if match: rows.append(match[1])
    retained=''.join(line for line in existing.splitlines(keepends=True) if not cyborg.SCOPE.match(line))
    newline='\r\n' if '\r\n' in existing else '\n'
    if retained and not retained.endswith(('\r','\n')): retained+=newline
    result=retained+'# @controller-layout type-25'+newline+newline.join('# @controller type-25 '+row for row in rows)+newline
    return result, {'imported':imported,'unassigned':empty,'inapplicable':skipped,'hardwareFit':'Existing global preferences inherited; no calibration values added'}

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--source',type=Path,required=True);p.add_argument('--existing',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args(); result,report=convert(json.loads(a.source.read_text(encoding='utf-8-sig')),a.existing.read_bytes().decode('utf-8-sig'))
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(result.encode('utf-8'))
    a.output.with_suffix('.import-report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))
