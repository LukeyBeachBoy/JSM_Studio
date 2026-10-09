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
  window.__calls=[];
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{window.__calls.push('save');if(window.__delaySave) await new Promise(resolve=>window.__finishSave=resolve);profiles[name]=content;window.__saved=true;return {name}},
   applyProfile:async(path,text)=>{window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 // Switching configurations is one control: the Editing segment in the title
 // bar opens a searchable menu of every configuration, and choosing one loads it.
 const picker=page.locator('.profile-chip');
 const selectProfile = async name => {
  await picker.click();
  await page.getByRole('menuitem').filter({hasText:name}).first().click();
 };
 await picker.filter({hasText:'Desktop'}).waitFor();
 // A controller is connected and in use, so the capsule draws its buttons,
 // never names or keys (D11); the mouse just used brings the keys back.
 await page.locator('.hint-capsule kbd').first().waitFor();
 await page.evaluate(()=>{ document.body.dataset.inputSource='controller' });
 await page.locator('.hint-capsule svg.hint-glyph[data-glyph]').first().waitFor();
 assert.equal(await page.locator('.hint-capsule kbd').count(),0,'capsule should show glyphs with a controller in use');
 await selectProfile('Game');
 await picker.filter({hasText:'Game'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__calls),[],'selecting a profile applied it');
 // Nothing unsaved and not running: the state button offers to apply it
 // (1e), and the Configuration menu's Save idles saying why. Ctrl+S still
 // writes the file, and must not apply it.
 // Console v2: the chip says Paused while you edit; ☰ has the actions.
 assert.equal(await page.locator('.titlebar .state-button').innerText(),'Paused while you edit');
 await page.locator('.titlebar .menu-chip').click();
 const save=page.locator('.config-menu__item').filter({hasText:'Save, not live yet'});
 assert.equal(await save.getAttribute('data-reason'),'No unsaved changes');
 await page.keyboard.press('Escape');
 await save.waitFor({state:'detached'});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__calls.length>0);
 assert.deepEqual(await page.evaluate(()=>window.__calls),['save'],'Save must not Apply');
 await selectProfile('Desktop');
 await page.getByRole('button',{name:'Layout',exact:true}).click();
 const output=page.locator('button[class*=callout]').filter({hasText:'SPACE'}).first();
 await output.waitFor();
 const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jsm-feedback-'));
 await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});
 await output.click();
 const north=page.locator('[data-input-command="N"]');await north.waitFor();
 assert(await north.evaluate(el=>el.contains(document.activeElement)),'preview shortcut did not focus N (its binding sheet is open)');
 // The row opens its binding sheet (console v2); its contents are binding_card_regression's business, this only proves it opens here.
 // (Choosing a Layout callout is A Change: it opens the input's binding sheet at once.)
 const bindingSheet=page.getByRole('dialog').last();
 await bindingSheet.getByRole('tablist',{name:'When you…'}).waitFor();
 await page.keyboard.press('Escape');
 await bindingSheet.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Layout',exact:true}).click();
 // Console v2: the left pad is one callout ("LP"); choosing it goes to that pad on Trackpads.
 await page.locator('[data-overview-slot="left-pad"]').click();
 const region=page.locator('[data-input-command="LEFT_PAD"]');
 await region.waitFor();
 // Trackpads is a lazy page, so give the shortcut's focus a moment to land.
 const focused=sel=>page.waitForFunction(sel=>document.querySelector(sel)?.contains(document.activeElement),sel,{timeout:3000}).then(()=>true,()=>false);
 assert(await focused('main [role="radiogroup"]'),'pad shortcut did not select the left pad and focus its mode cards');
 // Click-to-activate is a switch row on the pad's front (console v2, P4), toggled with A.
 await page.locator('.summary-row').filter({has:page.locator('.summary-row__label').getByText('Click required',{exact:true})}).first().waitFor();
 assert.equal(await page.locator('.section-item[aria-current="true"]').innerText().then(text=>/Left pad/.test(text)),true,'the pad shortcut lands on the left pad');
 await page.locator('[data-input-command="LEFT_PAD"]').waitFor();
 assert(await page.locator('main').evaluate(el=>el.contains(document.activeElement)),'lazy page focus escaped');
 await page.screenshot({path:path.join(out,'trackpads.png'),fullPage:true});
 await selectProfile('Game');
 await page.evaluate(()=>{window.__delaySave=true;window.__saved=false});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>typeof window.__finishSave==='function');
 await selectProfile('Desktop');
 await page.evaluate(()=>window.__finishSave());
 await page.waitForFunction(()=>window.__saved);
 await picker.filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Layout',exact:true}).click();
 await page.locator('button[class*=callout]').filter({hasText:'SPACE'}).first().waitFor();
 await page.evaluate(async()=>{
  window.__hidStatus={supported:true,installed:true,active:false,inverse:false,steamAllowed:false,whitelistSynced:true,requiresElevation:false,managedInstanceIds:['test'],devices:[{instanceId:'test',displayName:'Test Steam Controller',vendor:'Valve',product:'Controller',present:true,hidden:true,partiallyHidden:false,managedByApp:true,stale:false,likelyCurrentController:false}]};
  window.__TAURI_INTERNALS__={invoke:async command=>{if(command==='get_hidhide_status')return structuredClone(window.__hidStatus);throw new Error('Unexpected mocked Tauri command: '+command)}};
 });
 // Studio is one press from Home (2a): the Home chip, then its tile.
 // Console v2: Settings ▸ Hide the real controller.
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'deviceVisibility' })));
 await page.locator('.page-header__title').filter({hasText:'Hide the real controller'}).waitFor();
 await page.getByText('Set to hide · hiding is off',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__hidStatus.active=true;window.__hidStatus.inverse=true;window.__hidStatus.appList=[{name:'steam.exe',path:'C:/Steam/steam.exe',addedForYou:false,steam:true}];window.dispatchEvent(new Event('focus'))});
 await page.getByText('Hidden from the apps on HidHide’s list',{exact:true}).waitFor();
 await page.locator('[data-hidhide-app="steam.exe"]').getByText('Can see them too, so games may react twice',{exact:false}).waitFor();
 await page.evaluate(()=>{window.__hidStatus.inverse=false;window.__hidStatus.appList=[];window.dispatchEvent(new Event('focus'))});
 await page.getByText('Hidden from games · JSM still reads it',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-hidhide-app="steam.exe"]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: independent edit/save and delayed-save switching; actual overview bindings; preview shortcut focus; command menu; lazy page focus; live HidHide mode/status rendering.');
 } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1});
