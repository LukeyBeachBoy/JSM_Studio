// Luke's review of the Trackpads, Joysticks and binding editor (2026-09-26):
//
// 1. A mouse pad drew the menu its CLICK shift opens, so Wardogs' right pad
//    looked like a menu when touching it moves the mouse. It now draws a
//    mouse pad, and the "Click regions 0" row that counted only shift-specific
//    lines (0, while four regions fell through from the unshifted pad) is gone.
// 2. The pad's modeshift is the pad section itself -- the same preview, shape
//    tiles and region row -- on its own page from a "While holding Right pad
//    click" row, rather than "Click regions", and not "Pad click" (which pad?).
// 3. A menu's size, text and icons are set from its own On-screen menu row
//    (the On-screen menus view, console refinement 2d), and written to that
//    menu's own @overlay line.
// 4. One stick at a time (console v2, P4): the rail picks the stick.
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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(10000);

    const row = (scope, label) => scope.locator('.summary-row').filter({ has: page.locator('.summary-row__label', { hasText: label }) });

    // --- 1 and 2: the right pad and its click shift -------------------------
    // Console v2 (P4): one pad at a time on the rail; the pad's changes while
    // another button is held are a sub-page (D11), here reached from the
    // mouse pad's Click zones row.
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    await page.locator('.section-item').filter({ hasText: 'Right pad' }).click();
    const right = page.locator('#trackpad-right');
    await right.waitFor();
    assert.equal(await right.locator('[role="radio"][data-current="true"]').getAttribute('data-value'), 'MOUSE', 'the right pad is a mouse pad');
    assert.equal(await right.getByRole('button', { name: /^RT1:/ }).count(), 0, 'with the shift closed, the mouse pad must not draw any menu region');
    assert.equal(await page.getByText('Click regions', { exact: true }).count(), 0, 'the "Click regions" row and card title are gone');
    await right.locator('button').filter({ hasText: /^Click zones/ }).click();
    const holding = page.locator('[data-subpage]').first();
    // The shifts are a "<pad> while holding" list of rows; each opens its own editor page.
    const list = holding.locator('[data-modeshift-list]');
    assert.match(await list.getAttribute('aria-label'), /mode shifts$/, 'the shifts are one labelled list');
    assert.equal(await list.locator('[data-modeshift]').count(), 1, 'with one row per shift');
    const shiftRow = list.locator('[data-modeshift="MISC2"]');
    const head = await shiftRow.innerText();
    assert.match(head, /Right pad click held/, `the shift names its held input and side, got: ${head}`);
    assert.match(head, /4-way/, 'the row says what the pad becomes');
    assert.match(head, /Ping, Melee, Inventory, Sights/, 'and which regions it offers, including ones that fall through from the unshifted pad');

    await shiftRow.click();
    const shift = page.locator('[data-modeshift-editor="MISC2"]');
    await shift.getByRole('button', { name: /^RT1: Ping/ }).waitFor();
    // The shape lives in the pad section's Mode sheet now (2b); the shifted
    // pad has that same Mode row, naming the shape it becomes.
    assert.match(await row(shift, /^Mode$/).locator('.summary-row__value').innerText(), /Menu · 4-way/, 'the shifted pad has the pad section\'s own Mode row');
    assert.match(await shift.locator('[data-modeshift-button]').innerText(), /Right pad click/, 'the held-button row says which pad click');

    // --- 3: a menu's look, from its own On-screen menu row -------------------
    // Menu appearance folded into the On-screen menus view (2d): the left
    // pad's row opens it with the left menu selected, every menu drawn.
    await page.locator('[data-subpage]').filter({ has: shift }).locator('[data-modal-close]').evaluate(close => close.click());
    await shift.waitFor({ state: 'detached' });
    await holding.locator('[data-modal-close]').evaluate(close => close.click());
    await page.locator('[data-subpage]').waitFor({ state: 'detached' });
    await page.locator('.section-item').filter({ hasText: 'Left pad' }).click();
    const left = page.locator('#trackpad-left');
    await left.locator('button').filter({ hasText: /^On-screen menu/ }).click();
    // The view is a console sub-page (UX review I5): "Trackpads · Left pad ▸ On-screen menu", with console rows.
    const menus = page.getByRole('dialog', { name: /On-screen menu$/ });
    await menus.waitFor();
    assert.match(await menus.locator('.menus-chip[data-state="selected"]').innerText(), /Left pad/, 'the left pad opened it, so its menu is selected');
    assert.ok(await menus.locator('.menus-chip').filter({ hasText: /Right pad/ }).count() >= 1, 'the right pad\'s click-shift menu is drawn too');
    // Text size is a number row: ◂ ▸ change it directly.
    const text = menus.locator('[role="slider"]').filter({ hasText: /^Text size/ }).first();
    await text.focus();
    for (let i = 0; i < 20 && !/^11 px$/.test(await text.getAttribute('aria-valuetext')); i++) {
      const now = Number((await text.getAttribute('aria-valuetext')).replace(/\D+/g, ''));
      await page.keyboard.press(now > 11 ? 'ArrowLeft' : 'ArrowRight');
    }
    assert.match(await text.getAttribute('aria-valuetext'), /^11 px$/);
    await row(menus, /^Shows$/).click();
    const keys = row(menus, /^Keys$/);
    // A toggle row is a two-choice adjust row now: it reads On/Off, A adjusts, ◂ picks Off, A keeps.
    assert.equal(await keys.locator('.summary-row__value').innerText(), 'On');
    await keys.click();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    assert.equal(await keys.locator('.summary-row__value').innerText(), 'Off');
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
    await page.getByRole('button', { name: 'Sticks', exact: true }).click();
    const leftStick = page.locator('#mapping-section-leftStick');
    const rightStick = page.locator('#mapping-section-rightStick');
    await leftStick.waitFor();
    assert.equal(await rightStick.count(), 0, 'one stick at a time: the right stick waits on the rail');
    await page.locator('.section-item').filter({ hasText: 'Right stick' }).click();
    await rightStick.waitFor();
    assert.equal(await leftStick.count(), 0, 'the rail swaps the stick, it does not stack them');
    // The wheel's look and place on screen: Fine-tune ▸ Wheel ▸ On-screen wheel (2d).
    assert.equal(await rightStick.getByText('Menu appearance', { exact: true }).count(), 0, 'Menu appearance is gone from the stick');
    await rightStick.locator('[data-stick-fine-tune-row]').click();
    const wheelRow = page.locator('[data-subpage] button').filter({ hasText: /^On-screen wheel/ });
    await wheelRow.waitFor();
    await wheelRow.click();
    await menus.waitFor();
    assert.match(await menus.locator('.menus-chip[data-state="selected"]').innerText(), /Right stick wheel/, 'the stick wheel opened it, so its menu is selected');
    await page.keyboard.press('Escape');
    await menus.waitFor({ state: 'detached' });
    // B closes the view only; the Fine-tune page it opened from is still there, with focus back on its row, until B again.
    assert.equal(await wheelRow.evaluate(row => row === document.activeElement), true, 'focus returns to the On-screen wheel row');
    await page.keyboard.press('Escape');
    await page.locator('[data-subpage]').waitFor({ state: 'detached' });

    // --- 5: rows that drive layers, and Options --------------------------------
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const l4 = await page.locator('details[data-input-command="LSL"] > summary').innerText();
    assert.match(l4, /Hold Vehicles & utility/, `L4 names the layer it holds: ${l4}`);
    assert.ok(!/Unbound/.test(l4), `L4 does not read Unbound: ${l4}`);
    // R5 sends M and also toggles a mode: the row keeps its key and counts the rest ("M +1"); the focus caption and the
    // open sheet name the mode.
    const r5Summary = page.locator('details[data-input-command="RSL"] > summary');
    const r5 = await r5Summary.innerText();
    assert.match(r5, /\bM\b/, `R5 still shows its key: ${r5}`);
    assert.match(r5, /\+1/, `and counts its mode toggle: ${r5}`);
    assert.match(await r5Summary.getAttribute('data-caption'), /Toggle Tactical map/, 'R5 caption shows its layer');
    const face = page.locator('details[data-input-command="RSL"]');
    await r5Summary.click();
    await face.locator('[data-binding-sheet]').waitFor();
    assert.match(await face.locator('[data-when="regular"]').innerText(), /Toggle Tactical map/, 'the sheet shows its layer');
    // A command's options are the sheet's Fine-tune row now (3c), not a cog.
    await face.getByRole('button', { name: /^Fine-tune/ }).first().waitFor();
    assert.equal(await face.getByText('Timing', { exact: true }).count(), 0, 'nothing is labelled Timing any more');

    assert.deepEqual(errors, []);
    console.log('PASS: mouse pad draws no menu; pad shift is the pad section, named by its held input; menu appearance writes its own line; sticks stack; layer-only rows name their layer; Options not Timing');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
