// A binding row names the controller you have and the thing the game receives.
//
// Reported together, and they are the same complaint twice: the rows were
// printing the configuration file's vocabulary instead of the reader's.
//
//   - "Triangle / Y" on a Steam Controller, which has neither a triangle nor a
//     second name for Y. With a pad connected there is one right answer.
//   - "X_Y" as an output, which is a Y button to everyone except the parser.
//   - the output keycap floating in the middle of the row, because it and the
//     chevron each had `margin-left: auto` and split the free space between
//     them. Steam Input puts the value in its own right-hand column.
//
// Also covers the preview dot: only the live overlay has a thumb to show, and
// the editor preview was left with a permanent green blob in its top-left
// corner because nothing was there to move it.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS',
  'VIRTUAL_CONTROLLER = XBOX',
  'N = X_Y',
  'E = X_LB',
  'S = SPACE',
  'RSR,N = X_A',
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_GRID_SIZE = 2 2',
  'LT1 = G',
].join('\n') + '\n';

// JSL's Steam Controller type, the one the other renderer tests mock.
const STEAM = 24;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(([profile, type]) => {
      const profiles = { Desktop: profile };
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { profiles[name] = content; return { name } },
        applyProfile: async (path) => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, [PROFILE, STEAM]);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    // A Steam Controller's first connection asks about its power-on sound.
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(15000);
    await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();

    const rowText = async command =>
      (await page.locator(`details[data-input-command="${command}"] > summary`).first().innerText()).replace(/\s+/g, ' ').trim();

    // --- the input is named the way this controller names it ----------------
    const north = await rowText('N');
    assert.ok(!/Triangle/i.test(north), `a Steam Controller has no triangle: ${north}`);
    assert.match(north, /\bY\b/, `the row should name the button: ${north}`);
    const east = await rowText('E');
    assert.ok(!/Circle/i.test(east), `a Steam Controller has no circle: ${east}`);

    // --- the output is named the way the game receives it -------------------
    assert.ok(!/X_Y/.test(north), `the row should not print the raw token: ${north}`);
    assert.match(north, /Y Button/, `X_Y is a Y button: ${north}`);
    assert.match(east, /Left Bumper/, `X_LB is the left bumper: ${east}`);
    // A keyboard output reads as the key's own legend.
    assert.match(await rowText('S'), /Space/);

    // --- the value sits in its own right-hand column ------------------------
    // Outputs occupy the right-hand column. Rows without extras now use its
    // remaining space and align right; rows with shift badges reserve a lane.
    // Measure the settled layout, not a frame of the page sliding in.
    await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
    // Top-level rows only: a shifted card ("RSR,N") is nested inside its input's editor now.
    const rowSummaries = page.locator('details[data-input-command]:not([data-input-command*=","]) > summary');
    // Console v2 (ButtonList): what a row sends sits on its right, the same
    // right edge down the list.
    const rows = rowSummaries.locator('[class*=rowRight]');
    const rights = [];
    for (let i = 0; i < 3; i++) {
      const row = await rowSummaries.nth(i).boundingBox();
      const hint = await rows.nth(i).boundingBox();
      assert.ok(hint.x > row.x + row.width * 0.5, `the value is adrift in the middle of the row (${hint.x} of ${row.x}..${row.x + row.width})`);
      assert.ok(hint.x + hint.width <= row.x + row.width + 1, 'the output stays inside its row');
      rights.push(Math.round(hint.x + hint.width));
    }
    assert.equal(new Set(rights).size, 1, `outputs share a right edge: ${rights.join(', ')}`);

    // While holding (console v2): the change is a row of the input's While
    // holding page, named for this controller's own button.
    await page.locator('details[data-input-command="N"] > summary').first().click();
    await page.locator('details[data-input-command="N"][open] [data-fold="while-holding"]').click();
    const shiftRowLocator = page.locator('[data-modeshift-row]').first();
    await shiftRowLocator.waitFor({ state: 'visible' });
    const shiftRow = (await shiftRowLocator.innerText()).replace(/\s+/g, ' ').trim();
    assert.ok(!/RSR|Paddle 1/.test(shiftRow), `the trigger should use the pad's own name: ${shiftRow}`);
    assert.match(shiftRow, /R4/, `a Steam Controller calls it R4: ${shiftRow}`);
    await page.locator('[data-modeshift-row="RSR"]').click();
    await page.getByRole('button', { name: /Every way of pressing/ }).click();
    await page.locator('[data-input-command="RSR,N"]').first().waitFor();
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
    await page.waitForFunction(() => !document.querySelector('[data-subpage], .sheet-layer'));

    // --- one frame around the selected region, not three --------------------
    // The selected zone is a binding row on the pad's page (console v2,
    // Trackpads) that already shows what it sends; A opens its binding sheet,
    // arriving open rather than behind another click.
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const regionRow = page.locator('details[data-input-command="LT1"] > summary').first();
    await regionRow.waitFor();
    const regionText = (await regionRow.innerText()).replace(/\s+/g, ' ');
    assert.match(regionText, /Row 1, column 1|Region 1/i, `the row names the zone: ${regionText}`);
    assert.match(regionText, /\bG\b/, `the zone row names its binding: ${regionText}`);
    await regionRow.click();
    const region = page.locator('details[data-input-command="LT1"][open]').first();
    await region.waitFor();
    assert.equal(await page.getByText('Selected region', { exact: false }).count(), 0,
      'the region editor still wraps the card in a panel that repeats it');
    await page.keyboard.press('Escape');
    await page.locator('.sheet').waitFor({ state: 'detached' });


    assert.deepEqual(errors, []);
    console.log('PASS: rows name this controller and the output the game gets, and values line up');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
