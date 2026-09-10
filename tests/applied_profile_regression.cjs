const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript');
const source = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src/utils/appliedProfile.ts', 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const exported = {};
new Function('exports', compiled)(exported);
const {appliedProfileLabel} = exported;
for (const preview of ['applied-preview', 'profiles-library/applied-preview.txt', 'C:\\profiles-library\\APPLIED-PREVIEW.TXT']) {
  assert.equal(appliedProfileLabel(preview, 'Cyberpunk'), 'Cyberpunk');
}
assert.equal(appliedProfileLabel('profiles-library/The Finals.txt', 'Cyberpunk'), 'The Finals', 'real runtime auto-switch wins');
assert.equal(appliedProfileLabel(undefined, 'Cyberpunk'), 'Cyberpunk');
assert.equal(appliedProfileLabel('', 'Cyberpunk'), 'Cyberpunk');
assert.equal(appliedProfileLabel('applied-preview', null), null, 'never substitute the currently edited profile');
console.log('PASS: preview telemetry shows the actual applied name, with real auto-switch names preserved');
