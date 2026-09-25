// A binding can load a different configuration without Studio knowing. When it
// does, the menus on screen belong to a profile the controller is no longer
// running, and the overlay must stop drawing them.
//
// It used to re-read the active profile on a 2 second interval and nothing
// else, so for up to two seconds after a chord swapped the configuration the
// first stick tilt or pad touch put up the OLD profile's menu -- a weapon wheel
// over a config whose stick is a scroll wheel. Moving again after the poll had
// landed showed nothing, which is what made it look intermittent.
//
// Drives the real overlay document with a stubbed Tauri bridge; no controller.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/overlay.html';

// The game profile: the right stick is a weapon wheel.
const WHEEL = [
  'RIGHT_STICK_MODE = RADIAL_MENU',
  'RIGHT_STICK_MENU_SIZE = 4',
  'RIGHT_STICK_MENU_DEADZONE = 0.5',
  'RM1 = 1', 'RM2 = 2', 'RM3 = 3', 'RM4 = 4',
  '# @label RM1 = Primary',
  '# @overlay RSTICK at 0.5 0.5 size 280 show touch',
].join('\n');

// What a chord swaps to: the same stick is a scroll wheel, with no menu at all.
const SCROLL = [
  'RIGHT_STICK_MODE = SCROLL_WHEEL',
  'SCROLL_SENS = 76',
].join('\n');

function installTauriStub(profiles) {
  const callbacks = {};
  let nextId = 1;
  // What the mapper is running; the test moves this the way a chord would.
  window.__live = 'profiles-library/Game.txt';
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { const id = nextId++; callbacks[id] = cb; return id; },
    invoke(cmd, args) {
      if (cmd === 'plugin:event|listen') {
        window.__emit = payload => callbacks[args.handler]({ event: args.event, id: 1, payload });
        return Promise.resolve(1);
      }
      // Studio's SELECTION never moves here: only the mapper switches.
      if (cmd === 'get_active_profile') {
        return Promise.resolve({ path: 'profiles-library/Game.txt', content: profiles['profiles-library/Game.txt'] });
      }
      if (cmd === 'get_latest_telemetry_sample') return Promise.resolve({ activeProfile: window.__live });
      if (cmd === 'read_config_file') return Promise.resolve(profiles[args.path] ?? null);
      if (cmd === 'overlay_workarea') return Promise.resolve({ x: 0, y: 0, width: 1920, height: 1080 });
      return Promise.resolve(null);
    },
  };
}

const packet = (magnitude, live) => ({
  buttons: 0, leftPad: null, rightPad: null, leftStick: null,
  rightStick: { x: 0, y: magnitude },
  touchpadWidth: 0, touchpadHeight: 0,
  activeProfile: live,
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 320 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(installTauriStub, {
      'profiles-library/Game.txt': WHEEL,
      'profiles-library/Chord.txt': SCROLL,
    });
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__emit);

    const tilt = async (magnitude, live) => {
      for (let i = 0; i < 2; i += 1) {
        await page.evaluate(p => window.__emit(p), packet(magnitude, live));
        await page.waitForTimeout(50);
      }
      return page.locator('[data-visible]').first().getAttribute('data-visible');
    };

    // The wheel is there to begin with, or the rest of this proves nothing.
    assert.equal(await tilt(0.3, 'profiles-library/Game.txt'), 'true',
      'the weapon wheel must show while its own profile is running');
    assert.equal(await tilt(0, 'profiles-library/Game.txt'), 'false', 'and go away when the stick rests');

    // A chord swaps the configuration. The very next tilt must NOT show the
    // wheel: that is the first movement the user makes while holding the chord.
    await page.evaluate(() => { window.__live = 'profiles-library/Chord.txt'; });
    const firstMove = await tilt(0.3, 'profiles-library/Chord.txt');
    assert.equal(firstMove, 'false',
      'the first tilt after a configuration swap must not show the old profile menu');

    // And it stays gone while the chord is held.
    assert.equal(await tilt(0.9, 'profiles-library/Chord.txt'), 'false',
      'nor at full deflection');

    // Releasing the chord brings the real menu back.
    await page.evaluate(() => { window.__live = 'profiles-library/Game.txt'; });
    await page.evaluate(p => window.__emit(p), packet(0, 'profiles-library/Game.txt'));
    await page.waitForTimeout(150);
    assert.equal(await tilt(0.3, 'profiles-library/Game.txt'), 'true',
      'the weapon wheel must come back once its profile is running again');

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS: a configuration swap drops the old menus on the packet that reports it, not two seconds later');
  } finally {
    await browser.close();
  }
})();
