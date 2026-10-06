import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


audit = load('audit', 'scripts/audit-jsm-settings.py')
coverage = load('coverage', 'scripts/jsm-coverage-contract.py')
inventory = audit.inventory()
contract = json.loads(coverage.CONTRACT.read_text(encoding='utf-8'))
assert not coverage.check(inventory, contract)
assert len(inventory['dynamicBindings']) == 5, 'All physical, generic/left/right pad and stick menu registrations must be inventoried'
assert inventory['unregisteredSettingIds'] == ['STICKLIKE_FACTOR']
assert any(e['name'] == 'GYRO_SENS' and len(e['registrations']) == 2 for e in inventory['settings'])
assert any(e['name'] == 'AUTOLOAD' for e in inventory['settings']), 'Pre-constructed commands count'
assert 'PS_MOTION' in inventory['enumValues']['GyroOutput']
assert 'RIGHT_WIND_X' in inventory['enumValues']['StickMode']
assert inventory['enumValues']['GridShape'] == ['RECTANGLE', 'FOUR_WAY', 'RADIAL', 'EIGHT_WAY', 'INVALID']
assert 'GALLOPING' in inventory['enumValues']['AdaptiveTriggerMode']
assert inventory['enumValues']['VirtualMenuSource'][-2:] == ['ABXY', 'COUNT']
assert 'OnRelease' in inventory['enumValues']['BtnEvent']
assert inventory['enumSources']['AdaptiveTriggerMode'].endswith('/JslWrapper.h')
consumers = load('consumers', 'scripts/audit-jsm-setting-reads.py').inventory()
for name in ['ONE_EURO_MIN_CUTOFF', 'ONE_EURO_SPEED_COEFF']:
    assert consumers[name]['contextGetter'], f'{name}: held gyro tuning must have a controller-context consumer'
assert audit.enums('enum class Inline : unsigned char { First = 0, Second, INVALID };')['Inline'] == ['First', 'Second', 'INVALID']
source = audit.SOURCE.read_text(encoding='utf-8-sig')
added = audit.inventory(source + '\ncommandRegistry.add(new JSMMacro("NEW_GAMEPLAY_SETTING"));\n')
assert 'NEW_GAMEPLAY_SETTING: no declared GUI intent' in coverage.check(added, contract)
try:
    audit.inventory(source + '\ncommandRegistry.add(unknownFactory());\n')
    raise AssertionError('Unknown constructor must fail closed')
except ValueError as error:
    assert 'Unresolved command registrations' in str(error)
comment = audit.inventory(source + '\n// commandRegistry.add(new JSMMacro("COMMENT_ONLY"));\n')
assert not any(e['name'] == 'COMMENT_ONLY' for e in comment['settings'])
print('PASS: actual registrations, aliases, dynamic families, enums, drift detection and fail-closed extraction')
