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
 // The Steam Controller's first-connection "Controller power-on sound" dialog would steal focus: keep the controller's own sounds.
 await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}),async()=>{await page.getByRole('button',{name:'Keep them',exact:true}).click()});
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Dense'}).waitFor();
 const north=()=>page.locator('details[data-input-command="N"]').first();
 // Layout.dc.html: the grip row says what it turns on ("Gyro aim on · while held"), from the imported template.
 assert.match(await page.locator('[data-overview-input="MISC5"]').innerText(),/Gyro aim on\s*while held/);
 assert.match(await page.locator('[data-overview-input="ZL"]').innerText(),/Analog left trigger/);
 // Y ▸ Every use opens where the input is used (MISC5, named as the pad names it).
 await page.locator('[data-overview-input="MISC5"]').focus();await page.keyboard.press('y');
 await page.getByRole('button',{name:/^Every use/}).click();
 const dialog=page.getByRole('dialog',{name:'Where Right grip is used'});
 await dialog.waitFor();assert.ok(await dialog.evaluate(e=>e.contains(document.activeElement)));
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 // Only free inputs: Find "not set" in the quick menu. A 3×3 right pad with one zone set counts its zones.
 await page.locator('[data-overview-input="MISC5"]').focus();await page.keyboard.press('y');
 await page.getByRole('searchbox',{name:'Find an input or action'}).fill('not set');
 assert.equal(await page.locator('[data-overview-input="MISC5"]').count(),0);
 assert.equal(await page.locator('[data-overview-input="ZL"]').count(),0);
 assert.ok(await page.locator('[data-overview-slot][data-unset="true"]').count()>0,'free inputs are listed');
 await page.getByRole('searchbox',{name:'Find an input or action'}).fill('');
 await page.keyboard.press('Escape');
 assert.match(await page.locator('[data-overview-slot="right-pad"]').innerText(),/1 zone\b/);
 const overviewNorth=page.locator('[data-overview-slot="face"]');await overviewNorth.click();
 // B closes the input's sheet if one opened, then returns to Layout (where B would go Home).
 await north().waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(300);if(!(await overviewNorth.isVisible()))await page.keyboard.press('Escape');
 await overviewNorth.waitFor();assert.equal(await overviewNorth.evaluate(e=>e===document.activeElement),true,'Back restores originating input focus');
 // The face slot opens the first face button's sheet; close it and open the N (Y button) row's own sheet.
 await overviewNorth.click();await page.locator('details[data-input-command][open] [data-binding-sheet]').first().waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(300);
 await north().locator('summary').first().click();await north().locator('[data-binding-sheet]').waitFor();
 // The output is chosen in the action picker, from the sheet's "Sends" chip.
 await north().locator('[data-chip-command]').first().click();
 // The key picker (console v2): P is on Letters.
 await page.locator('[data-picker="key"] [data-category="letters"]').click(); await page.locator('[data-picker="key"] button.key-cap[data-token="P"]').click();
 // The library entry, not the "Applied · Running now" shortcut above the list (which also names Dense).
 const choose=async name=>{await page.locator('.profile-chip').click();await page.getByRole('menuitem').filter({has:page.locator('[class*=itemLabel]').getByText(name,{exact:true})}).filter({hasNotText:/Running now/}).click()};
 const closeLibrary=async()=>{const close=page.locator('.profile-modal [data-modal-close]');if(await close.count())await close.click()};
 await choose('Other');await page.getByRole('alertdialog').getByRole('button',{name:/Discard/i}).click();await page.locator('.profile-chip').filter({hasText:'Other'}).waitFor();await closeLibrary();
 await choose('Dense');await page.locator('.profile-chip').filter({hasText:'Dense'}).waitFor();await closeLibrary();
 assert.equal((await north().locator('summary [data-row-output]').first().innerText()).trim(),'F','discarded output must not return from draft cache');
 // The mode to edit is chosen on Layout's mode strip (console v2, P6).
 await page.getByRole('button',{name:'Layout',exact:true}).click();await page.getByRole('group',{name:'Showing layer'}).getByRole('button',{name:'Comms',exact:true}).click();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();await north().waitFor();
 if(await north().getAttribute('open')===null)await north().locator('summary').first().click();
 const origin=north().locator('[data-setting-origin="N"]').first();assert.match(await origin.innerText(),/Changed in Comms/);
 // The per-binding reset is the sheet's "Use Default" button now (it was the card's cog).
 await north().getByRole('button',{name:/^Use Default/}).first().click();
 assert.equal((await north().locator('summary [data-row-output]').first().innerText()).trim(),'F','per-binding reset restores Default');
 await page.keyboard.press('Control+s');await page.waitForFunction(()=>window.__saved.includes('@layer'));
 // With a controller connected, edits are written for that controller (`# @controller type-24 …`), so the Comms mode this
 // controller uses is the controller's own layer line when there is one, else the shared one.
 const layerLines=(await page.evaluate(()=>window.__saved)).split('\n').filter(l=>/^(# @controller type-24 )?# @layer /.test(l));
 const effective=new Map();for(const line of layerLines.sort((a,b)=>Number(a.startsWith('# @controller'))-Number(b.startsWith('# @controller')))){const layer=JSON.parse(line.slice(line.indexOf('# @layer ')+9));effective.set(layer.id,layer)}
 assert.equal(effective.get('comms').overrides.N,undefined,'the reset leaves Comms without an N override for this controller');
 await page.getByRole('button',{name:'Layout',exact:true}).click();
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
