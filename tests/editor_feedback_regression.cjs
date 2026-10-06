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
 await page.keyboard.press('Control+z');
 await page.waitForFunction(()=>!/^Apply \d+ change/.test(document.querySelector('.state-button')?.textContent??''));
 assert.equal(await rowValue(padSens),'1.00×','undo restores the pad');
 await page.keyboard.press('Control+Shift+z');
 await page.waitForFunction(()=>document.querySelector('.state-button')?.textContent==='Apply 1 change');
 assert.equal(await rowValue(padSens),'1.05×','redo reapplies it');
 await page.keyboard.press('Control+Shift+a');
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply']);
 assert.equal(await stateButton.innerText(),'Apply 1 change','applying is not saving');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__calls.includes('save'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save']);
 // Save moved off the title bar into the Configuration menu (1e), reached from
 // the configuration chip. With nothing unsaved it stays focusable but idle
 // and says why.
 const openConfigMenu=async()=>{
  await page.locator('.profile-chip').click();
  await page.getByRole('menuitem',{name:/^Configuration menu…/}).click();
  await page.locator('.config-menu').waitFor();
 };
 const saveItem=page.locator('.config-menu__item').filter({hasText:'Save without applying'});
 await openConfigMenu();
 assert.equal(await saveItem.getAttribute('aria-disabled'),'true');
 assert.equal(await saveItem.getAttribute('data-reason'),'No unsaved changes');
 await page.keyboard.press('Escape');
 await page.locator('.config-menu').waitFor({state:'detached'});
 await padSens.click();
 await adjustSens(1);
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.state-button')?.textContent==='Apply 1 change');
 await openConfigMenu();
 assert.equal(await saveItem.getAttribute('aria-disabled'),null);
 await saveItem.click();
 await page.waitForFunction(()=>window.__calls.length===3);
 // Saved but not running: the state button names the configuration it applies.
 assert.equal(await stateButton.innerText(),'Apply Desktop');
 await stateButton.click();
 await page.waitForFunction(()=>window.__calls.length===4);
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save','save','apply']);
 // A shift starts in the mode the pad is already in -- a modeshift is this
 // input reconfigured, not a jump to one particular mode -- and any mode the
 // pad supports can then be chosen, editable with the pad's own controls.
 await right.getByRole('button',{name:'Add modeshift'}).click();
 await right.getByRole('combobox').filter({hasText:'Choose a trigger'}).click();
 // A trigger is named for the controller that is connected, so the mocked
 // Steam Controller calls its top-left bumper LB rather than "L1 / LB".
 await page.getByRole('option',{name:/top-left bumper/}).click();
 // The shift is the pad section itself, so its Mode row is the pad's own.
 const shiftCard = right.locator('details[data-modeshift="L"]');
 assert.match(await shiftCard.locator(':scope > summary').innerText(),/While\s+LB\s+is held/,'the shift is announced by its held input');
 const shiftMode = shiftCard.locator('button.summary-row[data-input-command="L,RIGHT_PAD"]');
 await shiftMode.waitFor();
 assert.equal(await rowValue(shiftMode),'Mouse','a new shift should inherit the pad’s current mode');
 // Mode opens the Mode sheet; the mode is a choice adjusted in its row.
 await shiftMode.click();
 await sheet.getByRole('heading',{name:'Right pad · Mode'}).waitFor();
 const modeRow=row(sheet,'Mode');
 await modeRow.focus(); await page.keyboard.press('Enter');
 await page.keyboard.press('ArrowLeft');
 await page.keyboard.press('Enter');
 assert.equal(await rowValue(modeRow),'Menu');
 // A menu's layout rows appear in the same sheet once the pad is a menu.
 await row(sheet,'Columns').waitFor();
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 // Nothing is bound in the shift yet, so there is no menu to draw; the
 // region's own row is there, keyed by the shifted input, and its binding
 // editor opens in a sheet.
 const shiftRegion=shiftCard.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText(/^Region 1 · /)});
 await shiftRegion.waitFor();
 // Checked at the end, so the rest of the page is still exercised meanwhile.
 const shiftRegionKey=await shiftRegion.getAttribute('data-input-command');
 await shiftRegion.click();
 await sheet.locator('details[data-input-command="L,RT1"]').waitFor();
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/L\s*,\s*RIGHT_TOUCHPAD_MODE = GRID_AND_STICK/.test(window.__lastSaved));
 // Trackpad tuning is the Trackpad feel sheet now (2c), opened from the row
 // under a pad set to Mouse; its scope strip says which pads it touches.
 await row(right,'Trackpad feel').click();
 await sheet.getByRole('heading',{name:'Trackpad feel'}).waitFor();
 await sheet.locator('.scope-tile[data-state="uses"]').filter({hasText:'Right pad · Mouse · uses this'}).waitFor();
 await sheet.locator('.scope-tile[data-state="not"]').filter({hasText:'Left pad · Menu · not affected'}).waitFor();
 // The acceleration curve opens its own editor over the sheet (TODO-40), with
 // the live finger speed on it; closing it returns to the sheet.
 await row(sheet,'Acceleration curve').click();
 const curveView=page.locator('.curve-view');
 await curveView.locator('.curve-view__readout').getByText('420 px/s',{exact:true}).first().waitFor();
 await page.keyboard.press('Escape');
 await curveView.waitFor({state:'detached'});
 await sheet.getByRole('heading',{name:'Trackpad feel'}).waitFor();
 // A setting's description is X (What's this?) on its row; there is no help dialog to open.
 const lift=row(sheet,'Lift-off protection');
 await lift.focus(); await page.keyboard.press('x');
 await sheet.locator('.summary-row__help').getByText(/Below this finger speed/).waitFor();
 const artifacts=path.resolve(__dirname,'../tmp/feedback-review'); fs.mkdirSync(artifacts,{recursive:true});
 await page.screenshot({path:path.join(artifacts,'trackpad-tuning.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Triggers',exact:true}).click();
 // Threshold and release tuning now folds away behind its own disclosure.
 await page.locator('summary').filter({hasText:'Threshold & release'}).first().click();
 await page.getByRole('textbox',{name:'Soft press point',exact:true}).first().fill('0.1');
 await page.keyboard.press('Tab');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_THRESHOLD = 0.1'));
 const guardRow=page.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText('Flicker guard',{exact:true})}).first();
 await guardRow.click();
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('Enter');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_HYSTERESIS = 0.03'));
 // Debug Console now lives under the app-level Studio context, not the
 // per-configuration rail: the Home chip, then its Studio tile (2a).
 await page.locator('.home-chip').click();
 await page.getByRole('button',{name:/^Debug console/}).click();
 await page.getByLabel('JoyShockMapper live console').filter({hasText:'Mapper ready'}).waitFor();
 // A shift's region row is the shifted input: the shell finds inputs by
 // data-input-command (jump-to-input, focus restore), and "RT1" there would be
 // the unshifted region, which this row does not edit.
 assert.equal(shiftRegionKey,'L,RT1','the shift’s region row must be keyed by the shifted input');
 // Stepping a value in its row, on a fresh copy of the configuration. Several
 // steps are several writes, and none of them may leave anything behind:
 // TOUCHPAD_SENS = 1.1 means both axes, so stepping Horizontal from 1.00 twice
 // must not strand Vertical at the first step, and Escape must leave the file
 // exactly as it was, not write the starting value into it.
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 await padSens.click();
 await sheet.getByRole('heading',{name:'Right pad · Sensitivity'}).waitFor();
 await adjustSens(3,'Escape');
 assert.equal(await rowValue(sens),'1.00×','Escape reverts an adjustment');
 assert.match(await stateButton.innerText(),/Applied|Apply Desktop/,'Escape after adjusting an unset value must leave the file unchanged');
 await adjustSens(2);
 assert.equal(await rowValue(sens),'1.10×');
 assert.equal(await rowValue(row(sheet,'Vertical sensitivity')),'1.10×','stepping Horizontal must keep a single-value TOUCHPAD_SENS single');
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 assert.equal(await rowValue(padSens),'1.10×');
 assert.deepEqual(errors,[]);
 console.log('PASS: scoped dirty state, undo/redo, shortcuts, save/apply separation, modeshift editing, live graph, help, trigger controls, console');
 console.log('Screenshots:',artifacts);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
