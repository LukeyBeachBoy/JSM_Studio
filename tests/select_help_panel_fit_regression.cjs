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
        // The app opens on Home (console refinement 2a); these checks start in the editing shell.
        await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
        await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();
        // Narrow windows fold the page tabs into the navigation drawer, so the
        // page buttons only exist once it is open.
        const triggersTab = page.getByRole('button', { name: 'Triggers', exact: true });
        const drawer = page.locator('.page-tabs__drawer-button');
        if (await drawer.isVisible()) await drawer.click();
        await triggersTab.first().click();
        const trigger = page.getByRole('combobox', { name: /trigger behavior/i }).first();
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
        return { width, trigger: tbox.width, list: lbox.width, listBox: lbox, listLeft: lbox.x, listRight: lbox.x + lbox.width, help: hbox, side };
      } finally { await page.close(); }
    };

    // The row's own settling width shifts the exact pixel a panel flips sides
    // at whenever the surrounding shell changes, so these buckets exist only to
    // exercise "plenty of room", "tight but still beside it" and "no room
    // either side" -- not to pin a specific side to a specific width.
    const wide = [1920, 1440, 1180, 1058, 900];
    const narrow = [760, 700, 640, 500];
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

    // A select now sits at the end of its setting row at no more than 320px
    // (Gyro.dc.html, "Output"), so a trigger stretched across the row -- what
    // the cap was guarding against -- should no longer happen at all. Where one
    // still does, the list must not track it.
    const stretched = results.filter(r => r.trigger > WIDTH_CAP + 40);
    for (const r of results) {
      assert.ok(r.trigger <= 320 + 1, `at ${r.width}px the trigger is ${Math.round(r.trigger)}px wide, not a row-end select`);
    }
    for (const r of stretched) {
      assert.ok(r.list < r.trigger - 40,
        `at ${r.width}px the list (${Math.round(r.list)}) still tracks its ${Math.round(r.trigger)}px trigger`);
    }

    // Whichever side is chosen, the panel must actually sit there rather than
    // overlapping the list it describes -- the invariant that matters, and one
    // that (unlike a fixed width-to-side table) does not go stale when the
    // surrounding shell's chrome changes how much room a row has to give.
    const GAP_TOLERANCE = 2;
    for (const r of results) {
      if (r.side === 'right') {
        assert.ok(r.help.x >= r.listRight - GAP_TOLERANCE,
          `at ${r.width}px side=right but the panel (x=${Math.round(r.help.x)}) overlaps the list (ends ${Math.round(r.listRight)})`);
      } else if (r.side === 'left') {
        assert.ok(r.help.x + r.help.width <= r.listLeft + GAP_TOLERANCE,
          `at ${r.width}px side=left but the panel (ends ${Math.round(r.help.x + r.help.width)}) overlaps the list (starts ${Math.round(r.listLeft)})`);
      } else {
        assert.equal(r.side, 'bottom', `at ${r.width}px the panel has no recognised side`);
        assert.ok(r.help.y >= r.listBox.y + r.listBox.height - GAP_TOLERANCE,
          `at ${r.width}px side=bottom but the panel (y=${Math.round(r.help.y)}) overlaps the list (ends ${Math.round(r.listBox.y + r.listBox.height)})`);
      }
    }

    // With plenty of room on both sides the panel prefers the right, same as
    // the reported bug's fix relied on.
    const roomiest = results.find(r => r.width === Math.max(...results.map(x => x.width)));
    assert.equal(roomiest.side, 'right',
      `expected the widest window (${roomiest.width}px) to have room on the right, got ${roomiest.side}`);
    // ...and where neither side fits it drops below rather than off the edge.
    // This is what the ref-callback measurement could never do: it reported the
    // unpositioned rect and answered "right" at every size.
    const tightest = results.find(r => r.width === Math.min(...results.map(x => x.width)));
    assert.equal(tightest.side, 'bottom',
      `with no room either side (${tightest.width}px) the panel must drop below, got ${tightest.side}`);

    console.log('PASS: dropdown width is capped independently of its trigger, the help panel stays on screen and never overlaps the list it describes, from 1920px down to 500px');
  } finally { await browser.close(); }
})();
