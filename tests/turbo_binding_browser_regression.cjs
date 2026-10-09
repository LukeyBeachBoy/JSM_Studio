// A binding card has only Commands and, optionally, Modeshifts (TODO-54,
// TODO-55): "LED while held", a layer action and a sound are command rows,
// added from the Add command picker, and each edits its parameter in the
// row's settings sheet -- the colour and brightness, the layer and its verb,
// the sound and its volume. The file keeps the formats it always had:
// `N,LIGHT_BAR = x…`, `N,LED_BRIGHTNESS = n`, `# @layer-action N = toggle aim`
// and `"PLAY_SOUND n -12"`. Removing a row removes its lines.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'N = SPACE+{60} J+{200}', '# @layer {"id":"aim","name":"Aim","overrides":{"S":"Q"}}', ''].join('\n');
const ARTIFACTS = path.resolve(__dirname, '../tmp/turbo-binding');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile };
      window.__lastSaved = '';
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Desktop', path: 'profiles-library/Desktop.txt', content: profiles.Desktop }),
        readConfigFile: async () => '',
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
    // A Steam Controller's first connection asks about its power-on sound.
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
    await page.locator('.profile-chip').waitFor();
    await page.getByRole('button', { name: 'Buttons', exact: true }).click();
    fs.mkdirSync(ARTIFACTS, { recursive: true });

    const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
    // Console v2: Turbo is one of More's ways of pressing; each turbo command's
    // repeat speed is its own (Fine-tune ▸ Turbo, and More's ◂ ▸ Repeat speed).
    const card = page.locator('details[data-input-command="N"]').first();
    await card.locator(':scope > summary').click();
    const sheet = page.locator('details[data-input-command="N"][open] [data-binding-sheet]');
    await sheet.waitFor();
    await sheet.locator('[data-when="more"]').click();
    const set = sheet.locator('[aria-label="Set on this button"] [data-rare-command]').filter({ hasText: /Turbo/ });
    assert.equal(await set.count(), 2, 'both turbo commands are listed under More');
    assert.match(await set.nth(0).innerText(), /every 60 ms/);
    assert.match(await set.nth(1).innerText(), /every 200 ms/);
    await set.nth(0).click();
    const chips = sheet.locator('[data-chip-command]');
    assert.equal(await chips.count(), 2, 'Turbo sends Space and J');
    const speedOf = async () => {
      const ft = page.locator('[data-fine-tune]');
      await ft.waitFor();
      return ft.locator('[role="slider"]').filter({ hasText: 'Repeat speed' }).first();
    };
    // The first command: type 125 on the on-screen keyboard (A on the row).
    await sheet.locator('[data-fold="fine-tune"]').click();
    let speed = await speedOf();
    assert.equal(await speed.getAttribute('aria-valuenow'), '60');
    await speed.focus();
    await page.keyboard.press('Enter');
    const typing = page.getByRole('dialog', { name: /^Type: / });
    await typing.waitFor();
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.type('125'); await page.keyboard.press('Enter');
    await typing.waitFor({ state: 'detached' });
    let saved = await save(); assert.match(saved, /SPACE\+\{125\} J\+\{200\}/);
    await page.locator('[data-fine-tune]').screenshot({ path: path.join(ARTIFACTS, 'turbo-settings.png') });
    // Y on the row is Use Default: the configuration's timing.
    await speed.focus();
    await page.keyboard.press('y');
    saved = await save(); assert.match(saved, /SPACE\+ J\+\{200\}/);
    await page.keyboard.press('Escape');
    await page.locator('[data-fine-tune]').waitFor({ state: 'detached' });
    // The second command keeps its own speed (Y on its chip fine-tunes it).
    await chips.nth(1).focus();
    await page.keyboard.press('y');
    speed = await speedOf();
    assert.equal(await speed.getAttribute('aria-valuenow'), '200');
    assert.deepEqual(errors,[]);
    console.log('PASS: turbo repeat speed per command, independent editing, save and reset without affecting sibling');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
