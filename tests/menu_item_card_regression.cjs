// A menu item's card is the binding card built from the same parts (binding
// card refresh 3d): its icon in the header well, Change icon and the label
// shown on the menu in an identity row, and a Commands lane only.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_SIZE = 2 2\nLT1 = HOME\n# @label LT1 = Home\n# @icon LT1 = lucide:house\n'};
  window.__lastSaved='';
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{window.__lastSaved=content;profiles[name]=content;return {name}},
   applyProfile:async(path)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'Mapper ready',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // A Steam Controller's first connection asks about its power-on sound.
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {});
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.locator('.page-tabs').getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.locator('details[data-input-command="LT1"] > summary').first().click();
 const card = page.locator('details[data-input-command="LT1"][open]');
 await card.waitFor();
 const header = card.locator('.sheet__header');

 // The binding sheet's header (console v2): the item's icon where an input's
 // glyph goes, the label on the menu as the title, Rename beside it, no cog.
 assert.equal(await header.locator('.sheet__lead svg').count(), 1, 'the icon is not in the header');
 assert.equal((await header.locator('.sheet__title').innerText()).trim(), 'Home', 'the menu label titles the sheet');
 assert.equal(await card.getByRole('button',{name:'Binding settings'}).count(), 0, 'the old cog survived');
 assert.equal(await header.getByRole('button',{name:'Rename'}).count(), 1);

 // Change icon at the top of the sheet; what it sends below, nothing else:
 // a menu item has no While holding of its own.
 await card.getByRole('button',{name:'Change icon'}).waitFor();
 const sheet = card.locator('[data-binding-sheet]');
 assert.equal(await sheet.locator('[data-fold="while-holding"]').count(), 0);
 assert.equal(await sheet.locator('[data-chip-command]').count(), 1);
 assert.match(await sheet.locator('[data-chip-command]').getAttribute('aria-label'), /Choose action: Home/);

 // Change icon opens Pick an icon (console v2, IconPicker): a full-screen page
 // for "<menu> · Home", categories on LT / RT, labelled tiles, the menu itself
 // as the preview; choosing writes the icon.
 await card.getByRole('button',{name:'Change icon'}).click();
 const modal = page.locator('[data-picker="icon"]');
 await modal.waitFor();
 assert.equal(await modal.locator('h2').innerText(), 'Pick an icon');
 assert.match(await modal.innerText(), / · Home/, 'the eyebrow names the item');
 assert.ok(await modal.locator('[data-icon-preview]').count(), 'the aside shows the item on its menu');
 await modal.locator('[data-category="media"]').click();
 const first = modal.locator('[data-icon="lucide:play"]');
 await first.waitFor();
 assert.match(await first.innerText(), /Play/, 'tiles carry their names');
 await first.click();
 await modal.waitFor({state:'detached'});

 // Rename writes the menu's label (the on-screen keyboard).
 await header.getByRole('button',{name:'Rename'}).click();
 const typing = page.getByRole('dialog',{name:/^Type: /});
 await typing.waitFor();
 for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
 await page.keyboard.type('Go home');
 await page.keyboard.press('Enter');
 await typing.waitFor({state:'detached'});
 await page.keyboard.press('Control+s');
 await page.waitForFunction(() => /# @label LT1 = Go home/.test(window.__lastSaved));
 assert.match(await page.evaluate(() => window.__lastSaved), /# @icon LT1 = lucide:play/);

 assert.deepEqual(errors,[]);
 console.log('PASS: a menu item sheet has its icon, its label and what it sends, and no While holding');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
