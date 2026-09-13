// The stick wheel arrived on screen as a column of labels down the left edge of
// a circle, with the segments clipped into slivers:
//
//   every segment sits in grid cell 1/1 and is cut out of it by clip-path, so
//   the cell has to BE the whole wheel. Overlay.tsx skipped the inline grid
//   template only for FOUR_WAY, so a RADIAL menu still got
//   `grid-template-columns: repeat(4, 1fr)` -- four real tracks. Each segment
//   was then clipped inside a quarter-width sliver of the first column.
//
// tests/overlay_layout_regression.cjs proves the hit-test MATHS matches the
// backend; like the pad grid before it, nothing checked what is actually DRAWN.
// So this renders the real overlay document in a real browser, stubs only the
// Tauri IPC boundary underneath it, and measures the result.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/overlay.html';

// A four-segment right-stick wheel -- the weapon switcher that showed the bug.
const PROFILE = [
  'RIGHT_STICK_MODE = RADIAL_MENU',
  'RIGHT_STICK_MENU_SIZE = 4',
  'RIGHT_STICK_MENU_DEADZONE = 0.35',
  'RM1 = 1',
  'RM2 = 2',
  'RM3 = 3',
  'RM4 = 4',
  '# @overlay RSTICK at 0.5 0.5 size 280',
].join('\n');

// Stubs the Tauri IPC boundary, so the REAL Overlay component runs unmodified.
// @tauri-apps/api routes every invoke and every event subscription through
// window.__TAURI_INTERNALS__, which is the whole of what a webview provides.
function installTauriStub(profile) {
  const callbacks = {};
  let nextId = 1;
  // The event plugin's own teardown path, which the api package reaches for
  // directly rather than through invoke().
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) {
      const id = nextId++;
      callbacks[id] = cb;
      return id;
    },
    invoke(cmd, args) {
      switch (cmd) {
        case 'plugin:event|listen':
          window.__emit = payload => callbacks[args.handler]({ event: args.event, id: 1, payload });
          return Promise.resolve(1);
        case 'plugin:event|unlisten':
          return Promise.resolve(null);
        case 'get_active_profile':
          return Promise.resolve({ path: 'test.txt', content: profile });
        case 'read_config_file':
          return Promise.resolve(null);
        case 'overlay_workarea':
          return Promise.resolve({ x: 0, y: 0, width: 1920, height: 1080 });
        default:
          return Promise.resolve(null);
      }
    },
  };
}

