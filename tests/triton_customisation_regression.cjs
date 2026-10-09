// The Steam Controller 2026 customisations that its firmware allows
// (docs/triton-firmware-customisation.md): a configuration's LIGHT_BAR colour
// on the RGBW light, a global trackpad orientation, and the controller's own
// power-jingle volume. Compiles and runs the mapper's pure-function tests with
// the real MSVC toolchain, then checks that every layer is wired: the mapper
// registers the settings and applies them where the pad is read, Studio writes
// them to its global defaults, and the Preferences page exposes them.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const JSM = path.join(ROOT, 'JoyShockMapper/JoyShockMapper')
const VCVARS = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8')

// --- the C++ tests, with the compiler the mapper is built with --------------
if (fs.existsSync(VCVARS)) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'triton-tests-'))
  // vcvars64.bat shells out to vswhere.exe and only finds it via the Installer
  // directory, which is not on PATH in every shell this runs from.
  const installer = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer'
  for (const test of ['touch_rotation_tests', 'triton_led_tests']) {
    const source = path.join(JSM, 'tests', `${test}.cpp`)
    const exe = path.join(work, `${test}.exe`)
    const bat = path.join(work, `${test}.bat`)
    fs.writeFileSync(bat,
      `@echo off\r\nset "PATH=${installer};%PATH%"\r\ncall "${VCVARS}" >nul\r\n` +
      `cl /nologo /EHsc /std:c++17 /I "${path.join(JSM, 'include')}" "${source}" /Fe:"${exe}"\r\n`)
    const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
    assert.equal(build.status, 0, `${test} did not compile:\n${build.stdout}${build.stderr}`)
    const run = spawnSync(exe, { encoding: 'utf8' })
    assert.equal(run.status, 0, `${test} failed:\n${run.stdout}${run.stderr}`)
    assert.match(run.stdout, new RegExp(`${test} passed`))
  }
} else {
  console.log('SKIP: MSVC not found; C++ tests not run')
}

// --- the mapper wires the settings ----------------------------------------
const mapperHeader = read('JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h')
for (const id of ['LEFT_TOUCHPAD_ROTATION', 'RIGHT_TOUCHPAD_ROTATION', 'BOOT_SOUND_LEVEL']) assert.match(mapperHeader, new RegExp(`^\\t${id},`, 'm'), `${id} in SettingID`)

const main = read('JoyShockMapper/JoyShockMapper/src/main.cpp')
for (const name of ['LEFT_TOUCHPAD_ROTATION', 'RIGHT_TOUCHPAD_ROTATION', 'BOOT_SOUND_LEVEL']) assert.match(main, new RegExp(`JSMAssignment<(float|int)>\\("${name}"`), `${name} registered`)

const sdl = read('JoyShockMapper/JoyShockMapper/src/SDLWrapper.cpp')
// Rotation happens where the pad is read, so telemetry and the mapper agree.
const getTouchState = sdl.slice(sdl.indexOf('TOUCH_STATE GetTouchState('), sdl.indexOf('bool GetStickTouch('))
assert.match(getTouchState, /touchpad_rotation::rotate\(state\.t0X, state\.t0Y, SettingsManager::get<float>\(SettingID::LEFT_TOUCHPAD_ROTATION\)/)
assert.match(getTouchState, /touchpad_rotation::rotate\(state\.t1X, state\.t1Y, SettingsManager::get<float>\(SettingID::RIGHT_TOUCHPAD_ROTATION\)/)
// The light: the user-colour switch is turned on with the colour and off when unset.
const apply = sdl.slice(sdl.indexOf('void applyTritonSettings('), sdl.indexOf('int pollDevices()'))
assert.match(apply, /triton_led::payload\(wanted\.raw & 0x00FFFFFF\)/)
assert.match(apply, /triton_led::kUserColorSetting, uint16_t\(1\)/)
assert.match(apply, /triton_led::kUserColorSetting, uint16_t\(0\)/)
assert.match(apply, /triton_boot_sound::levelReport\(level\)/)
// A Steam Controller's LIGHT_BAR goes through that path, not SDL's LED call.
assert.match(sdl, /JS_TYPE_STEAM_CONTROLLER_2026\)\s*\{[^}]*_wantedLightBar\.store\(uint32_t\(colour\)\)/)
// Closing the device hands the light back to the firmware.
assert.match(sdl, /_appliedLedColorSwitch == 1 && _sdlController != nullptr/)
// An explicit colour is marked so the default white is not mistaken for one.
assert.match(read('JoyShockMapper/JoyShockMapper/src/operators.cpp'), /color\.rgb\.a = 0xFF/)

// --- Studio's global defaults carry the orientation and the jingle level ----
const runtime = read('JSM_GUI/jsm_gui_tauri/src-tauri/src/runtime.rs')
for (const line of ['LEFT_TOUCHPAD_ROTATION = {}', 'RIGHT_TOUCHPAD_ROTATION = {}', 'BOOT_SOUND_LEVEL = {}']) assert.ok(runtime.includes(line), `${line} in studio_defaults_text`)
for (const field of ['left_pad_rotation', 'right_pad_rotation', 'boot_sound_level']) {
  assert.match(runtime, new RegExp(`pub ${field}: (f64|i32),`), `${field} in RuntimeMappingState and ControllerPreferences`)
  assert.match(runtime, new RegExp(`state\\.${field} = `), `${field} saved by set_controller_preferences`)
}
assert.match(runtime, /clamp\(-180\.0, 180\.0\)/)
assert.match(runtime, /boot_sound_level\.clamp\(-1, 2\)/)

// --- the Preferences page ---------------------------------------------------
const prefs = read('JSM_GUI/jsm_gui_tauri/src/components/ControllerPreferences.tsx')
// Settings ▸ Controller (console v2): the default rotation is a Mounted / Level choice
// with an Advanced angle per pad; the jingle level has its own row.
assert.match(prefs, /PAD_CANT = { left: 10.7, right: -10.5 }/)
assert.match(prefs, /leftPadRotation: PAD_CANT.left, rightPadRotation: PAD_CANT.right/)
assert.match(prefs, /export function TrackpadRotation/)
assert.match(prefs, /JingleLevel|bootSoundLevel/)
// Controller light & sounds (this configuration): the same rotation per configuration, both keys, same cant.
const light = read('JSM_GUI/jsm_gui_tauri/src/components/light/LightSounds.tsx')
assert.match(light, /PAD_CANT = { left: 10.7, right: -10.5 }/)
assert.match(light, /'LEFT_TOUCHPAD_ROTATION'/)
assert.match(light, /'RIGHT_TOUCHPAD_ROTATION'/)
assert.match(light, /bootSoundLevel/)
assert.match(read('JSM_GUI/jsm_gui_tauri/src/App.tsx'), /<LightSounds open={lightSoundsOpen}/)
const bridge = read('JSM_GUI/jsm_gui_tauri/src/platform/desktopBridge.ts')
for (const field of ['leftPadRotation', 'rightPadRotation', 'bootSoundLevel']) assert.match(bridge, new RegExp(`${field}\\??: number`), `${field} in the bridge types`)

// The artwork turns the dot back by the configured angle so it tracks the finger.
const art = read('JSM_GUI/jsm_gui_tauri/src/components/ControllerStatusSvg.tsx')
assert.match(art, /rot: STEAM_PAD\.left\.rot - \(runtimePrefs\?\.leftPadRotation \?\? 0\)/)
assert.match(art, /rot: STEAM_PAD\.right\.rot - \(runtimePrefs\?\.rightPadRotation \?\? 0\)/)
// The preset in Studio matches the mapper's constants for the cant, which in
// turn match the artwork the dot is drawn on.
const rotationHeader = read('JoyShockMapper/JoyShockMapper/include/TouchpadRotation.h')
assert.match(rotationHeader, /kLeftPadCantDegrees = 10\.7f/)
assert.match(rotationHeader, /kRightPadCantDegrees = -10\.5f/)
assert.match(art, /rot: 10\.7 \}/)
assert.match(art, /rot: -10\.5 \}/)

