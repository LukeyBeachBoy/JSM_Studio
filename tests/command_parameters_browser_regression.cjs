// Controller-action outputs written from the pickers (console v2): a light
// change, a mode switch with its verb and "Happens on", and a tune are chosen
// in their pickers and land in the file in the formats they always had --
// `LIGHT_BAR = x…`, `# @layer-action N = toggle aim` (`!N` on release) and
// `"PLAY_SOUND n"`. (The per-row parameter sheets became Fine-tune: BIND.)
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const PROFILE = ['RESET_MAPPINGS', 'N = SPACE', '# @layer {"id":"aim","name":"Aim","overrides":{"S":"Q"}}', ''].join('\n');
const ARTIFACTS = path.resolve(__dirname, '../tmp/command-parameters');

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
    const card = page.locator('details[data-input-command="N"]').first();
    await card.locator(':scope > summary').click();
    const sheet = page.locator('details[data-input-command="N"][open]');
    await sheet.locator('[data-kind="key"]').first().waitFor();
    const picker = kind => page.locator('[data-picker="' + kind + '"]');
    const when = async name => { await sheet.locator('[data-when="' + name + '"]').click(); await page.waitForTimeout(200); };

    // ---- A light change: Controller action ▸ Light ▸ Change light colour (on Hold) ----
    await when('hold');
    await sheet.locator('[data-kind="controller"]').first().click();
    await picker('controller').locator('[data-category="light"]').click();
    await picker('controller').locator('[data-action="LIGHT_BAR"]').click();
    await picker('light').locator('[data-light-use]').click();
    await picker('controller').waitFor({ state: 'detached' });
    let saved = await save();
    assert.match(saved, /LIGHT_BAR = x[0-9a-f]{6}/, `the light colour is written as its console command:
${saved}`);
    assert.match(saved, /^N = SPACE/m, 'the Press command is untouched');

    // ---- A mode: Switch mode ▸ Aim, Toggle, on Let go ----
    await when('tap');
    await sheet.locator('[data-kind="mode"]').first().click();
    const mode = picker('mode');
    await mode.waitFor();
    await mode.locator('[data-mode-verb]').focus();
    await page.keyboard.press('ArrowRight');
    await mode.locator('[data-mode-on]').focus();
    await page.keyboard.press('ArrowRight');
    await mode.locator('[data-layer="aim"]').click();
    await mode.waitFor({ state: 'detached' });
    saved = await save();
    assert.match(saved, /^(?:# @controller \S+ )?# @layer-action !N = toggle aim$/m, `on release is the "!N" input:
${saved}`);
    await page.screenshot({ path: path.join(ARTIFACTS, 'sheet-layer-action.png') });

    // ---- A tune: Rumble & sound ▸ Victory! (on Double-tap) ----
    await when('double');
    await sheet.locator('[data-kind="controller"]').first().click();
    await picker('controller').locator('[data-category="rumble"]').click();
    await picker('controller').locator('[data-action="tune-3"]').click();
    await picker('controller').waitFor({ state: 'detached' });
    saved = await save();
    assert.match(saved, /"PLAY_SOUND 3"/, `the tune is written as PLAY_SOUND with its index:
${saved}`);
    await page.screenshot({ path: path.join(ARTIFACTS, 'sheet-sound.png') });

    assert.deepEqual(errors, []);
    console.log('PASS: a light change, a mode switch with its verb and a tune are written in the formats they always had');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
