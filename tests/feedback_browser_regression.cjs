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
 // Switching configurations is one control now: the chip that names what you
 // are editing opens the library, and a row there loads it.
 const picker=page.locator('.profile-chip');
 const selectProfile = async name => {
  await picker.click();
  const rows = page.locator('[class*=profileLibraryItem]');
  await rows.first().waitFor();
  const names = await rows.locator("input").evaluateAll(inputs => inputs.map(input => input.value));
  const index = names.indexOf(name);
  if (index < 0) throw new Error(`no configuration named ${name}: ${names.join(", ")}`);
  await rows.nth(index).getByRole('button',{name:'Load',exact:true}).click();
  const close = page.locator('.modal-overlay [data-modal-close], .modal-overlay .modal-header .ghost-btn').first();
  if (await close.count()) await close.click().catch(() => {});
 };
 await picker.filter({hasText:'Desktop'}).waitFor();
 await selectProfile('Game');
 await picker.filter({hasText:'Game'}).waitFor();
 assert.deepEqual(await page.evaluate(()=>window.__calls),[],'selecting a profile applied it');
 await page.getByRole('button',{name:'Save configuration',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>window.__calls),['save'],'Save must not Apply');
 await selectProfile('Desktop');
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 const output=page.locator('button[class*=callout]').filter({hasText:'SPACE'}).first();
 await output.waitFor();
 const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jsm-feedback-'));
 await page.screenshot({path:path.join(out,'overview.png'),fullPage:true});
 await output.click();
 const north=page.locator('[data-input-command="N"]');await north.waitFor();
 assert(await north.evaluate(el=>el.contains(document.activeElement)),'preview shortcut did not focus N');
 await north.locator('input').filter({visible:true}).first().waitFor();
 await north.getByRole('button',{name:'Command actions',exact:true}).click();
 // The command menu carries what the header does not; its exact contents are
 // binding_card_regression's business, this only proves it opens here.
 await page.getByRole('menuitem',{name:'Duplicate',exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 // A callout names the action, not the command -- 'LT3' is what it is called
 // in the configuration, not what it does -- so reach it by accessible name.
 await page.locator('button[aria-label^="LT3:"]').click();
 const region=page.locator('[data-input-command="LT3"]');
 await region.waitFor();
 assert(await region.evaluate(el=>el.contains(document.activeElement)),'grid shortcut did not select and focus LT3');
 await page.getByRole('checkbox',{name:'Require a click to activate a region',exact:true}).first().waitFor();
 await page.locator('[data-input-command="LEFT_PAD"]').waitFor();
 assert(await page.locator('main').evaluate(el=>el.contains(document.activeElement)),'lazy page focus escaped');
 await page.screenshot({path:path.join(out,'trackpads.png'),fullPage:true});
 await selectProfile('Game');
 await page.evaluate(()=>{window.__delaySave=true;window.__saved=false});
 await page.getByRole('button',{name:'Save configuration',exact:true}).click();
 await page.waitForFunction(()=>typeof window.__finishSave==='function');
 await selectProfile('Desktop');
 await page.evaluate(()=>window.__finishSave());
 await page.waitForFunction(()=>window.__saved);
 await picker.filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.locator('button[class*=callout]').filter({hasText:'SPACE'}).first().waitFor();
 await page.evaluate(async()=>{
  window.__hidStatus={supported:true,installed:true,active:false,inverse:false,steamAllowed:false,whitelistSynced:true,requiresElevation:false,managedInstanceIds:['test'],devices:[{instanceId:'test',displayName:'Test Steam Controller',vendor:'Valve',product:'Controller',present:true,hidden:true,partiallyHidden:false,managedByApp:true,stale:false,likelyCurrentController:false}]};
  window.__TAURI_INTERNALS__={invoke:async command=>{if(command==='get_hidhide_status')return structuredClone(window.__hidStatus);throw new Error('Unexpected mocked Tauri command: '+command)}};
 });
 await page.getByRole('button',{name:'Device Visibility',exact:true}).click();
 await page.getByText('Configured to hide · hiding disabled',{exact:true}).waitFor();
 await page.evaluate(()=>{window.__hidStatus.active=true;window.__hidStatus.inverse=true;window.__hidStatus.steamAllowed=true});
 await page.getByRole('button',{name:'Refresh',exact:true}).click();
 await page.getByText('Hidden from listed applications',{exact:true}).waitFor();
 await page.getByText('Steam currently has access through the application list.',{exact:false}).waitFor();
 await page.evaluate(()=>{window.__hidStatus.inverse=false;window.__hidStatus.steamAllowed=false;window.dispatchEvent(new Event('focus'))});
 await page.getByText('Hidden',{exact:true}).waitFor();
 assert.equal(await page.getByText('Steam currently has access through the application list.',{exact:false}).count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: independent edit/save and delayed-save switching; actual overview bindings; preview shortcut focus; command menu; lazy page focus; live HidHide mode/status rendering.');
 } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1});
