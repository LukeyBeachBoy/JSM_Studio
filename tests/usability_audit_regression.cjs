const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const profiles={Dense:'RESET_MAPPINGS\nprofiles-library/Template.txt\nN = F\nRSR,N = J\nRIGHT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_GRID_SIZE = 3 3\nRT1 = A\n# @layer {"id":"comms","name":"Comms","trigger":"RSR","overrides":{"N":"K"}}',Other:'RESET_MAPPINGS\nN = ENTER'};
  window.__saved='';window.__type=24;
  window.electronAPI={getActiveProfile:async()=>({name:'Dense',path:'profiles-library/Dense.txt',content:profiles.Dense}),listLibraryProfiles:async()=>Object.keys(profiles),loadLibraryProfile:async name=>({name,content:profiles[name]}),readConfigFile:async()=> 'GYRO_ON = MISC5\nZL_MODE = X_LT\nE = C',saveLibraryProfile:async(name,content)=>{profiles[name]=content;window.__saved=content;return{name}}};
  window.telemetry={onSample:cb=>{const emit=()=>cb({activeProfile:'profiles-library/Dense.txt',devices:[{handle:1,type:window.__type,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});emit();const timer=setInterval(emit,100);return()=>clearInterval(timer)}};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Dense'}).waitFor();
 const north=()=>page.locator('details[data-input-command="N"]').first();
 // Overview.dc.html: the grip row is named, with the activation as its pill ("Enables gyro").
 assert.match(await page.locator('[data-overview-input="MISC5"]').innerText(),/Enables gyro/);
 assert.match(await page.locator('[data-overview-input="ZL"]').innerText(),/Analog left trigger/);
 await page.getByRole('button',{name:'Show uses of Right grip',exact:true}).click(); // MISC5, named as the pad names it
 const dialog=page.getByRole('dialog',{name:'Uses of Right grip'});
 await dialog.waitFor();assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 await page.getByRole('toolbar',{name:'Filter bindings'}).getByRole('button',{name:/^Available/}).click();
 assert.equal(await page.locator('[data-overview-input="MISC5"]').count(),0);
 assert.equal(await page.locator('[data-overview-input="ZL"]').count(),0);
 assert.equal(await page.locator('[data-overview-input="RT9"]').count(),1);
 await page.getByRole('toolbar',{name:'Filter bindings'}).getByRole('button',{name:'All bindings',exact:true}).click();
 const overviewNorth=page.locator('[data-overview-input="N"]');await overviewNorth.click();
 await north().waitFor();await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 await overviewNorth.waitFor();assert.equal(await overviewNorth.evaluate(e=>e===document.activeElement),true,'Back restores originating input focus');
 await overviewNorth.click();
 // Output/value fields fold behind the advanced-settings gear now.
 // The output is chosen in the action picker, from the row's keycap (3c).
 await north().locator('[data-command-row]').first().getByRole('button',{name:/^Choose action/}).click();
 await page.getByRole('dialog',{name:'Choose an action'}).locator('button.key-cap').filter({hasText:/^P$/}).click();
 // The library entry, not the "Applied · Running now" shortcut above the list (which also names Dense).
 const choose=async name=>{await page.locator('.profile-chip').click();await page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText(name,{exact:true})}).filter({hasNotText:/Running now/}).click()};
 const closeLibrary=async()=>{const close=page.locator('.profile-modal [data-modal-close]');if(await close.count())await close.click()};
 await choose('Other');await page.getByRole('alertdialog').getByRole('button',{name:/Discard/i}).click();await page.locator('.profile-chip').filter({hasText:'Other'}).waitFor();await closeLibrary();
 await choose('Dense');await page.locator('.profile-chip').filter({hasText:'Dense'}).waitFor();await closeLibrary();
 assert.equal(await north().locator('[data-command-row]').first().getByRole('button',{name:/^Choose action/}).innerText(),'F','discarded output must not return from draft cache');
 await page.getByRole('button',{name:/^Editing layer:/}).click();await page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText('Comms',{exact:true})}).click();
 if(await north().getAttribute('open')===null)await north().locator('summary').first().click();
 const origin=north().locator('[data-setting-origin="N"]').first();assert.match(await origin.innerText(),/Override/);
 // The per-binding reset is on the card's cog now (3c).
 await north().getByRole('button',{name:'Binding settings',exact:true}).click();
 await page.getByRole('menuitem',{name:'Reset to inherited',exact:true}).click();
 assert.equal(await north().locator('[data-command-row]').first().getByRole('button',{name:/^Choose action/}).innerText(),'F','per-binding reset restores Default');
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>window.__saved.includes('@layer'));
 const layer=JSON.parse((await page.evaluate(()=>window.__saved)).split('\n').find(l=>l.startsWith('# @layer ')).slice(9));assert.equal(layer.overrides.N,undefined);
 await page.getByRole('button',{name:'Overview',exact:true}).click();
 const artifacts=path.resolve('tmp/ui-fixes-2026-09-17');fs.mkdirSync(artifacts,{recursive:true});
 for(const [type,name] of [[6,'xbox'],[3,'nintendo'],[5,'playstation'],[24,'steam']]){
  await page.evaluate(type=>window.__type=type,type);await page.waitForTimeout(180);
  await page.screenshot({path:path.join(artifacts,`controller-${name}.png`)});
  if(type===6 || type===3) assert.equal(await page.locator('svg[aria-label$="live status"]').getByText(/TOUCHPAD|MIC/).count(),0,'non-PlayStation drawing has no PlayStation pad');
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: activation-aware availability, unused grid cells, usage dialog focus, Back restoration, discarded draft removal, per-binding inheritance reset, controller-family rendering');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
