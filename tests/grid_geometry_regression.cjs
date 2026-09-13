// The parity test proves the hit-test MATHS matches the backend. It cannot see
// whether what is DRAWN matches that maths -- and that is its own bug class:
//
//   the grid set gridTemplateColumns but not gridTemplateRows, so rows were
//   `auto` and sized to content. One region with an icon grew taller and pushed
//   the boundary into the next row. A touch inside the visible "Drop" box fired
//   the action below it.
//
// So this measures the real rendered cells in a real browser and requires the
// cell a point falls inside to be the cell the hit test selects.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const URL = process.env.JSM_TEST_URL || 'http://127.0.0.1:1420';

// A 2x2 pad where exactly one region carries an icon -- the shape that broke.
const CONFIG = [
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SIZE = 2 2',
  'LT1 = G',
  'LT2 = F',
  'LT3 = R',
  'LT4 = V',
  '# @label LT1 = Drop',
  '# @icon LT1 = game-icons:parachute',
].join('\n');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL);

    // Drive the config editor the way a person would, so this exercises the
    // real render path rather than a hand-built DOM.
    await page.getByRole('button', { name: 'Edit config', exact: true }).click();
    const editor = page.locator('textarea').first();
    await editor.waitFor();
    await editor.fill(CONFIG);
    // Its own Close button: the toolbar toggle is covered by the panel itself.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await editor.waitFor({ state: 'hidden' });

    // Trackpads page, where the pad preview lives.
    await page.getByText('Trackpads', { exact: true }).first().click();
    // The editor preview and the live overlay are one renderer now, so a
    // region is the overlay's own element: a div with the button role, named
    // '<command>: <label>'. Ordering by that name keeps LT1..LT4 in index
    // order rather than DOM order, which a wheel does not guarantee.
    const cells = page.locator('[role=button][aria-label^="LT"]');
    await cells.first().waitFor();
    assert.equal(await cells.count(), 4, 'expected four rendered regions');

    const named = await cells.evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    const boxes = [];
    for (let i = 1; i <= 4; i++) {
      const index = named.findIndex(name => name.startsWith(`LT${i}:`) || name === `LT${i}`);
      assert.ok(index >= 0, `LT${i} is not drawn: ${named.join(', ')}`);
      boxes.push(await cells.nth(index).boundingBox());
    }
    assert.ok(boxes.every(Boolean), 'every region must be laid out');

    // --- the invariant -------------------------------------------------------
    // Equal quarters: every cell the same size, rows level with each other.
    const w = boxes[0].width;
    const h = boxes[0].height;
    boxes.forEach((b, i) => {
      assert.ok(Math.abs(b.width - w) <= 1, `region ${i + 1} is a different width (${b.width} vs ${w})`);
      assert.ok(
        Math.abs(b.height - h) <= 1,
        `region ${i + 1} is a different height (${b.height} vs ${h}) -- an icon has grown its row`
      );
    });
    // Rows are level with each other.
    assert.ok(Math.abs(boxes[0].y - boxes[1].y) <= 1, 'LT1 and LT2 must sit on the same row');
    assert.ok(Math.abs(boxes[2].y - boxes[3].y) <= 1, 'LT3 and LT4 must sit on the same row');

    // --- the decisive check --------------------------------------------------
    // The hit test splits the pad into equal fractions with no gaps. The cells
    // are drawn with a gap between them, so they are a little smaller -- but
    // each one must stay INSIDE its own fraction. The reported bug was exactly
    // this: an icon grew LT1 past the halfway line, so a touch that looked like
    // it was on "Drop" was already in the row below.
    const gridLeft = Math.min(...boxes.map(b => b.x));
    const gridTop = Math.min(...boxes.map(b => b.y));
    const gridW = Math.max(...boxes.map(b => b.x + b.width)) - gridLeft;
    const gridH = Math.max(...boxes.map(b => b.y + b.height)) - gridTop;
    const SLACK = 1.5; // sub-pixel layout rounding

    boxes.forEach((b, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const idealLeft = gridLeft + (col / 2) * gridW;
      const idealRight = gridLeft + ((col + 1) / 2) * gridW;
      const idealTop = gridTop + (row / 2) * gridH;
      const idealBottom = gridTop + ((row + 1) / 2) * gridH;
      assert.ok(b.x >= idealLeft - SLACK, `LT${index + 1} starts left of its own column`);
      assert.ok(b.x + b.width <= idealRight + SLACK, `LT${index + 1} overflows into the next column`);
      assert.ok(b.y >= idealTop - SLACK, `LT${index + 1} starts above its own row`);
      assert.ok(
        b.y + b.height <= idealBottom + SLACK,
        `LT${index + 1} overflows into the next row -- an icon has grown it past the boundary the hit test uses`
      );
    });

    // Every cell centre must resolve to its own region, the simplest statement
    // of "what you are looking at is what will fire".
    boxes.forEach((b, index) => {
      const fx = (b.x + b.width / 2 - gridLeft) / gridW;
      const fy = (b.y + b.height / 2 - gridTop) / gridH;
      const selected = Math.min(1, Math.floor(fy * 2)) * 2 + Math.min(1, Math.floor(fx * 2));
      assert.equal(selected, index, `the centre of LT${index + 1} selects region ${selected + 1}`);
    });

    assert.deepEqual(errors, [], 'no page errors');
    console.log('grid geometry: rendered regions match the hit test, with and without icons');
  } finally {
    await browser.close();
  }
})();
