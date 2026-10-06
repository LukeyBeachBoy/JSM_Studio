// TODO-46 -- associate a configuration with a game, with its icon, without
// implying auto-apply. In the dev mock:
//
// - "+ New configuration" opens a dialog: name, "Game or app (optional)" with
//   Browse… and a "Running now" select, and an auto-apply toggle that is OFF
//   by default.
// - Creating with a game chosen and auto-apply off gives the row the game's
//   icon (an <img>, not the generic glyph), the Selected panel a "Game" row
//   reading "icon only", and the Associations page a row that reads
//   "Associated · not applied automatically" with its switch off.
// - The Home card shows the icon beside the title.
// - "Associate…" on an existing configuration opens the same dialog in edit
//   mode; choosing a running app and switching auto-apply on makes a live rule.
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
    await page.locator('#home-config-title').waitFor();
    assert.equal(await page.locator('#home-config-title').evaluate(h => !!h.parentElement.querySelector('img[data-app-icon]')), true, 'Home card lacks the associated game icon');

    await openStudioPage('Configurations');
    await page.locator('[data-profile="Wardogs"]').waitFor();
    assert.equal(await page.locator('[data-profile="Wardogs"] img[data-app-icon]').count(), 1, 'Wardogs row does not show its game icon');
    assert.equal(await page.locator('[data-profile="Gamepad"] img[data-app-icon]').count(), 0, 'an unassociated row must keep the generic glyph');

    // + New configuration opens the dialog rather than creating at once.
    const before = await page.locator('[data-profile]').count();
    await page.getByRole('button', { name: '+ New configuration' }).click();
    const dialog = page.getByRole('dialog', { name: 'New configuration' });
    await dialog.waitFor({ timeout: 3000 });
    assert.equal(await page.locator('[data-profile]').count(), before, 'the button created a configuration before the dialog was confirmed');

    const toggle = dialog.getByRole('switch', { name: 'Apply automatically when this game is running' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'auto-apply must start off');
    assert.equal(await toggle.isDisabled(), true, 'auto-apply is meaningless before a game is chosen');
    await dialog.getByRole('combobox', { name: 'Running now' }).waitFor();

    await dialog.getByPlaceholder('e.g. Doom Eternal').fill('Doom');
    await dialog.getByRole('button', { name: 'Browse…' }).click();
    await dialog.getByText('DOOMEternalx64vk.exe', { exact: true }).waitFor({ timeout: 3000 });
    await dialog.locator('img[data-app-icon]').waitFor({ timeout: 3000 });
    assert.equal(await dialog.getByPlaceholder('e.g. Doom Eternal').inputValue(), 'Doom', 'a typed name must not be replaced by the picked game');
    assert.equal(await toggle.getAttribute('aria-checked'), 'false', 'choosing a game must not switch auto-apply on');
    assert.equal(await toggle.isDisabled(), false);
    await shot('new-configuration-dialog');

    await dialog.getByRole('button', { name: 'Create' }).click();
    await dialog.waitFor({ state: 'hidden', timeout: 3000 });
    const row = page.locator('[data-profile="Doom"]');
    await row.waitFor({ timeout: 3000 });
    await row.locator('img[data-app-icon]').waitFor({ timeout: 3000 });
    assert.equal(await row.locator('img[data-app-icon]').getAttribute('data-app-icon'), 'C:\\Games\\DOOM Eternal\\DOOMEternalx64vk.exe');
    assert.doesNotMatch(await row.innerText(), /Autoload:/, 'an icon-only association must not read as autoload');

    // The new configuration is the one being edited and selected; its panel names the game.
    await row.locator('> button').first().click();
    const panel = page.locator('aside[aria-label="Doom details"]');
    await panel.waitFor();
    assert.match(await panel.innerText(), /Game\s+DOOMEternalx64vk\.exe\s+Icon only/, 'the Selected panel must show the game as icon only');
    assert.match(await panel.innerText(), /Autoload\s+none/);
    await panel.getByRole('button', { name: 'Change…' }).waitFor();
    await shot('configurations-icon');

    // The mock recorded a paused rule with the exe path.
    const rules = await page.evaluate(() => window.electronAPI.listAutoloadRules());
    const doom = rules.find(rule => rule.processName === 'DOOMEternalx64vk');
    assert.ok(doom, 'no rule was written for the chosen game');
    assert.equal(doom.paused, true, 'auto-apply off must save the rule paused');
    assert.equal(doom.profileName, 'Doom');
    assert.equal(doom.exePath, 'C:\\Games\\DOOM Eternal\\DOOMEternalx64vk.exe');
    assert.equal(doom.fileName, 'DOOMEternalx64vk.txt.paused');

    // Home: the icon sits beside the new configuration's title.
    await goHome();
    await page.locator('#home-config-title').waitFor();
    assert.equal(await page.locator('#home-config-title').innerText(), 'Doom');
    await page.locator('#home-config-title').evaluate(async h => { for (let i = 0; i < 20 && !h.parentElement.querySelector('img[data-app-icon]'); i++) await new Promise(r => setTimeout(r, 100)); });
    assert.equal(await page.locator('#home-config-title').evaluate(h => h.parentElement.querySelector('img[data-app-icon]')?.dataset.appIcon), 'C:\\Games\\DOOM Eternal\\DOOMEternalx64vk.exe', 'Home card lacks the new icon');
    await shot('home-icon');

    // Associations: listed as associated, not applied -- not as paused or broken.
    await openStudioPage('Associations');
    const assoc = page.locator('[data-process="DOOMEternalx64vk"]');
    await assoc.waitFor({ timeout: 3000 });
    assert.match(await assoc.innerText(), /Associated · not applied automatically/);
    assert.equal(await assoc.getByRole('switch').getAttribute('aria-checked'), 'false');
    assert.equal(await assoc.locator('img[data-app-icon]').count(), 1, 'Associations row lacks the game icon');
    assert.match(await page.locator('[data-process="steamwebhelper"]').innerText(), /Paused/, 'a paused rule without an exe still reads Paused');
    await shot('associations');

    // Associate… on an existing configuration: the same dialog in edit mode.
    await openStudioPage('Configurations');
    await page.locator('[data-profile="Cyberpunk"] > button').first().click();
    const cyberPanel = page.locator('aside[aria-label="Cyberpunk details"]');
    await cyberPanel.waitFor();
    // Cyberpunk's mock rule has no exe: the panel offers Change…, the row no icon.
    assert.equal(await page.locator('[data-profile="Cyberpunk"] img[data-app-icon]').count(), 0);
    await cyberPanel.getByRole('button', { name: 'Change…' }).click();
    const edit = page.getByRole('dialog', { name: 'Game for Cyberpunk' });
    await edit.waitFor({ timeout: 3000 });
    assert.equal(await edit.getByRole('switch').getAttribute('aria-checked'), 'true', 'a live rule opens with auto-apply on');
    await edit.getByRole('combobox', { name: 'Running now' }).click();
    await page.getByRole('option', { name: /Cyberpunk2077\.exe/ }).click();
    await edit.getByText('C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe').waitFor({ timeout: 3000 });
    await edit.getByRole('button', { name: 'Save' }).click();
    await edit.waitFor({ state: 'hidden', timeout: 3000 });
    await page.locator('[data-profile="Cyberpunk"] img[data-app-icon]').waitFor({ timeout: 3000 });
    assert.match(await cyberPanel.innerText(), /Game\s+Cyberpunk2077\.exe\s+Applies automatically/);
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
