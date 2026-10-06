const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + `
        let testChords = [{id: 'builtin-default', buttons: [], triggerGroups: [['HOME']], profilePath: 'profiles-library/Default Global Chords.txt'}];
        desktopBridge.listGlobalChords = async () => testChords;
        const source = 'RESET_MAPPINGS\\nN = SPACE\\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\\nLEFT_GRID_SIZE = 2 2\\nLT1 = ENTER\\nRIGHT_TOUCHPAD_MODE = MOUSE\\nRIGHT_TOUCHPAD_SENS = 2.5\\nMISC5 = K\\n';
        desktopBridge.listLibraryProfiles = async () => ['Desktop'];
        desktopBridge.getActiveProfile = async () => ({name:'Desktop',path:'profiles-library/Desktop.txt',content:source});
        desktopBridge.loadLibraryProfile = async () => ({name:'Desktop',content:source});
        desktopBridge.saveLibraryProfile = async (name,content) => {window.__lastSaved=content;return {name};};
        desktopBridge.saveGlobalChord = async chord => { testChords = [chord]; return testChords; };
        const subscribe = desktopBridge.onTelemetrySample;
        window.__physicalButtons = 0;
        desktopBridge.onTelemetrySample = callback => subscribe(sample => callback({ ...sample,
          activeProfile: 'profiles-library/Steam-layout.txt',
          devices: [...(sample.devices?.map(device => ({ ...device, status: { ...device.status,
            buttons: window.__physicalButtons, leftStick: {x:0,y:0}, rightStick: {x:0,y:0},
            triggers: {left:0,right:0}, leftPad: {x:0,y:0,touched:false}, rightPad: {x:0,y:0,touched:false}
          }})) ?? []), {...sample.devices?.[0],handle:99,type:24,supportedButtons:8589934591}]
        }));
      ` })
    })
    await page.route('**/src/dev/mockDesktop.ts*', async route => {
      const response = await route.fetch()
      const original = await response.text()
      const body = original.replace(/type:\s*24,\s*supportedButtons:\s*8589934591/, 'type: 5, supportedButtons: 524287')
      assert.notEqual(body, original, 'mock telemetry must use DualSense')
      await route.fulfill({ response, body })
    })
    await page.goto('http://127.0.0.1:1420/?mock')
    const onboarding = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await onboarding.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await onboarding.getByRole('button', { name: 'Keep them', exact: true }).click()
    }


    await page.locator('[data-home-continue]').click();
    await page.getByRole('button',{name:/Trackpads/i}).first().click();
    await page.getByRole('combobox',{name:'Editing for controller'}).waitFor();
    assert.equal(await page.getByRole('combobox',{name:'Editing for controller'}).textContent(),'DualSense');
    await page.getByRole('combobox',{name:'Touchpad fallback source'}).click();
    await page.getByRole('option',{name:'Steam left trackpad',exact:true}).click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>window.__lastSaved?.includes('# @controller-pad type-5 left'));
    const saved=await page.evaluate(()=>window.__lastSaved);
    assert(saved.includes('RIGHT_TOUCHPAD_MODE = MOUSE'));
    assert(saved.includes('LEFT_TOUCHPAD_MODE = GRID_AND_STICK'));
    assert(saved.includes('LT1 = ENTER'));
    await page.getByRole('combobox',{name:'Editing for controller'}).click();
    await page.getByRole('option',{name:'Steam Controller',exact:true}).click();
    await page.waitForTimeout(500);
    await page.screenshot({path:path.join(__dirname,'../tmp/controller-variants-steam.png')});
    assert.equal(await page.getByRole('combobox',{name:'Touchpad fallback source'}).count(),0);
    await page.getByRole('combobox',{name:'Editing for controller'}).click();
    await page.getByRole('option',{name:'DualSense',exact:true}).click();
    assert.equal(await page.getByRole('combobox',{name:'Touchpad fallback source'}).textContent(),'Steam left trackpad');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('main').getByText('LEFT PAD',{exact:true}).count(),0, 'DualSense exposes one pad even with Steam Controller connected');
    assert(await page.locator('main').getByText('Grid and Stick',{exact:true}).count()>0, 'selected fallback pad mode is shown');
    await page.screenshot({path:path.join(__dirname,'../tmp/controller-variants.png')});
    await page.getByRole('button',{name:'Use regular gamepad',exact:true}).click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>window.__lastSaved?.includes('# @controller type-5 S = X_A'));
    const regular=await page.evaluate(()=>window.__lastSaved);
    assert(regular.includes('N = SPACE'));
    assert(regular.includes('MISC5 = K'));
    assert(regular.includes('# @controller type-5 MISC5 = NONE'));
    assert(regular.includes('# @controller type-5 VIRTUAL_CONTROLLER = XBOX'));
    assert.equal(await page.locator('main').getByText('LEFT PAD',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: two-controller selection, single-pad source choice, save preserves original pad bindings, and switching models restores their own view without browser errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
