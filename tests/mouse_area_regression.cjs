// TOUCHPAD_MODE = MOUSE_AREA (docs/trackpad-mouse-area.md): a trackpad as a map
// of one rectangle of the screen.
//
// The editor's preview and the picker's ghost draw where a touch puts the
// cursor using utils/mouseArea.ts; the mapper puts it there using
// include/TouchAreaMapping.h. If the two disagree, the preview lies. So the
// first half compiles the REAL header with MSVC and sweeps both over the same
// inputs; the second half checks every layer is wired: the mapper registers
// the settings and dispatches the mode, the editor knows the keys, and the
// picker's command surface exists.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const JSM = path.join(ROOT, 'JoyShockMapper/JoyShockMapper');
const HEADER = path.join(JSM, 'include/TouchAreaMapping.h');
const VCVARS = 'C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat';
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

// --- the TypeScript under test, transpiled the same way vite would -----------
const SRC_ROOT = path.join(ROOT, 'JSM_GUI/jsm_gui_tauri');
const moduleCache = new Map();
function loadModule(relative) {
  const file = path.join(SRC_ROOT, relative);
  if (moduleCache.has(file)) return moduleCache.get(file);
  const ts = require(path.join(SRC_ROOT, 'node_modules/typescript'));
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  moduleCache.set(file, exports);
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier);
    const base = path.resolve(path.dirname(file), specifier);
    const resolved = ['.ts', '.tsx', '/index.ts', ''].map(ext => base + ext).find(fs.existsSync);
    if (!resolved) throw new Error(`cannot resolve ${specifier} from ${relative}`);
    return loadModule(path.relative(SRC_ROOT, resolved));
  };
  const module = { exports };
  new Function('module', 'exports', 'require', js)(module, exports, localRequire);
  moduleCache.set(file, module.exports);
  return module.exports;
}
const mouseArea = loadModule('src/utils/mouseArea.ts');

// --- the value format ---------------------------------------------------------
assert.deepEqual(mouseArea.parseMouseArea('0.3 0.9 0.4 0.08'), { x: 0.3, y: 0.9, w: 0.4, h: 0.08 });
assert.equal(mouseArea.parseMouseArea('0.3 0.9 0.4'), null, 'three numbers is not an area');
assert.equal(mouseArea.parseMouseArea('0.3 0.9 0.4 0.08 1'), null, 'five numbers is not an area');
assert.equal(mouseArea.parseMouseArea('a b c d'), null);
assert.equal(mouseArea.formatMouseArea({ x: 0.3, y: 0.9, w: 0.4, h: 0.08 }), '0.3000 0.9000 0.4000 0.0800');
// What the mapper writes back must read as the same rectangle.
assert.deepEqual(mouseArea.parseMouseArea(mouseArea.formatMouseArea({ x: 0.3, y: 0.9, w: 0.4, h: 0.08 })), { x: 0.3, y: 0.9, w: 0.4, h: 0.08 });
assert.equal(mouseArea.describeMouseArea(null), 'Whole screen');
assert.equal(mouseArea.describeMouseArea({ x: 0, y: 0, w: 1, h: 1 }), 'Whole screen');
assert.equal(mouseArea.describeMouseArea({ x: 0.3, y: 0.9, w: 0.4, h: 0.08 }), '40% × 8% at 30%, 90%');
assert.equal(mouseArea.normalizeMouseAreaFit('uniform'), 'UNIFORM');
assert.equal(mouseArea.normalizeMouseAreaFit(undefined), 'STRETCH');
assert.equal(mouseArea.normalizeMouseAreaFit('nonsense'), 'STRETCH');
// sanitize: on screen, never zero-sized.
const tiny = mouseArea.sanitizeMouseArea({ x: 1, y: 1, w: 0, h: 0 });
assert.ok(tiny.w > 0 && tiny.h > 0 && tiny.x + tiny.w <= 1 + 1e-9 && tiny.y + tiny.h <= 1 + 1e-9);
assert.deepEqual(mouseArea.sanitizeMouseArea({ x: NaN, y: 0, w: 1, h: 1 }), { x: 0, y: 0, w: 1, h: 1 });

