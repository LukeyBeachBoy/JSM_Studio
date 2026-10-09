// Console v2, P4 parity: every stick, trigger, trackpad and grip setting in
// src/constants/configKeys.ts has a home on the redesigned Sticks, Triggers,
// Trackpads and Grip sensors screens (design/console-v2 Parity.dc.html, D5).
// Static: a key counts as homed when the P4 sources write or read it, either
// spelled out or built from its side prefix (`${SIDE}_STICK_MODE`,
// `${P}TOUCHPAD_SENS`, `${target}_UNDEADZONE_INNER`, `TOUCHPAD_${field}`).
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const SRC = path.join(__dirname, '..', 'JSM_GUI', 'jsm_gui_tauri', 'src')
const read = file => fs.readFileSync(path.join(SRC, file), 'utf8')
const keysFile = read('constants/configKeys.ts')
const group = name => {
  const match = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`).exec(keysFile)
  assert.ok(match, `configKeys.ts has ${name}`)
  return [...match[1].matchAll(/'([A-Z0-9_]+)'/g)].map(m => m[1])
}

const homes = [
  ...['sticks', 'triggers', 'trackpads'].flatMap(dir => fs.readdirSync(path.join(SRC, 'components', dir)).filter(file => /\.tsx?$/.test(file)).map(file => `components/${dir}/${file}`)),
  'components/keymap/GripSensorsSheet.tsx',
  'utils/adaptiveTriggers.ts',
  'utils/padFeedback.ts',
  'utils/sourceModeSettings.ts',
  'utils/virtualStickSettings.ts',
]
const source = homes.map(read).join('\n')
// Settings the shell or the hooks write for these screens (the rail's mode
// handlers, App's grip handlers) are homed through the props they pass in.
const viaProps = read('components/KeymapControls.tsx') + read('App.tsx') + read('hooks/useGripConfig.ts')

const homed = key => {
  if (source.includes(`'${key}'`) || source.includes(`"${key}"`) || source.includes(`\`${key}\``) || new RegExp(`\\b${key}\\b`).test(source)) return true
  const side = /^(LEFT|RIGHT)_(.+)$/.exec(key)
  const rest = side ? side[2] : key.replace(/^TOUCHPAD_/, '')
  // Built from a prefix: `${SIDE}_STICK_MODE`, `${P}TOUCHPAD_SENS`, key('UNDEADZONE_INNER').
  if (new RegExp(`\\}_?${rest}\\b`).test(source) || source.includes(`'${rest}'`)) return true
  if (/^STICK_(UNDEADZONE|UNPOWER|VIRTUAL_SCALE)/.test(rest) && source.includes(`'${rest.replace(/^STICK_/, '')}'`)) return true
  // Built from a head and a field: `TOUCHPAD_${field}` with 'HAPTIC_INTENSITY',
  // `GRID_${name}` with 'SHAPE', `${target}_DEADZONE_PROBE`.
  const parts = rest.split('_')
  for (let k = 1; k < parts.length; k++) {
    const head = parts.slice(0, k).join('_') + '_', tail = parts.slice(k).join('_')
    if (source.includes(head + '${') && source.includes(`'${tail}'`)) return true
    if (k < parts.length - 1 && source.includes(`}_${tail}`)) return true
  }
  // The trackpad curve's own numbers are edited in the curve editor that
  // Trackpads ▸ Fine-tune ▸ Advanced ▸ Edit the curve opens.
  if (/^TOUCHPAD_ACCEL_/.test(key) && source.includes("'jsm:accel-curve', { detail: 'touchpad' }") && read('hooks/useTouchpadConfig.ts').includes(`keyName.${key}`)) return true
  return new RegExp(`\\b${key}\\b`).test(viaProps)
}

const groups = ['stickKeys', 'stickModeKeys', 'triggerKeys', 'touchpadKeys', 'touchpadExtraKeys', 'gripKeys', 'gripReleaseKeys']
const missing = []
for (const name of groups) for (const key of group(name)) if (!homed(key)) missing.push(`${name}: ${key}`)
assert.deepEqual(missing, [], `every P4 setting has a home on the console v2 screens:\n${missing.join('\n')}`)

// The groups the P4 brief asked for exist and hold what they should.
assert.ok(group('triggerKeys').includes('TRIGGER_SKIP_DELAY'), 'triggerKeys lists the quick full press window')
assert.ok(group('triggerKeys').includes('RIGHT_TRIGGER_RANGE'), 'triggerKeys lists the calibration travel')
assert.ok(group('stickModeKeys').includes('MOUSELIKE_FACTOR'), 'stickModeKeys lists the mouse-like speed')
assert.ok(group('stickModeKeys').includes('FLICK_STICK_OUTPUT'), 'stickModeKeys lists the flick output')
assert.ok(group('touchpadExtraKeys').includes('TOUCHPAD_D_CUTOFF'), 'touchpadExtraKeys lists the speed reading cutoff')

// TOUCHPAD_ACCELERATION had a handler and no UI: Trackpads ▸ Fine-tune ▸ Advanced has it now.
assert.match(read('components/trackpads/TrackpadFineTune.tsx'), /setting="TOUCHPAD_ACCELERATION"/, 'simple speed-up has a row')
// The shared stick dead zones are writable: "Both sticks" writes STICK_DEADZONE_*.
assert.match(read('components/sticks/stickGroups.tsx'), /STICK_DEADZONE_INNER: inner, STICK_DEADZONE_OUTER: outer/, 'Both sticks writes the shared dead zones')
// TRIGGER_SKIP_DELAY is always shown in Advanced, not only for skip modes.
assert.match(read('components/triggers/TriggerFineTune.tsx'), /label="Window" setting="TRIGGER_SKIP_DELAY"/, 'the quick full press window always has its row')
// The flick's gamepad output reaches that stick's game corrections.
assert.match(read('components/sticks/stickGroups.tsx'), /<GameStickRows ctx=\{ctx\} target=\{target\} compact \/>/, 'flick output shows the game stick corrections')
assert.match(read('components/SourceModeTuning.tsx'), /correctionTarget/, 'While holding’s flick output shows them too')
assert.doesNotMatch(read('components/SourceModeTuning.tsx'), /Â°/, 'no mojibake in the turn-rate unit')
// StickSettingsCard was dead code.
assert.ok(!fs.existsSync(path.join(SRC, 'components/StickSettingsCard.tsx')), 'StickSettingsCard.tsx is gone')

console.log('console v2 P4 parity: every stick, trigger, trackpad and grip setting has a home')
