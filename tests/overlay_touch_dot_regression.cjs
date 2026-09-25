// The touch dot has to sit under the finger.
//
// It was centred twice -- `margin: -8px 0 0 -8px` AND `translate(-50%, -50%)` --
// so it drew half its own width up and to the left of where the finger was. And
// its offsets start at the pad's padding box while the container units that move
// it measure the CONTENT box, so it also ran short of the far corner. Touching
// the top-left put the dot mostly outside the pad; touching the bottom-right
// left it visibly short of it.
//
// The wedges are clip-path triangles filling a square cell, so they also need
// the pad to clip them, or they paint over its rounded corners.
//
// Drives the real overlay document with a stubbed Tauri bridge; no controller.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/overlay.html';

const PROFILE = [
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SHAPE = FOUR_WAY',
  'LT1 = R', 'LT2 = B', 'LT3 = V', 'LT4 = G',
  '# @label LT1 = Rotate', '# @label LT2 = Snap',
  '# @label LT3 = Dismantle', '# @label LT4 = Supply crate',
  '# @overlay LEFT at 0.5 0.5 size 280',
].join('\n');

function installTauriStub(text) {
  const callbacks = {};
  let nextId = 1;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { const id = nextId++; callbacks[id] = cb; return id; },
    invoke(cmd, args) {
      if (cmd === 'plugin:event|listen') {
        window.__emit = payload => callbacks[args.handler]({ event: args.event, id: 1, payload });
        return Promise.resolve(1);
      }
      if (cmd === 'get_active_profile') return Promise.resolve({ path: 't.txt', content: text });
      if (cmd === 'overlay_workarea') return Promise.resolve({ x: 0, y: 0, width: 1920, height: 1080 });
      return Promise.resolve(null);
    },
  };
}

// The pad reports -1..1 on each axis. Negative y is the TOP of the pad, which
// is what touchFourWayCell in the mapper uses.
const packet = (x, y) => ({
  buttons: 0, leftStick: null, rightStick: null, rightPad: null,
  leftPad: { x, y, touched: true, pressure: 0.5 },
  touchpadWidth: 0, touchpadHeight: 0,
});

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(installTauriStub, PROFILE);
    await page.goto(URL);
    await page.waitForFunction(() => !!window.__emit);

    const touch = async (x, y) => {
      // Twice: the first packet for a menu is the one that mounts it.
      for (let i = 0; i < 2; i += 1) {
        await page.evaluate(p => window.__emit(p), packet(x, y));
        await page.waitForTimeout(40);
      }
      return page.evaluate(() => {
        const dot = document.querySelector('[class*=dot]');
        const pad = document.querySelector('[class*=pad]');
        if (!dot || !pad) return null;
        const d = dot.getBoundingClientRect();
        const p = pad.getBoundingClientRect();
        const style = getComputedStyle(pad);
        const inset = parseFloat(style.paddingLeft) || 0;
        return {
          // Where the dot's centre sits inside the pad's own box.
          x: d.left + d.width / 2 - p.left,
          y: d.top + d.height / 2 - p.top,
          padWidth: p.width,
          padHeight: p.height,
          inset,
          border: parseFloat(style.borderLeftWidth) || 0,
          clipped: style.overflow,
          radius: parseFloat(style.borderTopLeftRadius) || 0,
        };
      });
    };

    // The drawn regions live inside the pad's border and padding; the dot must
    // share that box, at both ends of it.
    const topLeft = await touch(-1, -1);
    assert.ok(topLeft, 'the overlay must render a pad and a dot');
    const near = (actual, expected, what) =>
      assert.ok(Math.abs(actual - expected) <= 1.5,
        `${what}: expected ~${expected.toFixed(1)}px, got ${actual.toFixed(1)}px`);

    const start = topLeft.border + topLeft.inset;
    near(topLeft.x, start, 'a touch at the left edge puts the dot at the left edge');
    near(topLeft.y, start, 'a touch at the top edge puts the dot at the top edge');

    const bottomRight = await touch(1, 1);
    const end = topLeft.padWidth - topLeft.border - topLeft.inset;
    near(bottomRight.x, end, 'a touch at the right edge puts the dot at the right edge');
    near(bottomRight.y, topLeft.padHeight - topLeft.border - topLeft.inset,
      'a touch at the bottom edge puts the dot at the bottom edge');

    // The centre is the centre: this is what fails if only one of the two
    // centring offsets is removed.
    const middle = await touch(0, 0);
    near(middle.x, topLeft.padWidth / 2, 'a touch in the middle puts the dot in the middle');
    near(middle.y, topLeft.padHeight / 2, 'a touch in the middle puts the dot in the middle');

    // And the wedges must be cut by the pad's corners rather than painting over
    // them, which is the same clip that rounds the block of wedges.
    assert.equal(middle.clipped, 'hidden', 'the pad must clip its wedges');
    assert.ok(middle.radius > 0, 'the pad must keep its rounded corners');

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS: the touch dot lands under the finger at both corners and the centre, and the pad clips its wedges');
  } finally {
    await browser.close();
  }
})();
