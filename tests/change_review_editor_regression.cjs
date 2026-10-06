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

 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Controller status',exact:true}).count(),0);
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const right=page.locator('#trackpad-right'), left=page.locator('#trackpad-left');
 await right.waitFor();
 // Trackpads (console refinement 2b): each pad is a column of summary rows. A
 // value is adjusted in its row -- Enter to adjust, arrows to step, Enter to
 // keep, Escape to put it back -- and a row whose value is not Default says
 // where it comes from on its second line instead of the hint.
 const sheet=page.locator('.sheet');
 const row=(scope,label)=>scope.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText(label,{exact:true})}).first();
 const rowValue=async r=>(await r.locator('.summary-row__value').innerText()).trim();
 const rowLine=r=>r.locator('.summary-row__hint');
 const stateButton=page.locator('.state-button');
 const padSens=row(right,'Sensitivity');
 const leftBefore=await left.innerText();
 assert.equal(await rowValue(padSens),'1.00×');
 assert.equal(await rowLine(padSens).getAttribute('data-tone'),null,'an unset sensitivity shows its hint, not an origin');
 // Sensitivity opens its own sheet, with a row per axis.
 await padSens.click();
 await sheet.getByRole('heading',{name:'Right pad · Sensitivity'}).waitFor();
 const sens=row(sheet,'Horizontal sensitivity');
 const adjustSens=async(steps,finish='Enter')=>{
  await sens.focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-adjusting')==='true');
  for(let i=0;i<Math.abs(steps);i++) await page.keyboard.press(steps>0?'ArrowRight':'ArrowLeft');
  await page.keyboard.press(finish);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-adjusting')!=='true');
 };
 await adjustSens(1);
 assert.equal(await rowValue(sens),'1.05×');
 assert.equal(await sens.locator('.summary-row__hint[data-tone]').count(),0,'a value the configuration sets with nothing behind it names no origin: the configuration is the one being edited');
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 // The edit shows on its own pad's row and nowhere else.
 assert.equal(await rowValue(padSens),'1.05×');
 assert.equal(await padSens.locator('.summary-row__hint[data-tone]').count(),0);
 assert.equal(await left.innerText(),leftBefore,'unrelated pad changed');
 // One state button says what it will do (1e).
 await page.waitForFunction(()=>document.querySelector('.state-button')?.textContent==='Apply 1 change');
 await page.getByRole('button',{name:'Review 1 changes',exact:true}).click();
 const review=page.getByRole('dialog',{name:'Review changes',exact:true});await review.waitFor();
 assert.match(await review.innerText(),/Right pad sensitivity/);
 await review.getByRole('button',{name:'Revert Right pad sensitivity',exact:true}).click();
 await review.getByRole('heading',{name:'No pending changes',exact:true}).waitFor();
 await review.getByRole('button',{name:/^Undo/}).click();assert.match(await review.innerText(),/1 change/);
 await review.getByRole('button',{name:'Save and apply',exact:true}).click();
 await page.waitForFunction(()=>window.__calls.includes('save')&&window.__calls.includes('apply'));
 await page.getByRole('button',{name:'Review 0 changes',exact:true}).click();
 await page.getByRole('heading',{name:'No pending changes',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: editor integration, pending sensitivity review, selective revert undo, save/apply baseline reset');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
