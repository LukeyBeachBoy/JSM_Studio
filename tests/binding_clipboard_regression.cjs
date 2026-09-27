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
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 // Bindings open in a focused detail panel now, so the card exists only once
 // its input row is opened.
 await page.locator('details[data-input-command="N"] > summary').click();
 const open = page.locator('details[data-input-command="N"][open]');
 const card = open.locator('[data-command-row]').first();
 await card.waitFor();

 const bar = page.locator('[class*=clipboardBar]');
 assert.equal(await bar.count(), 0, 'the clipboard bar shows with an empty clipboard');

 // Copy one binding from its row's settings sheet (the cog, 3c).
 const copyOne = async () => {
   await card.getByRole('button',{name:'Command settings'}).click();
   await page.getByRole('dialog').getByRole('button',{name:'Copy binding'}).click();
   await bar.waitFor();
 };
 await copyOne();

 // Paste is on the card's own cog (3c); a closed row carries no text-only button.
 const pasteItem = async () => {
   await open.getByRole('button',{name:'Binding settings'}).click();
   const item = page.getByRole('menuitem',{name:/^Paste/});
   const disabled = (await item.getAttribute('data-disabled')) !== null;
   await page.keyboard.press('Escape');
   return disabled;
 };
 assert.equal(await pasteItem(), false, 'the open card offers the clipboard');
 assert.equal(await page.locator('summary .link-btn').count(), 0, 'a closed row still carries a text-only paste');

 // Clearing puts the clipboard down, and paste with it.
 await bar.getByRole('button',{name:'Clear'}).click();
 await bar.waitFor({state:'detached'});
 assert.equal(await pasteItem(), true, 'paste survived Clear');

 // Escape does the same, so it can be dismissed without aiming at anything.
 await copyOne();
 await page.keyboard.press('Escape');
 await bar.waitFor({state:'detached'});

 assert.deepEqual(errors,[]);
 console.log('PASS: the binding clipboard is visible in one place, quiet elsewhere, and can be cleared');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
