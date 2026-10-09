// A shifted binding is edited with the sheet the unshifted input uses.
//
// The While holding page (console v2, BindingWhileHolding) opens a change's
// "Every way of pressing, while held" on the same binding sheet as the input
// itself -- the When you… strip, More, the eight kinds, the pickers -- and the
// writes it produces stay inside the one shift being edited.
//
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = [
  'RESET_MAPPINGS',
  'N = SPACE',
  'E = R',
  'S = T',
  'L,N = F',
  'L,E = G',
  'R,N = H',
].join('\n') + '\n';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ console: 'Mapper ready', activeProfile: 'profiles-library/Desktop.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 150); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(15000);
    await page.locator('.profile-chip').filter({ hasText: 'Desktop' }).waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    const eff = (text, key) => {
      const lines = text.split('\n');
      const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
      const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
      const line = own ? own.slice('# @controller type-24 '.length) : shared;
      return line ? line.slice(key.length + 3).trim() : undefined;
    };

    // The focused row says what the shifts do without opening (ButtonList).
    const north = page.locator('details[data-input-command="N"]').first();
    await north.locator(':scope > summary').focus();
    const rowText = (await north.locator(':scope > summary').innerText()).replace(/\s+/g, ' ');
    assert.match(rowText, /Space/, 'the row must show what the binding sends');
    assert.match(rowText, /With LB held: F/, `the focused row names the first shift: ${rowText}`);
    assert.match(rowText, /With RB held: H/, `and the second: ${rowText}`);

    await north.locator(':scope > summary').click();
    const openN = page.locator('details[data-input-command="N"][open]');
    await openN.locator('[data-fold="while-holding"]').click();
    await page.locator('[data-modeshift-row="L"]').click();
    await page.getByRole('button', { name: /Every way of pressing/ }).click();
    const shifted = page.locator('[data-input-command="L,N"]');
    await shifted.waitFor();
    assert.equal(await shifted.count(), 1, 'a shifted card must be separately addressable from the normal one');
    const tiles = (await shifted.locator('[data-when]').allInnerTexts()).map(text => text.split('\n')[0].trim());
    assert.deepEqual(tiles, ['Press', 'Tap', 'Hold', 'Double-tap', 'More'], 'a shifted binding offers the same ways of pressing');
    assert.equal(await shifted.locator('[data-kind]').count(), 8, 'and the same eight kinds');
    assert.equal(await shifted.locator('[data-fold="while-holding"]').count(), 0, 'a shift has no While holding of its own');
    assert.match(await shifted.locator('[data-when="regular"]').innerText(), /F/);

    const pickLetter = async letter => {
      const picker = page.getByRole('dialog', { name: /Pick a key/ });
      await picker.waitFor();
      await picker.getByRole('button', { name: 'Letters', exact: true }).click();
      await picker.getByRole('button', { name: new RegExp(`^${letter}( ·|$)`) }).first().click();
      await picker.waitFor({ state: 'detached' });
    };
    await shifted.locator('[data-when="regular"]').focus();
    await shifted.locator('[data-kind="key"]').click();
    await pickLetter('K');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,N\s*=\s*K/.test(window.__lastSaved || ''));
    const saved = await page.evaluate(() => window.__lastSaved);
    assert.equal(eff(saved, 'N'), 'SPACE', 'editing a shift rewrote the normal binding');
    assert.equal(eff(saved, 'L,E'), 'G', 'editing one shifted input disturbed another');
    assert.equal(eff(saved, 'R,N'), 'H', 'editing one shift disturbed a different trigger');
    assert.ok(!/^(# @controller type-24 )?L,S\s*=/m.test(saved), `an untouched inherited binding was written as an override:\n${saved}`);
    // Once in the shared layout and at most once in this controller's own.
    assert.ok((saved.match(/^L,N\s*=/gm) || []).length <= 1 && (saved.match(/^# @controller type-24 L,N\s*=/gm) || []).length <= 1, 'the shifted line was written twice');

    // A second command on the same shifted press keeps the first.
    await shifted.getByRole('button', { name: 'Also send' }).click();
    await pickLetter('M');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /L,N\s*=.*M/.test(window.__lastSaved || ''));
    const both = await page.evaluate(() => window.__lastSaved);
    const line = eff(both, 'L,N') ?? '';
    assert.match(line, /K/, `editing the second command dropped the first: ${line}`);
    assert.match(line, /M/, `the second command was not written: ${line}`);
    assert.equal(eff(both, 'N'), 'SPACE', 'a second shifted command reached the normal binding');

    assert.deepEqual(errors, []);
    console.log('PASS: shifted bindings use the normal sheet, offer no While holding of their own, keep several commands on one line, and write only their own shift');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1 });
