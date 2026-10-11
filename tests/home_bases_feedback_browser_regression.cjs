// Studio reads the pad itself while it has focus (design handoff, "native
// controller navigation"): LB/RB page (tabs), LT/RT step sections, D-pad moves, A opens,
// B backs out, View goes Home from anywhere, Menu opens the Configuration menu,
// and Test hands the pad to the configuration until View + Menu is held.
// Driven through the same telemetry stream the live preview uses, with a
// scripted pad.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nprofiles-library/My base.txt\nN = SPACE\nS = ENTER\nL = Q\n', 'My base':'GYRO_SENS = 1\n', 'Default Global Chords':'LEFT_TOUCHPAD_MODE = GRID_AND_STICK\n'};
  window.__calls=[];
  window.electronAPI={
   getHidHideStatus:async()=>({supported:true,installed:true,active:true,inverse:false,steamAllowed:false,whitelistSynced:true,requiresElevation:false,managedInstanceIds:['steam'],devices:[{instanceId:'steam',displayName:'Steam Controller Puck',vendor:'Valve',product:'Steam Controller',present:true,hidden:true,partiallyHidden:false,likelyCurrentController:true,stale:false,managedByApp:true,vendorId:0x28de,productId:0x1205}],appList:[]}),
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;window.__calls.push('save');return {name}},
   applyProfile:async(path)=>{window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  // Raw button bits, as utils/controllerStatus decodes them.
  const BITS={UP:0,DOWN:1,LEFT:2,RIGHT:3,'+':4,'-':5,L:8,R:9,S:12,E:13,W:14,N:15};
  window.__held=new Set(); window.__triggers={left:0,right:0};
  // While Studio is in front the mapper runs Studio's navigation profile; a
  // held global chord swaps its own configuration in (activeProfile follows).
  window.__live='AppNavigation.txt';
  // Web builds record the controller feedback they would send (nav/feedback.ts).
  window.__padFeedback=[];
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'ready',activeProfile:window.__live,devices:[{handle:1,type:24,supportedButtons:8589934591,
     status:{buttons:[...window.__held].reduce((m,c)=>m+2**BITS[c],0),leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:window.__triggers,gyro:{x:0,y:0,z:0}}}]});
   emit();const timer=setInterval(emit,10);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})

 await page.locator('[data-home-continue]').waitFor();
 await page.getByRole('button',{name:'Change base',exact:true}).click();
 await page.getByRole('heading',{name:'Change base',exact:true}).waitFor();
 assert.equal(await page.getByRole('menuitemradio',{name:/My base/}).getAttribute('aria-checked'),'true');
 await page.keyboard.press('Escape');
 await page.keyboard.press('m');
 await page.locator('.config-menu').waitFor();
 await page.keyboard.press('Escape');
 const hold = async buttons => page.evaluate(b => b.forEach(x => window.__held.add(x)), buttons);
 const release = async buttons => page.evaluate(b => b.forEach(x => window.__held.delete(x)), buttons);
 await hold(['+']); await page.waitForTimeout(80); await release(['+']);
 await page.locator('.config-menu').waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('slider',{name:'Gyro speed',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 const savesBefore=await page.evaluate(()=>window.__calls.filter(x=>x==='save').length);
 await hold(['+']); await page.waitForTimeout(700); await release(['+']);
 await page.waitForFunction(before=>window.__calls.filter(x=>x==='save').length===before+1,savesBefore);
 await page.getByRole('slider',{name:'Gyro speed',exact:true}).focus();
 await page.keyboard.press('ArrowRight');
 await page.keyboard.down('m'); await page.waitForTimeout(600); await page.keyboard.up('m');
 await page.waitForFunction(before=>window.__calls.filter(x=>x==='save').length===before+2,savesBefore);
 assert.equal(await page.locator('.config-menu').count(),0,'holding Menu saves without opening options');
 await page.screenshot({path:'tests/tmp/feedback-home.png'});
 await page.getByRole('button',{name:'Your game configs',exact:true}).click();
 await page.locator('[data-library-view="games"]').waitFor();
 await page.locator('.page-tab').filter({hasText:/^Bases$/}).click();
 await page.getByRole('heading',{name:'Your bases',exact:true}).waitFor();
 await page.getByRole('heading',{name:'Built-in bases',exact:true}).waitFor();
 assert.equal(await page.locator('button[data-profile="Default Global Chords"]').count(),0);
 const preset=page.locator('[data-builtin-base]').first();
 await preset.focus();
 await hold(['RIGHT']); await page.waitForTimeout(80); await release(['RIGHT']);
 await page.waitForFunction(()=>document.activeElement?.dataset.builtinBase==='shooter-stick');
 await preset.focus();
 assert.match(await preset.getAttribute('data-hints'),/A:Copy/);
 await page.waitForTimeout(600);
 await page.screenshot({path:'tests/tmp/feedback-bases.png'});
 await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.__calls.includes('save'));
 await page.waitForFunction(()=>document.querySelector('.profile-chip')?.textContent.includes('My Shooter'));
 await page.keyboard.press('Home');
 await page.locator('[data-home-continue]').waitFor();
 await page.getByRole('button',{name:/^Settings/}).click();
 await page.locator('.section-item').filter({hasText:/^Hide the real controller$/}).click();
 const controller=page.locator('[data-hidhide-device="steam"]');
 await controller.waitFor();
 assert.equal(await controller.locator('[aria-hidden="true"]').first().evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.waitForTimeout(600);
 await page.screenshot({path:'tests/tmp/feedback-controller.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: Home base picker, direct game configs, tap options/hold save, split bases, Enter copies built-in base');
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
