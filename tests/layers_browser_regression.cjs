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
  const profiles={Desktop:'RESET_MAPPINGS\nprofiles-library/Template.txt\nRSR,N = J\nRSR,W = U\nN = SPACE\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_SIZE = 2 2\nLT1 = ENTER\nLT3 = TAB\nRIGHT_TOUCHPAD_MODE = MOUSE\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.__calls=[]; window.__lastApplied=''; window.__lastSaved='';
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   readConfigFile:async()=> 'E = C\nLEFT_TOUCHPAD_SENS = 1.7\n',
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


 // The editing layer is the title bar's Layer segment; its menu switches it.
 const picker=page.locator('.context-segment--layer');
 const pickerName=async()=>(await picker.locator('b').innerText()).trim();
 const layerItem=name=>page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText(name,{exact:true})});
 // Activation belongs to the input, so it is bound from the input, not from
 // the layer panel. Group is the Buttons-page section the input lives in.
 // Activation belongs to the input, so it is bound from the input rather than
 // from the layer panel. The Buttons page lists every input, so no group
 // navigation is needed to reach one.
 // Activation belongs to the input, so it is bound from the input rather than
 // from the layer panel. The Buttons page lists every input, so no group
 // navigation is needed to reach one.
 // Manage layers is the last row of the title bar's Layer menu.
 const openManageLayers=async()=>{
  if(await page.locator('#layer-management').count()) return;
  await page.getByRole('button',{name:/^Editing layer:/}).click();
  await page.getByRole('menuitem',{name:'Manage layers…'}).click();
 };
 // Anything modal covers the page behind it, so close whatever is open before
 // touching the app itself. One at a time, since closing one can reveal another.
 const closeManageLayers=async()=>{
  for(let attempt=0;attempt<4;attempt++){
   if(!await page.locator('.modal-overlay').count()) return;
   const close=page.locator('.modal-overlay [data-modal-close]').first();
   if(await close.count()) await close.click().catch(()=>{});
   else await page.keyboard.press('Escape');
   await page.waitForTimeout(150);
  }
  const left=await page.locator('.modal-overlay').count();
  if(left) throw new Error(`${left} modal overlay(s) would not close: `+await page.locator('.modal-overlay').first().innerText());
 };
 const bindLayerAction=async(command,verb,layerName)=>{
  await closeManageLayers();
  await page.getByRole('button',{name:'Buttons',exact:true}).click();
  const card=page.locator(`details[data-input-command="${command}"]`).first();
  await card.waitFor();
  if(await card.getAttribute('open')===null) await card.locator('summary').first().click();
  const details=card.locator('details').filter({hasText:'Add layer action'}).first();
  if(await details.getAttribute('open')===null) await details.locator('summary').click();
  await details.getByRole('combobox',{name:'Layer action',exact:true}).click();
  await page.getByRole('option',{name:verb,exact:true}).click();
  await details.getByRole('combobox',{name:'Layer action destination',exact:true}).click();
  await page.getByRole('option',{name:layerName,exact:true}).click();
 };
 const chooseLayer=async name=>{await closeManageLayers();await picker.click();await layerItem(name).click();};
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await openManageLayers();
 await page.getByRole('textbox',{name:'New layer name',exact:true}).fill('Comms');
 await page.getByRole('button',{name:'Create layer',exact:true}).click();
 // Creating a layer binds nothing: moving an input's modeshifts into it is a
 // separate, explicit act, and so is binding something to turn it on.
 await page.getByRole('combobox',{name:'Move modeshifts from',exact:true}).click();
 await page.getByRole('option',{name:/\(RSR\)/}).click();
 await page.getByRole('button',{name:/^Move \d+ assignment/}).click();
 assert.equal(await pickerName(),'Comms','creation selects the new layer');
 await chooseLayer('Comms');
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const right=page.locator('#trackpad-right');
 const sens=right.getByRole('textbox',{name:'Horizontal sensitivity',exact:true});
 await sens.fill('3.3'); await sens.press('Tab');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('@layer'));
 let saved=await page.evaluate(()=>window.__lastSaved);
 let layer=JSON.parse(saved.split('\n').find(l=>l.startsWith('# @layer ')).slice(9));
 assert.equal(layer.overrides.RIGHT_TOUCHPAD_SENS,'3.3');
 assert.equal(layer.overrides.N,'J','existing shifts migrated together');
 assert.equal(layer.overrides.W,'U');
 assert.equal(layer.overrides.E,undefined,'unmodified imported binding must stay inherited');
 assert.ok(saved.includes('profiles-library/Template.txt'),'keep imports as imports');
 assert.ok(!/^E = C/m.test(saved),'do not inline imported bindings when saving a layer');
 assert.equal(await right.getByText('Unsaved changes',{exact:true}).count(),0,'saved layer should be clean even with imports');
 assert.ok(!/^RIGHT_TOUCHPAD_SENS = 3.3/m.test(saved),'layer edit leaked into base');
 await bindLayerAction('LSR','Apply layer','Comms');
 await bindLayerAction('RSL','Remove layer','Comms');
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/# @layer-action RSL = remove /.test(window.__lastSaved));
 const activation=(await page.evaluate(()=>window.__lastSaved)).split('\n').filter(l=>l.startsWith('# @layer-action '));
 assert.ok(activation.some(l=>/LSR = apply /.test(l)),`apply is bound to the input: ${activation}`);
 assert.ok(activation.some(l=>/RSL = remove /.test(l)),`remove is bound to the input: ${activation}`);
 assert.equal(activation.length,2,`a new layer starts with no activation of its own: ${activation}`);
 await chooseLayer('Default');
 assert.notEqual(await sens.inputValue(),'3.3');
 await chooseLayer('Comms');
 assert.equal(await sens.inputValue(),'3.3');
 // Switching on Buttons must edit the chosen layer and keep Default intact.
 await openManageLayers();
 await closeManageLayers();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const north=page.locator('details[data-input-command="N"]').first();
 const northOutput=north.locator('summary kbd').first();
 assert.equal(await northOutput.innerText(),'J');
 await north.locator('summary').first().click();
 await north.getByRole('button',{name:'Advanced command settings',exact:true}).first().click();
 const output=north.locator('input[class*="valueInput"]').first();
 await output.fill('K');
 // A pointer switch must commit any focused input before projecting the next layer.
 await chooseLayer('Default');
 assert.equal(await northOutput.innerText(),'Space');
 await chooseLayer('Comms');
 assert.equal(await pickerName(),'Comms');
 assert.equal(await northOutput.innerText(),'K','unsaved layer edit survives switching');
 await chooseLayer('Default');
 assert.equal(await northOutput.innerText(),'Space');
 // Keyboard: the menu opens on the current layer; End reaches the last layer.
 await picker.focus(); await page.keyboard.press('ArrowDown');
 await layerItem('Comms').waitFor();
 await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='menuitem');
 await page.keyboard.press('End');
 // Radix moves roving focus on a timer, so let End land before the next key.
 await page.waitForFunction(()=>document.activeElement?.textContent.startsWith('Manage layers'));
 await page.keyboard.press('ArrowUp');
 await page.waitForFunction(()=>document.activeElement?.textContent.startsWith('Comms'));
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.context-segment--layer b')?.textContent==='Comms');
 assert.equal(await pickerName(),'Comms','keyboard layer selection');
 assert.equal(await northOutput.innerText(),'K');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('"N":"K"'));
 assert.match(await page.evaluate(()=>window.__lastSaved),/^N = SPACE/m);
 assert.deepEqual(await page.evaluate(()=>window.__calls.filter(c=>c==='apply')),[],'editor layer selection must not activate a runtime layer');
 // Badges and outputs must share the value column, without forcing the chevron onto a second line.
 // Compared closed: an open row is a 64px card header by design (Binding Editor).
 if(await north.getAttribute('open')!==null){ await north.locator('summary').first().click(); await page.waitForFunction(()=>!document.querySelector('details[data-input-command="N"]')?.open); }
 const northSummary=await north.locator('summary').first().boundingBox();
 const inheritedSummary=await page.locator('details[data-input-command="E"] > summary').first().boundingBox();
 assert.equal(northSummary.height,inheritedSummary.height,'override and inherited rows keep the same height');
 assert.ok(northSummary.height<70,'layer badges must not create extra grid rows');
 const fixedY=(await picker.boundingBox()).y;
 await page.locator('.shell-scroll').evaluate(el=>{el.scrollTop=el.scrollHeight});
 assert.equal((await picker.boundingBox()).y,fixedY,'picker stays fixed when input page scrolls');
 await page.getByRole('button',{name:'Triggers',exact:true}).click();
 assert.equal(await pickerName(),'Comms','layer is retained across input pages');
 await closeManageLayers();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const artifacts=path.resolve(__dirname,'../tmp/layers-review'); fs.mkdirSync(artifacts,{recursive:true});
 await page.locator('.shell-scroll').evaluate(el=>{el.scrollTop=0});
 await page.screenshot({path:path.join(artifacts,'buttons-layer-picker.png'),fullPage:true});
 await page.setViewportSize({width:900,height:700});
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const compactPicker=await picker.boundingBox();
 assert.ok(compactPicker.y>=0 && compactPicker.y+compactPicker.height<700,'picker stays visible in compact layout');
 await chooseLayer('Default');
 assert.equal(await pickerName(),'Default');
 await chooseLayer('Comms');
 await page.screenshot({path:path.join(artifacts,'buttons-layer-picker-compact.png')});
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>window.scrollTo(0,0));
 // A layer action is not an output. It needs a layer as well as an action, one
 // input can carry several, and it coexists with that input’s ordinary binding,
 // so it is edited in its own section under the card. The output list used to
 // offer "Hold layer" / "Apply layer" / "Remove layer" too, which set nothing:
 // it dispatched an event, snapped back to its previous value, and left you
 // looking at the dropdown. The output list offers outputs.
 const northCard = page.locator('details[data-input-command="N"]').first();
 if (await northCard.getAttribute('open') === null) await northCard.locator('summary').first().click();
 await northCard.getByRole('button',{name:'Advanced command settings',exact:true}).first().click();
 const outputKind = northCard.getByRole('combobox',{name:'Output'}).first();
 await outputKind.click();
 const offered = await page.getByRole('option').evaluateAll(es => es.map(e => e.textContent.trim()));
 await page.keyboard.press('Escape');
 for (const gone of ['Hold layer','Apply layer','Remove layer']) {
   assert.ok(!offered.includes(gone), `the output list must not offer ${gone}: ${offered.join(', ')}`);
 }
 assert.ok(offered.includes('Keyboard'), `the output list still offers real outputs: ${offered.join(', ')}`);
 // ...and the section that does the job is still there on the same card.
 await northCard.getByText('Add layer action',{exact:true}).waitFor();

 await page.getByRole('button',{name:'Overview',exact:true}).click();
 // Comms is already applied by L5 and removed by R5; a hold on R4 as well is
 // three inputs driving one layer, which the old one-field-per-layer model
 // could not express at all.
 await bindLayerAction('RSR','Hold layer','Comms');
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.getByText(/Hold layer: Comms/).first().waitFor();
 await page.getByText('Apply layer: Comms',{exact:true}).waitFor();
 await page.getByText('Remove layer: Comms',{exact:true}).waitFor();
 await page.screenshot({path:path.join(artifacts,'overview.png'),fullPage:true});
 await page.getByRole('button',{name:'Apply',exact:true}).click();
 await page.waitForFunction(()=>window.__calls.includes('apply'));
 assert.ok((await page.evaluate(()=>window.__lastApplied)).includes('@layer'));
 await openManageLayers();
 const layerName=page.getByRole('textbox',{name:'Layer name',exact:true});
 await layerName.fill('Radio'); await layerName.press('Tab');
 assert.equal(await pickerName(),'Radio');
 await bindLayerAction('LSL','Hold layer','Radio');
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await openManageLayers();
 assert.equal(await pickerName(),'Radio');
 await page.getByText(/overrides · Restore inheritance/).click();
 await page.locator('.layer-override').filter({hasText:'Right pad sensitivity'}).getByRole('button',{name:'Use Default',exact:true}).click();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('Radio'));
 let renamed=JSON.parse((await page.evaluate(()=>window.__lastSaved)).split('\n').find(l=>l.startsWith('# @layer ')).slice(9));
 assert.equal(renamed.trigger,undefined,'a saved layer carries no activation of its own');
 assert.ok((await page.evaluate(()=>window.__lastSaved)).includes('# @layer-action LSL = hold '),'it is on the input instead');
 assert.equal(renamed.overrides.RIGHT_TOUCHPAD_SENS,undefined);
 await page.getByRole('button',{name:'Delete layer',exact:true}).click();
 assert.equal(await pickerName(),'Default');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>!window.__lastSaved.includes('@layer'));
 assert.ok(/^N = SPACE/m.test(await page.evaluate(()=>window.__lastSaved)),'delete keeps Default');
 // A layer can use only persistent actions, with no hold button.
 await page.getByRole('textbox',{name:'New layer name',exact:true}).fill('Vehicles');
 // Nothing to clear: a new layer has no activation of its own.
 await page.getByRole('button',{name:'Create layer',exact:true}).click();
 await chooseLayer('Vehicles');
 await bindLayerAction('RSR','Apply layer','Vehicles');
 await bindLayerAction('LSL','Remove layer','Vehicles');
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>window.__lastSaved.includes('Vehicles') && /# @layer-action LSL = remove /.test(window.__lastSaved));
 const bound=(await page.evaluate(()=>window.__lastSaved)).split('\n').filter(l=>l.startsWith('# @layer-action '));
 assert.ok(bound.some(l=>/RSR = apply /.test(l))&&bound.some(l=>/LSL = remove /.test(l)),`a layer with no hold at all: ${bound}`);
 assert.equal(await pickerName(),'Vehicles');
 await page.screenshot({path:path.join(artifacts,'persistent-layer-actions.png'),fullPage:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: layer actions are edited in their own section and not offered as outputs, fixed Buttons layer picker, keyboard/arrows, compact scrolling, scoped binding edits, create/select layer, scoped trackpad edit, save/apply document, Default inheritance, Overview action badges, persistent-only creation, Apply/Remove assignments');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
