// Isolated renderer checks; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_SIZE = 2 2\nLT1 = ENTER\nLT3 = TAB\nRIGHT_TOUCHPAD_MODE = MOUSE\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.__calls=[]; window.__lastApplied=''; window.__lastSaved='';
  // With a controller connected, edits land in its own layout (`# @controller type-24 KEY = …`), which wins over the shared line.
  window.__eff=key=>{
   const lines=window.__lastSaved.split('\n').map(line=>line.replace(/\r$/,''));
   const own=lines.filter(line=>line.startsWith('# @controller type-24 '+key+' = ')).pop();
   const shared=lines.filter(line=>line.startsWith(key+' = ')).pop();
   const line=own?own.slice('# @controller type-24 '.length):shared;
   return line?line.slice(key.length+3).trim():undefined;
  };
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{window.__lastSaved=content;window.__calls.push('save');if(window.__delaySave) await new Promise(resolve=>window.__finishSave=resolve);profiles[name]=content;window.__saved=true;return {name}},
   applyProfile:async(path,text)=>{window.__lastApplied=text;window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'Mapper ready\nProfile loaded',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:true,pressure:0.02,speed:420}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // A Steam Controller on first connection asks about its own jingles; decline it, whenever it appears.
 await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}),async()=>{ await page.getByRole('button',{name:'Keep them',exact:true}).click() })
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})



 page.setDefaultTimeout(10000);
 const artifacts=path.resolve(__dirname,'../tmp/steam-workspace'); fs.mkdirSync(artifacts,{recursive:true});
 const shot=async name=>page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});
 const nav=async name=>{
   const mobile=page.getByRole('button',{name:/Navigate$/});
   if(await mobile.isVisible()) await mobile.click();
   await page.getByRole('button',{name,exact:true}).first().click();
 };
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Debug Console',exact:true}).count(),0,'Studio tools stay out of the configuration rail');
 await shot('overview');
 await nav('Buttons');
 const north=page.locator('details[data-input-command="N"]').first();
 await north.locator(':scope > summary').click();
 assert.equal(await north.getByRole('combobox',{name:'Output',exact:true}).count(),0,'advanced editor starts closed');
 const choose=north.getByRole('button',{name:/Choose action:/}).first();
 await choose.click();
 const dialog=page.locator('[data-picker="key"]');
 await dialog.waitFor();
 await page.keyboard.press('PageDown');
 assert.equal(await page.locator('.page-tab[aria-current="page"]').innerText(),'Buttons','section stepping must not escape a dialog');
 await dialog.locator('[data-category="letters"]').click();
 await shot('action-picker-letters');
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'detached'});
 assert.equal(await choose.evaluate(el=>el===document.activeElement),true,'cancel restores originating command focus');
 await choose.click();
 await dialog.waitFor();
 await shot('action-picker-keyboard');
 // Tab wrapping stays in the picker.
 await page.keyboard.press('Tab');
 assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
 await dialog.locator('[data-category="letters"]').click();
 await dialog.locator('button.key-cap[data-token="K"]').click();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__eff('N')==='K');
 assert.deepEqual(await page.evaluate(()=>window.__calls),['save'],'selecting/saving an action must not apply it');
 // X (Listen for a key) in the key picker replaces the existing command's output.
 await north.getByRole('button',{name:/Choose action:/}).first().click();
 await dialog.waitFor();
 await page.keyboard.press('x');
 await page.waitForFunction(()=>document.body.dataset.bindingCapture==='true');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>!document.body.dataset.bindingCapture);
 assert.equal(await page.locator('.page-tab[aria-current="page"]').innerText(),'Buttons');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/^RIGHT\\?$/.test(window.__eff('N')));
 await shot('button-advanced');
 // Controller slider edit mode changes values; ordinary arrows navigate.
 await nav('Gyro');
 // Steadiness ▸ Advanced ▸ Smoothing (console v2, P5): ◂ ▸ change the focused value directly, and down moves on.
 await page.locator('[data-gyro-fine-tune]').click();
 const gyroTop=page.locator('[data-subpage]').last();
 await gyroTop.locator('button[data-group="steadiness"]').click();
 await gyroTop.locator('button').filter({hasText:/^AdvancedIgnore jitter/}).first().click();
 await page.locator('[data-subpage]').last().locator('nav[aria-label="Groups"] button').filter({hasText:/^Smoothing/}).click();
 const slider=page.locator('[data-subpage]').last().locator('[role="slider"]').filter({hasText:/^Smoothing time/}).first();
 await slider.focus(); const original=await slider.getAttribute('aria-valuenow');
 await page.keyboard.press('ArrowRight');
 assert.notEqual(await slider.getAttribute('aria-valuenow'),original);
 await page.keyboard.press('ArrowDown');
 assert.equal(await slider.evaluate(el=>el===document.activeElement),false,'navigation exits the value without further adjustment');
 await shot('gyro-noise');
 for (let n = 0; n < 3; n++) await page.keyboard.press('Escape');
 await page.locator('[data-subpage]').waitFor({state:'detached'});
 await nav('Triggers'); await shot('triggers');
 await nav('Trackpads'); await shot('trackpads');
 await nav('Layers');
 // "New layer" names the new layer on the on-screen keyboard, then edits it.
 await page.getByRole('button',{name:/New layer/}).click();
 const keyboard=page.locator('[data-text-entry] [role="dialog"]');
 await keyboard.waitFor();
 for(let i=0;i<24;i++) await page.keyboard.press('Backspace');
 await page.keyboard.type('Vehicles');
 await page.keyboard.press('Enter');
 await keyboard.waitFor({state:'detached'});
 // A on the layer's card opens what it changes; "See it on Layout" there edits it on Layout (it becomes the layer being edited).
 await page.locator('[data-modes-page] [data-mode-id]').filter({hasText:'Vehicles'}).first().click();
 await page.getByRole('dialog',{name:/What changes in this layer/}).getByRole('button',{name:/See it on Layout/}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Layout'}).waitFor();
 // Console v2: the mode being edited shows in the game chip (modes are chosen on Layout / Modes).
 assert.match(await page.locator('.game-chip').innerText(),/Vehicles layer/);
 await shot('layers');
 // Studio is one press from Home (2a): the Home chip, then its tile.
 await page.locator('.titlebar .home-chip').click();
 // Console v2: Home's Library opens Library ▸ Games.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'configurations'})));
 await page.getByRole('heading',{name:'Games',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Buttons',exact:true}).count(),0);
 await shot('configurations');
 await nav('Launch with game');
 // Add app is a row on the page now, opening a sheet of running apps.
 await page.getByRole('button',{name:/^Add app/}).click();
 await page.locator('.sheet-layer').waitFor();
 await page.keyboard.press('Escape');
 // Console v2: Settings is a hub of categories in the rail; the log and Controller are two of them.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'settings'})));
 await page.locator('.section-item').filter({hasText:'Troubleshooting log'}).click();
 await shot('diagnostics');
 await page.locator('.section-item').filter({hasText:/^Controller/}).first().click();
 await shot('settings');
 // Back to the page being edited: Home, then Continue editing (the back chip is gone).
 await page.locator('.titlebar .home-chip').click();
 await page.locator('[data-home-continue]').click();
 // Home's A is Edit layout (the Layout tab); the mode strip chooses Default again.
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Layout'}).waitFor();
 await page.getByRole('group',{name:'Showing layer'}).getByRole('button',{name:/^Default/}).click();
 assert.doesNotMatch(await page.locator('.game-chip').innerText(),/layer/);
 // The one state button saves and applies the pending edits (1e).
 const state=page.locator('.titlebar .state-button');
 assert.match((await state.innerText()).replace(/\s/g,''),/^Unsaved·(M)?Save$/);
 await state.click();
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 // Both desktop scaling proxies and compact windows; existing mouse and keyboard routes remain usable.
 for(const width of [1440,1024]) {
   await page.setViewportSize({width,height:width===1440?900:720});
   for(const name of ['Buttons','Triggers','Trackpads','Gyro','Layout']) {
     await nav(name);
     await page.locator('.page-tab[aria-current="page"]').filter({hasText:name}).waitFor();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' overflows at '+width);
     await shot(width+'-'+name.toLowerCase());
   }
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.profile-chip').evaluate(el=>getComputedStyle(el).transitionDuration),'1e-05s');
 assert.deepEqual(errors,[]);
 console.log('PASS: workspace contexts, category picker, cancel/focus restore, modal trapping, capture ownership, slider adjustment, layers, save/apply separation and responsive visual sweep');
 } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
