// TODO-46 -- associate a configuration with a game, with its icon, without
// implying auto-apply. In the dev mock:
//
// - Library ▸ Games' "New for a game" opens the New configuration wizard
//   (console v2): Launch with game is OFF by default; Browse picks an .exe.
// - Keeping it with Launch with game off gives the cover the game's icon (an
//   <img>, not a plain cover), the detail "Launches with … · art only", and
//   Launch with game a row that reads "Art only · not launched automatically"
//   with its switch off. The file is built on the shipped base it chose.
// - Y More ▸ Launch with game on an existing configuration opens the game
//   dialog in edit mode; choosing a running app and switching it on makes a
//   live rule.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const shotsDir = process.env.JSM_DIALOG_SHOTS || path.join(__dirname, '..', 'tmp');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const shot = async name => {
      fs.mkdirSync(shotsDir, { recursive: true });
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(shotsDir, `todo46-${name}.png`) });
    };
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock');
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar') && window.electronAPI?.saveAutoloadRule);
    const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' });
    if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await firstConnect.getByRole('button', { name: 'Keep them' }).click();
      await firstConnect.waitFor({ state: 'hidden' });
    }
    await page.waitForTimeout(500);
    const goHome = async () => {
      await page.evaluate(() => [...document.querySelectorAll('.titlebar button')].find(b => /Home/.test(b.textContent))?.click());
      await page.waitForTimeout(600);
    };
    const openStudioPage = async name => {
      await goHome();
      await page.evaluate(label => [...document.querySelectorAll('button, a')].find(b => b.textContent.trim().startsWith(label))?.click(), name);
      await page.waitForTimeout(700);
    };

    // The existing association in the mock (Wardogs → Wardogs.exe) already
    // draws the game's icon on its row and on the Home card.
    // (Home v2 draws the game's hero art, not its icon: SHELL's Home owns that check.)
    await page.locator('#home-config-title').waitFor();

    // Console v2 (Library ▸ Games): covers wear the game's Steam art, or a flat
    // cover with its icon; an unassociated one has neither.
    const openLibrary = async tab => {
      await page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), tab);
      await page.waitForTimeout(700);
    };
    await openLibrary('configurations');
    await page.locator('[data-profile="Wardogs"]').waitFor();
    await page.locator('[data-profile="Wardogs"] img').first().waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-profile="Gamepad"] img').count(), 0, 'an unassociated cover must keep the plain cover');

    // New for a game opens the wizard rather than creating at once.
    const before = await page.locator('[data-profile]').count();
    await page.getByRole('button', { name: /^New for a game/ }).click();
    const dialog = page.getByRole('dialog', { name: /New configuration$/ });
    await dialog.waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-profile]').count(), before, 'the cover created a configuration before the wizard finished');

    // Step 1: Launch with game starts off; Browse picks an .exe outside Steam.
    const toggle = dialog.getByRole('switch', { name: 'Launch with game' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'Launch with game must start off');
    await dialog.getByRole('button', { name: /^Browse for an \.exe/ }).click();
    // Step 2: a play style, then Step 3: Keep it (A held, or clicked).
    await dialog.getByRole('radio', { name: /Shooter, stick aim/ }).click();
    await dialog.getByText('Press anything to try it').waitFor({ timeout: 3000 });
    await shot('new-configuration-try');
    await dialog.getByRole('button', { name: /^Keep it/ }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });

    await openLibrary('configurations');
    const row = page.locator('[data-profile="DOOM Eternal"]');
    await row.waitFor({ timeout: 3000 });
    await row.locator('img[data-app-icon]').waitFor({ timeout: 3000 });
    assert.equal(await row.locator('img[data-app-icon]').getAttribute('data-app-icon'), 'C:\\Games\\DOOM Eternal\\DOOMEternalx64vk.exe');
    assert.match(await row.innerText(), /Shooter · stick/, 'the cover names the base it is built on');
    const created = await page.evaluate(() => window.electronAPI.loadLibraryProfile('DOOM Eternal'));
    assert.match(created.content, /^bases\/Shooter stick aim\.txt$/m, 'the new configuration is built on the shipped base');
    assert.match(created.content, /^RESET_MAPPINGS$/m);

    // Its detail: built on the base, wearing the game's art only.
    await row.locator('button').first().focus();
    const panel = page.locator('aside[aria-label="DOOM Eternal details"]');
    await panel.waitFor();
    assert.match(await panel.innerText(), /Built on\s+Shooter, stick aim/);
    assert.match(await panel.innerText(), /Launches with\s+DOOMEternalx64vk\.exe · art only/, 'the detail must show the game as art only');
    await shot('configurations-icon');

    // The mock recorded a paused rule with the exe path.
    const rules = await page.evaluate(() => window.electronAPI.listAutoloadRules());
    const doom = rules.find(rule => rule.processName === 'DOOMEternalx64vk');
    assert.ok(doom, 'no rule was written for the chosen game');
    assert.equal(doom.paused, true, 'auto-apply off must save the rule paused');
    assert.equal(doom.profileName, 'DOOM Eternal');
    assert.equal(doom.exePath, 'C:\\Games\\DOOM Eternal\\DOOMEternalx64vk.exe');
    assert.equal(doom.fileName, 'DOOMEternalx64vk.txt.paused');

    // Home: the icon sits beside the new configuration's title.
    await goHome();
    await page.locator('#home-config-title').waitFor();
    assert.equal(await page.locator('#home-config-title').innerText(), 'DOOM Eternal');
    await shot('home-icon');

    // Launch with game: listed as art only -- not as paused or broken.
    await openLibrary('associations');
    const assoc = page.locator('[data-process="DOOMEternalx64vk"]');
    await assoc.waitFor({ timeout: 3000 });
    assert.match(await assoc.innerText(), /Art only · not launched automatically/);
    assert.equal(await assoc.getByRole('switch').getAttribute('aria-checked'), 'false');
    assert.equal(await assoc.locator('img[data-app-icon]').count(), 1, 'the Launch with game row lacks the game icon');
    assert.match(await page.locator('[data-process="steamwebhelper"]').innerText(), /Off/, 'a paused rule without an exe reads Off');
    await shot('associations');

    // Launch with game on an existing configuration (Y More): the same dialog in edit mode.
    await openLibrary('configurations');
    await page.locator('[data-profile="Cyberpunk"] button').first().focus();
    const cyberPanel = page.locator('aside[aria-label="Cyberpunk details"]');
    await cyberPanel.waitFor();
    // Cyberpunk's mock rule has no exe: the cover has no icon.
    assert.equal(await page.locator('[data-profile="Cyberpunk"] img[data-app-icon]').count(), 0);
    await page.keyboard.press('y');
    await page.getByRole('dialog', { name: 'Cyberpunk' }).getByRole('button', { name: /^Launch with game/ }).click();
    const edit = page.getByRole('dialog', { name: 'Game for Cyberpunk' });
    await edit.waitFor({ timeout: 3000 });
    assert.equal(await edit.getByRole('switch').getAttribute('aria-checked'), 'true', 'a live rule opens with auto-apply on');
    await edit.getByRole('combobox', { name: 'Running now' }).click();
    await page.getByRole('option', { name: /Cyberpunk2077\.exe/ }).click();
    await edit.getByText('C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe').waitFor({ timeout: 3000 });
    await edit.getByRole('button', { name: 'Save' }).click();
    await edit.waitFor({ state: 'hidden', timeout: 3000 });
    await page.locator('[data-profile="Cyberpunk"] img[data-app-icon]').waitFor({ timeout: 3000 });
    await page.waitForTimeout(500);
    assert.match(await cyberPanel.innerText(), /Launches with\s+Cyberpunk2077\.exe/);
    assert.match(await cyberPanel.innerText(), /Goes live automatically when Cyberpunk2077\.exe comes to the front/);
    const cyber = (await page.evaluate(() => window.electronAPI.listAutoloadRules())).find(rule => rule.processName === 'Cyberpunk2077');
    assert.ok(!cyber.paused, 'auto-apply on must leave the rule live');
    assert.equal(cyber.exePath, 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe');
    await shot('associate-existing');

    assert.deepEqual(errors, []);
    console.log('game association: ok');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
