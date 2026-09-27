// "While released" modeshifts on the real mapper binary: `!MISC5,W = X` holds
// W's shifted binding while the right grip is NOT held (the use case: a layer
// or modeshift that applies when you let go of a grip). The mapper must take
// the chorded binding and a chorded setting, and refuse "!" where it has no
// meaning (a simultaneous press, a touch cell).
//
// End to end on the real binary, no controller, telemetry on its own port so a
// running Studio is not disturbed. Like the other mapper tests it cannot get
// telemetry while another JoyShockMapper holds the controller.
const assert = require('node:assert/strict');
const dgram = require('node:dgram');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXE = process.env.JSM_MAPPER_EXE
  || path.join(__dirname, '..', 'build-jsm-sdl', 'JoyShockMapper', 'Release', 'JoyShockMapper.exe');
const PORT = 18977;

(async () => {
  assert.ok(fs.existsSync(EXE), `mapper binary not built: ${EXE}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-inverted-'));
  const accepted = ['!MISC5,W = X', '!MISC6,S = SPACE', '!MISC5,GYRO_SENS = 2 2', '!RSL,E = C'];
  const refused = ['!MISC5+W = X', '!T1,W = X', '!NOTABUTTON,W = X'];
  fs.writeFileSync(path.join(dir, 'Inverted.txt'), ['RESET_MAPPINGS', `TELEMETRY_ENABLED = ON`, `TELEMETRY_PORT = ${PORT}`, ...accepted, ...refused].join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'OnStartUp.txt'), ['AUTOCONNECT = OFF', 'AUTOLOAD = OFF', `TELEMETRY_ENABLED = ON`, `TELEMETRY_PORT = ${PORT}`, 'Inverted.txt'].join('\n'));

  const socket = dgram.createSocket('udp4');
  const first = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no telemetry within 6s')), 6000);
    socket.on('message', message => { clearTimeout(timer); resolve(JSON.parse(message.toString())) });
  });
  await new Promise(resolve => socket.bind(PORT, '127.0.0.1', resolve));
  const child = spawn(EXE, [dir, '--manual-connect'], { cwd: path.dirname(EXE), windowsHide: true, detached: false });
  try {
    await first;
    await new Promise(resolve => setTimeout(resolve, 1200));
    const latest = await new Promise(resolve => socket.once('message', message => resolve(JSON.parse(message.toString()))));
    const errors = (latest.configErrors ?? []).map(error => error.text.trim());
    for (const line of accepted) assert.ok(!errors.includes(line), `the mapper refused ${line}: ${JSON.stringify(latest.configErrors)}`);
    for (const line of refused) assert.ok(errors.includes(line), `the mapper should refuse ${line}; errors: ${JSON.stringify(errors)}`);
  } finally {
    child.kill();
    socket.close();
  }
  console.log('PASS: the mapper takes "!X," modeshifts for bindings and settings and refuses "!" on simultaneous presses, touch cells and unknown inputs');
})().catch(error => { console.error(error); process.exitCode = 1 });
