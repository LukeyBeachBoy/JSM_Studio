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
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 // A Steam Controller's first connection asks about its power-on sound.
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 // Bindings open in a focused detail panel now, so the card exists only once
 // its input row is opened.
 // Console v2 (ButtonList): Copy and Paste are in the row's Y menu.
 const summary = page.locator('details[data-input-command="N"] > summary');
 await summary.waitFor();
 const bar = page.locator('[class*=clipboardBar]');
 assert.equal(await bar.count(), 0, 'the clipboard bar shows with an empty clipboard');

 const menu = async () => { await summary.focus(); await page.keyboard.press('y'); await page.getByRole('menuitem').first().waitFor(); };
 const copyOne = async () => {
   await menu();
   await page.getByRole('menuitem',{name:/^Copy/}).click();
   await bar.waitFor();
 };
 await copyOne();

 const pasteDisabled = async () => {
   await menu();
   const item = page.getByRole('menuitem',{name:/^Paste/});
   const disabled = (await item.getAttribute('data-disabled')) !== null;
   await page.keyboard.press('Escape');
   await page.getByRole('menuitem').first().waitFor({state:'detached'});
   return disabled;
 };
 assert.equal(await pasteDisabled(), false, 'the row offers the clipboard');
 assert.equal(await page.locator('summary .link-btn').count(), 0, 'a closed row still carries a text-only paste');

 await bar.getByRole('button',{name:'Clear'}).click();
 await bar.waitFor({state:'detached'});
 assert.equal(await pasteDisabled(), true, 'paste survived Clear');

 await copyOne();
 await summary.focus();
 await page.keyboard.press('Escape');
 await bar.waitFor({state:'detached'});

 assert.deepEqual(errors,[]);
 console.log('PASS: the binding clipboard is visible in one place, quiet elsewhere, and can be cleared');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
