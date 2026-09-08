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

 await page.locator('.utility-profile-select').getByRole('combobox').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Controller status',exact:true}).count(),0);
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const right=page.locator('#trackpad-right'), left=page.locator('#trackpad-left');
 await right.waitFor();
 const sens=right.getByRole('textbox',{name:'Horizontal sensitivity',exact:true});
 await sens.fill('3.3'); await sens.press('Tab');
 await right.getByText('Unsaved changes',{exact:true}).waitFor();
 assert.equal(await left.getByText('Unsaved changes',{exact:true}).count(),0,'unrelated pad is dirty');
 await page.keyboard.press('Control+z');
 await page.waitForFunction(()=>!document.querySelector('#trackpad-right')?.textContent.includes('Unsaved changes'));
 await page.keyboard.press('Control+Shift+z');
 await right.getByText('Unsaved changes',{exact:true}).waitFor();
 await page.keyboard.press('Control+Shift+a');
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply']);
 await right.getByText('Unsaved changes',{exact:true}).waitFor();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__calls.includes('save'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save']);
 await page.getByRole('button',{name:'Save and apply',exact:true}).click();
 await page.waitForFunction(()=>window.__calls.length===4);
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save','save','apply']);
 // Shifted grid must be editable even though the ordinary mode is mouse.
 await right.getByRole('combobox').filter({hasText:'No modeshift'}).click();
 await page.getByRole('option',{name:'Pad click',exact:true}).click();
 await right.getByRole('textbox',{name:'Columns',exact:true}).waitFor();
 await right.getByRole('button',{name:/Region 1|Cell 1|RT1/}).first().waitFor();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('MISC2,RIGHT_TOUCHPAD_MODE = GRID_AND_STICK') || window.__lastSaved.includes('MISC2, RIGHT_TOUCHPAD_MODE = GRID_AND_STICK'));
 await page.getByRole('button',{name:'Trackpad tuning',exact:true}).click();
 await page.getByRole('navigation',{name:'Trackpad tuning sections'}).waitFor();
 await page.getByText('420.00 px/s',{exact:true}).waitFor();
 await page.locator('#touch-release').getByRole('button',{name:'Help: Lift-off protection',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('dialog').count(),0);
 const artifacts=path.resolve(__dirname,'../tmp/feedback-review'); fs.mkdirSync(artifacts,{recursive:true});
 await page.evaluate(()=>{document.querySelector('.shell-scroll').scrollTop=0});
 await page.screenshot({path:path.join(artifacts,'trackpad-tuning.png'),fullPage:true});
 await page.getByRole('button',{name:'Triggers',exact:true}).click();
 await page.getByRole('textbox',{name:'Soft press point',exact:true}).first().fill('0.1');
 await page.keyboard.press('Tab');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_THRESHOLD = 0.1'));
 await page.getByRole('textbox',{name:'Flicker guard',exact:true}).first().fill('0.03');
 await page.keyboard.press('Tab');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_HYSTERESIS = 0.03'));
 await page.getByRole('button',{name:'Debug Console',exact:true}).click();
 await page.getByLabel('JoyShockMapper live console').filter({hasText:'Mapper ready'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: scoped dirty state, undo/redo, shortcuts, save/apply separation, modeshift editing, live graph, help, trigger controls, console');
 console.log('Screenshots:',artifacts);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
