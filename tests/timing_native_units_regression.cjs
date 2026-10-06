const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(root, 'node_modules/typescript'))
const modulePath = path.join(root, 'src/utils/timing.ts')
const target = { exports: {} }
const compiled = ts.transpileModule(fs.readFileSync(modulePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
new Function('module', 'exports', compiled)(target, target.exports)
const { timingLines, timingMilliseconds } = target.exports
for (const value of [0, 0.2, 2, 9, 10, 150, 5000]) {
  assert.equal(timingMilliseconds(String(value)), value, 'all native timing magnitudes retain milliseconds')
}
for (const value of ['', 'NaN', 'Infinity', '-1', '2 seconds']) assert.equal(timingMilliseconds(value), null)
const source = '# measured profile\nDBL_PRESS_WINDOW = 150\nDBL_PRESS_WINDOW = 2 # rapid double\nL,HOLD_PRESS_TIME = 200\nsim_press_window = 50\nN = "DBL_PRESS_WINDOW = 999"\nUNKNOWN = unchanged\n'
assert.deepEqual(timingLines(source), [{ key: 'DBL_PRESS_WINDOW', raw: '2' }, { key: 'SIM_PRESS_WINDOW', raw: '50' }])
assert.equal(timingMilliseconds(timingLines(source)[0].raw), 2, 'Move to shared receives 2 ms, never guessed 2000 ms')
assert.ok(!timingLines(source).some(item => item.key === 'HOLD_PRESS_TIME'), 'held timing remains separate from shared/default timing')
const page = fs.readFileSync(path.join(root, 'src/components/TimingPage.tsx'), 'utf8')
assert.match(page, /const ms = timingMilliseconds\(item.raw\)/, 'migration uses the same native-unit parser')
assert.doesNotMatch(page, /value < 10 \? value \* 1000/)
console.log('PASS: native millisecond values, fractional timings, last-assignment precedence, held isolation and safe shared migration')
