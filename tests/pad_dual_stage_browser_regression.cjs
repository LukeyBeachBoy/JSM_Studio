// Native touch/click policies, with simulated Steam Controller telemetry.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

// Fine-tune shows only the groups a pad's mode uses, and Zones (with its Touch
// and click part) belongs to a pad of zones, so both pads start as menus; the
// held-input pad is a mouse.
const PROFILE = ['RESET_MAPPINGS', 'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'RIGHT_TOUCHPAD_MODE = GRID_AND_STICK',
  'LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP', 'RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP',
  'MISC2,RIGHT_TOUCHPAD_MODE = MOUSE', 'MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP', '# untouched odd line', 'UNRECOGNIZED_PAD_FEATURE = keep-exact'].join('\n') + '\n';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(profile => {
      const profiles = { Wardogs: localStorage.getItem('pad-stage-fixture') ?? profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Wardogs', path: 'profiles-library/Wardogs.txt', content: profiles.Wardogs }),
        listLibraryProfiles: async () => Object.keys(profiles),
        loadLibraryProfile: async name => ({ name, content: profiles[name] }),
        saveLibraryProfile: async (name, content) => { window.__lastSaved = content; profiles[name] = content; localStorage.setItem('pad-stage-fixture', content); return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      };
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ activeProfile: 'profiles-library/Wardogs.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, leftPad: { x: 0, y: 0, touched: false }, rightPad: { x: 0, y: 0, touched: false } } }] });
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer);
      } };
    }, PROFILE);
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    // The app opens on Home (console refinement 2a); these checks start in the editing shell.
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    page.setDefaultTimeout(10000);

    const row = (scope, label) => scope.locator('.summary-row').filter({ has: page.locator('.summary-row__label', { hasText: label }) });


    // Console v2 (P4): Trackpads ▸ Fine-tune ▸ Zones ▸ Touch and click is a
    // card per touch/click behaviour; choosing one writes it at once.
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    const open = async side => {
      await page.locator('.section-item').filter({ hasText: side === 'left' ? 'Left pad' : 'Right pad' }).click();
      await page.locator(`#trackpad-${side} [data-trackpad-fine-tune]`).click();
      const sub = page.locator('[data-subpage]');
      await sub.locator('[data-group="zones"]').click();
      await sub.locator('[role="tab"]').filter({ hasText: 'Touch and click' }).click();
      await sub.locator('[data-zone-part="touch"]').waitFor();
      return sub;
    };
    const current = sub => sub.locator('[data-zone-part="touch"] [role="radio"][data-current="true"]').getAttribute('data-value');
    const choose = async (sub, value) => { await sub.locator(`[data-zone-part="touch"] [role="radio"][data-value="${value}"]`).click(); };
    const close = async sub => { await sub.locator('[data-modal-close]').evaluate(button => button.click()); await sub.waitFor({ state: 'detached' }); };
    let sub = await open('left');
    assert.equal(await current(sub), 'NO_SKIP', 'Touch and click is the default');
    const cards = sub.locator('[data-zone-part="touch"] [role="radio"]');
    assert.equal(await cards.count(), 7);
    for (const card of await cards.all()) {
      const caption = await card.getAttribute('data-caption');
      assert.ok(caption && caption.length > 12, 'every card says what it does');
      assert.doesNotMatch(caption, /Soft press|full.pull/i);
    }
    await page.screenshot({ path: 'tmp/choice-dropdown-dual-stage.png' });
    // Moving between cards only shows them; A (or a click) uses one.
    await cards.first().focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await current(sub), 'NO_SKIP', 'moving focus does not write');
    await choose(sub, 'NO_FULL');
    assert.equal(await current(sub), 'NO_FULL');
    await close(sub);
    sub = await open('right');
    await choose(sub, 'NO_SKIP_EXCLUSIVE');
    assert.equal(await current(sub), 'NO_SKIP_EXCLUSIVE');
    await close(sub);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP_EXCLUSIVE/.test(window.__lastSaved));
    let saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_FULL$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?UNRECOGNIZED_PAD_FEATURE = keep-exact$/m);
    // A held-input pad has the same control even when it is a mouse
    // (While holding…, from the pad's Y menu; each shift opens its own page).
    await page.locator('#trackpad-right [role="radio"]').first().focus();
    await page.keyboard.press('y');
    await page.locator('[data-more-item="holding"]').click();
    await page.locator('[data-subpage] [data-modeshift-list] [data-modeshift="MISC2"]').click();
    const shift = page.locator('[data-modeshift-editor="MISC2"]');
    await row(shift, /^Click/).click();
    let sheet = page.getByRole('dialog').filter({ has: page.getByRole('combobox', { name: 'Touch and click dual-stage mode', exact: true }) });
    await sheet.waitFor(); let choice = sheet.getByRole('combobox', { name: 'Touch and click dual-stage mode', exact: true });
    assert.equal(await choice.innerText(), 'Quick click skips delayed touch');
    await choice.focus(); await page.keyboard.press('Enter');
    await page.getByRole('option', { name: 'Quick click skips immediate touch', exact: true }).click();
    assert.equal(await choice.innerText(), 'Quick click skips immediate touch');
    await page.keyboard.press('Escape'); await sheet.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => /MISC2,RIGHT_TOUCHPAD_DUAL_STAGE_MODE = MAY_SKIP_R/.test(window.__lastSaved));
    saved = await page.evaluate(() => window.__lastSaved);
    assert.match(saved, /^(?:# @controller type-\d+ )?LEFT_TOUCHPAD_DUAL_STAGE_MODE = NO_FULL$/m);
    assert.match(saved, /^(?:# @controller type-\d+ )?RIGHT_TOUCHPAD_DUAL_STAGE_MODE = NO_SKIP_EXCLUSIVE$/m);
    await page.reload();
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click();
    sub = await open('right');
    assert.equal(await current(sub), 'NO_SKIP_EXCLUSIVE');
    assert.deepEqual(errors, []);
    console.log('PASS: both pads expose friendly touch-and-click cards; captions, focus without writing, direct selection, independent save/reload, held-input parity and unknown config preservation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
