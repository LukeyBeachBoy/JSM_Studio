"""Fail on unreviewed native mode values, including nested/inline enums."""
from pathlib import Path
import importlib.util
import json

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('audit', ROOT / 'scripts/audit-jsm-settings.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)
inventory = audit.inventory()
intent = json.loads((ROOT / 'docs/jsm-enum-ui-intent.json').read_text(encoding='utf-8'))
assert set(inventory['enumValues']) == set(intent), 'New/removed native enum requires an intentional graphical or internal disposition'
count = 0
for name, values in inventory['enumValues'].items():
    entry = intent[name]
    assert entry['scope'] in {'USER', 'INTERNAL', 'DELEGATED'}, name
    assert set(values) == set(entry['values']), f'{name}: changed native values require review'
    if entry['scope'] == 'USER':
        assert (ROOT / entry['editor']).is_file(), name
        for value, handling in entry['values'].items():
            assert handling['status'] in {'COMPLETE', 'PARTIAL', 'MISSING', 'INTERNAL', 'LEGACY'}, (name, value)
            assert len(handling['reason'].strip()) > 20, (name, value)
            count += 1
    else:
        assert len(entry['reason'].strip()) > 20, name
assert intent['AdaptiveTriggerMode']['values']['RESISTANCE_RAW']['status'] == 'INTERNAL'
assert intent['ControllerOrientation']['values']['JOYCON_SIDEWAYS']['status'] == 'PARTIAL'
assert intent['HapticEffect']['values']['NOISE']['status'] == 'PARTIAL'
print(f'PASS: {len(intent)} native enums and {count} user-facing enum values/sentinels have explicit handling intent; mode declarations are not runtime verification')
