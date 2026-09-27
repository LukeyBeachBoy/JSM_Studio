// Luke's review of the Trackpads, Joysticks and binding editor (2026-09-26):
//
// 1. A mouse pad drew the menu its CLICK shift opens, so Wardogs' right pad
//    looked like a menu when touching it moves the mouse. It now draws a
//    mouse pad, and the "Click regions 0" row that counted only shift-specific
//    lines (0, while four regions fell through from the unshifted pad) is gone.
// 2. The pad's modeshift is the pad section itself -- the same preview, shape
//    tiles and region row -- announced as "While Right pad click is held"
//    rather than "Click regions", and not "Pad click" (which pad?).
// 3. A menu's size, text and icons are set from its own On-screen menu row
//    (the On-screen menus view, console refinement 2d), and written to that
//    menu's own @overlay line.
// 4. The two sticks are two rows, not four dense columns.
// 5. A paddle that only drives a layer says so on its row; it used to read
//    Unbound. "Timing" opened no timing; it is "Options".
//
// Run with the dev server up: npm run dev:web, then node tests/pad_modeshift_presentation_regression.cjs
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const WARDOGS = [
  'RESET_MAPPINGS',
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'LEFT_GRID_SHAPE = FOUR_WAY', 'LEFT_GRID_DEADZONE = 0.15',
  'LT1 = R', 'LT2 = B', 'LT3 = V', 'LT4 = G',
  'RIGHT_TOUCHPAD_MODE = MOUSE', 'RIGHT_GRID_SHAPE = FOUR_WAY',
  'MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'RT1 = MMOUSE', 'RT2 = V', 'RT3 = TAB', 'RT4 = Z',
  'LSL = NONE', 'RSL = !M\\',
  'RIGHT_STICK_MODE = RADIAL_MENU', 'RIGHT_STICK_MENU_SIZE = 8', 'RM1 = 1', 'RM2 = 2',
  '# @label LT4 = Supply crate', '# @label RT1 = Ping', '# @label RT2 = Melee', '# @label RT3 = Inventory', '# @label RT4 = Sights',
  '# @layer {"id":"veh","name":"Vehicles & utility","overrides":{"N":"H"}}',
  '# @layer {"id":"map","name":"Tactical map","overrides":{"S":"M"}}',
  '# @layer-action LSL = hold veh', '# @layer-action RSL = toggle map',
].join('\n') + '\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(profile => {
      const profiles = { Wardogs: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer);
      } };
    }, WARDOGS);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(10000);

    const row = (scope, label) => scope.locator('.summary-row').filter({ has: page.locator('.summary-row__label', { hasText: label }) });

    // --- 1 and 2: the right pad and its click shift -------------------------
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const right = page.locator('#trackpad-right');
    await right.getByText('Moves the mouse', { exact: true }).waitFor();
    const base = right.locator(':scope > div > div').first();
    assert.equal(await right.getByRole('button', { name: /^RT1:/ }).count(), 0, 'with the shift closed, the mouse pad must not draw any menu region');
    assert.equal(await page.getByText('Click regions', { exact: true }).count(), 0, 'the "Click regions" row and card title are gone');
    assert.ok(base, 'the pad section renders');

    const shift = right.locator('details[data-modeshift="MISC2"]');
    const head = await shift.locator(':scope > summary').innerText();
    assert.match(head, /While\s+Right pad click\s+is held/, `the shift names its held input and side, got: ${head}`);
    assert.match(head, /4-way/, 'the header says what the pad becomes');
    assert.match(head, /Ping, Melee, Inventory, Sights/, 'and which regions it offers, including ones that fall through from the unshifted pad');
    assert.match(await right.locator('section[aria-label$="modeshifts"] header').innerText(), /Modeshifts\s*1/i, 'the modeshifts are a counted group');

    await shift.locator(':scope > summary').click();
    await shift.getByRole('button', { name: /^RT1: Ping/ }).waitFor();
    // The shape lives in the pad section's Mode sheet now (2b); the shifted
    // pad has that same Mode row, naming the shape it becomes.
    assert.match(await row(shift, /^Mode$/).locator('.summary-row__value').innerText(), /Menu · 4-way/, 'the shifted pad has the pad section\'s own Mode row');
    assert.equal(await shift.getByRole('combobox', { name: 'Held input', exact: true }).innerText().then(text => /Right pad click/.test(text)), true, 'the held-input picker says which pad click');

    // --- 3: a menu's look, from its own On-screen menu row -------------------
    // Menu appearance folded into the On-screen menus view (2d): the left
    // pad's row opens it with the left menu selected, every menu drawn.
    const left = page.locator('#trackpad-left');
    await row(left, /^On-screen menu$/).click();
    const menus = page.getByRole('dialog', { name: 'On-screen menus', exact: true });
    await menus.waitFor();
    assert.match(await menus.locator('.menus-chip[data-state="selected"]').innerText(), /Left pad/, 'the left pad opened it, so its menu is selected');
    assert.ok(await menus.locator('.menus-chip').filter({ hasText: /Right pad/ }).count() >= 1, 'the right pad\'s click-shift menu is drawn too');
    const text = row(menus, /^Text size$/);
    await text.focus(); await page.keyboard.press('Enter');
    assert.equal(await text.getAttribute('data-adjusting'), 'true', 'A (Enter) adjusts the text size in place');
    for (let i = 0; i < 20 && !/^11 px$/.test(await text.locator('.summary-row__value').innerText()); i++) {
      const now = Number((await text.locator('.summary-row__value').innerText()).replace(/\D+/g, ''));
      await page.keyboard.press(now > 11 ? 'ArrowLeft' : 'ArrowRight');
    }
    await page.keyboard.press('Enter');
    assert.match(await text.locator('.summary-row__value').innerText(), /^11 px$/);
    await row(menus, /^Shows$/).click();
    const keys = row(menus, /^Keys$/);
    assert.equal(await keys.getAttribute('aria-pressed'), 'true');
    await keys.click();
    assert.equal(await keys.getAttribute('aria-pressed'), 'false');
    await menus.getByRole('button', { name: 'Done', exact: true }).click();
    await menus.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /# @overlay LEFT at /.test(window.__lastSaved));
    const saved = await page.evaluate(() => window.__lastSaved);
    const line = saved.split('\n').find(entry => entry.startsWith('# @overlay LEFT at'));
    assert.match(line, /font 11/, `text size is written to the left menu's own line: ${line}`);
    assert.match(line, /keys off/, `and so is hiding keys: ${line}`);
    assert.ok(!/# @overlay RIGHT:MISC2/.test(saved) || !/# @overlay RIGHT:MISC2.*font 11/.test(saved), 'the other menu is untouched');

    // --- 4: joysticks stack ---------------------------------------------------
    await page.getByRole('button', { name: 'Joysticks', exact: true }).click();
    const leftStick = page.locator('#mapping-section-leftStick');
    const rightStick = page.locator('#mapping-section-rightStick');
    await rightStick.waitFor();
    const [a, b] = [await leftStick.boundingBox(), await rightStick.boundingBox()];
    assert.ok(b.y >= a.y + a.height - 1, `the right stick sits under the left, not beside it (${JSON.stringify({ a, b })})`);
    // The wheel's look and place on screen: the same On-screen menu row (2d).
    assert.equal(await rightStick.getByText('Menu appearance', { exact: true }).count(), 0, 'Menu appearance is gone from the stick');
    const wheelRow = row(rightStick, /^On-screen menu$/);
    await wheelRow.waitFor();
    await wheelRow.click();
    await menus.waitFor();
    assert.match(await menus.locator('.menus-chip[data-state="selected"]').innerText(), /Right stick wheel/, 'the stick wheel opened it, so its menu is selected');
    await page.keyboard.press('Escape');
    await menus.waitFor({ state: 'detached' });

    // --- 5: rows that drive layers, and Options --------------------------------
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const l4 = await page.locator('details[data-input-command="LSL"] > summary').innerText();
    assert.match(l4, /Hold Vehicles & utility/, `L4 names the layer it holds: ${l4}`);
    assert.ok(!/Unbound/.test(l4), `L4 does not read Unbound: ${l4}`);
    const r5 = await page.locator('details[data-input-command="RSL"] > summary').innerText();
    assert.match(r5, /Toggle Tactical map/, `R5 shows its layer: ${r5}`);
    assert.match(r5, /\bM\b/, `and still its key: ${r5}`);
    const face = page.locator('details[data-input-command="RSL"]');
    await face.locator(':scope > summary').click();
    await face.getByRole('button', { name: 'Command options', exact: true }).first().waitFor();
    assert.equal(await face.getByText('Timing', { exact: true }).count(), 0, 'nothing is labelled Timing any more');

    assert.deepEqual(errors, []);
    console.log('PASS: mouse pad draws no menu; pad shift is the pad section, named by its held input; menu appearance writes its own line; sticks stack; layer-only rows name their layer; Options not Timing');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