// The keys are known to the editor, so a configuration that sets them keeps them.
const keys = read('JSM_GUI/jsm_gui_tauri/src/constants/configKeys.ts')
for (const key of ['LEFT_TOUCHPAD_ROTATION', 'RIGHT_TOUCHPAD_ROTATION']) {
  assert.ok(keys.includes(`'${key}',`), `${key} in touchpadKeys`)
  assert.ok(keys.includes(`${key}: '${key}',`), `${key} in keyName`)
}

console.log('PASS: Triton light colour, trackpad orientation and power jingle are wired end to end')

// --- where custom sounds play (SOUND_ACTUATORS) -----------------------------
// The firmware's own tunes are tone requests on the grip motors (channels 2+3);
// a tone sequence goes there by default, one report per note, and the choice
// travels mapper setting -> StudioDefaults.txt -> Preferences.
assert.match(mapperHeader, /^\tSOUND_ACTUATORS,/m, 'SOUND_ACTUATORS in SettingID')
assert.match(main, /JSMAssignment<SoundActuators>\("SOUND_ACTUATORS"/, 'SOUND_ACTUATORS registered')
const toneHeader = read('JoyShockMapper/JoyShockMapper/include/ToneSequence.h')
assert.match(toneHeader, /enum class SoundActuators\s*\{\s*GRIPS,\s*PADS,\s*BOTH,\s*INVALID,?\s*\}/)
assert.match(toneHeader, /kSideBothGrips = 5/)
const player = sdl.slice(sdl.indexOf('static void runTonePlayer('), sdl.indexOf('static int startToneSequence('))
assert.match(player, /toneRoutes\(device->_toneActuators\)/, 'the player routes by the actuator choice')
assert.match(player, /wait_until\(guard, due, newerOrQuit\)/, 'notes are timed against the sequence start')
assert.doesNotMatch(player, /sendToneBurst\(device->_sdlController, 0,/, 'no per-pad report pair any more')
assert.match(sdl, /SettingsManager::get<SoundActuators>\(SettingID::SOUND_ACTUATORS\)->value\(\)/)
assert.ok(runtime.includes('SOUND_ACTUATORS = {}'), 'SOUND_ACTUATORS in studio_defaults_text')
assert.match(runtime, /pub sound_actuators: String,/)
assert.match(runtime, /state\.sound_actuators = validated_sound_actuators\(/)
assert.match(prefs, /label="Your sounds play on" setting="SOUND_ACTUATORS"/)
assert.match(read("JSM_GUI/jsm_gui_tauri/src/components/sounds/SoundLibraryPage.tsx"), /Plays on/)
assert.match(read('JSM_GUI/jsm_gui_tauri/src/utils/controllerPreferences.ts'), /soundActuators: state\?\.soundActuators \?\? defaults\.soundActuators/)
console.log('triton customisation: C++ tests, mapper wiring, Studio defaults, Preferences page and sound actuators checked')
