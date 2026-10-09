// Hold to swap on real hardware (2026-10-08): fixes found with a Steam
// Controller in hand, each guarded here. The pure decisions are C++ tests
// compiled with the mapper's own MSVC; the wiring that needs a controller to
// exercise is checked in the source, so a refactor can't silently drop it.
//
// 1. The mapper froze in Lizard Mode (intermittently, mostly with the
//    controller already on at start): the controller thread waited forever for
//    the configuration lock while a reconnect waited for it. Then skipping
//    readings instead killed gyro. Now: a short, bounded wait (lockForPoll).
// 2. A held chord unplugged the virtual Xbox pad and replugged it on release
//    (Steam notifications, trackpad lag): the chord keeps the virtual pad
//    unless it sets VIRTUAL_CONTROLLER itself.
// 3. Inside a chord there was no shutdown sound (and factory sound gain, tick
//    time): a controller-scoped reset now reloads StudioDefaults.txt.
// 4. A chord held while the window in front changed was dropped by the whole
//    configuration load; let go and the controller stayed wrong. Held chords
//    are put back after such a load.
// 5. "Unrecognized command: TOUCHPAD_ROTATION = 4" on every load: pad rotation
//    is global and is not translated for one-pad controllers.
// 6. Studio dropped its own record of a chord when the mapper confirmed it
//    (binding_chose_profile), so letting go never ended it; and a packet
//    without devices read as "the controller left". Both have Rust unit tests
//    (global_chords::tests, telemetry::heartbeat_tests), run here when cargo is
//    available.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.join(__dirname, '..')
const JSM = path.join(ROOT, 'JoyShockMapper/JoyShockMapper')
const TAURI = path.join(ROOT, 'JSM_GUI/jsm_gui_tauri/src-tauri')
const VCVARS = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat'
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8')
const between = (text, from, to) => {
  const start = text.indexOf(from)
  assert.ok(start >= 0, `"${from}" not found`)
  const end = text.indexOf(to, start + from.length)
  return text.slice(start, end < 0 ? undefined : end)
}

// --- C++: rotation, virtual pad decision, the poll lock ------------------------
if (fs.existsSync(VCVARS)) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'chord-tests-'))
  const installer = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer'
  const test = 'chord_lifecycle_tests'
  const exe = path.join(work, `${test}.exe`)
  const bat = path.join(work, `${test}.bat`)
  fs.writeFileSync(bat,
    `@echo off\r\nset "PATH=${installer};%PATH%"\r\ncall "${VCVARS}" >nul\r\n` +
    `cl /nologo /EHsc /std:c++17 /I "${path.join(JSM, 'include')}" "${path.join(JSM, 'tests', `${test}.cpp`)}" /Fe:"${exe}"\r\n`)
  const build = spawnSync('cmd.exe', ['/d', '/c', bat], { cwd: work, encoding: 'utf8' })
  assert.equal(build.status, 0, `${test} did not compile:\n${build.stdout}${build.stderr}`)
  const run = spawnSync(exe, { encoding: 'utf8', timeout: 30000 })
  assert.equal(run.status, 0, `${test} failed:\n${run.stdout}${run.stderr}`)
  assert.match(run.stdout, /chord_lifecycle_tests passed/)
} else {
  console.log('SKIP: MSVC not found; C++ tests not run')
}

// --- the mapper's wiring ---------------------------------------------------
const main = read('JoyShockMapper/JoyShockMapper/src/main.cpp')
const registry = read('JoyShockMapper/JoyShockMapper/src/CmdRegistry.cpp')
const context = read('JoyShockMapper/JoyShockMapper/include/ControllerContext.h')

// 1. Both controller-thread callbacks take the lock through lockForPoll, before any Guard.
assert.match(context, /inline std::recursive_timed_mutex mutex;/)
for (const signature of ['void touchCallback(', 'void joyShockPollCallback(']) {
  const body = between(main, signature, 'shared_ptr<JoyShock>')
  assert.match(body, /if \(!ControllerContext::lockForPoll\(configurationFree\)\) return;[\s\S]*ControllerContext::Guard controllerScope/, `${signature} waits briefly, then gives way`)
  assert.doesNotMatch(body, /try_to_lock/, `${signature} must not skip readings on any contention`)
}

