// Graph inputs must match configured native curves and the selected device.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const APP = path.join(__dirname, '..', 'JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(APP, 'node_modules/typescript'))
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'))
  if (cache.has(file)) return cache.get(file).exports
  const mod = new Module(file); cache.set(file, mod)
  mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
  mod.require = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), /\.(ts|json)$/.test(name) ? name : name + '.ts')) : require(require.resolve(name, { paths: [APP] }))
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file)
  return mod.exports
}
const U = name => load(path.join(APP, 'src/utils', name + '.ts'))
const { effectiveGyroCurveParams: params, readGyroSpeed } = U('gyroSpeed')
const { accelSensitivityAt: at } = U('accelCurve')
const steady = U('gyroSteadiness')
const selection = U('controllerSelection')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
// Curve-form settings are not evidence of increasing sensitivity. The UI must
// not infer that acceleration is active merely from readGyroSpeed.mode.
const flat = 'MIN_GYRO_SENS = 2\nMAX_GYRO_SENS = 2\nMIN_GYRO_THRESHOLD = 5\nMAX_GYRO_THRESHOLD = 75'
assert.equal(readGyroSpeed(flat).mode, 'accel')
near(at(1, params(flat)), 2)
near(at(150, params(flat)), 2)
const falling = flat.replace('MIN_GYRO_SENS = 2', 'MIN_GYRO_SENS = 4')
assert.equal(readGyroSpeed(falling).mode, 'accel')
near(at(1, params(falling)), 4)
near(at(150, params(falling)), 2)
const source = 'MIN_GYRO_SENS = 5 3\nMAX_GYRO_SENS = 21 6\nACCEL_CURVE = QUADRATIC\nMAX_GYRO_THRESHOLD = 80\nGYRO_CUTOFF_RECOVERY = 5\nGYRO_STEADYING_FLOOR = 2 1.5'
near(at(1, params(source)), 2.1739048)
near(at(1, params(source, source, 'y')), 1.58690715)
near(at(80, params(source)), 21)
near(at(1, params(source + '\nGYRO_CUTOFF_SPEED = 2')), 0)
near(at(0, params('GYRO_SENS = 5 3\nGYRO_CUTOFF_RECOVERY = 5\nGYRO_STEADYING_FLOOR = 2 1')), 2)
const borrowed = source + '\nACCEL_CURVE_LINK = GYRO_USES_TOUCHPAD\nTOUCHPAD_ACCEL_CURVE = LINEAR\nTOUCHPAD_ACCEL_MIN_SPEED = 200\nTOUCHPAD_ACCEL_MAX_SPEED = 2200'
near(at(40, params(borrowed)), 13)
near(at(40, params(borrowed, borrowed, 'y')), 4.5)
near(at(40, params(borrowed + '\nMAX_GYRO_SENS = 37 12')), 21)
// A zero time/sample window cannot smooth, even when the threshold is high.
assert.equal(steady.smoothedAt(0, { smoothThreshold: 20, smoothTime: 0, tickMs: 3, decay: false }), 0)
assert.equal(steady.smoothedAt(0, { smoothThreshold: 20, smoothTime: 0, tickMs: 3, decay: true }), 0)
near(steady.smoothedAt(5, { smoothThreshold: 20, smoothTime: .1, tickMs: 3, decay: true }), .5625)
near(steady.euroSmoothedAt(100, 6, .3, 3), 1 / (1 + 2 * Math.PI * 36 * .003))
near(steady.euroSmoothedAt(100, 0, 0, 3), 1)
assert.notEqual(steady.euroSmoothedAt(100, 6, .3, 3), steady.euroSmoothedAt(100, 6, .3, 8))
const a = { handle: 1, type: 24, status: { motion: { omega: 12, sensX: 2, sensY: 3, sampleHz: 250 } } }
const b = { handle: 2, type: 5, status: { motion: { omega: 48, sensX: 7, sensY: 9, sampleHz: 500 } } }
selection.selectController('type-5')
let sample = selection.selectedControllerSample({ omega: 999, sensX: 999, devices: [a, b] })
assert.equal(sample.omega, 48); assert.equal(sample.sensX, 7); assert.equal(sample.devices[0].handle, 2)
assert.equal(sample.sampleHz, 500)
selection.selectController('type-24')
sample = selection.selectedControllerSample({ omega: 999, devices: [a, b] })
assert.equal(sample.omega, 12)
const legacyA = { ...a, status: {} }, legacyB = { ...b, status: {} }
assert.equal(selection.selectedControllerSample({ omega: 999, devices: [legacyA, legacyB] }).omega, undefined)
assert.equal(selection.selectedControllerSample({ omega: 12, devices: [legacyA] }).omega, 12)
selection.selectController('type-5')
assert.equal(selection.selectedControllerSample({ omega: 12, devices: [legacyA] }).omega, undefined, 'offline selection cannot borrow the connected device reading')
assert.equal(selection.selectedControllerSample({ omega: 12, devices: [] }).omega, undefined)
console.log('PASS: effective curve/floor/link inputs, smoothing weights, configured filter interval and controller-local telemetry')
