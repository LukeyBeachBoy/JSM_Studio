// In a four-way pad menu every wedge must stack its icon, label and key on one
// centre line, and each wedge's block must still sit on its own side of the pad.
//
// Those are two jobs, and doing both with the region's `align-items` cost the
// left and right wedges the first one: to push their block off centre they
// aligned their contents to an edge, which also flush-aligned the narrow icon
// and key against the wide label. Up and down looked right only because their
// block is centred horizontally anyway, so they never overrode `center`.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS', 'TELEMETRY_ENABLED = ON',
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'LEFT_GRID_SHAPE = FOUR_WAY', 'LEFT_GRID_REQUIRES_CLICK = ON',
  // Deliberately lopsided: a wide label with a narrow icon and key is what makes
  // an edge alignment visible. A short label would hide the bug.
  'LT1 = R', 'LT2 = B', 'LT3 = V', 'LT4 = G',
  '# @label LT1 = Rotate', '# @icon LT1 = game-icons:clockwise-rotation',
  '# @label LT2 = Snap', '# @icon LT2 = game-icons:vine-whip',
  '# @label LT3 = Dismantle', '# @icon LT3 = game-icons:explosion-rays',
  '# @label LT4 = Supply crate', '# @icon LT4 = game-icons:wooden-crate',
  '# @overlay LEFT at 0.2 0.75 size 180',
].join('\n');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(p => {
      const profiles = { Wedge: p };
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Wedge', path: 'profiles-library/Wedge.txt', content: profiles.Wedge }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async n => ({ name: n, content: profiles[n] }),
        readConfigFile: async () => null,
        saveLibraryProfile: async (n, c) => { profiles[n] = c; return { name: n } },
        applyProfile: async (x) => ({ path: x, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'x', activeProfile: 'profiles-library/Wedge.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const i = setInterval(emit, 300); return () => clearInterval(i);
      } };
    }, PROFILE);

    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('.profile-chip').filter({ hasText: 'Wedge' }).waitFor();
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    await page.locator('[class*=wedges]').first().waitFor();

    const measure = () => page.evaluate(() => {
      const pad = [...document.querySelectorAll('[class*=pad]')].find(p => p.className.includes('wedges'));
      if (!pad) return null;
      const mid = el => { const r = el.getBoundingClientRect(); return r.width ? r.left + r.width / 2 : null };
      return [...pad.children].filter(c => c.className.includes('region')).map((r, i) => {
        const spans = [...r.querySelectorAll('span')].filter(s => !s.className.includes('hint'));
        return {
          name: ['Up', 'Right', 'Down', 'Left'][i],
          icon: mid(r.querySelector('svg')),
          label: spans[0] ? mid(spans[0]) : null,
          key: spans[1] ? mid(spans[1]) : null,
        };
      });
    });

    const wedges = await measure();
    assert.ok(wedges && wedges.length === 4, `expected four wedges, got ${JSON.stringify(wedges)}`);

    // 1. Within a wedge, the three parts share a centre line.
    for (const w of wedges) {
      assert.ok(w.icon !== null && w.label !== null && w.key !== null,
        `${w.name}: a part did not render: ${JSON.stringify(w)}`);
      assert.ok(Math.abs(w.icon - w.label) <= 1,
        `${w.name}: icon is ${(w.icon - w.label).toFixed(1)}px off its label`);
      assert.ok(Math.abs(w.key - w.label) <= 1,
        `${w.name}: key is ${(w.key - w.label).toFixed(1)}px off its label`);
    }

    // 2. ...and the blocks still sit on their own sides. Centring everything in
    // the pad would satisfy (1) and be wrong in the other direction.
    const by = name => wedges.find(w => w.name === name).label;
    assert.ok(by('Left') < by('Up') - 10, `Left block is not left of centre: ${JSON.stringify(wedges)}`);
    assert.ok(by('Right') > by('Up') + 10, `Right block is not right of centre: ${JSON.stringify(wedges)}`);
    assert.ok(Math.abs(by('Up') - by('Down')) <= 1, 'Up and Down should share the pad centre line');

    // 3. The guard is only worth having if it can fail. Collapsing the wrapper
    // puts the parts back to being the region's own flex items, which is the
    // pre-fix DOM -- the left wedge should then come apart.
    await page.addStyleTag({ content: '[class*=wedgeContent]{display:contents !important}' });
    await page.waitForTimeout(200);
    const collapsed = await measure();
    const left = collapsed.find(w => w.name === 'Left');
    assert.ok(Math.abs(left.icon - left.key) > 5,
      `without the wrapper the left wedge should mis-align, so this test would not have caught the bug: ${JSON.stringify(left)}`);

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS: every four-way wedge centres its icon, label and key on one line, and each block stays on its own side');
  } finally { await browser.close(); }
})();
