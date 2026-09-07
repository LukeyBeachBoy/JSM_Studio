const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const app = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(app, 'node_modules/typescript'))
const source = fs.readFileSync(path.join(app, 'src/utils/gripCalibration.ts'), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const context = { exports: {} }
vm.runInNewContext(compiled, context)
const { gripRangePercent, gripGuardPercent, gripRangeRaw, gripGuardRaw } = context.exports
assert.equal(gripRangePercent(-1), undefined)
assert.equal(gripGuardPercent(-1), undefined)
assert.equal(gripRangeRaw(''), '')
assert.equal(gripGuardRaw(''), '')
assert.equal(gripRangeRaw('0'), '400')
assert.equal(gripRangeRaw('100'), '25')
assert.equal(gripGuardRaw('0'), '100')
assert.equal(gripGuardRaw('100'), '25')
assert.equal(gripRangePercent(100), 80) // Steam default threshold
assert.equal(gripGuardPercent(80), 27) // Steam default hysteresis
for (let percent = 0; percent <= 100; percent++) {
  assert.ok(Math.abs(gripRangePercent(Number(gripRangeRaw(String(percent)))) - percent) <= 1)
  assert.ok(Math.abs(gripGuardPercent(Number(gripGuardRaw(String(percent)))) - percent) <= 1)
  if (percent) {
    assert.ok(Number(gripRangeRaw(String(percent))) <= Number(gripRangeRaw(String(percent - 1))))
    assert.ok(Number(gripGuardRaw(String(percent))) <= Number(gripGuardRaw(String(percent - 1))))
  }
}
console.log('PASS: grip slider direction, Steam defaults, endpoints, round trips, unset values')
