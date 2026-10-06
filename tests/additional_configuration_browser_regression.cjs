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
    const card = page.locator('details[data-input-command="N"]').first();
    await card.locator(':scope > summary').click();
    const open = page.locator('details[data-input-command="N"][open]');
    const rows = open.locator('[data-command-row]');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 2);
    await rows.first().getByRole('button',{name:'Command settings',exact:true}).click();
    let sheet=page.getByRole('dialog').last();
    let field=sheet.getByRole('textbox',{name:'Small motor strength',exact:true});
    assert.equal(await field.inputValue(),'50.2');
    await field.fill('100');await field.press('Enter');
    field=sheet.getByRole('textbox',{name:'Big motor strength',exact:true});
    await field.fill('25');await field.press('Enter');
    let saved=await save();assert.match(saved,/R40FF\+\{60\} J\+\{200\}/);
    await sheet.screenshot({path:path.join(ARTIFACTS,'rumble-settings.png')});
    await page.keyboard.press('Escape');
    const show=async input=>{
      await page.locator(`details[data-input-command="${input}"] > summary`).first().click();
      await page.locator(`details[data-input-command="${input}"][open]`).getByRole('button',{name:'Command settings',exact:true}).first().click();
      return page.getByRole('dialog').last();
    };
    sheet=await show('S');
    assert.match(await sheet.getByRole('combobox',{name:'Effect',exact:true}).innerText(),/imported/);
    await sheet.getByRole('combobox',{name:'Actuator',exact:true}).click();
    await page.getByRole('option',{name:'Left grip',exact:true}).click();
    await sheet.getByRole('combobox',{name:'Effect',exact:true}).click();
    await page.getByRole('option',{name:'Tone',exact:true}).click();
    field=sheet.getByRole('textbox',{name:/Gain/});
    await field.fill('-12');await field.press('Enter');
    saved=await save();assert.match(saved,/HAPTIC_L_TONE_N12/);
    await page.keyboard.press('Escape');
    sheet=await show('E');
    await sheet.getByRole('combobox',{name:'Configuration',exact:true}).click();
    await page.getByRole('option',{name:'Other',exact:true}).click();
    saved=await save();assert.match(saved,/profiles-library\/Other.txt/);
    await page.keyboard.press('Escape');
    sheet=await show('W');
    await sheet.getByRole('button',{name:'Edit action',exact:true}).click();
    let picker=page.getByRole('dialog',{name:'Choose an action'});
    field=picker.getByRole('textbox',{name:'Console command',exact:true});
    await field.fill('CUSTOM_ACTION 24');await picker.getByRole('button',{name:'Use',exact:true}).click();
    saved=await save();assert.match(saved,/CUSTOM_ACTION 24/);
    // Replacing an existing output now immediately opens its required fields.
    const customRow=page.locator('details[data-input-command="W"][open] [data-command-row]').first();
    await customRow.getByRole('button',{name:/Choose action/}).click();
    picker=page.getByRole('dialog',{name:'Choose an action'});
    await picker.locator('.action-picker__tabs .action-tab').filter({hasText:'JSM'}).click();
    await picker.getByRole('button',{name:'Change LED colour',exact:true}).click();
    sheet=page.getByRole('dialog').last();
    await sheet.locator('[data-parameter="led-color"]').waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'Virtual menus',exact:true}).click();
    await page.getByRole('button',{name:'Create virtual menu',exact:true}).click();
    await page.locator('[data-virtual-menus-page] [data-nav-skip][role="button"]').first().press('Enter');
    const item=page.getByRole('dialog').last();
    await item.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText('Add command',{exact:true})}).click();
    picker=page.getByRole('dialog',{name:'Choose an action'});
    await picker.locator('.action-picker__tabs .action-tab').filter({hasText:'JSM'}).click();
    await picker.getByRole('button',{name:'Change LED colour',exact:true}).click();
    sheet=page.getByRole('dialog').last();
    await sheet.locator('[data-parameter="led-color"]').waitFor();
    await sheet.locator('[data-parameter="led-color"]').getByRole('radio',{name:'Green',exact:true}).click();
    saved=await save();
    assert.match(Buffer.from(/VIRTUAL_MENUS\s*=\s*HEX:([a-f0-9]+)/.exec(saved)[1],'hex').toString('utf8'),/LIGHT_BAR = x34c759/);
    assert.deepEqual(errors,[]);
    console.log('PASS: rumble/haptic/configuration/custom settings, sibling preservation, and replacement and menu-item addition open LED parameters, imported effects remain visible');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});

