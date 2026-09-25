// Guards AutoConnect's triggers, and the three ways they have gone wrong.
//
// The original trigger was "the device count changed since last poll":
//
//     int realSize = jsl->GetDeviceCount() - Gamepad::getCount();
//     if (lastSize != realSize) { lastSize = realSize; WriteToConsole(...); }
//
// Bug 1 -- never retried. A controller that sleeps and wakes is re-enumerated
// immediately, so that reconnect fires while its driver still has the device
// unclassified. SDL_IsGamepad() is false or SDL_OpenGamepad() fails, the
// ControllerDevice is invalid, and connectDevices() drops it -- at the same
// device count it had before. Edge-only, so it never fired again.
//
// Fixing that needs a second trigger: SDL lists a device we have not opened.
// Two attempts at making that trigger "keep trying until it works" caused:
//
// Bug 2 -- a self-renewing budget. `opened - Gamepad::getCount() <= 0` was read
// as "nothing is connected", but those are different populations (SDL devices
// we opened, versus ViGEm pads we created). With one real controller and one
// virtual pad it computes zero, renewed the budget forever, and reconnected
// every 30s. RECONNECT_CONTROLLERS closes every open gamepad, and closing a
// Steam Controller hands it back to its firmware -- Lizard Mode. So it did not
// wait quietly in the background; it dropped the controller, repeatedly.
//
// Bug 3 -- re-arming on device identity. The careful-looking replacement:
// refill the budget when the SET of unopened devices changes, since a
// switched-on controller is a new joystick id. But a reconnect destroys and
// recreates our own virtual pad whenever the configuration sets
// VIRTUAL_CONTROLLER, and it returns as a new SDL device with a new id -- so
// the retry re-armed off the wake of its own reconnect and unplugged the
// controller every few seconds, audibly.
//
// Bug 4 -- the wrong question. "Does SDL list something we have not opened?"
// sounds like the right signal and is not: VIRTUAL_CONTROLLER creates a ViGEm
// pad AFTER ConnectDevices() has enumerated, so SDL lists it while
// _controllerMap does not, permanently. The retry spent its whole budget every
// session reconnecting over a pad JSM created itself and must never open --
// the log read "1 device connected" beside "1 device(s) listed but not open".
//
// The shape that holds: the retry asks what the last CONNECT ATTEMPT failed to
// open (recorded where it is known, in GetConnectedDeviceHandles) rather than
// diffing the live list; only the device count arms it; the budget is bounded
// and nothing refills it; and every reconnect is followed by a settle window
// in which the device list is ignored, because that churn is our own. The
// schedule itself is covered by
// JoyShockMapper/tests/autoconnect_retry_harness.cpp.
//
// Run: node tests/autoconnect_reconnect_regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JSM = path.join(__dirname, '..', 'JoyShockMapper/JoyShockMapper');
const read = (rel) => fs.readFileSync(path.join(JSM, rel), 'utf8');

const AUTOCONNECT_CPP = read('src/AutoConnect.cpp');
const SDLWRAPPER_CPP = read('src/SDLWrapper.cpp');
const JSLWRAPPER_H = read('include/JslWrapper.h');
const LEGACY_CPP = read('src/JslWrapper.cpp');

const RECONNECT = 'WriteToConsole("RECONNECT_CONTROLLERS")';

