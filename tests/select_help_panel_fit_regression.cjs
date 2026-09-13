// A dropdown must stay a sensible width, and its help panel must stay on screen.
//
// Two faults produced one symptom. The popup took `min-width` from the trigger,
// and these triggers stretch to their settings column -- so a list of words like
// NO_SKIP rendered ~900px wide and left no room beside it. And the side the help
// panel sits on was measured in the Content's ref callback, which runs before
// Radix's popper has positioned the element, so the measurement was taken where
// the list was not yet: it read "acres of room on the right" and went right,
// off the edge of the window, at every size that mattered.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Kept in step with .content in Select.module.css (min-width cap).
const WIDTH_CAP = 22 * 16;

const stub = () => {
  const profiles = { Desktop: 'RESET_MAPPINGS\nN = SPACE\nZL_MODE = NO_SKIP\nZR_MODE = MUST_SKIP\n' };
  window.electronAPI = {
    getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
    listLibraryProfiles: async () => Object.keys(profiles),
    loadLibraryProfile: async n => ({ name: n, content: profiles[n] }),
    readConfigFile: async () => null,
    saveLibraryProfile: async (n, c) => { profiles[n] = c; return { name: n } },
    applyProfile: async p => ({ path: p, mappingEnabled: true }),
  };
  window.telemetry = { onSample: cb => {
    const emit = () => cb({ console: 'x', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
    emit(); const i = setInterval(emit, 200); return () => clearInterval(i);
  } };
};

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const measureAt = async width => {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      try {
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.addInitScript(stub);
        await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
        await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();
        await page.getByRole('button', { name: 'Triggers', exact: true }).click();
        const trigger = page.getByRole('combobox', { name: /full pull mode/i }).first();
        await trigger.waitFor();
        const tbox = await trigger.boundingBox();
        await trigger.click();
        const list = page.getByRole('listbox').first();
        await list.waitFor();
        const help = page.locator('[aria-live="polite"]').last();
        await help.waitFor();
        // The side is chosen a frame after opening; wait for that frame rather
        // than a sleep, so the test measures the settled placement.
        await page.waitForFunction(() => new Promise(r => requestAnimationFrame(() => r(true))));
        const lbox = await list.boundingBox();
        const hbox = await help.boundingBox();
        const side = (await help.getAttribute('class') || '').match(/right|left|bottom/)?.[0] ?? null;
        assert.deepEqual(errors, [], `page errors at ${width}: ${errors.join(', ')}`);
        return { width, trigger: tbox.width, list: lbox.width, listRight: lbox.x + lbox.width, help: hbox, side };
      } finally { await page.close(); }
    };

    const wide = [1920, 1440, 1180, 1058, 900];
    const narrow = [760, 700, 640];
    const results = [];
    for (const w of [...wide, ...narrow]) results.push(await measureAt(w));

    for (const r of results) {
      // The help panel is the whole point of the panel: it has to be readable.
      assert.ok(r.help.x >= 0 && r.help.x + r.help.width <= r.width + 1,
        `at ${r.width}px the help panel runs off screen (x=${Math.round(r.help.x)} w=${Math.round(r.help.width)}, side=${r.side})`);
      // A list of short words must not inherit a settings column's width.
      assert.ok(r.list <= WIDTH_CAP + 1,
        `at ${r.width}px the list is ${Math.round(r.list)}px wide, above the ${WIDTH_CAP}px cap`);
    }

    // The cap has to actually be biting, or this test proves nothing about it.
    const stretched = results.filter(r => r.trigger > WIDTH_CAP + 40);
    assert.ok(stretched.length >= 4, 'expected several widths where the trigger is far wider than the cap');
    for (const r of stretched) {
      assert.ok(r.list < r.trigger - 40,
        `at ${r.width}px the list (${Math.round(r.list)}) still tracks its ${Math.round(r.trigger)}px trigger`);
    }

    // With room to the right the panel goes right...
    assert.ok(results.filter(r => wide.includes(r.width)).every(r => r.side === 'right'),
      `panel should sit beside the list when there is room: ${JSON.stringify(results.map(r => [r.width, r.side]))}`);
    // ...and where neither side fits it drops below rather than off the edge.
    // This is what the ref-callback measurement could never do: it reported the
    // unpositioned rect and answered "right" at every size.
    const tightest = results.find(r => r.width === 640);
    assert.equal(tightest.side, 'bottom',
      `with no room either side the panel must drop below, got ${tightest.side}`);

    console.log('PASS: dropdown width is capped independently of its trigger, and the help panel stays on screen from 1920px down to 640px');
  } finally { await browser.close(); }
})();
