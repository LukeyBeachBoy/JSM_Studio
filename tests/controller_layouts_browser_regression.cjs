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


    await page.locator('.app-shell').waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'touchpad' })));
    // Console v2 (ControllerVariant): Layout for this controller is a full page.
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:open-controller-layout')));
    const variant = page.getByRole('dialog', { name: /Layout for this controller$/ });
    await variant.waitFor();
    assert.equal(await variant.getByRole('radio', { name: /Only for DualSense/ }).getAttribute('aria-checked'), 'true');
    const pad = variant.getByRole('radiogroup', { name: 'Touchpad uses', exact: true });
    assert.match(await pad.innerText(), /Steam right trackpad/);
    await pad.focus(); await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>window.__lastSaved?.includes('# @controller-pad type-5 left'));
    const saved=await page.evaluate(()=>window.__lastSaved);
    assert(saved.includes('RIGHT_TOUCHPAD_MODE = MOUSE'));
    assert(saved.includes('LEFT_TOUCHPAD_MODE = GRID_AND_STICK'));
    assert(saved.includes('LT1 = ENTER'));
    // What DualSense lacks is listed; Pick a button moves it, for DualSense only.
    const missing = variant.getByRole('region', { name: /DualSense doesn't have/ });
    const grip = missing.locator('button:has(svg[data-glyph="MISC5"])').first();
    await grip.click();
    const capture = page.getByRole('dialog', { name: /Pick a button$/ });
    await capture.waitFor();
    await capture.locator('[role="option"]:has(svg[data-glyph="R"])').click();
    await capture.waitFor({ state: 'detached' });
    await page.keyboard.press('Control+s');
    
    await page.waitForFunction(()=>/# @controller type-5 R = K/.test(window.__lastSaved));
    assert((await page.evaluate(()=>window.__lastSaved)).includes('MISC5 = K'), 'the shared layout keeps the grip');
    // Another connected controller has its own view; DualSense's choice is kept.
    const controller = variant.getByRole('radiogroup', { name: 'Controller', exact: true });
    await controller.focus(); await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(__dirname,'../tmp/controller-variants-steam.png')});
    assert.equal(await variant.getByRole('radiogroup', { name: 'Touchpad uses', exact: true }).count(),0);
    await controller.focus(); await page.keyboard.press('ArrowLeft');
    assert.match(await variant.getByRole('radiogroup', { name: 'Touchpad uses', exact: true }).innerText(), /Left trackpad/);
    await page.screenshot({path:path.join(__dirname,'../tmp/controller-variants.png')});
    await variant.getByRole('button',{name:/Use regular gamepad/}).click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>window.__lastSaved?.includes('# @controller type-5 S = X_A'));
    const regular=await page.evaluate(()=>window.__lastSaved);
    assert(regular.includes('N = SPACE'));
    assert(regular.includes('MISC5 = K'));
    assert(regular.includes('# @controller type-5 MISC5 = NONE'));
    assert(regular.includes('# @controller type-5 VIRTUAL_CONTROLLER = XBOX'));
    // Reset is confirmed in place, Keep them first.
    await variant.getByRole('button',{name:/Reset DualSense/}).click();
    await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-keep'));
    await page.keyboard.press('Escape');
    await variant.getByRole('button',{name:/Reset DualSense/}).click();
    await variant.getByRole('alertdialog').getByRole('button',{name:'Reset',exact:true}).click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>!window.__lastSaved?.includes('# @controller type-5 '));
    assert.deepEqual(errors,[]);
    console.log('PASS: variant page, single-pad source choice, Pick a button for this controller only, two-controller views, regular gamepad and reset in place without browser errors');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
