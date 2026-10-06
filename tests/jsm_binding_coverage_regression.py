"""Check every exported graphical token with the actual Windows native parser."""
import importlib.util
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('bindings', root / 'scripts/audit-jsm-bindings.py')
bindings = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bindings)
result = bindings.verify()
verified = {row['token']: row for row in result['verifiedWindowsOutputs']}
assert all(verified[f'F{i}']['guiCatalog'] for i in range(13, 25))
assert verified['=']['code'] == verified['+']['code']
assert all(row['code'] != 0 for row in verified.values())
assert 'Toggle' in result['ActionModifier'] and 'ReleasePress' in result['EventModifier']
assert bindings.inventory()['linux']['namedTokens'], 'Platform distinctions must remain inventoried'
assert bindings.coverage_issues(list(verified.values()) + [{'token': 'NEW_BACKEND_OUTPUT', 'code': 65, 'guiCatalog': False}], result['graphicalIntent']) == ['NEW_BACKEND_OUTPUT: no declared graphical output handling']
print('PASS: real native key/Mapping acceptance for all GUI output catalogs, extended keys and activator/platform inventory')
