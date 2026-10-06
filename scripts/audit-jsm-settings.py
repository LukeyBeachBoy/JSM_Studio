"""Inventory actual command registrations, not a hand-picked list of constants.

Reads C++ constructors with balanced delimiters, links assignments to their
variables, and fails closed on registrations it cannot resolve. No compiler or
running controller is needed. UI evidence is a candidate, never proof of coverage.
"""
from pathlib import Path
import argparse
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'JoyShockMapper/JoyShockMapper/src/main.cpp'
HEADER = ROOT / 'JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h'
GUI = ROOT / 'JSM_GUI/jsm_gui_tauri/src'


def mask_comments(text):
    pattern = r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    return re.sub(pattern, lambda m: re.sub(r'[^\n]', ' ', m[0]) if m[0].startswith(('/',)) else m[0], text)


def arguments(text, start):
    """Return constructor contents and end offset, respecting quoted strings."""
    depth, quote, escape = 1, '', False
    for at in range(start + 1, len(text)):
        c = text[at]
        if quote:
            if escape:
                escape = False
            elif c == '\\':
                escape = True
            elif c == quote:
                quote = ''
        elif c in '\"\'':
            quote = c
        elif c == '(':
            depth += 1
        elif c == ')':
            depth -= 1
            if not depth:
                return text[start + 1:at], at + 1
    raise ValueError(f'Unbalanced constructor at {start}')


def enums(header):
    # Values can be mixed-case, inline, or use a multiword underlying type.
    # Enumerators in the project's headers use scalar constant expressions.
    pattern = r'\benum\s+(?:class\s+)?(\w+)(?:\s*:\s*[A-Za-z_]\w*(?:\s+[A-Za-z_]\w*)*)?\s*\{([^}]+)\}'
    result = {}
    for match in re.finditer(pattern, mask_comments(header)):
        values = re.findall(r'(?:^|,)\s*([A-Za-z_]\w*)\s*(?:=[^,]*)?(?=,|$)', match[2])
        if not values:
            raise ValueError(f'Unresolved enum values: {match[1]}')
        result[match[1]] = values
    return result


