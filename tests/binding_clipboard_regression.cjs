// A copied binding can be put back down, and does not shout from every input.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\nE = LCONTROL\nS = R\n'};
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;return {name}},
   applyProfile:async(path,text)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'Mapper ready',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 // Bindings open in a focused detail panel now, so the card exists only once
 // its input row is opened.
 await page.locator('details[data-input-command="N"] > summary').click();
 const card = page.locator('[class*=commandCard]').first();
 await card.waitFor();

 const bar = page.locator('[class*=clipboardBar]');
 assert.equal(await bar.count(), 0, 'the clipboard bar shows with an empty clipboard');

 // Copy one binding out of the card menu.
 await card.getByRole('button',{name:'Command actions'}).click();
 await page.getByRole('menuitem',{name:'Copy binding'}).click();
 await bar.waitFor();

 // The paste affordance is quiet, not a filled primary on every input.
 const paste = page.getByRole('button',{name:/^Paste /});
 assert.ok(await paste.count() > 1, 'expected a paste target on each input');
 const classes = await paste.first().getAttribute('class');
 assert.ok(classes.includes('link-btn'), `paste should be a quiet button, got: ${classes}`);

 // Clearing puts the clipboard down, and every paste button with it.
 await bar.getByRole('button',{name:'Clear'}).click();
 await paste.first().waitFor({state:'detached'});
 assert.equal(await bar.count(), 0, 'the bar survived Clear');
 assert.equal(await page.getByRole('button',{name:/^Paste /}).count(), 0, 'paste buttons survived Clear');

 // Escape does the same, so it can be dismissed without aiming at anything.
 await card.getByRole('button',{name:'Command actions'}).click();
 await page.getByRole('menuitem',{name:'Copy binding'}).click();
 await bar.waitFor();
 await page.keyboard.press('Escape');
 await bar.waitFor({state:'detached'});

 assert.deepEqual(errors,[]);
 console.log('PASS: the binding clipboard is visible in one place, quiet elsewhere, and can be cleared');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
