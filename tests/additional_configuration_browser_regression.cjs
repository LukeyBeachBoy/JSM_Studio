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

const PROFILE = ['RESET_MAPPINGS', 'N = SMALL_RUMBLE+{60} J+{200}', 'S = HAPTIC_BOTH_SCRIPT_N6', 'E = "profiles-library/Target.txt"', 'W = "CUSTOM_ACTION 12"', '# @layer {"id":"aim","name":"Aim","overrides":{"S":"Q"}}', ''].join('\n');
const ARTIFACTS = path.resolve(__dirname, '../tmp/additional-configuration');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.addInitScript(profile => {
      const profiles = { Desktop: profile, Target: 'RESET_MAPPINGS\n', Other: 'RESET_MAPPINGS\n' };
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
    // Console v2: a row's card is a sheet over the list; B / Escape closes it
    // (after closing whatever it opened) before another row can be reached.
    const closeSheets=async()=>{ for(let i=0;i<5&&await page.locator('details[data-input-command][open], [data-subpage]').count();i++){ await page.keyboard.press('Escape'); await page.waitForTimeout(150); } };
    const sheetOf = input => page.locator(`details[data-input-command="${input}"][open] [data-binding-sheet]`);
    const fineTune = async input => {
      await closeSheets();
      await page.locator(`details[data-input-command="${input}"] > summary`).first().click();
      await sheetOf(input).locator('[data-fold="fine-tune"]').click();
      const ft = page.locator('[data-fine-tune]');
      await ft.waitFor();
      return ft;
    };
    // A value row takes its number on the on-screen keyboard (A on the row).
    const typeValue = async (row, text) => {
      await row.focus();
      await page.keyboard.press('Enter');
      const typing = page.getByRole('dialog', { name: /^Type: / });
      await typing.waitFor();
      for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await typing.waitFor({ state: 'detached' });
    };
    const segment = (ft, label, text) => ft.locator('[role="radiogroup"]').filter({ hasText: label }).locator('button', { hasText: text }).first().click();

    // N = SMALL_RUMBLE+{60} J+{200}: two turbo commands; Y on the first one's
    // chip fine-tunes it, and its Rumble card holds the motor strengths.
    await page.locator('details[data-input-command="N"] > summary').first().click();
    const north = sheetOf('N');
    await north.locator('[data-when="more"]').click();
    await north.locator('[aria-label="Set on this button"] [data-rare-command]').first().click();
    const chips = north.locator('[data-chip-command]');
    assert.equal(await chips.count(), 2);
    await chips.first().focus();
    await page.keyboard.press('y');
    let ft = page.locator('[data-fine-tune]');
    await ft.waitFor();
    const small = ft.locator('[role="slider"]').filter({ hasText: 'Small motor strength' });
    const big = ft.locator('[role="slider"]').filter({ hasText: 'Big motor strength' });
    assert.equal(await small.getAttribute('aria-valuenow'), '50');
    await typeValue(small, '100');
    await typeValue(big, '25');
    let saved=await save();assert.match(saved,/R40FF\+\{60\} J\+\{200\}/);
    await ft.screenshot({path:path.join(ARTIFACTS,'rumble-settings.png')});

    // S = HAPTIC_BOTH_SCRIPT_N6: an imported effect stays visible; grip, pattern and strength change.
    ft = await fineTune('S');
    assert.match(await ft.locator('[role="radiogroup"]').filter({ hasText: 'Pattern' }).innerText(), /imported/);
    await segment(ft, 'Grip', 'Left');
    await segment(ft, 'Pattern', 'Tone');
    await typeValue(ft.locator('[role="slider"]').filter({ hasText: 'Strength' }), '-12');
    saved=await save();assert.match(saved,/HAPTIC_L_TONE_N12/);

    // E = a configuration: Fine-tune ▸ Load a configuration.
    ft = await fineTune('E');
    // Many values, so the row shows the one name with ◂ ▸ (Right steps to the next configuration).
    const configRow = ft.locator('[role="radiogroup"]').filter({ hasText: 'Configuration' });
    await configRow.focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => /Other/.test(document.querySelector('[data-fine-tune] [aria-label="Configuration"]')?.textContent ?? ''));
    saved=await save();assert.match(saved,/profiles-library\/Other.txt/);
    // The Command picker (console v2): a console command typed on its own
    // keyboard -- a real keyboard types there too; Enter is Done.
    await closeSheets();
    await page.locator('details[data-input-command="W"] > summary').first().click();
    const wSheet=page.locator('details[data-input-command="W"][open]');
    await wSheet.locator('[data-kind="command"]').first().click();
    let picker=page.locator('[data-picker="command"]');
    await picker.waitFor();
    await page.keyboard.type('CUSTOM_ACTION 24');
    await page.keyboard.press('Enter');
    await picker.waitFor({state:'detached'});
    saved=await save();assert.match(saved,/CUSTOM_ACTION 24/);

    // Replacing an existing output with a light change writes the light command.
    await wSheet.locator('[data-kind="controller"]').first().click();
    picker=page.locator('[data-picker="controller"]');
    await picker.waitFor();
    await picker.locator('[data-category="light"]').click();
    await picker.locator('[data-action="LIGHT_BAR"]').click(); await page.locator('[data-picker="light"] [data-light-use]').click();
    await picker.waitFor({state:'detached'});
    saved=await save();assert.match(saved,/LIGHT_BAR = x[0-9a-f]{6}/);
    await closeSheets();
    // Menus (console v2): a slice's action is edited on the binding sheet (A on the preview).
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'virtualMenus'})));
    await page.locator('[data-virtual-menus-page]').getByRole('radio',{name:/Start empty/}).click();
    await page.locator('[data-virtual-menus-page] [data-menu-preview]').press('Enter');
    const item=page.getByRole('dialog').last();
    await item.locator('[data-kind="controller"]').click();
    picker=page.locator('[data-picker="controller"]');
    await picker.waitFor();
    await picker.locator('[data-category="light"]').click();
    await picker.locator('[data-action="LIGHT_BAR"]').click(); await page.locator('[data-picker="light"] [data-light-use]').click();
    await picker.waitFor({state:'detached'});
    saved=await save();
    assert.match(Buffer.from(/VIRTUAL_MENUS\s*=\s*HEX:([a-f0-9]+)/.exec(saved)[1],'hex').toString('utf8'),/LIGHT_BAR = x[0-9a-f]{6}/);
    assert.deepEqual(errors,[]);
    console.log('PASS: rumble/haptic/configuration/custom settings, sibling preservation, and replacement opens LED parameters and a menu slice takes a controller action, imported effects remain visible');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});