def inventory(source=None, header=None, extra_headers=None):
    original = source if source is not None else SOURCE.read_text(encoding='utf-8-sig')
    text = mask_comments(original)
    header = header if header is not None else HEADER.read_text(encoding='utf-8-sig')
    enum_values = enums(header)
    enum_sources = {name: HEADER.relative_to(ROOT).as_posix() for name in enum_values}
    # Registration types also live in source-specific headers: adaptive
    # triggers, grid shapes, sound actuators and menu/binding semantics.
    if extra_headers is None:
        extra_headers = {path.relative_to(ROOT).as_posix(): path.read_text(encoding='utf-8-sig')
                         for path in sorted(HEADER.parent.rglob('*'))
                         if path.suffix in {'.h', '.hpp'} and path != HEADER}
    for path, contents in extra_headers.items():
        for name, values in enums(contents).items():
            if name in enum_values and enum_values[name] != values:
                raise ValueError(f'Ambiguous enum {name}: {enum_sources[name]} and {path}')
            enum_values[name] = values
            enum_sources[name] = path
    variables = []
    for m in re.finditer(r'auto\s+(\w+)\s*=\s*new\s+(JSMSetting|JSMVariable)<([^>]+)>\s*\(', text):
        args, end = arguments(text, m.end() - 1)
        sid = re.search(r'SettingID::(\w+)', args)
        # Global JSMVariable constructors do not carry an ID. SettingsManager::add does.
        tail = text[end:text.find('commandRegistry', end)]
        if not sid:
            sid = re.search(r'SettingsManager::add\(SettingID::(\w+)\s*,\s*' + m[1] + r'\)', tail)
        variables.append({'variable': m[1], 'id': sid[1] if sid else None,
                          'type': m[3], 'default': args.split(',', 1)[1].strip() if m[2] == 'JSMSetting' else args.strip(),
                          'chordable': m[2] == 'JSMSetting', 'at': m.start(), 'end': end})

    entries = {}
    dynamic = []
    unresolved = []
    for m in re.finditer(r'(?:commandRegistry|registry)(?:->|\.)add\s*\(', text):
        body, end = arguments(text, m.end() - 1)
        ctor = re.search(r'new\s+(\w+)(?:<([^>]+)>)?\s*\(', body)
        if not ctor and re.fullmatch(r'\w+', body.strip()):
            # A command may be constructed first to attach listeners later.
            definition = re.search(r'auto\s+\*?' + re.escape(body.strip()) + r'\s*=\s*(new[^;]+);', text[:m.start()])
            if definition:
                body = definition[1]
                ctor = re.search(r'new\s+(\w+)(?:<([^>]+)>)?\s*\(', body)
        if not ctor:
            unresolved.append({'line': text.count('\n', 0, m.start()) + 1, 'expression': body})
            continue
        args, _ = arguments(body, ctor.end() - 1)
        kind, typ = ctor[1], ctor[2]
        line = text.count('\n', 0, m.start()) + 1
        literals = re.findall(r'"([A-Z][A-Z0-9_]*)"', args)
        sid = re.search(r'SettingID::(\w+)', args)
        ref = re.search(r'\*(\w+)', args)
        variable = next((v for v in reversed(variables) if ref and v['variable'] == ref[1] and v['at'] < m.start()), None)
        name = literals[0] if literals else sid[1] if sid else variable['id'] if variable else None
        if typ == 'Mapping' and not name:
            dynamic.append({'line': line, 'expression': args, 'type': 'Mapping'})
            continue
        if kind == 'HelpCmd':
            name = 'HELP'
        if not name:
            unresolved.append({'line': line, 'expression': args, 'constructor': kind})
            continue
        entry = entries.setdefault(name, {'name': name, 'kind': 'macro' if kind in ('JSMMacro', 'HelpCmd') else 'binding' if typ == 'Mapping' else 'setting', 'registrations': []})
        help_strings = re.findall(r'"((?:\\.|[^"\\])*)"', body[body.find('setHelp'):]) if 'setHelp' in body else []
        entry['registrations'].append({'line': line, 'constructor': kind, 'type': typ or (variable['type'] if variable else kind),
                                      'variable': variable['variable'] if variable else None,
                                      'default': variable['default'] if variable else None,
                                      'chordable': variable['chordable'] if variable else kind in ('GyroButtonAssignment', 'GyroSensAssignment', 'StickDeadzoneAssignment'),
                                      'help': ''.join(help_strings)})
    if unresolved:
        raise ValueError('Unresolved command registrations: ' + json.dumps(unresolved, indent=2))
    registered_ids = {v['id'] for v in variables if v['id']}
    # Aliases have a SettingID but intentionally share a variable.
    registered_ids.update(e['name'] for e in entries.values() if e['kind'] == 'setting')
    unused = sorted(set(enum_values['SettingID']) - registered_ids - set(entries) - {'INVALID', 'SIZE', 'NONE', 'ZERO'})
    return {'settings': sorted(entries.values(), key=lambda e: e['name']), 'dynamicBindings': dynamic,
            'enumValues': enum_values, 'enumSources': enum_sources, 'unregisteredSettingIds': unused,
            'variableCount': len(variables)}


def ui_evidence(name, files):
    matches = []
    for file, lines in files:
        for n, line in enumerate(lines, 1):
            if re.search(r'\b' + re.escape(name) + r'\b', line):
                matches.append(f'{file.relative_to(ROOT).as_posix()}:{n}')
                break
    return matches


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    result = inventory()
    result['source'] = SOURCE.relative_to(ROOT).as_posix()
    result['note'] = 'Static registration inventory. UI references are candidates; a key or help entry does not establish graphical coverage.'
    files = [(f, f.read_text(encoding='utf-8-sig').splitlines()) for f in sorted(GUI.rglob('*'))
             if f.suffix in ('.ts', '.tsx') and 'i18n' not in f.parts and 'dev' not in f.parts]
    for entry in result['settings']:
        entry['uiEvidence'] = ui_evidence(entry['name'], files)
    target = ROOT / 'docs/jsm-backend-inventory.json'
    if args.write:
        target.write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'commands': len(result['settings']), 'variables': result['variableCount'],
                      'dynamicRegistrations': len(result['dynamicBindings']), 'unregisteredSettingIds': result['unregisteredSettingIds'],
                      'noUiReferences': [e['name'] for e in result['settings'] if not e['uiEvidence']]}, indent=2))


if __name__ == '__main__':
    main()
