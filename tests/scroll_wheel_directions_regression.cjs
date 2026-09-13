// A stick in SCROLL_WHEEL mode is a whole-stick mode, so the editor used to fold
// away all four of its direction cards -- including the two the mode actually
// fires. With RLEFT/RRIGHT hidden there was nowhere to say what a scroll notch
// does, and the rotary scroll wheel read as broken.
//
// This guards the pair that has to agree: the GUI's idea of which directions a
// mode still sends, and JoyShockMapper's own wiring of the scroll wheel.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const app = path.resolve(__dirname, '../JSM_GUI/jsm_gui_tauri')
const ts = require(path.join(app, 'node_modules/typescript'))

const cache = new Map()
const requireTs = (file) => {
  const full = file.endsWith('.ts') ? file : file + '.ts'
  if (cache.has(full)) return cache.get(full)
  const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const module = { exports: {} }
  cache.set(full, module.exports)
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (spec) => (spec.startsWith('.') ? requireTs(path.resolve(path.dirname(full), spec)) : require(spec)),
  })
  cache.set(full, module.exports)
  return module.exports
}

const src = path.join(app, 'src')
const { STICK_MODE_VALUES, isDirectionalStickMode, stickModeDirectionUse } =
  requireTs(path.join(src, 'constants/sticks'))

// --- SCROLL_WHEEL keeps left/right and only left/right ----------------------
assert.equal(stickModeDirectionUse('SCROLL_WHEEL'), 'leftRight')
assert.equal(stickModeDirectionUse('scroll_wheel'), 'leftRight', 'mode reads are case-insensitive')
assert.equal(stickModeDirectionUse(' SCROLL_WHEEL '), 'leftRight', 'config values arrive with whitespace')

// It is *not* a four-way directional mode: up and down are never sent, so Bind
// to WASD still has to clear the mode rather than write four bindings into it.
assert.equal(isDirectionalStickMode('SCROLL_WHEEL'), false)

// --- Every other mode is unchanged ------------------------------------------
// 'all' and isDirectionalStickMode have to stay the same answer everywhere else,
// or the two callers disagree about what a mode does.
for (const mode of [...STICK_MODE_VALUES, '', 'SOMETHING_UNKNOWN']) {
  if (mode === 'SCROLL_WHEEL') continue
  assert.equal(
    stickModeDirectionUse(mode) === 'all',
    isDirectionalStickMode(mode),
    `${mode || '(unset)'} disagrees between stickModeDirectionUse and isDirectionalStickMode`
  )
}

// An unset mode is JSM's own default, which is directional.
assert.equal(stickModeDirectionUse(''), 'all')
assert.equal(stickModeDirectionUse(undefined), 'all')
assert.equal(stickModeDirectionUse('NO_MOUSE'), 'all')
assert.equal(stickModeDirectionUse('AIM'), 'none')
assert.equal(stickModeDirectionUse('FLICK'), 'none')
assert.equal(stickModeDirectionUse('RIGHT_STICK'), 'none')

// --- The mapper still pulses the left/right buttons -------------------------
// If upstream ever rewires the scroll wheel onto different inputs, the cards the
// editor keeps visible would be the wrong two, so pin the wiring here.
const joyShock = fs.readFileSync(
  path.resolve(__dirname, '../JoyShockMapper/JoyShockMapper/src/JoyShock.cpp'),
  'utf8'
)
for (const [stick, left, right] of [
  ['_leftStick', 'LLEFT', 'LRIGHT'],
  ['_rightStick', 'RLEFT', 'RRIGHT'],
]) {
  // Pull the one line out before asserting: matching against the whole file
  // dumps 60KB of C++ into the failure message when it does not match.
  const init = joyShock.split('\n').find(line => line.includes(`${stick}.scroll.init(`))
  assert.ok(init, `${stick} no longer initialises a scroll wheel at all`)
  assert.ok(
    init.includes(`ButtonID::${left}`) && init.includes(`ButtonID::${right}`),
    `${stick} scroll wheel no longer pulses ${left}/${right}: ${init.trim()}`
  )
}

console.log('scroll wheel directions regression: ok')
