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


 page.setDefaultTimeout(10000);
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.locator('aside').getByText('Navigate with controller',{exact:true}).count(),0);
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-overview.png'),fullPage:true});
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const normal = page.locator('details[data-input-command="N"]');
 assert.equal(await normal.getAttribute('open'),null);
 await normal.locator(':scope > summary').click();
 await normal.getByRole('combobox',{name:'Trigger',exact:true}).waitFor();
 assert.equal(await normal.getByRole('button',{name:/icon/i}).count(),0,'ordinary inputs cannot assign menu icons');
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-bindings.png'),fullPage:true});
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const left = page.locator('#trackpad-left');
 const drag = left.getByRole('combobox',{name:/What the drag acts as/i});
 await drag.click(); await page.getByRole('option',{name:'Mouse Aim',exact:true}).click();
 await drag.click(); await page.getByRole('option',{name:/None selected|Use default/i}).click();
 await page.keyboard.press('Control+s');
 assert.ok(!/LEFT_TOUCH_STICK_MODE = AIM/.test(await page.evaluate(()=>window.__lastSaved)));
 const appearance = left.getByRole('button',{name:'Appearance & Position',exact:true});
 await appearance.click();
 await page.getByRole('heading',{name:'Menu Layout',exact:true}).waitFor();
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-menus.png'),fullPage:true});
 await page.getByRole('button',{name:'Settings',exact:true}).first().click();
 await page.getByRole('heading',{name:'Controller Polling',exact:true}).waitFor();
 await page.getByRole('button',{name:'Navigate with controller',exact:true}).waitFor();
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-settings.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: compact bindings, non-menu icons hidden, clearable modes, menu layout navigation, settings relocation');
 } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
