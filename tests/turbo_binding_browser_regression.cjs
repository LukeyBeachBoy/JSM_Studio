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
    const card = page.locator('details[data-input-command="N"]').first();
    await card.locator(':scope > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const rows = open.locator('[data-command-row]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 2);
    await rows.first().getByRole('button',{name:'Command settings',exact:true}).click();
    let sheet=page.getByRole('dialog').last();
    const field=sheet.getByRole('textbox',{name:'Turbo interval',exact:true});
    assert.equal(await field.inputValue(),'60');
    await field.fill('125');await field.press('Enter');
    let saved=await save();assert.match(saved,/SPACE\+\{125\} J\+\{200\}/);
    await sheet.screenshot({path:path.join(ARTIFACTS,'turbo-settings.png')});
    await sheet.getByRole('button',{name:'Use configuration timing',exact:true}).click();
    saved=await save();assert.match(saved,/SPACE\+ J\+\{200\}/);
    await page.keyboard.press('Escape');
    await rows.nth(1).getByRole('button',{name:'Command settings',exact:true}).click();
    sheet=page.getByRole('dialog').last();
    assert.equal(await sheet.getByRole('textbox',{name:'Turbo interval',exact:true}).inputValue(),'200');
    assert.deepEqual(errors,[]);
    console.log('PASS: turbo interval sheet, independent editing, save and reset without affecting sibling');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
