const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const source = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src/utils/appliedProfile.ts', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const {appliedProfileLabel, activeControllerProfilePath} = exported;
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
