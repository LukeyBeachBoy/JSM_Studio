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
 const dialog=page.getByRole('dialog',{name:'Choose an action'});
 await dialog.waitFor();
 await page.keyboard.press('PageDown');
 assert.equal(await page.locator('.page-header__title').innerText(),'Buttons','section stepping must not escape a dialog');
 await dialog.getByRole('button',{name:'Mouse',exact:true}).click();
 await shot('action-picker-mouse');
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await choose.evaluate(el=>el===document.activeElement),true,'cancel restores originating command focus');
 await choose.click();
 await dialog.getByRole('button',{name:'Keyboard',exact:true}).click();
 await shot('action-picker-keyboard');
 // Tab wrapping stays in the modal.
 const advanced=dialog.getByRole('button',{name:'Command options',exact:true});
 await advanced.focus(); await page.keyboard.press('Tab');
 assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);
 await dialog.getByRole('button',{name:'K',exact:true}).click();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/^N = K$/m.test(window.__lastSaved));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['save'],'selecting/saving an action must not apply it');
 await north.getByRole('button',{name:'Command options',exact:true}).click();
 await north.getByRole('combobox',{name:'Output',exact:true}).waitFor();
 await north.getByRole('button',{name:'Capture',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.bindingCapture==='true');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>!document.body.dataset.bindingCapture);
 assert.equal(await page.locator('.page-header__title').innerText(),'Buttons');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/^N = RIGHT$/m.test(window.__lastSaved));
 await shot('button-advanced');
 // Controller slider edit mode changes values; ordinary arrows navigate.
 await nav('Gyro');
 // Noise & steadying is the Steadying row under Fine tuning now, and opens a sheet (1d).
 await page.getByRole('button',{name:'Fine tuning',exact:true}).click();
 await page.locator('.summary-row').filter({has:page.locator('.summary-row__label').getByText('Steadying',{exact:true})}).click();
 const sheet=page.locator('.sheet');
 await sheet.getByRole('heading',{name:'Steadying',exact:true}).waitFor();
 const slider=sheet.getByRole('slider').first();
 await slider.focus(); const original=await slider.getAttribute('aria-valuenow');
 await page.keyboard.press('Enter'); await page.keyboard.press('ArrowRight');
 assert.notEqual(await slider.getAttribute('aria-valuenow'),original);
 await page.keyboard.press('Escape');
 await page.keyboard.press('ArrowDown');
 assert.equal(await slider.evaluate(el=>el===document.activeElement),false,'navigation exits slider without further adjustment');
 await shot('gyro-noise');
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 await nav('Triggers'); await shot('triggers');
 await nav('Trackpads'); await shot('trackpads');
 await nav('Layers');
 await page.getByRole('textbox',{name:'New layer name',exact:true}).fill('Vehicles');
 await page.getByRole('button',{name:'Create layer',exact:true}).click();
 assert.equal((await page.locator('.context-segment--layer b').innerText()),'Vehicles');
 await shot('layers');
 // Studio is one press from Home (2a): the Home chip, then its tile.
 await page.locator('.titlebar .home-chip').click();
 await page.locator('section[aria-labelledby="home-studio-title"]').getByRole('button',{name:/^Configurations/}).click();
 await page.getByRole('heading',{name:'Configurations',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Buttons',exact:true}).count(),0);
 await shot('configurations');
 await nav('Associations');
 await page.getByRole('button',{name:'+ Add app',exact:true}).click();
 await page.locator('.modal-overlay').waitFor();
 await page.keyboard.press('Escape');
 await nav('Debug console'); await shot('diagnostics');
 await nav('Preferences'); await shot('settings');
 // Back to the page being edited: Home, then Continue editing (the back chip is gone).
 await page.locator('.titlebar .home-chip').click();
 await page.locator('[data-home-continue]').click();
 await page.locator('.page-header__title').filter({hasText:'Layers'}).waitFor();
 await page.getByRole('button',{name:/^Editing layer:/}).click();await page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText('Default',{exact:true})}).click();
 assert.equal((await page.locator('.context-segment--layer b').innerText()),'Default');
 // The one state button saves and applies the pending edits (1e).
 const state=page.locator('.titlebar .state-button');
 assert.match(await state.innerText(),/^Apply \d+ changes?$/);
 await state.click();
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 // Both desktop scaling proxies and compact windows; existing mouse and keyboard routes remain usable.
 for(const width of [1440,1024]) {
   await page.setViewportSize({width,height:width===1440?900:720});
   for(const name of ['Buttons','Triggers','Trackpads','Gyro','Overview']) {
     await nav(name);
     await page.locator('.page-header__title').filter({hasText:name}).waitFor();
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