// --- parity with the mapper ---------------------------------------------------
const areas = [
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 0.3, y: 0.9, w: 0.4, h: 0.08 },   // a hotbar
  { x: 0.45, y: 0.1, w: 0.1, h: 0.8 },   // a column
  { x: 0.4, y: 0.3, w: 0.2, h: 0.2 * 16 / 9 }, // a square on 16:9
  { x: 0.9, y: -0.5, w: 0.5, h: 0.3 },   // off the edge: sanitised the same way on both sides
];
const shapes = [
  { pad: 1, screen: 16 / 9 },
  { pad: 2, screen: 16 / 9 },
  { pad: 1, screen: 21 / 9 },
  { pad: 2.087, screen: 4 / 3 },
  { pad: 0, screen: 16 / 9 },             // unknown pad shape: falls back to STRETCH
];
const cases = [];
for (const area of areas) for (const shape of shapes) for (const fit of ['STRETCH', 'UNIFORM']) {
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    cases.push({ u: i / 10, v: j / 10, area, fit, ...shape });
  }
}

function runBackend() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mousearea-'));
  fs.copyFileSync(HEADER, path.join(tmp, 'TouchAreaMapping.h'));
  const f = v => `${Number(v).toFixed(6)}f`;
  const rows = cases.map(c =>
    `  run(${f(c.u)}, ${f(c.v)}, touch_area::Rect{${f(c.area.x)}, ${f(c.area.y)}, ${f(c.area.w)}, ${f(c.area.h)}}, ` +
    `touch_area::Fit::${c.fit}, ${f(c.pad)}, ${f(c.screen)});`).join('\n');
  fs.writeFileSync(path.join(tmp, 'parity.cpp'),
    `#include "TouchAreaMapping.h"\n#include <cstdio>\n` +
    `static void run(float u, float v, touch_area::Rect r, touch_area::Fit fit, float pad, float screen) {\n` +
    `  float x = 0, y = 0; touch_area::map(u, v, r, fit, pad, screen, x, y); std::printf("%.6f %.6f\\n", x, y);\n}\n` +
    `int main(){\n${rows}\n  return 0;\n}\n`);
  const installer = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer';
  fs.writeFileSync(path.join(tmp, 'b.bat'),
    `@echo off\r\nset "PATH=${installer};%PATH%"\r\ncall "${VCVARS}" >nul\r\n` +
    `cl /nologo /EHsc /std:c++17 "${tmp}\\parity.cpp" /Fe:"${tmp}\\parity.exe"\r\n`);
  const build = spawnSync('cmd.exe', ['/d', '/c', path.join(tmp, 'b.bat')], { cwd: tmp, encoding: 'utf8' });
  if (build.status !== 0) throw new Error(`backend did not compile:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(path.join(tmp, 'parity.exe'), { encoding: 'utf8' });
  if (run.status !== 0) throw new Error('backend harness failed to run');
  return run.stdout.trim().split(/\r?\n/).map(line => line.split(' ').map(Number));
}

if (fs.existsSync(VCVARS)) {
  const backend = runBackend();
  assert.equal(backend.length, cases.length);
  let mismatches = 0;
  cases.forEach((c, index) => {
    const ours = mouseArea.mapTouchToArea(c.u, c.v, c.area, c.fit, c.pad, c.screen);
    const [bx, by] = backend[index];
    // float on one side, double on the other: a few parts in a million is the
    // expected gap, a thousandth of the screen is a real disagreement.
    if (Math.abs(ours.x - bx) > 1e-4 || Math.abs(ours.y - by) > 1e-4) {
      mismatches++;
      if (mismatches <= 10) console.error(`mismatch: ${JSON.stringify(c)} ours=${ours.x},${ours.y} mapper=${bx},${by}`);
    }
  });
  assert.equal(mismatches, 0, `${mismatches} of ${cases.length} points disagree with the mapper`);

  // The mapper's own unit test, with the compiler the mapper is built with.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'mousearea-tests-'));
  const installer = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer';
  const exe = path.join(work, 'touch_area_tests.exe');
  fs.writeFileSync(path.join(work, 't.bat'),
    `@echo off\r\nset "PATH=${installer};%PATH%"\r\ncall "${VCVARS}" >nul\r\n` +
    `cl /nologo /EHsc /std:c++17 /I "${path.join(JSM, 'include')}" "${path.join(JSM, 'tests', 'touch_area_tests.cpp')}" /Fe:"${exe}"\r\n`);
  const build = spawnSync('cmd.exe', ['/d', '/c', path.join(work, 't.bat')], { cwd: work, encoding: 'utf8' });
  assert.equal(build.status, 0, `touch_area_tests did not compile:\n${build.stdout}${build.stderr}`);
  const run = spawnSync(exe, { encoding: 'utf8' });
  assert.equal(run.status, 0, `touch_area_tests failed:\n${run.stdout}${run.stderr}`);
  assert.match(run.stdout, /touch_area_tests: ok/);
} else {
  console.log('SKIP: MSVC not found; parity with the mapper not checked');
}

// --- the mapper wires the mode and its settings ------------------------------
const mapperHeader = read('JoyShockMapper/JoyShockMapper/include/JoyShockMapper.h');
assert.match(mapperHeader, /enum class TouchpadMode[\s\S]*?MOUSE_AREA,[\s\S]*?INVALID/, 'MOUSE_AREA is a TouchpadMode, before INVALID');
assert.match(mapperHeader, /enum class MouseAreaFit\s*\{\s*STRETCH,\s*UNIFORM,\s*INVALID/);
for (const id of ['TOUCHPAD_AREA', 'TOUCHPAD_AREA_FIT', 'LEFT_TOUCHPAD_AREA', 'LEFT_TOUCHPAD_AREA_FIT', 'RIGHT_TOUCHPAD_AREA', 'RIGHT_TOUCHPAD_AREA_FIT']) {
  assert.match(mapperHeader, new RegExp(`^\\t${id},`, 'm'), `${id} in SettingID`);
}
const main = read('JoyShockMapper/JoyShockMapper/src/main.cpp');
for (const name of ['TOUCHPAD_AREA', 'LEFT_TOUCHPAD_AREA', 'RIGHT_TOUCHPAD_AREA']) {
  assert.match(main, new RegExp(`JSMAssignment<MouseArea>\\("${name}"`), `${name} registered`);
  assert.match(main, new RegExp(`JSMAssignment<MouseAreaFit>\\("${name}_FIT"`), `${name}_FIT registered`);
}
// Dispatch: both pads of a two-pad controller and the single pad, each to its own settings.
assert.match(main, /leftMode == TouchpadMode::MOUSE_AREA[\s\S]*?processTouchArea\(js, point0, prevState\.t0Down,\s*SettingID::LEFT_TOUCHPAD_AREA, SettingID::LEFT_TOUCHPAD_AREA_FIT/);
assert.match(main, /rightMode == TouchpadMode::MOUSE_AREA[\s\S]*?processTouchArea\(js, point1, prevState\.t1Down,\s*SettingID::RIGHT_TOUCHPAD_AREA, SettingID::RIGHT_TOUCHPAD_AREA_FIT/);
assert.match(main, /mode == TouchpadMode::MOUSE_AREA[\s\S]*?SettingID::TOUCHPAD_AREA, SettingID::TOUCHPAD_AREA_FIT/);
// The cursor is placed on the screen the game is on, and gyro mouse is held off meanwhile.
assert.match(main, /setMouseOnActiveScreen\(x, y\)/);
assert.match(main, /if \(!lockMouse && !jc->touchAreaHold && gyroOutput == GyroOutput::MOUSE/);
const win = read('JoyShockMapper/JoyShockMapper/src/win32/InputHelpers.cpp');
assert.match(win, /MOUSEEVENTF_MOVE \| MOUSEEVENTF_ABSOLUTE \| MOUSEEVENTF_VIRTUALDESK/, 'absolute placement spans every monitor');
assert.match(win, /MonitorFromWindow\(foreground, MONITOR_DEFAULTTOPRIMARY\)/, 'the screen is the foreground window\'s');
// The value type reads four numbers and rejects anything else.
const operators = read('JoyShockMapper/JoyShockMapper/src/operators.cpp');
assert.match(operators, /istream &operator>>\(istream &in, MouseArea &area\)/);
assert.match(operators, /A fifth token is a typo/);

// --- the editor knows the keys ------------------------------------------------
const configKeys = read('JSM_GUI/jsm_gui_tauri/src/constants/configKeys.ts');
for (const key of ['TOUCHPAD_AREA', 'TOUCHPAD_AREA_FIT', 'LEFT_TOUCHPAD_AREA', 'LEFT_TOUCHPAD_AREA_FIT', 'RIGHT_TOUCHPAD_AREA', 'RIGHT_TOUCHPAD_AREA_FIT']) {
  assert.match(configKeys, new RegExp(`'${key}',`), `${key} in touchpadKeys (so Save files it under the touch section)`);
  assert.match(configKeys, new RegExp(`${key}: '${key}'`), `${key} in keyName`);
}
// Save keeps the settings where the touchpad settings go, not in the custom tail.
const serializer = loadModule('src/utils/configSerializer.ts');
const roundTrip = serializer.serializeConfig(serializer.parseConfigText('RESET_MAPPINGS\nRIGHT_TOUCHPAD_MODE = MOUSE_AREA\nRIGHT_TOUCHPAD_AREA = 0.3000 0.9000 0.4000 0.0800\nRIGHT_TOUCHPAD_AREA_FIT = UNIFORM\n'));
assert.match(roundTrip, /RIGHT_TOUCHPAD_AREA = 0\.3000 0\.9000 0\.4000 0\.0800/);
assert.match(roundTrip, /RIGHT_TOUCHPAD_AREA_FIT = UNIFORM/);
const touchpadConfig = loadModule('src/utils/touchpadConfig.ts');
assert.equal(touchpadConfig.normalizeTouchpadMode('mouse_area'), 'MOUSE_AREA');

// Both pad editors offer the mode and the two rows, and the single-pad card gets the same.
const padSection = read('JSM_GUI/jsm_gui_tauri/src/components/keymap/PadSection.tsx');
assert.match(padSection, /\{ value: 'MOUSE_AREA', label: 'Mouse area' \}/);
assert.match(padSection, /setting=\{key\('TOUCHPAD_AREA'\)\}[\s\S]*?onActivate=\{config\.onPickMouseArea\}/);
assert.match(padSection, /setting=\{key\('TOUCHPAD_AREA_FIT'\)\}/);
const settingsSection = read('JSM_GUI/jsm_gui_tauri/src/components/keymap/TouchpadSettingsSection.tsx');
assert.match(settingsSection, /<option value="MOUSE_AREA">/);
assert.match(settingsSection, /setting=\{key\('TOUCHPAD_AREA'\)\}/);
// Console v2 (P4): the Trackpads front offers Mouse area as a card, and its
// Screen area row draws the area; Pad fit is a segmented row on the front and
// in Fine-tune (Click, Mouse area).
const padModes = read('JSM_GUI/jsm_gui_tauri/src/components/trackpads/padModes.tsx');
assert.match(padModes, /MOUSE_AREA: \{ label: 'Mouse area'/);
assert.match(padModes, /case 'MOUSE_AREA': return \{ \[modeKey\]: 'MOUSE_AREA' \}/);
const trackpadsPage = read('JSM_GUI/jsm_gui_tauri/src/components/trackpads/TrackpadsPage.tsx');
assert.match(trackpadsPage, /label="Screen area"[\s\S]*?onOpen=\{\(\) => pad\.card\.onPickMouseArea\?\.\(\)\}/);
assert.match(trackpadsPage, /label="Pad fit"[^\n]*setting=\{`\$\{P\}TOUCHPAD_AREA_FIT`\}/);
const trackpadFineTune = read('JSM_GUI/jsm_gui_tauri/src/components/trackpads/TrackpadFineTune.tsx');
assert.match(trackpadFineTune, /label="Screen area"[\s\S]*?onOpen=\{\(\) => pad\.card\.onPickMouseArea\?\.\(\)\}/);
const controls = read('JSM_GUI/jsm_gui_tauri/src/components/KeymapControls.tsx');
assert.match(controls, /mouseAreas\.LEFT\.pick\(livePadAspect\)/);
assert.match(controls, /mouseAreas\.RIGHT\.pick\(livePadAspect\)/);
assert.match(controls, /mouseAreas\[''\]\.pick\(livePadAspect\)/);

// --- the picker exists on both sides of the bridge -----------------------------
const bridge = read('JSM_GUI/jsm_gui_tauri/src/platform/desktopBridge.ts');
assert.match(bridge, /invokeTauri<unknown>\('area_picker_open', \{ request \}\)/);
assert.match(bridge, /listenTauri<MouseAreaPickResult>\('mouse-area-picked', callback\)/);
const lib = read('JSM_GUI/jsm_gui_tauri/src-tauri/src/lib.rs');
for (const command of ['area_picker_open', 'area_picker_state', 'area_picker_next_monitor', 'area_picker_close']) {
  assert.match(lib, new RegExp(`commands::${command},`), `${command} registered`);
}
// Building a window from a synchronous command deadlocks on Windows: Draw on
// screen hung there and the picker never appeared (2026-10-08). Async, and the
// window is prebuilt at startup.
assert.match(read('JSM_GUI/jsm_gui_tauri/src-tauri/src/commands.rs'), /pub async fn area_picker_open\(/, 'area_picker_open must be async');
assert.ok(read('JSM_GUI/jsm_gui_tauri/src-tauri/src/lib.rs').includes('services::area_picker::prepare(&app.handle());'), 'the picker window is built at startup');
const picker = read('JSM_GUI/jsm_gui_tauri/src-tauri/src/services/area_picker.rs');
// It takes input (unlike the overlay) and puts Studio out of the way of the game.
assert.match(picker, /set_ignore_cursor_events\(false\)/);
assert.match(picker, /main\.minimize\(\)/);
assert.match(picker, /emit_to\(MAIN_LABEL, PICKED_EVENT, payload\)/);
const capabilities = JSON.parse(read('JSM_GUI/jsm_gui_tauri/src-tauri/capabilities/default.json'));
assert.ok(capabilities.windows.includes('areapicker'), 'the picker window has the default capability (or invoke/listen silently fail)');
const vite = read('JSM_GUI/jsm_gui_tauri/vite.config.ts');
assert.match(vite, /areapicker: resolve\(__dirname, 'areapicker\.html'\)/);
assert.ok(fs.existsSync(path.join(SRC_ROOT, 'areapicker.html')));
// The picker's result is written to the pad it was opened for.
const hook = read('JSM_GUI/jsm_gui_tauri/src/hooks/useMouseAreaConfig.ts');
assert.match(hook, /desktopBridge\.onMouseAreaPicked\(result =>[\s\S]*?write\(keyFor\('TOUCHPAD_AREA', scope\), formatMouseArea\(result\.area\)\)/);

console.log('mouse_area_regression: ok');
