// New configuration (console v2: NewConfigGame, NewConfig, NewConfigTry), driven
// with the mock pad in the dev mock:
//
// - it opens from jsm:new-configuration straight after a cold load, before the
//   Library's code has loaded (the event used to be heard only by the lazy
//   Library page, so the first "New for a game" could be lost);
// - step 1 lists running games first; step 2 offers the play styles built on
//   the shipped bases, with the one best for the controller marked;
// - step 3 runs the draft in Test mode: a tap is tested like any button (and
//   logged in What was sent), holding B goes back and puts the live
//   configuration back, holding A keeps it -- and only then is a file written,
//   built on the base, with its game's art and a Launch with game rule.
//
// Run with the dev server up: node tests/new_configuration_wizard_browser_regression.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const shots = path.resolve(__dirname, '../tmp/new-configuration'); fs.mkdirSync(shots, { recursive: true });
    const shot = name => page.screenshot({ path: path.join(shots, `${name}.png`) });
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'}/?mock`);
    await page.waitForFunction(() => window.__pad && window.electronAPI?.applyProfile && document.querySelector('.titlebar'));
    await page.evaluate(() => {
      window.__applied = [];
      const apply = window.electronAPI.applyProfile;
      window.electronAPI.applyProfile = async (path, text) => { window.__applied.push(text); return apply(path, text) };
    });
    // Cold: the event before anything Library has loaded.
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:new-configuration')));
    const wizard = page.locator('[data-new-configuration]');
    await wizard.waitFor({ timeout: 5000 });
    // The Steam Controller's first-connection question can land over it.
    const keep = page.getByRole('button', { name: 'Keep them', exact: true });
    if (await keep.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) {
      await keep.click();
      await keep.waitFor({ state: 'detached' }).catch(() => {});
      await wizard.locator('[data-autofocus]').first().focus();
    }
    const step = () => wizard.getAttribute('data-step');
    const pad = (buttons, ms = 90) => page.evaluate(([b, m]) => window.__pad.press(b, m), [buttons, ms]).then(() => page.waitForTimeout(300));
    const hold = async (button, ms) => { await page.evaluate(b => window.__pad.hold([b]), button); await page.waitForTimeout(ms); await page.evaluate(b => window.__pad.release([b]), button); await page.waitForTimeout(500) };
    const before = await page.evaluate(() => window.electronAPI.listLibraryProfiles());

    // Step 1: the running games come first; the first is focused and chosen.
    await page.waitForFunction(() => /Wardogs/.test(document.activeElement?.textContent ?? ''));
    assert.match(await wizard.innerText(), /Running now[\s\S]*Recent Steam games/i);
    await pad(['RIGHT']);
    assert.match(await page.evaluate(() => document.activeElement?.textContent), /Deep Rock Galactic/);
    await shot('step1');
    await pad(['S']);
    assert.equal(await step(), '2');

    // Step 2: one card per play style; gyro aim is best on the Steam Controller.
    await page.getByRole('radio', { name: /Best with your controller.*Shooter, gyro aim/ }).waitFor();
    assert.match(await wizard.innerText(), /What you get[\s\S]*Hold to aim with gyro/i);
    await shot('step2');
    await pad(['S']);
    assert.equal(await step(), '3');
    await page.waitForFunction(() => window.__applied.some(text => text.includes('bases/Shooter gyro aim - Steam Controller.txt')));
    await wizard.getByText('Testing · nothing saved yet').waitFor();

    // A tap is tested like any other button: logged, nothing chosen, nothing saved.
    await pad(['S'], 120);
    assert.equal(await step(), '3');
    assert.match(await wizard.getByRole('complementary', { name: 'What was sent' }).innerText(), /Jump[\s\S]*Space/);
    assert.deepEqual(await page.evaluate(() => window.electronAPI.listLibraryProfiles()), before, 'a tap must not create anything');
    await shot('step3');

    // Hold B: back to the styles, and the live configuration goes back.
    await hold('E', 1300);
    assert.equal(await step(), '2');
    await page.waitForFunction(() => !window.__applied.at(-1).includes('bases/'));
    assert.deepEqual(await page.evaluate(() => window.electronAPI.listLibraryProfiles()), before, 'Back must not create anything');

    // Again, and hold A: kept.
    await pad(['S']);
    await page.waitForFunction(() => document.querySelector('[data-new-configuration]')?.dataset.step === '3');
    await page.waitForTimeout(600);
    await hold('S', 1400);
    await wizard.waitFor({ state: 'detached', timeout: 5000 });
    const created = await page.evaluate(() => window.electronAPI.loadLibraryProfile('Deep Rock Galactic'));
    assert.ok(created?.content, 'Keep it creates the configuration');
    assert.match(created.content, /^RESET_MAPPINGS$/m);
    assert.match(created.content, /^bases\/Shooter gyro aim - Steam Controller\.txt$/m, 'built on the shipped base');
    assert.match(created.content, /# @game \{"steamAppId":"548430"/, 'it keeps its game for the cover art');
    const rule = (await page.evaluate(() => window.electronAPI.listAutoloadRules())).find(entry => entry.processName === 'FSD-Win64-Shipping');
    assert.ok(rule, 'a Launch with game rule was made for the running game');
    assert.equal(rule.paused, true, 'Launch with game was left off: the rule only lends its art');
    assert.match(await page.locator('.titlebar').innerText(), /Deep Rock Galactic/, 'it opens for editing');
    // Home's hero has its Steam art too, from the `# @game` line (it used to look
    // only at a Launch with game rule's executable, so a new game showed none).
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'home' })));
    await page.waitForFunction(() => document.querySelector('[data-home-continue]'));
    await page.waitForFunction(() => [...document.querySelectorAll('[data-art]')].some(node => node.getAttribute('data-art') === 'steam' && /Deep Rock Galactic/.test(node.textContent ?? '')), null, { timeout: 5000 });

    assert.deepEqual(errors, []);
    console.log('PASS: New configuration opens on a cold load, offers styles from the shipped bases, tests a tap, goes back on a held B and keeps on a held A');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