// 2. A chord keeps the virtual pad unless it sets one.
const begin = between(registry, 'if (trimmedLine.rfind(deviceBegin, 0) == 0) {', 'const string autoload')
assert.match(begin, /const auto keepVirtual = virtualControllerAssignment\(id\);[\s\S]*loadConfigFile\(path\);[\s\S]*setsKey\(_profileLines, "VIRTUAL_CONTROLLER"\)[\s\S]*processLine\(keepVirtual\)/)
assert.match(main, /string virtualControllerAssignment\(int handle\)/)

// 3. A controller-scoped reset reloads Studio's defaults.
const reset = between(main, 'bool do_RESET_MAPPINGS(', 'os_mouse_speed = 1.0f;')
assert.match(reset, /if \(scoped\)\s*\{[\s\S]*registry->loadConfigFile\("StudioDefaults\.txt"\);[\s\S]*return true;/)

// 4. Held chords survive a whole configuration load and are put back after it.
const load = between(registry, 'bool CmdRegistry::loadConfigFile(', 'string_view CmdRegistry::strtrim(')
assert.match(load, /reholdChords = deviceProfiles;/)
assert.match(load, /processLine\("STUDIO_DEVICE_CHORD_BEGIN " \+ std::to_string\(id\) \+ " " \+ path\)/)
// The end of a chord is always logged, held or not, so a mismatch shows up.
assert.match(registry, /let go: back to/)
assert.match(registry, /let go, but nothing was being held/)

// 5. Rotation stays global (also covered by the C++ test).
assert.match(read('JoyShockMapper/JoyShockMapper/include/ControllerCompatibility.h'), /if \(token == side \+ "TOUCHPAD_ROTATION"\) return token;/)

// 6. Studio fills a heartbeat with the last device list before anyone reads it.
const telemetry = read('JSM_GUI/jsm_gui_tauri/src-tauri/src/services/telemetry.rs')
assert.match(telemetry, /Ok\(mut packet\) => \{\s*\/\/[^\n]*\n\s*let heartbeat = fill_heartbeat_devices\(&state, &mut packet\);\s*presses\.observe\(&packet\);/)
assert.match(telemetry, /update_latest_packet\(&state, packet, heartbeat\);/)
assert.match(read('JSM_GUI/jsm_gui_tauri/src-tauri/src/services/global_chords.rs'), /!active\.is_some_and\(\|chord\| chord\.eq_ignore_ascii_case\(live\)\)/)

// 7. The on-screen keyboard's capture is a device chord too: it is "captured" when
//    the controller reports it, and it keeps the virtual pad plugged in.
const keyboard = read('JSM_GUI/jsm_gui_tauri/src-tauri/src/services/virtual_keyboard.rs')
assert.ok(keyboard.includes('let captured=is_capture(&d["activeProfile"]) || is_capture(&packet["activeProfile"]);'), 'the keyboard checks the controller\'s own profile for the capture')
assert.doesNotMatch(between(keyboard, 'let mut text=String::from("RESET_MAPPINGS', ');'), /VIRTUAL_CONTROLLER = NONE/)

const cargo = spawnSync('cargo --version', { encoding: 'utf8', shell: true })
if (cargo.status === 0 && !process.env.JSM_SKIP_CARGO) {
  for (const filter of ['heartbeat_tests', 'global_chords']) {
    const result = spawnSync('cargo test --lib ' + filter, { cwd: TAURI, encoding: 'utf8', shell: true, timeout: 900000 })
    assert.equal(result.status, 0, `cargo test ${filter} failed:\n${result.stdout.slice(-3000)}${result.stderr.slice(-3000)}`)
    assert.match(result.stdout, /test result: ok\. [1-9]\d* passed; 0 failed/, `cargo test ${filter} ran no tests`)
  }
} else {
  console.log('SKIP: cargo not run (JSM_SKIP_CARGO or no cargo)')
}

console.log('PASS: chord lifecycle, poll lock, virtual pad, scoped defaults, rehold, rotation and heartbeat devices are guarded')