// Right stick pushed up and slightly right: inside segment 0, outside the
// deadzone, so the wheel is live and one segment is selected.
const PACKET = {
  buttons: 0,
  leftPad: null,
  rightPad: null,
  leftStick: null,
  rightStick: { x: 0.1, y: 0.9 },
  touchpadWidth: 0,
  touchpadHeight: 0,
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(installTauriStub, PROFILE);
    await page.goto(URL);

    // The component polls the profile on an interval; wait for the first read.
    await page.waitForFunction(() => !!window.__emit);
    // Twice on purpose. The first packet is what decides WHICH menu is up, and
    // the highlight is written straight to the DOM -- so on that packet the
    // region elements do not exist yet and there is nothing to mark. The stream
    // runs at the display's refresh rate, so the real cost is one frame.
    await page.evaluate(packet => window.__emit(packet), PACKET);

    const pad = page.locator('[class*="pad"]').first();
    await pad.waitFor({ timeout: 5000 });
    await page.evaluate(packet => window.__emit(packet), PACKET);
    const segments = page.locator('[data-selected]');
    assert.equal(await segments.count(), 4, 'expected four wheel segments');

    const padBox = await pad.boundingBox();
    const boxes = [];
    for (let i = 0; i < 4; i++) boxes.push(await segments.nth(i).boundingBox());

    // --- invariant 1: every segment IS the wheel -----------------------------
    // They are cut apart by clip-path, not by layout, so each element's box has
    // to cover the whole pad. Any segment smaller than the pad means the wheel
    // is being clipped out of a box that is not the wheel.
    // Against the pad's CONTENT box: the segments sit inside its border, so
    // comparing with the border box is off by the border width on each side.
    const inner = await pad.evaluate(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      const l = parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
      const t = parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
      return { x: r.x + l, y: r.y + t, width: el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight), height: el.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) };
    });
    boxes.forEach((b, i) => {
      assert.ok(
        Math.abs(b.width - inner.width) <= 1 && Math.abs(b.height - inner.height) <= 1,
        `segment ${i + 1} is ${b.width}x${b.height} but the wheel is ${inner.width}x${inner.height}`
        + ' -- it is being clipped inside a grid track instead of the whole pad'
      );
      assert.ok(
        Math.abs(b.x - inner.x) <= 1 && Math.abs(b.y - inner.y) <= 1,
        `segment ${i + 1} does not start at the wheel's origin`
      );
    });

    // --- invariant 2: the labels sit around the wheel, not in a column -------
    // Segment 0 is centred on up and they run clockwise, matching
    // touchRadialCell. This is the statement the screenshot contradicted: the
    // four labels were stacked vertically down the left-hand edge.
    const cx = padBox.x + padBox.width / 2;
    const cy = padBox.y + padBox.height / 2;
    const labels = [];
    for (let i = 0; i < 4; i++) {
      const el = segments.nth(i).locator('span').first();
      const b = await el.boundingBox();
      labels.push({ x: b.x + b.width / 2 - cx, y: b.y + b.height / 2 - cy });
    }
    const MIN = padBox.width * 0.15; // comfortably clear of the centre
    assert.ok(labels[0].y < -MIN && Math.abs(labels[0].x) < MIN, `segment 1 should sit above the centre, got ${JSON.stringify(labels[0])}`);
    assert.ok(labels[1].x > MIN && Math.abs(labels[1].y) < MIN, `segment 2 should sit right of the centre, got ${JSON.stringify(labels[1])}`);
    assert.ok(labels[2].y > MIN && Math.abs(labels[2].x) < MIN, `segment 3 should sit below the centre, got ${JSON.stringify(labels[2])}`);
    assert.ok(labels[3].x < -MIN && Math.abs(labels[3].y) < MIN, `segment 4 should sit left of the centre, got ${JSON.stringify(labels[3])}`);

    // --- invariant 3: the wheel is round and the right one is lit ------------
    const radius = await pad.evaluate(el => getComputedStyle(el).borderTopLeftRadius);
    assert.ok(/50%|\d+px/.test(radius) && radius !== '0px', 'the wheel must be drawn round');
    const selected = await page.locator('[data-selected="true"]').count();
    assert.equal(selected, 1, 'exactly one segment should be highlighted');
    const selectedIndex = await page.evaluate(() =>
      [...document.querySelectorAll('[data-selected]')].findIndex(el => el.dataset.selected === 'true'));
    assert.equal(selectedIndex, 0, 'a stick pushed up should light the segment centred on up');

    // --- invariant 4: the hole you can SEE is the hole that is dead ---------
    // `deadzone` is the fraction of the pad from centre to edge that selects
    // nothing, and touchRadialCell compares hypot(dx, dy) against deadzone * 0.5
    // in 0..1 coordinates whose half width is 0.5 -- so the hole's radius is
    // `deadzone` of the wheel's radius. The drawing halved it, so the wheel
    // showed a hole half the size of the dead zone it stood for and a stick
    // pushed part way looked live while firing nothing.
    const DEADZONE = 0.35; // as set in PROFILE
    const hubBox = await page.locator('[class*="hub"]').boundingBox();
    assert.ok(
      Math.abs(hubBox.width - inner.width * DEADZONE) <= 2,
      `the drawn hole is ${hubBox.width}px across but the dead zone is `
      + `${inner.width * DEADZONE}px -- what is drawn does not match what fires`
    );

    // And the same statement made through the real pipeline rather than by
    // measuring: push the stick to either side of that radius and ask the
    // overlay what it thinks. Twice per push, for the one-frame reason above.
    const push = async magnitude => {
      const packet = { ...PACKET, rightStick: { x: 0, y: magnitude } };
      await page.evaluate(p => window.__emit(p), packet);
      await page.waitForTimeout(40);
      await page.evaluate(p => window.__emit(p), packet);
      await page.waitForTimeout(40);
      return page.locator('[data-selected="true"]').count();
    };
    assert.equal(await push(DEADZONE - 0.05), 0, 'a stick inside the drawn hole must select nothing');
    assert.equal(await push(DEADZONE + 0.05), 1, 'a stick just outside the drawn hole must select a segment');

    assert.deepEqual(errors, [], 'no page errors');
    console.log('overlay radial: segments fill the wheel, labels sit around it, the hole matches the dead zone');
  } finally {
    await browser.close();
  }
})();
