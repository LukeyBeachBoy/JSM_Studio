"""Locate native setting consumers for semantic/chord applicability review.

Registration alone does not prove that a runtime reads a chorded value. These
are call-site candidates, not an automatic verdict: helpers with variable IDs,
aliases and driver boundaries still need code review and runtime tests.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'JoyShockMapper/JoyShockMapper/src'
PATTERNS = {
    'directGlobal': re.compile(r'SettingsManager::get(?:V)?<[^>]+>\(\s*SettingID::([A-Z0-9_]+)\s*\)\s*->\s*value\('),
    'contextGetter': re.compile(r'getSetting(?:<[^>]+>)?\(\s*SettingID::([A-Z0-9_]+)'),
}


def inventory():
    spec = importlib.util.spec_from_file_location('registrations', ROOT / 'scripts/audit-jsm-settings.py')
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    commands = {entry['name']: entry for entry in audit.inventory()['settings']}
    reads = {}
    for path in sorted(SOURCE.rglob('*.cpp')):
        source = path.read_text(encoding='utf-8-sig')
        for kind, pattern in PATTERNS.items():
            for match in pattern.finditer(source):
                name = match.group(1)
                entry = reads.setdefault(name, {'directGlobal': [], 'contextGetter': []})
                entry[kind].append(f'{path.relative_to(ROOT).as_posix()}:{source.count(chr(10), 0, match.start()) + 1}')
    for name, entry in reads.items():
        registration = commands.get(name)
        entry['sameNameRegistrationChordable'] = any(site.get('chordable') for site in registration['registrations']) if registration else None
    return dict(sorted(reads.items()))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    reads = inventory()
    report = {'note': __doc__.strip(), 'settings': reads}
    if args.write:
        (ROOT / 'docs/jsm-setting-runtime-reads.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    candidates = [name for name, entry in reads.items() if entry['sameNameRegistrationChordable'] and entry['directGlobal'] and not entry['contextGetter']]
    print(json.dumps({'literalSettingConsumers': len(reads), 'chordableGlobalOnlyCandidates': candidates}, indent=2))
