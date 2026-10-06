"""Check explicit graphical handling intent for every native registration.

--init seeds a conservative audit for review, never COMPLETE coverage. Normal
runs fail on added, removed or unclassified commands and missing editor files.
"""
import argparse
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-jsm-settings.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
CONTRACT = ROOT / 'docs/jsm-ui-coverage.json'
VALID = {'COMPLETE', 'PARTIAL', 'MISSING', 'INTERNAL', 'LEGACY', 'PLATFORM-SPECIFIC', 'HARDWARE-SPECIFIC'}


def check(inventory, contract):
    actual = {e['name'] for e in inventory['settings']}
    declared = set(contract)
    errors = [f'{name}: no declared GUI intent' for name in sorted(actual - declared)]
    errors += [f'{name}: backend registration removed' for name in sorted(declared - actual)]
    for name, intent in contract.items():
        if intent.get('status') not in VALID or not intent.get('reason'):
            errors.append(f'{name}: invalid classification/reason')
        if intent.get('status') == 'COMPLETE' and (not intent.get('editors') or not intent.get('verification')):
            errors.append(f'{name}: COMPLETE needs editors and verification')
        for editor in intent.get('editors', []):
            if not (ROOT / editor).is_file():
                errors.append(f'{name}: missing editor {editor}')
    return errors


def render(inventory, contract):
    lines = ['# JSM graphical setting coverage', '',
             'Generated from actual C++ registrations and an explicit handling contract. Run `python scripts/jsm-coverage-contract.py --write` after reviewing changes.', '',
             '**This is an in-progress audit, not a claim of complete UI coverage.** PARTIAL includes existing UI references that still need control/dependency/default and round-trip review. MISSING means no graphical control has been established. Raw config editing never counts. Hardware applicability is described independently of completeness.', '',
             'The inventory also extracts native mode enums and all dynamic binding registration sites. `STICKLIKE_FACTOR` is an enum-only ID with no registered assignment; do not add a fake editor. The physical and dynamic Mapping families use the shared action editor, with capability-specific review still required.', '',
             '| Command | Type / default | Classification | Graphical handling / remaining work |',
             '| --- | --- | --- | --- |']
    for entry in inventory['settings']:
        intent = contract[entry['name']]
        reg = entry['registrations'][0]
        typ = reg['type'] or entry['kind']
        default = (reg['default'] or 'command / alias').replace('|', '\\|').replace('\n', ' ')
        links = ', '.join(f'[{Path(e).name}](../{e})' for e in intent.get('editors', []))
        lines.append(f"| `{entry['name']}` | {typ}: `{default}` | {intent['status']} | {intent['reason']} {links} |")
    lines += ['', '## Dynamic bindings', '', '| Registration site | Expression | Handling |', '| --- | --- | --- |']
    for binding in inventory['dynamicBindings']:
        lines.append(f"| main.cpp:{binding['line']} | `{binding['expression']}` | Shared BindingEditor / source region cards; audit reachability and event semantics separately |")
    lines += ['', '## Runtime consumer audit', '',
              '[Native setting read sites](jsm-setting-runtime-reads.json) distinguish literal controller-context and direct-global consumers. Helper IDs and aliases still require manual review. The SDL hardware boundary currently reads grip feedback, grip firmware tuning and pad rotation globally despite accepting registered setting chords. Pad mounting correction is explicitly device-global; feedback still needs context work before claiming held overrides. Gyro One Euro tuning now resolves through the controller context; its enable command and lifecycle settings remain global.']
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--init', action='store_true')
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    inventory = audit.inventory()
    if args.init:
        if CONTRACT.exists():
            raise RuntimeError('Refusing to overwrite reviewed coverage contract')
        evidence = json.loads((ROOT / 'docs/jsm-backend-inventory.json').read_text(encoding='utf-8'))
        contract = {}
        for e in evidence['settings']:
            editors = [p.split(':')[0] for p in e['uiEvidence'] if '/components/' in p]
            contract[e['name']] = {
                'status': 'PARTIAL' if editors else 'MISSING',
                'reason': 'Existing graphical references; mode applicability, labels, defaults, validation and round-trip require review.' if editors else 'No dedicated graphical handling established; assess native semantics and expose contextually.',
                'editors': editors[:3], 'verification': []}
        for name in ['HELP', 'CLEAR', 'QUIT', 'README', 'TELEMETRY_ENABLED', 'TELEMETRY_PORT', 'HIDE_MINIMIZED', 'JSM_DIRECTORY', 'RECONNECT_CONTROLLERS', 'WHITELIST_ADD', 'WHITELIST_REMOVE', 'WHITELIST_SHOW', 'AUTOLOAD', 'AUTOCONNECT']:
            contract[name] = {'status': 'INTERNAL', 'reason': 'Runtime/service lifecycle or diagnostics command; native app services own it rather than gameplay configuration.', 'editors': [], 'verification': []}
        CONTRACT.write_text(json.dumps(contract, indent=2) + '\n', encoding='utf-8')
    else:
        contract = json.loads(CONTRACT.read_text(encoding='utf-8'))
    errors = check(inventory, contract)
    if errors:
        raise RuntimeError('\n'.join(errors))
    if args.write:
        (ROOT / 'docs/jsm-setting-ui-coverage.md').write_text(render(inventory, contract), encoding='utf-8')
    counts = {s: sum(e['status'] == s for e in contract.values()) for s in sorted(VALID)}
    print(f'PASS: {len(contract)} native commands have declared GUI intent: {counts}')


if __name__ == '__main__':
    main()