/** The body of a function, braces included, found by its signature. */
function methodBody(source, signature) {
  const m = source.match(signature);
  assert.ok(m, `signature not found: ${signature}`);
  const start = source.indexOf('{', m.index + m[0].length);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces for ${signature}`);
}

const pollBody = () => methodBody(AUTOCONNECT_CPP, /bool AutoConnect::AutoConnectPoll\([^)]*\)\s*/);
const censusBody = () => methodBody(SDLWRAPPER_CPP, /DeviceCensus TakeDeviceCensus\(\) override\s*/);

/** Index just past the `if (lastSize != realSize) { ... }` block. */
function countBranchEnd(body) {
  const m = body.match(/if\s*\(\s*lastSize\s*!=\s*realSize\s*\)/);
  assert.ok(m, 'the device-count trigger is gone from AutoConnectPoll');
  const start = body.indexOf('{', m.index + m[0].length);
  let depth = 0;
  for (let i = start; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error('the device-count branch never closes');
}

const afterCountBranch = () => pollBody().slice(countBranchEnd(pollBody()));

const checks = [];
const check = (name, fn) => checks.push([name, fn]);

check('a device-count change still reconnects immediately', () => {
  const branch = pollBody().slice(0, countBranchEnd(pollBody()));
  assert.ok(branch.includes('reconnect('), 'a change in device count no longer reconnects');
});

check('bug 1: a failed reconnect is retried outside the count branch', () => {
  assert.ok(afterCountBranch().includes('reconnect('),
    'AutoConnectPoll can only reconnect when the device count changes -- a reconnect ' +
    'that fails while the count stays put (a controller woken from sleep, re-enumerated ' +
    'before its driver classified it) is never retried');
});

check('the retry is driven by the last connect attempt, not a timer', () => {
  const after = afterCountBranch();
  assert.ok(after.includes('census.failedToOpen'),
    'the retry does not ask what the last connect attempt failed to open, so it ' +
    'cannot tell a healthy session from a failed reconnect');
  assert.ok(after.indexOf('census.failedToOpen') < after.indexOf('reconnect('),
    'the retry reconnects before checking whether anything actually failed to open ' +
    '-- that reconnects a healthy session on a timer');
});

check('bug 4: the retry does not chase our own virtual pad', () => {
  // VIRTUAL_CONTROLLER creates a ViGEm pad AFTER ConnectDevices() has
  // enumerated, so SDL lists it while _controllerMap does not -- permanently.
  // A retry keyed on that live diff spends its entire budget reconnecting
  // over a device JSM created itself and must never open, which is what the
  // log showed: "1 device connected" beside "1 device(s) listed but not open".
  const after = afterCountBranch();
  assert.ok(!after.includes('census.unopened'),
    'the retry is driven by a live listed-but-not-open diff again, which counts ' +
    'our own virtual pad forever and burns the budget on it every session');
  const census = censusBody();
  assert.ok(census.includes('_failedToOpen'),
    'the census recomputes what is unopened instead of reporting what the last ' +
    'connect attempt recorded, so it cannot tell our own virtual pad apart from a ' +
    'controller that genuinely failed to attach');
  assert.ok(!census.includes('_joystickId'),
    'the census is back to diffing SDL ids against the open map, which is the ' +
    'comparison that counts our own virtual pad as a device needing a retry');
});

check('bug 2: the retry never renews its own budget', () => {
  const after = afterCountBranch();
  assert.ok(!after.includes('renew()'),
    'the retry refills its own budget, so a device that never opens reconnects the ' +
    'session forever, dropping a working Steam Controller into Lizard Mode each time');
  assert.ok(!after.includes('Gamepad::getCount()'),
    'the retry mixes the count of our own virtual pads into a decision about real ' +
    'controllers. Those are different populations: with one controller open and one ' +
    'virtual pad created, opened - virtual reads 0 and it concludes nothing is connected');
});

check('bug 3: only the device count arms the retry', () => {
  assert.ok(!afterCountBranch().includes('arm()'),
    're-arms the retry after the device-count branch. Whatever it keys on is state a ' +
    'reconnect itself produces, which is a loop that unplugs the controller repeatedly');
});

check('every reconnect starts a settle window', () => {
  const body = pollBody();
  assert.ok(body.includes('settleTicks'), 'the poll has no settle window after a reconnect');
  assert.ok(body.indexOf('settleTicks') < body.indexOf('lastSize != realSize'),
    'the settle window is checked after the device-count trigger, so the reconnect we ' +
    'just issued can still set it off');
  const issued = AUTOCONNECT_CPP.split(RECONNECT).length - 1;
  assert.equal(issued, 1,
    'RECONNECT_CONTROLLERS is written from more than one place, so a path can reconnect ' +
    'without starting the settle window that stops it looping');
  const helper = methodBody(AUTOCONNECT_CPP, /void AutoConnect::reconnect\([^)]*\)\s*/);
  assert.ok(helper.includes('settleTicks =') && helper.includes(RECONNECT),
    'the one place that reconnects does not start the settle window');
});

check('the settle window resyncs rather than freezing', () => {
  // Absorbing the churn means adopting it: if the window ended without
  // updating lastSize, the next tick would read our own reconnect as a device
  // change and fire again -- the loop, one tick later.
  const body = pollBody();
  const window = body.slice(body.indexOf('settleTicks'), body.indexOf('lastSize != realSize'));
  assert.ok(window.includes('lastSize = realSize'),
    'the settle window does not resync lastSize, so the first tick after it reads our ' +
    'own reconnect as a device change and starts over');
});

check('the open-failure count is recorded where it is known', () => {
  // Only the connect attempt knows which devices it actually tried to open.
  // Once it is over, a device it failed on is indistinguishable from one that
  // was never there -- and from our own virtual pad, which is listed and
  // never opened by design.
  const handles = methodBody(SDLWRAPPER_CPP, /int GetConnectedDeviceHandles\([^)]*\) override\s*/);
  assert.ok(handles.includes('_failedToOpen = 0'),
    'GetConnectedDeviceHandles does not reset the open-failure count, so failures ' +
    'from an old attempt keep driving retries after a later one succeeded');
  assert.ok(handles.includes('++_failedToOpen'),
    'GetConnectedDeviceHandles drops the fact that a device it tried to open did ' +
    'not open, which is the one moment anyone knows it');
  assert.ok(censusBody().includes('SDL_GetJoysticks'),
    'the census does not read the live SDL list for the device count');
});

check('the census refreshes without holding the controller lock', () => {
  // Same constraint autoconnect_lock_regression.py enforces on its
  // neighbours: RefreshDeviceList locks per phase, so an outer lock would
  // re-introduce the 20ms poll-loop stall and deadlock the non-recursive mutex.
  const body = censusBody();
  assert.ok(!body.slice(0, body.indexOf('RefreshDeviceList()')).includes('lock_guard'),
    'the census holds controller_lock across RefreshDeviceList()');
});

check('the poll takes only one census per tick', () => {
  // RefreshDeviceList carries a 20ms settle, and AutoConnect runs every second
  // for the whole session.
  const count = pollBody().split('TakeDeviceCensus()').length - 1;
  assert.equal(count, 1,
    'AutoConnectPoll asks for more than one census per tick, paying the 20ms ' +
    'device-list settle twice a second forever');
});

check('the legacy backend reports a usable census', () => {
  // JoyShockLibrary cannot enumerate without connecting. Taking the base class
  // default there would report zero devices, which AutoConnect reads as
  // everything having been unplugged.
  assert.ok(LEGACY_CPP.includes('TakeDeviceCensus'),
    'the JoyShockLibrary backend has no census of its own, so it inherits the empty ' +
    'default and reads as "every device unplugged" on every poll');
  const body = methodBody(LEGACY_CPP, /DeviceCensus TakeDeviceCensus\(\) override\s*/);
  assert.ok(body.includes('_deviceCount'), 'the legacy census reports nothing it knows');
  assert.ok(!body.includes('census.unopened'),
    'the legacy backend claims to know about unopened devices; it cannot, and a ' +
    'non-zero count there would drive a retry that can never succeed');
});

check('the wrapper interface default keeps other backends building', () => {
  assert.match(JSLWRAPPER_H, /virtual DeviceCensus TakeDeviceCensus\(\)\s*\{\s*return DeviceCensus\{\};\s*\}/,
    'TakeDeviceCensus is not a defaulted virtual on JslWrapper, so a backend that ' +
    'cannot answer it fails to build');
});

let failures = 0;
// Bug 5 -- a controller switched back on through its dongle never came back.
// SDL rescans HID devices only on a Windows device-change notification,
// delivered to a window owned by the thread that called SDL_Init (our main
// thread, parked in the console read). Turning a Steam Controller off makes
// SDL drop it, but the dongle's interfaces never leave, so Windows reports no
// change when it returns and SDL never looks again. While nothing is
// connected, AutoConnect has SDL enumerate from scratch every few polls.
check('bug 5: idle rescan only while nothing is open, and never in a settle window', () => {
  const body = pollBody();
  const at = body.indexOf('RescanDevices()');
  assert.ok(at >= 0, 'AutoConnectPoll never rescans, so a controller turned back on through its dongle is never seen');
  const guard = body.slice(0, at);
  assert.match(guard, /settleTicks\s*==\s*0/, 'the rescan can run inside the settle window after our own reconnect');
  assert.match(guard, /census\.opened\s*==\s*0/, 'the rescan is not limited to when nothing is open');
  assert.ok(at < countBranchEnd(body), 'the rescan must come before the device-count trigger, so the next census reports what it found');
  const rescan = methodBody(SDLWRAPPER_CPP, /void RescanDevices\(\) override\s*/);
  assert.match(rescan, /_controllerMap\.empty\(\)/, 'RescanDevices would restart SDL with controllers open -- closing them hands a Steam Controller back to Lizard Mode');
  assert.ok(rescan.indexOf('_controllerMap.empty()') < rescan.indexOf('SDL_QuitSubSystem'), 'RescanDevices checks for open controllers only after restarting SDL');
  assert.match(JSLWRAPPER_H, /virtual void RescanDevices\(\)\s*\{\s*\}/, 'the wrapper interface needs a no-op default for other backends');
});

for (const [name, fn] of checks) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}
process.exit(failures ? 1 : 0);
