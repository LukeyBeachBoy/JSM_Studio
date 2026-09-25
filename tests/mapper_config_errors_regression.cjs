// A configuration line JoyShockMapper cannot use used to show up only as a
// line in its console -- which Studio does not show unless you go looking --
// so a typo silently did nothing. The mapper now reports each such line, with
// the file and line number it came from, in its telemetry; and it keeps sending
// telemetry with no controller connected, so Studio hears about it (and that
// the mapper is alive) before a pad is ever plugged in.
//
// End to end on the real binary, like mapper_startup_crash_regression: no
// controller, AUTOCONNECT off, telemetry on a port of its own so a running
// Studio is not disturbed.
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXE = process.env.JSM_MAPPER_EXE
  || path.join(__dirname, '..', 'build-jsm-sdl', 'JoyShockMapper', 'Release', 'JoyShockMapper.exe');
const PORT = 18974;

const CONFIG = [
  'AUTOCONNECT = OFF',
  'AUTOLOAD = OFF',
  // After RESET_MAPPINGS, which puts the telemetry settings back to default.
  'RESET_MAPPINGS',
  `TELEMETRY_PORT = ${PORT}`,
  'TELEMETRY_ENABLED = ON',
  'S = SPACE',
  'NOT_A_THING = F',
  'GYRO_SENS = banana',
  'E = C',
].join('\n');

(async () => {
  assert.ok(fs.existsSync(EXE), `mapper binary not built: ${EXE}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-config-errors-'));
  fs.writeFileSync(path.join(dir, 'OnStartUp.txt'), CONFIG);

  const socket = dgram.createSocket('udp4');
  const packet = new Promise((resolve, reject) => {
    // With no controller attached only the idle heartbeat can deliver this.
    const timer = setTimeout(() => reject(new Error('no telemetry reporting both bad lines within 6s')), 6000);
    socket.on('message', message => {
      const sample = JSON.parse(message.toString());
      if (Array.isArray(sample.configErrors) && sample.configErrors.length >= 2) { clearTimeout(timer); resolve(sample); }
    });
  });
  await new Promise(resolve => socket.bind(PORT, '127.0.0.1', resolve));

  const child = spawn(EXE, [dir], { cwd: path.dirname(EXE), windowsHide: true, detached: false });
  const exited = new Promise(resolve => child.on('exit', resolve));
  try {
    const sample = await packet;
    const byLine = Object.fromEntries(sample.configErrors.map(error => [error.line, error]));
    assert.equal(byLine[7]?.text, 'NOT_A_THING = F', `line 7 is the unknown command: ${JSON.stringify(sample.configErrors)}`);
    assert.match(byLine[7].reason, /unknown command NOT_A_THING/);
    assert.equal(byLine[8]?.text, 'GYRO_SENS = banana', `line 8 is the bad value: ${JSON.stringify(sample.configErrors)}`);
    assert.match(byLine[8].reason, /invalid value banana for (MIN_|MAX_)?GYRO_SENS/);
    assert.ok(!byLine[6] && !byLine[9], 'good lines are not reported');
    assert.match(byLine[7].file, /OnStartUp\.txt$/i);
    assert.ok('reached' in sample.gyroCal, 'calibration progress carries how far a cancelled run got');
    console.log('mapper config errors: bad lines reported with file and line, reported over telemetry');
  } finally {
    child.kill();
    await exited;
    socket.close();
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); break; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
  }
})().catch(error => { console.error(error); process.exit(1); });
