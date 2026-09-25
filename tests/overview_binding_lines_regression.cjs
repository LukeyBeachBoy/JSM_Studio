// What the Overview says about a modifier, and how a layer action is shown.
//
// A layer action is a different kind of thing from a binding: it changes what
// the whole controller is doing, not what one input emits. It now carries the
// layer icon and the layer colour so it does not read as another output.
//
// And a modifier row used to print "Modeshift trigger - 1 changed inputs /
// settings". A count answers nothing: it says there is something to find
// without saying what it is or where it lives. With one affected input there is
// room to say what it becomes; with many, name the first few and count the rest.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE
  || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS',
  'N = F', 'E = C', 'S = SPACE', 'W = R',
  'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK', 'RIGHT_GRID_SIZE = 3 3', 'RT1 = A',
  'RSR = NONE', 'LSL = NONE', 'RSL = NONE',
  // One affected input, and it loads a configuration -- the case where the row
  // can say what it turns into.
  'LSL,+ = "profiles-library/Wardogs Menu.txt"',
  // Several affected, including a pad cell, which must not be title-cased.
  'RSL,RT1 = MMOUSE', 'RSL,N = J', 'RSL,E = K', 'RSL,W = U',
  '# @layer {"id":"comms","name":"Comms","trigger":"RSR","overrides":{"N":"J"}}',
].join('\n');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(cfg => {
      const profiles = { Lines: cfg };
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Lines', path: 'profiles-library/Lines.txt', content: cfg }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async n => ({ name: n, content: profiles[n] }),
        readConfigFile: async () => null,
        saveLibraryProfile: async (n, c) => { profiles[n] = c; return { name: n } },
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/Lines.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 },
            leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const i = setInterval(emit, 250); return () => clearInterval(i);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.locator('.profile-chip').filter({ hasText: 'Lines' }).waitFor();
    await page.locator('[data-overview-input="RSR"]').waitFor();

    const row = input => page.locator(`[data-overview-input="${input}"]`).evaluate(el => ({
      layer: [...el.querySelectorAll('span')].filter(s => /layerLine/.test(s.className)).map(s => s.innerText.trim()),
      relation: [...el.querySelectorAll('span')].filter(s => /relationLine/.test(s.className)).map(s => s.innerText.trim()),
      icons: [...el.querySelectorAll('span')].filter(s => /layerLine/.test(s.className) && s.querySelector('svg')).length,
    }));

    // A layer action is marked as one, and carries the icon.
    const hold = await row('RSR');
    assert.deepEqual(hold.layer, ['Hold layer: Comms'],
      `a layer action must be shown as a layer action: ${JSON.stringify(hold)}`);
    assert.equal(hold.icons, 1, 'and must carry the layer icon');

    // One affected input: say what it becomes, not that there is one of it.
    // Input names follow the connected controller; wait for its telemetry.
    await page.waitForFunction(() => /While held: Menu/.test(document.querySelector('[data-overview-input="LSL"]')?.innerText ?? ''));
    const single = await row('LSL');
    assert.deepEqual(single.relation, ['While held: Menu \u2192 Load Wardogs Menu'],
      `a single modeshift must say what it changes it to: ${JSON.stringify(single)}`);

    // Several: name the first few, count the rest, and leave pad cells alone.
    const many = await row('RSL');
    assert.match(many.relation[0] || '', /^While held, changes .+ and \d+ more$/,
      `a crowded modifier names what it can: ${JSON.stringify(many)}`);
    assert.ok(/RT1/.test(many.relation[0]), `a pad cell keeps its own name: ${many.relation[0]}`);
    assert.ok(!/Rt\d/.test(many.relation[0]), `and is not title-cased: ${many.relation[0]}`);

    // The old wording is gone everywhere, not just on these rows.
    const body = await page.locator('body').innerText();
    assert.ok(!/Modeshift trigger/.test(body), 'the raw "Modeshift trigger" count must not survive');
    assert.ok(!/changed inputs \/ settings/.test(body), 'nor its counted half');

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS: layer actions are marked and iconed, and a modifier says what it changes rather than how many');
  } finally {
    await browser.close();
  }
})();
