import importlib.util
import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'scripts/import-cyberpunk-rewasd.py'
spec = importlib.util.spec_from_file_location('rewasd_import', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def fixture():
    ids = [1, 3, 8, 11, 12, 25, 40, 41, 42, 43]
    masks = [{'id': number, 'set': [{'deviceId': 1, 'buttonId': number}]} for number in ids]
    masks.append({'id': 99, 'set': [{'deviceId': 23, 'buttonId': 4}]})
    def mapping(number, shift=0, kind='single', key=None, jump=None):
        item = {'condition': {'mask': {'id': number, 'activator': {'type': kind}}}}
        if shift:
            item['condition']['shiftId'] = shift
        if jump is not None:
            item['jumpToLayer'] = {'layer': jump}
        else:
            item['macros'] = [{'keyboard': {'description': 'DIK_' + key}}]
        return item
    mappings = [mapping(1, key='LCONTROL'), mapping(3, key='SPACE'), mapping(8, key='F'),
                mapping(12, key='R'), mapping(25, key='B'),
                *(mapping(number, key=key) for number, key in zip([40,41,42,43], ['W','S','A','D'])),
                mapping(11, jump=1), mapping(11, shift=1, jump=0),
                mapping(8, shift=1, kind='long', jump=0), mapping(99, jump=2),
                mapping(99, shift=2, kind='release', jump=0)]
    return {'config': {'appName': 'Cyberpunk'}, 'masks': masks, 'mappings': mappings}

source = 'RESET_MAPPINGS\r\nS = X_A\r\n# @controller type-24 S = ENTER\r\n# @controller type-25 JOY1 = Q\r\n# @controller type-25 LEFT_STICK_ROTATION = 15\r\n'
output, report = module.convert(fixture(), source)
assert '# @controller type-25 JOY1 = LCONTROL\r\n' in output
assert '# @controller type-25 JOY3 = SPACE\r\n' in output
assert '# @controller type-25 JOY5 = R\r\n' in output
assert '# @controller type-25 JOY26 = B\r\n' in output
assert '# @controller type-25 LEFT_STICK_ROTATION = 15\r\n' in output
assert '# @controller type-25 VIRTUAL_MENUS = HEX:\r\n' in output
strip_scope = lambda text: ''.join(line for line in text.splitlines(keepends=True) if not module.SCOPE.match(line))
assert strip_scope(source) == strip_scope(output), 'Other controllers and the shared layout must be preserved exactly'
assert '# @controller type-25 # @layer-action JOY25 = toggle cyborg-driving' in output
assert '# @controller type-25 # @layer-action MOUSE_BACK = hold cyborg-weapons' in output
layers = [json.loads(line.split('# @layer ',1)[1]) for line in output.splitlines() if '# @layer {' in line]
driving = next(layer for layer in layers if layer['id'] == 'cyborg-driving')['overrides']
assert driving['LEFT_STICK_MODE'] == 'LEFT_STICK'
assert all(driving[key] == 'NONE' for key in ['LUP','LDOWN','LLEFT','LRIGHT'])
assert driving['JOY9'] == '!F\\ "LAYER_REMOVE cyborg-driving"_'
assert len(report['layerTransitions']) == 5
bad = fixture(); bad['mappings'][0]['macros'][0]['keyboard']['description'] = 'DIK_UNSUPPORTED'
try:
    module.convert(bad, source)
except ValueError:
    pass
else:
    raise AssertionError('Unsupported mappings must not be silently discarded')
print('PASS: physical-position conversion, source preservation, stick fit, Driving/Weapons transitions, long-press action, unsupported-key rejection')
