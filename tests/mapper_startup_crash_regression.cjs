// JoyShockMapper died the instant a config named a stick radial menu segment,
// so the controller simply never appeared and the GUI reported nothing:
//
//   onNewStickMenuSize() push_back()s 25 JSMButtons into a vector nobody had
//   reserve()d, handing registry->add() a reference to maps.back() each time.
//   The first reallocation left every assignment already registered pointing at
//   freed memory, and parsing "RM1 = 1" dereferenced one. Access violation,
//   ~3s after launch, with no console output because JSM is a WinMain app.
//
// The grid vectors were reserved in main(), 1700 lines from their push_back, so
// the stick menus copied the loop without the pairing. This test is deliberately
// end to end -- launch the real binary and require it to still be alive -- so it
// catches any startup crash, not just this one.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXE = process.env.JSM_MAPPER_EXE
  || path.join(__dirname, '..', 'build-jsm-sdl', 'JoyShockMapper', 'Release', 'JoyShockMapper.exe');
const ALIVE_FOR_MS = 6000;

// AUTOCONNECT is off on purpose: the crash is in command parsing, so the test
// needs no controller and must not grab one out from under whoever is running it.
const CONFIG = [
  'AUTOCONNECT = OFF',
  'AUTOLOAD = OFF',
  'RESET_MAPPINGS',
  // One segment from each wheel. Either alone was enough to kill it.
  'LM1 = 1',
  'RM1 = 1',
  // ...and a pad region, the same shape of bug in the grid vectors.
  'LT1 = G',
  'RT1 = F',
].join('\n');

(async () => {
  assert.ok(fs.existsSync(EXE), `mapper binary not built: ${EXE}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsm-startup-'));
  fs.writeFileSync(path.join(dir, 'OnStartUp.txt'), CONFIG);

  const child = spawn(EXE, [dir], { cwd: path.dirname(EXE), windowsHide: true, detached: false });
  const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));
  const survived = new Promise(resolve => setTimeout(() => resolve(null), ALIVE_FOR_MS));

  // The mapper still has the directory open the moment it is killed, so give
  // Windows a beat before deleting it rather than failing the test on EBUSY.
  const cleanup = async () => {
    for (let i = 0; i < 10; i++) {
      try { fs.rmSync(dir, { recursive: true, force: true }); return; } catch { await new Promise(r => setTimeout(r, 200)); }
    }
  };

  const outcome = await Promise.race([exited, survived]);
  if (outcome === null) {
    child.kill();
    await exited;
    await cleanup();
    console.log('mapper startup: survived a config binding stick menu and pad regions');
    return;
  }

  await cleanup();
  // 0xC0000005 arrives as a large unsigned value or as its signed form.
  const hex = outcome.code === null ? String(outcome.signal) : `0x${(outcome.code >>> 0).toString(16).toUpperCase()}`;
  assert.fail(
    `JoyShockMapper exited ${hex} within ${ALIVE_FOR_MS}ms of loading a config that binds `
    + 'LM1/RM1/LT1/RT1. A dangling JSMButton reference is the usual cause: check that every '
    + 'vector feeding registry->add(new JSMAssignment<Mapping>(vec.back())) is reserved first.'
  );
})();
