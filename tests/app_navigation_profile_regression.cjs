// While Studio is in front, AppNavigation.txt has the controller, and it must
// map nothing: the buttons drive Studio from telemetry, and the trackpads and
// the gyro do nothing (the right pad used to be a mouse, and the gyro is on by
// default, so the pointer moved while Studio said mapping was paused). It also
// has to be a file the mapper takes without complaint, and it must leave
// telemetry on: RESET_MAPPINGS turns it off, and without telemetry Studio sees
// no controller, cannot navigate and loses its global chords (0.7.73 did).
//
// Also checks that AutoLoad skips a paused association (<name>.txt.paused):
// it compared names up to the first dot, so a paused rule still loaded.
//
// End to end on the real binary, no controller, telemetry on its own port.
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXE = process.env.JSM_MAPPER_EXE
  || path.join(__dirname, '..', 'build-jsm-sdl', 'JoyShockMapper', 'Release', 'JoyShockMapper.exe');
const NAV = path.join(__dirname, '..', 'JSM_GUI', 'jsm_gui_tauri', 'src-tauri', 'bin', 'SDL', 'AppNavigation.txt');
const AUTOLOAD_SOURCE = path.join(__dirname, '..', 'JoyShockMapper', 'JoyShockMapper', 'src', 'AutoLoad.cpp');
const PORT = 18975;

(async () => {
  assert.ok(fs.existsSync(EXE), `mapper binary not built: ${EXE}`);
  const nav = fs.readFileSync(NAV, 'utf8');
  const lines = nav.split(/\r?\n/).map(line => line.replace(/#.*/, '').trim()).filter(Boolean)

  // Nothing that moves the pointer or presses a key.
  assert.ok(!lines.some(line => /=\s*(MOUSE|LMOUSE|RMOUSE|MMOUSE)\b/i.test(line) && !/NO_MOUSE/i.test(line)), `AppNavigation maps something to the mouse:\n${lines.join('\n')}`);
  assert.ok(lines.includes('GYRO_ON = NONE'), 'AppNavigation must turn the gyro off');
  assert.ok(lines.includes('RIGHT_TOUCHPAD_MODE = GRID_AND_STICK') && lines.includes('LEFT_TOUCHPAD_MODE = GRID_AND_STICK'), 'both pads are grids with nothing bound');
  const SETTINGS = /^(AUTOCONNECT|TELEMETRY_ENABLED|TELEMETRY_PORT|GYRO_ON)\s*=|_MODE\s*=/;
  const bindings = lines.filter(line => /^[A-Z0-9_,+]+\s*=/.test(line) && !SETTINGS.test(line));
  assert.deepEqual(bindings, [], `AppNavigation binds inputs: ${bindings.join(', ')}`);

  // Telemetry is switched back on after the reset, on Studio's port.
  const reset = lines.indexOf('RESET_MAPPINGS');
  assert.ok(reset >= 0 && lines.indexOf('TELEMETRY_ENABLED = ON') > reset && lines.indexOf('TELEMETRY_PORT = 8974') > reset,
    'AppNavigation must turn telemetry back on (port 8974) after RESET_MAPPINGS');

  // The mapper takes every line and keeps sending telemetry with the profile
  // loaded last -- on this test's port, so a running Studio is not disturbed.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-app-nav-'));
  fs.writeFileSync(path.join(dir, 'AppNavigation.txt'), nav.replace('TELEMETRY_PORT = 8974', `TELEMETRY_PORT = ${PORT}`));
  fs.writeFileSync(path.join(dir, 'StudioDefaults.txt'), '# JSM Studio global defaults\nTICK_TIME = 1\n');
  fs.writeFileSync(path.join(dir, 'OnStartUp.txt'), ['AUTOCONNECT = OFF', 'AUTOLOAD = OFF', 'AppNavigation.txt'].join('\n'));

  const socket = dgram.createSocket('udp4');
  const packet = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no telemetry within 6s')), 6000);
    socket.on('message', message => { clearTimeout(timer); resolve(JSON.parse(message.toString())) });
  });
  await new Promise(resolve => socket.bind(PORT, '127.0.0.1', resolve));
  const child = spawn(EXE, [dir], { cwd: path.dirname(EXE), windowsHide: true, detached: false });
  try {
    const sample = await packet;
    // Give the heartbeat a second so every line has been read.
    await new Promise(resolve => setTimeout(resolve, 1200));
    const latest = await new Promise(resolve => socket.once('message', message => resolve(JSON.parse(message.toString()))));
    const errors = [...(sample.configErrors ?? []), ...(latest.configErrors ?? [])];
    assert.deepEqual(errors, [], `the mapper rejected AppNavigation lines: ${JSON.stringify(errors)}`);
  } finally {
    child.kill();
    socket.close();
  }

  // AutoLoad only treats <name>.txt as a rule.
  const autoload = fs.readFileSync(AUTOLOAD_SOURCE, 'utf8');
  assert.match(autoload, /iequals\(file\.substr\(file\.size\(\) - 4\), "\.txt"\)/, 'AutoLoad must skip files that are not <name>.txt');

  console.log('PASS: AppNavigation maps nothing (no mouse, no gyro, no bindings), the mapper takes every line, AutoLoad skips paused rules.');
})().catch(error => { console.error(error); process.exitCode = 1 });
