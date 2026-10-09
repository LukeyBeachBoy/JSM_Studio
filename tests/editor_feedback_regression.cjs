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
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})

 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Controller status',exact:true}).count(),0);
 // Console v2 (P4): Trackpads shows one pad at a time, picked on the rail. A
 // mouse pad's Sensitivity is a console row: the arrows step it, it writes at
 // once, and a value the configuration sets with nothing behind it names no origin.
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.locator('.section-item').filter({hasText:'Right pad'}).click();
 const right=page.locator('#trackpad-right');
 await right.waitFor();
 const sheet=page.locator('.sheet');
 const unsaved=page.locator('.state-button[data-state="unsaved"]');
 const padSens=right.locator('[role="slider"]').filter({hasText:'Sensitivity'});
 const tag=row=>row.locator('[class*="tag"]');
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.00×');
 assert.equal(await tag(padSens).innerText(),'Default','an unset sensitivity says it is the default');
 await padSens.focus(); await page.keyboard.press('ArrowRight');
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.05×');
 assert.equal(await tag(padSens).count(),0,'a value the configuration sets with nothing behind it names no origin: the configuration is the one being edited');
 // The edit is on its own pad, and nowhere else.
 await page.locator('.section-item').filter({hasText:'Left pad'}).click();
 await page.locator('#trackpad-left').waitFor();
 assert.equal(await page.locator('#trackpad-left [role="radio"][data-current="true"]').getAttribute('data-value'),'ZONES');
 await page.locator('.section-item').filter({hasText:'Right pad'}).click();
 await right.waitFor();
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.05×');
 // One state button says what it will do (1e).
 await unsaved.waitFor();
 await page.keyboard.press('Control+z');
 await unsaved.waitFor({state:'detached'});
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.00×','undo restores the pad');
 await page.keyboard.press('Control+Shift+z');
 await unsaved.waitFor();
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.05×','redo reapplies it');
 await page.keyboard.press('Control+Shift+a');
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply']);
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__calls.includes('save'));
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save']);
 // Saving is in the Configuration menu (☰). With nothing unsaved it stays
 // focusable but idle and says why.
 const openConfigMenu=async()=>{
  await page.locator('.menu-chip').click();
  await page.locator('.config-menu').waitFor();
 };
 const saveItem=page.locator('.config-menu__item[data-key="save"]');
 await openConfigMenu();
 assert.equal(await saveItem.getAttribute('aria-disabled'),'true');
 await page.keyboard.press('Escape');
 await page.locator('.config-menu').waitFor({state:'detached'});
 await padSens.focus(); await page.keyboard.press('ArrowRight');
 await unsaved.waitFor();
 await openConfigMenu();
 assert.equal(await saveItem.getAttribute('aria-disabled'),null);
 await saveItem.click();
 await page.waitForFunction(()=>window.__calls.length===3);
 assert.deepEqual(await page.evaluate(()=>window.__calls),['apply','save','save']);
 // While holding… is this pad reconfigured, not a jump to one particular
 // mode: a new shift starts in the mode the pad is already in, and any mode
 // the pad supports can then be chosen, edited with the pad's own controls.
 await right.locator('[role="radio"]').first().focus();
 await page.keyboard.press('y');
 await page.locator('[data-more-item="holding"]').click();
 const holding=page.locator('[data-subpage]').first();
 // "Add a button" opens the "Hold which button?" sheet; Next creates the shift
 // and opens its editor on a page of its own.
 await holding.locator('[data-add-modeshift]').click();
 const holdSheet=page.getByRole('dialog').filter({has:page.locator('[data-hold-input]')});
 await holdSheet.locator('[data-hold-input="L"]').click();
 await holdSheet.getByRole('button',{name:'Next',exact:true}).click();
 const shiftCard = page.locator('[data-modeshift-editor="L"]');
 await shiftCard.waitFor();
 // A trigger is named for the controller that is connected, so the mocked
 // Steam Controller calls its top-left bumper LB rather than "L1 / LB".
 assert.match(await holding.locator('[data-modeshift="L"]').innerText(),/LB held/,'the shift is announced by its held input');
 assert.match(await page.locator('[data-subpage]').filter({has:shiftCard}).locator(':scope > header').innerText(),/Mode shift · LB/,'its page is titled by the held input');
 const shiftMode = shiftCard.locator('button.summary-row[data-input-command="L,RIGHT_PAD"]');
 await shiftMode.waitFor();
 assert.equal((await shiftMode.locator('.summary-row__value').innerText()).trim(),'Mouse','a new shift should inherit the pad’s current mode');
 await shiftMode.click();
 await sheet.getByRole('heading',{name:/Right (pad|trackpad) · Mode/}).waitFor();
 const modeRow=sheet.getByRole('combobox',{name:/^Mode/}).first();
 await modeRow.focus(); await page.keyboard.press('Enter');
 await page.getByRole('option',{name:'Menu',exact:true}).click();
 assert.match(await modeRow.innerText(),/Menu/);
 // A menu's layout rows appear in the same sheet once the pad is a menu.
 await sheet.locator('.summary-row-wrap').filter({hasText:/^Columns/}).first().waitFor();
 await sheet.locator('[data-modal-close]').evaluate(close=>close.click());
 await sheet.waitFor({state:'detached'});
 // The shift's region row is keyed by the shifted input, and its binding
 // editor opens in a sheet.
 const shiftRegion=shiftCard.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText(/^Region 1 · /)});
 await shiftRegion.waitFor();
 const shiftRegionKey=await shiftRegion.getAttribute('data-input-command');
 await shiftRegion.click();
 await sheet.locator('details[data-input-command="L,RT1"]').waitFor();
 for (let i=0;i<3 && await sheet.count();i++) await sheet.last().locator('[data-modal-close]').evaluate(close=>close.click());
 await sheet.waitFor({state:'detached'});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/L\s*,\s*RIGHT_TOUCHPAD_MODE = GRID_AND_STICK/.test(window.__lastSaved));
 await page.locator('[data-subpage]').filter({has:shiftCard}).locator('[data-modal-close]').evaluate(close=>close.click());
 await shiftCard.waitFor({state:'detached'});
 await holding.locator('[data-modal-close]').evaluate(close=>close.click());
 await page.locator('[data-subpage]').waitFor({state:'detached'});
 // Trackpad feel is Trackpads ▸ Fine-tune now (Speed & curve, Glide, Click,
 // Feel). The acceleration curve opens its own editor over it (TODO-40), with
 // the live finger speed on it; closing it returns to Fine-tune.
 await right.locator('[data-trackpad-fine-tune]').click();
 const sub=page.locator('[data-subpage]');
 await sub.locator('[data-group="speed"]').waitFor();
 await sub.locator('button').filter({hasText:/^Advanced/}).click();
 await sub.last().locator('button').filter({hasText:/^Edit the curve/}).click();
 const curveView=page.locator('.curve-view');
 await curveView.locator('.curve-view__readout').getByText('420 px/s',{exact:true}).first().waitFor();
 await page.keyboard.press('Escape');
 await curveView.waitFor({state:'detached'});
 // A setting says what it does in the footer caption on focus (no help dialog to open).
 await page.locator('[data-subpage] [data-modal-close]').last().evaluate(close=>close.click());
 await sub.locator('[data-group="click"]').click();
 const lift=sub.locator('[role="slider"]').filter({hasText:'Lift-off guard'});
 assert.match(await lift.getAttribute('data-caption'),/Holds the cursor as your thumb rolls off/);
 const artifacts=path.resolve(__dirname,'../tmp/feedback-review'); fs.mkdirSync(artifacts,{recursive:true});
 await page.screenshot({path:path.join(artifacts,'trackpad-tuning.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await sub.waitFor({state:'detached'});
 // Triggers: press points are Fine-tune ▸ Press points (half-press point and release margin).
 await page.getByRole('button',{name:'Triggers',exact:true}).click();
 await page.locator('#trigger-left [data-trigger-fine-tune]').click();
 const press=page.locator('[data-subpage]');
 const half=press.locator('[role="slider"]').filter({hasText:'Half-press point'});
 await half.focus();
 for (let i=0;i<10;i++) await page.keyboard.press('ArrowRight');
 assert.equal(await half.getAttribute('aria-valuetext'),'10%');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_THRESHOLD = 0.1'));
 const guardRow=press.locator('[role="slider"]').filter({hasText:'Release margin'});
 await guardRow.focus();
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('ArrowRight');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('TRIGGER_HYSTERESIS = 0.03'));
 await page.keyboard.press('Escape');
 await press.waitFor({state:'detached'});
 // Debug Console now lives under the app-level Studio context, not the
 // per-configuration rail: the Home chip, then its Studio tile (2a).
 // Console v2: Settings ▸ Troubleshooting log.
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'debugConsole' })));
 await page.getByLabel('JoyShockMapper live log').filter({hasText:'Mapper ready'}).waitFor();
 // A shift's region row is the shifted input: the shell finds inputs by
 // data-input-command (jump-to-input, focus restore), and "RT1" there would be
 // the unshifted region, which this row does not edit.
 assert.equal(shiftRegionKey,'L,RT1','the shift’s region row must be keyed by the shifted input');
 // Stepping a value in its row, on a fresh copy of the configuration. Several
 // steps are several writes, and none of them may leave anything behind:
 // TOUCHPAD_SENS = 1.1 means both axes, so stepping Horizontal from 1.00 twice
 // must not strand Vertical at the first step.
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:5000}).catch(()=>{});
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.locator('.section-item').filter({hasText:'Right pad'}).click();
 await padSens.focus();
 await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
 assert.equal(await padSens.getAttribute('aria-valuetext'),'1.10×');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/RIGHT_TOUCHPAD_SENS = 1\.1$/m.test(window.__lastSaved));
 assert.deepEqual(errors,[]);
 console.log('PASS: scoped dirty state, undo/redo, shortcuts, save/apply separation, modeshift editing, live graph, captions, trigger controls, console');
 console.log('Screenshots:',artifacts);
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
