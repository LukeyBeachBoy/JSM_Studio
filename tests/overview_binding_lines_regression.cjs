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
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    await page.locator('.profile-chip').filter({ hasText: 'Lines' }).waitFor();
    await page.locator('[data-overview-input="RSR"]').waitFor();

    // A callout is two fixed lines (2a, 2g): the name, then chips -- a layer
    // it drives, the inputs it shifts. The full account is the inspector's
    // (and the callout's accessible name), never inline, so holding or
    // editing nothing makes a callout grow.
    const row = input => page.locator(`[data-overview-input="${input}"]`).evaluate(el => ({
      chips: [...el.querySelectorAll('[class*=chip]')].map(s => ({ concept: s.dataset.concept, text: s.innerText.trim(), icon: Boolean(s.querySelector('svg')) })),
      label: el.getAttribute('aria-label'),
      height: el.getBoundingClientRect().height,
    }));

    // A layer action is a layer chip, with the layer mark.
    const hold = await row('RSR');
    assert.deepEqual(hold.chips.filter(chip => chip.concept === 'layer'), [{ concept: 'layer', text: 'Comms', icon: true }],
      `a layer action must be shown as a layer chip: ${JSON.stringify(hold)}`);
    assert.match(hold.label, /Hold Comms/, 'the inspector still says what it does');

    // A modifier is a "Shifts n" chip; what it changes is the inspector's.
    // Input names follow the connected controller; wait for its telemetry.
    await page.waitForFunction(() => /While held: Menu/.test(document.querySelector('[data-overview-input="LSL"]')?.getAttribute('aria-label') ?? ''));
    const single = await row('LSL');
    assert.deepEqual(single.chips.filter(chip => chip.concept === 'shift').map(chip => chip.text), ['Shifts 1']);
    assert.match(single.label, /While held: Menu \u2192 Load Wardogs Menu/,
      `a single modeshift must say what it changes it to: ${JSON.stringify(single)}`);
    assert.ok(!/While held/.test(await page.locator('[data-overview-input="LSL"]').innerText()), 'relation prose is still inline');

    // Several: name the first few, count the rest, and leave pad cells alone.
    const many = await row('RSL');
    assert.match(many.label || '', /While held, changes .+ and \d+ more/,
      `a crowded modifier names what it can: ${JSON.stringify(many)}`);
    assert.ok(/RT1/.test(many.label), `a pad cell keeps its own name: ${many.label}`);
    assert.ok(!/Rt\d/.test(many.label), `and is not title-cased: ${many.label}`);
    for (const callout of [hold, single, many]) assert.equal(Math.round(callout.height), 56, 'callouts are a fixed 56 high');

    // The old wording is gone everywhere, not just on these rows.
    const body = await page.locator('body').innerText();
    assert.ok(!/Modeshift trigger/.test(body), 'the raw "Modeshift trigger" count must not survive');
    assert.ok(!/changed inputs \/ settings/.test(body), 'nor its counted half');

    assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
    console.log('PASS: callouts are two fixed lines of name and chips; what a modifier changes is the inspector\'s');
  } finally {
    await browser.close();
  }
})();
