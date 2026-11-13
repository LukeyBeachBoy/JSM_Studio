const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1700,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/platform/desktopBridge.ts',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:(await response.text())+`
   const source='S = SPACE\\nHOME = ESC\\n# @controller type-25 LEFT_STICK_DEADZONE_INNER = .12\\n# @controller type-25 JOY1 = W\\n# @controller type-24 S = ENTER\\n# @controller type-24-device-0000000000000002 S = J\\n# @controller type-24-device-0000000000000002 GYRO_SENS = 0\\n';
   desktopBridge.listLibraryProfiles=async()=>['Co-op'];
   desktopBridge.getActiveProfile=async()=>({name:'Co-op',path:'profiles-library/Co-op.txt',content:source});
   desktopBridge.loadLibraryProfile=async()=>({name:'Co-op',content:source});
   desktopBridge.listGlobalChords=async()=>[];
   const subscribe=desktopBridge.onTelemetrySample;
   window.players=[1,2,3];window.pressedPlayer=0;
   desktopBridge.onTelemetrySample=callback=>subscribe(sample=>callback({...sample,devices:window.players.map(n=>({...sample.devices[0],handle:n,type:n===3?25:24,controllerId:'type-'+(n===3?25:24)+'-device-000000000000000'+n,persistentIdentity:true,supportedButtons:n===3?0xf03ffffff:0x1ffffffff,status:{...sample.devices[0].status,buttons:window.pressedPlayer===n?4096:0}}))}));
  `});
 });
 await page.goto('http://127.0.0.1:1420/?mock');
 await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:3000}).catch(()=>{});
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'buttons'})));
 const selector=page.getByRole('combobox',{name:'Controller to configure'});
 await selector.waitFor();
 await page.locator('details[data-input-command="JOY1"]').waitFor();
 for(const command of ['S','HOME','MIC','LSL','MISC5']) assert.equal(await page.locator('details[data-input-command="'+command+'"]').count(),0,command+' absent on Cyborg');
 assert.equal(await page.locator('details[data-input-command^="JOY"]').count(),26);
 assert.equal(await page.locator('#mapping-section-face').count(),0);
 await page.screenshot({path:'build-jsm-sdl/azeron-acceptance/controller-filtered-buttons.png'});
 await selector.click(); await page.getByRole('option',{name:/Steam Controller.*Controller 1/}).click();
 let south=page.locator('details[data-input-command="S"] summary').first();await south.waitFor();
 assert.match(await south.innerText(),/Enter/i);
 assert.equal(await page.locator('details[data-input-command="JOY1"]').count(),0);
 await selector.click(); await page.getByRole('option',{name:/Steam Controller.*Controller 2/}).click();
 await page.waitForFunction(()=>document.querySelector('details[data-input-command="S"] summary')?.textContent.includes('J'));
 await page.getByRole('button',{name:'Identify',exact:true}).click();
 await page.evaluate(()=>{window.pressedPlayer=1});
 await page.waitForFunction(async()=>(await import('/src/utils/controllerSelection.ts')).selectedController()==='type-24-device-0000000000000001');
 await page.evaluate(()=>{window.pressedPlayer=0;window.players=[3,2]});
 await page.waitForTimeout(400);
 assert.equal(await page.evaluate(async()=>(await import('/src/utils/controllerSelection.ts')).selectedController()),'type-24-device-0000000000000001','disconnect preserves editing destination');
 assert.match(await south.innerText(),/Enter/i);
 await page.evaluate(()=>{window.players=[2,3,1]});await page.waitForTimeout(400);
 assert.equal(await page.evaluate(async()=>(await import('/src/utils/controllerSelection.ts')).selectedController()),'type-24-device-0000000000000001','reordering does not switch players');
 await selector.click(); await page.getByRole('option',{name:/Azeron Cyborg/}).click();
 await page.evaluate(async()=>{
  const {desktopBridge}=await import('/src/platform/desktopBridge.ts');
  const {patchRuntimePreferences}=await import('/src/platform/preferenceStore.ts');
  patchRuntimePreferences(await desktopBridge.setCyborgStickDefaults({LEFT_STICK_DEADZONE_INNER:'.35'}));
  window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'joysticks'}));
 });
 const inner=page.getByRole('slider').filter({hasText:'Inner deadzone'}).first();
 await inner.waitFor(); assert.equal(await inner.getAttribute('aria-valuenow'),'12');
 await inner.getByRole('button',{name:'Edit source layout'}).click();
 await page.waitForFunction(async()=>(await import('/src/utils/controllerSelection.ts')).selectedController()==='type-25');
 await inner.getByRole('button',{name:'Use Default'}).click();
 await page.waitForFunction(()=>[...document.querySelectorAll('[role=slider]')].find(el=>el.textContent.includes('Inner deadzone'))?.getAttribute('aria-valuenow')==='35');
 assert.deepEqual(errors,[]);
 console.log('PASS: physical selector, identical controllers, inherited bindings filtered, Cyborg 26 keys, identify, disconnect and reorder isolation');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
