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

    // A trigger picker names its input the same way.
    const modeshift = page.locator('details').filter({ hasText: 'Modeshift ·' }).first();
    const shiftRow = (await modeshift.locator(':scope > summary').innerText()).replace(/\s+/g, ' ').trim();
    assert.ok(!/RSR|Paddle 1/.test(shiftRow), `the trigger should use the pad's own name: ${shiftRow}`);
    assert.match(shiftRow, /R4/, `a Steam Controller calls it R4: ${shiftRow}`);

    // --- the value sits in its own right-hand column ------------------------
    // Not "roughly right of centre": every row's value must start at the same
    // x, which is what makes the outputs readable as a column.
    const rows = page.locator('details[data-input-command] > summary .binding-summary-hint');
    const lefts = [];
    for (let i = 0; i < 3; i++) {
      const row = await page.locator('details[data-input-command] > summary').nth(i).boundingBox();
      const hint = await rows.nth(i).boundingBox();
      assert.ok(hint.x > row.x + row.width * 0.5, `the value is adrift in the middle of the row (${hint.x} of ${row.x}..${row.x + row.width})`);
      lefts.push(Math.round(hint.x + hint.width));
    }
    assert.equal(new Set(lefts).size, 1, `the values do not line up as a column: ${lefts.join(', ')}`);

    // --- no phantom thumb in the editor preview -----------------------------
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    await page.locator('[data-input-command="LT1"]').first().waitFor();
    assert.equal(
      await page.locator('[class*=Overlay_dot], [class*=dot]').count(),
      0,
      'the preview draws a live-touch dot that nothing is driving'
    );

    // --- one frame around the selected region, not three --------------------
    const region = page.locator('details[data-input-command="LT1"]').first();
    assert.notEqual(await region.getAttribute('open'), null, 'the selected region should arrive open, not behind another click');
    assert.equal(await page.getByText('Selected region', { exact: false }).count(), 0,
      'the region editor still wraps the card in a panel that repeats it');

    assert.deepEqual(errors, []);
    console.log('PASS: rows name this controller and the output the game gets, values line up, and the preview has no phantom thumb');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
