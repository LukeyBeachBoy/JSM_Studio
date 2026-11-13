// Run the real overlay bundle against a controllable Tauri bridge. Covers a
// held menu through HDMI removal, late monitor replies, and config changes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const URL = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/overlay.html';

function bridge() {
  const callbacks = {}, listeners = {};
  let id = 0;
  window.__reads = 0;
  window.__bounds = [];
  window.__profile = 'Game.txt';
  window.__size = 280;
  window.__area = { x: 2560, y: 0, width: 3840, height: 2160, scale: 1.5 };
  window.__emit = (event, payload) => {
    for (const handler of listeners[event] || []) callbacks[handler]({ event, id: handler, payload });
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { callbacks[++id] = cb; return id; },
    invoke(cmd, args) {
      if (cmd === 'plugin:event|listen') {
        (listeners[args.event] ||= []).push(args.handler);
        return Promise.resolve(args.handler);
      }
      if (cmd === 'get_active_profile') {
        window.__reads++;
        const profile = window.__profile, size = window.__size;
        const result = { path: profile, content: [
          'RIGHT_STICK_MODE = RADIAL_MENU', 'RIGHT_STICK_MENU_SIZE = 4',
          'RIGHT_STICK_MENU_DEADZONE = 0.1', 'RM1 = 1', 'RM2 = 2', 'RM3 = 3', 'RM4 = 4',
          `# @overlay RSTICK at 0.5 0.5 size ${size} show touch`,
        ].join('\n') };
        if (window.__slowRead) return new Promise(resolve => { window.__finishRead = () => resolve(result); });
        return Promise.resolve(result);
      }
      if (cmd === 'get_latest_telemetry_sample') return Promise.resolve({ activeProfile: window.__profile, devices: [] });
      if (cmd === 'overlay_workarea') {
        if (window.__slowArea) return new Promise(resolve => { window.__finishArea = () => resolve(window.__area); });
        return Promise.resolve(window.__area);
      }
      if (cmd === 'overlay_set_bounds') window.__bounds.push(args);
      return Promise.resolve(null);
    },
  };
}
const packet = { buttons: 0, leftPad: null, rightPad: null, leftStick: null,
  rightStick: { x: 0.5, y: 0 }, touchpadWidth: 0, touchpadHeight: 0, activeProfile: 'Game.txt' };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(bridge);
    await page.goto(URL);
    await page.waitForFunction(() => window.__reads > 0);
    const move = async () => {
      await page.evaluate(p => window.__emit('overlay-telemetry', p), packet);
      await page.waitForTimeout(60);
    };
    await page.waitForTimeout(250);
    await move(); await move();
    const visible = () => page.locator('[data-visible]').first().getAttribute('data-visible');
    assert.equal(await visible(), 'true');

    const before = await page.evaluate(() => ({ reads: window.__reads, moves: window.__bounds.length }));
    await page.waitForTimeout(4300);
    assert.deepEqual(await page.evaluate(() => ({ reads: window.__reads, moves: window.__bounds.length })), before,
      'no two-second profile reload or repeated move while a menu is held');

    await page.evaluate(() => window.__emit('overlay-display-ready', false));
    await move();
    assert.equal(await visible(), 'false', 'hide during HDMI negotiation even with a held stick');
    await page.evaluate(() => {
      window.__area = { x: 0, y: 0, width: 1920, height: 1080, scale: 1 };
      window.__emit('overlay-display-ready', true);
    });
    await move(); await move();
    assert.equal(await visible(), 'true', 'held menu recovers without a new activation');
    const box = await page.evaluate(() => window.__bounds.at(-1));
    assert.ok(box.x >= 0 && box.x + box.width <= 1920 && box.y + box.height <= 1080,
      'recovered overlay fits the remaining display');

    await page.evaluate(() => {
      window.__slowArea = true;
      window.__size = 320;
      window.__emit('overlay-config-changed', null);
    });
    await page.waitForFunction(() => typeof window.__finishArea === 'function');
    const moves = await page.evaluate(() => window.__bounds.length);
    await page.evaluate(() => {
      window.__emit('overlay-display-ready', false);
      window.__finishArea();
    });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__bounds.length), moves,
      'late reply from the removed monitor cannot enqueue a stale move');
    assert.equal(await visible(), 'false');
    await page.evaluate(() => { window.__slowArea = false; window.__emit('overlay-display-ready', true); });
    await move(); await move();
    assert.equal(await visible(), 'true');

    await page.evaluate(() => {
      window.__slowRead = true;
      window.__size = 360;
      window.__emit('overlay-config-changed', null);
    });
    await page.waitForFunction(() => typeof window.__finishRead === 'function');
    const reads = await page.evaluate(() => window.__reads);
    await page.evaluate(() => {
      window.__size = 400;
      window.__emit('overlay-config-changed', null);
      window.__emit('applied-profile-changed', null);
    });
    assert.equal(await page.evaluate(() => window.__reads), reads, 'coalesce concurrent reload requests');
    await page.evaluate(() => { window.__slowRead = false; window.__finishRead(); });
    await page.waitForFunction(() => window.__bounds.at(-1)?.width === 400);
    assert.deepEqual(errors, []);
    console.log('PASS: idle overlay has no recurring reads/moves; HDMI recovery, stale-placement cancellation, and coalesced config reloads work');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
