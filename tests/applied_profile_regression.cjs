const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const source = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src/utils/appliedProfile.ts', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const {appliedProfileLabel, activeControllerProfilePath, resolveAppliedProfile} = exported;
const globalPath = 'profiles-library/applied-preview.txt';
assert.equal(activeControllerProfilePath({ activeProfile: globalPath, devices: [{ activeProfile: 'profiles-library/Desktop.txt' }] }), 'profiles-library/Desktop.txt');
assert.equal(activeControllerProfilePath({ activeProfile: globalPath, devices: [{ activeProfile: 'profiles-library/Quick Access Chord.txt' }] }), 'profiles-library/Quick Access Chord.txt');
for (const activeProfile of [undefined, null, '', '  ']) {
  assert.equal(activeControllerProfilePath({ activeProfile: globalPath, devices: [{ activeProfile }] }), globalPath);
}
assert.equal(activeControllerProfilePath({ activeProfile: globalPath, devices: [{ activeProfile: 'profiles-library/Gamepad.txt' }, { activeProfile: 'profiles-library/Desktop.txt' }] }), 'profiles-library/Gamepad.txt', 'only the selected controller drives the status');
assert.equal(activeControllerProfilePath(null), '');
for (const preview of ['applied-preview', 'profiles-library/applied-preview.txt', 'C:\\profiles-library\\APPLIED-PREVIEW.TXT']) {
  assert.equal(appliedProfileLabel(preview, 'Cyberpunk'), 'Cyberpunk');
}
assert.equal(appliedProfileLabel('profiles-library/The Finals.txt', 'Cyberpunk'), 'The Finals', 'real runtime auto-switch wins');
assert.equal(appliedProfileLabel(undefined, 'Cyberpunk'), 'Cyberpunk');
assert.equal(appliedProfileLabel('', 'Cyberpunk'), 'Cyberpunk');
assert.equal(appliedProfileLabel('applied-preview', null), null, 'never substitute the currently edited profile');
for (const nav of ['AppNavigation.txt', 'C:\\Users\\x\\JSM\\AppNavigation.txt', 'appnavigation']) {
  assert.equal(appliedProfileLabel(nav, 'Cyberpunk'), 'Cyberpunk', "Studio's navigation profile is never shown as applied");
}
console.log('PASS: preview telemetry shows the actual applied name, with real auto-switch names preserved');
const slots = [{ id: 1, profileName: 'Cyberpunk' }, { id: 2, profileName: 'Desktop' }];
for (const path of [
  'profiles-library/.slots/slot-1.txt',
  'profiles-library/.layers/slot-1/0-Driving.txt',
  'profiles-library/.layers/slot-1/type-25-device-abcd/19645443654666599-Driving + Weapons.txt',
  'C:\\Users\\test\\runtime\\profiles-library\\.layers\\slot-1\\type-25\\19645443654666599-Weapons.txt',
]) assert.deepEqual(resolveAppliedProfile(path, 'Desktop', slots), { name: 'Cyberpunk', readPath: 'profiles-library/.slots/slot-1.txt' });
assert.deepEqual(resolveAppliedProfile('profiles-library/.slots/slot-1.txt', 'Cyberpunk', slots), { name: 'Cyberpunk', readPath: 'profiles-library/.slots/slot-1.txt' }, 'compare the running snapshot even when source names match');
assert.equal(appliedProfileLabel('profiles-library/.slots/slot-2.txt', 'Cyberpunk', slots), 'Desktop');
assert.equal(appliedProfileLabel('profiles-library/.slots/slot-3.txt', 'Cyberpunk', slots), null, 'an unresolved slot must not borrow another controller config');
assert.equal(appliedProfileLabel('profiles-library/slot-1.txt', 'Cyberpunk', slots), 'slot-1', 'real user filenames remain valid');
assert.equal(appliedProfileLabel('profiles-library/19645443654666599.txt', 'Cyberpunk', slots), '19645443654666599');
for (const scope of ['', 'type-25/', 'type-25-device-abcd/']) {
  assert.deepEqual(resolveAppliedProfile(`profiles-library/.layers/Cyberpunk/${scope}19645443654666599-Driving.txt`, 'Desktop', slots), { name: 'Cyberpunk', readPath: 'profiles-library/Cyberpunk.txt' });
  assert.deepEqual(resolveAppliedProfile(`profiles-library/.layers/applied-preview/${scope}19645443654666599-Driving.txt`, 'Cyberpunk', slots), { name: 'Cyberpunk', readPath: null });
}
assert.equal(appliedProfileLabel('profiles-library/.layers/unrecognized.txt', 'Cyberpunk', slots), null);
console.log('PASS: slots and scoped layer stacks resolve source identity without losing snapshot freshness');
