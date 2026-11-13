const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source = ['RESET_MAPPINGS', 'HOLD_PRESS_TIME = 450', '# @controller-layout type-25',
  '# @controller type-25 JOY9 = F',
  '# @controller type-25 # @layer ' + JSON.stringify({id:'driving',name:'Driving',overrides:{JOY9:'!F\\ "LAYER_REMOVE driving"_'}}),
  '# @controller type-25 # @layer ' + JSON.stringify({id:'weapons',name:'Weapons',overrides:{}}),
  '# @controller type-25 # @layer-action JOY25 = toggle driving'].join('\n');
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/src/platform/desktopBridge.ts*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`
        let holdLayerSource=${JSON.stringify(source)};
        desktopBridge.listLibraryProfiles=async()=>['Hold layer'];
        desktopBridge.getActiveProfile=async()=>({name:'Hold layer',path:'profiles-library/Hold layer.txt',content:holdLayerSource});
        desktopBridge.loadLibraryProfile=async()=>({name:'Hold layer',content:holdLayerSource});
        desktopBridge.saveLibraryProfile=async(name,content)=>{holdLayerSource=content;window.__holdLayerSaved=content;return {name}};
        const holdSubscribe=desktopBridge.onTelemetrySample;
        desktopBridge.onTelemetrySample=callback=>holdSubscribe(sample=>callback({...sample,devices:[{...sample.devices?.[0],type:25,handle:25,controllerId:'type-25-device-0123456789abcdef'}]}));
      `});
    });
    await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1422/?mock');
    await page.locator('.app-shell').waitFor();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'overview'})));
    await page.getByRole('button',{name:'Buttons',exact:true}).click();
    await page.locator('[data-layer-selector]').getByRole('button',{name:'Driving',exact:true}).click();
    await page.locator('details[data-input-command="JOY9"] > summary').first().click();
    const sheet=page.locator('[data-binding-sheet="JOY9"]');
    await sheet.locator('[data-when="hold"]').click();
    const chip=sheet.locator('[data-chip-command]').first();
    const waitOutput=async name=>page.waitForFunction(name=>document.querySelector('[data-binding-sheet="JOY9"] [data-chip-command]')?.textContent.includes(name),name);
    await waitOutput('Turn off Driving');
    assert.match(await chip.innerText(),/Turn off Driving/);
    assert.match(await chip.innerText(),/Switch layer/,'existing command is presented as a layer binding');
    await chip.click();
    const picker=page.locator('[data-picker="mode"]');
    await picker.waitFor();
    assert.match(await picker.innerText(),/once the Hold time is reached/);
    assert.equal(await picker.locator('[data-mode-on]').count(),0,'Hold must not become Press or Let go');
    await picker.locator('[data-layer="weapons"]').click();
    await waitOutput('Turn off Weapons');
    assert.match(await chip.innerText(),/Turn off Weapons/);
    await chip.click();
    await picker.locator('[data-layer="driving"]').click();
    await waitOutput('Turn off Driving');
    // Recreate through Add action rather than the legacy command editor.
    await sheet.getByRole('button',{name:'Remove Turn off Driving',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('[data-binding-sheet="JOY9"] [data-chip-command]'));
    await sheet.locator('[data-when="hold"]').click();
    await page.locator('[data-picker="action-type"] [data-kind="mode"]').click();
    await picker.locator('[data-layer="driving"]').click();
    await waitOutput('Turn off Driving');
    assert.equal(await sheet.locator('[data-chip-command]').first().getAttribute('data-trigger-kind'),'hold');
    assert.match(await sheet.locator('[data-chip-command]').first().innerText(),/Turn off Driving/);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>Boolean(window.__holdLayerSaved));
    const saved=await page.evaluate(()=>window.__holdLayerSaved);
    const layer=JSON.parse(saved.split('\n').filter(line=>line.includes('# @layer {') && line.includes('"id":"driving"')).pop().split('# @layer ')[1]);
    // The serializer omits '_' for the second token: native JSM infers Hold
    // from that position. The first token keeps its explicit Press suffix.
    assert.match(layer.overrides.JOY9,/^!F\\ "LAYER_REMOVE driving"_?$/,'Hold action and sibling press output survive');
    assert.match(saved,/HOLD_PRESS_TIME = 450/);
    assert.equal((saved.match(/@layer-action/g)||[]).length,1,'no input-wide layer action was accidentally added');
    await page.keyboard.press('Escape');
    await page.locator('details[data-input-command="JOY9"] > summary').first().click();
    await sheet.locator('[data-when="hold"]').click();
    assert.match(await sheet.locator('[data-chip-command]').first().innerText(),/Turn off Driving/);
    assert.equal(await sheet.locator('[data-chip-command]').first().getAttribute('data-trigger-kind'),'hold');
    fs.mkdirSync('tests/tmp',{recursive:true});
    await sheet.locator('[data-chip-command]').first().click();
    await picker.waitFor();
    await page.screenshot({path:'tests/tmp/layer-hold-removal.png'});
    await page.setViewportSize({width:900,height:800});
    assert(await picker.evaluate(el=>el.scrollWidth<=el.clientWidth),'picker fits narrow layouts');
    assert.deepEqual(errors,[]);
    console.log('PASS: existing Hold removal uses Switch layer; edit, remove, add, save and reopen preserve Hold timing, press binding and layer scope');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
