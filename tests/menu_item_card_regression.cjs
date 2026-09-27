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
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.locator('.page-tabs').getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.locator('button.summary-row[data-input-command="LT1"]').first().click();
 const card = page.locator('details[data-input-command="LT1"][open]');
 await card.waitFor();
 const head = card.locator(':scope > summary');

 // The header: the icon, the menu label as title, where it is, and the cog.
 assert.equal(await head.locator('[class*=iconWell] svg').count(), 1, 'the icon is not in the header well');
 assert.match((await head.innerText()).replace(/\s+/g,' '), /^Home Region 1/, 'the menu label titles the card, over where it is');
 assert.equal(await head.getByRole('button',{name:'Binding settings'}).count(), 1);

 // Change icon and the label on the menu, side by side.
 await card.getByRole('button',{name:'Change icon'}).waitFor();
 const labelField = card.getByPlaceholder('Label on the menu');
 assert.equal(await labelField.inputValue(), 'Home');

 // Commands only: no modeshift or layer lanes, no input glyph on the row.
 assert.deepEqual(await card.locator('section[aria-label]').evaluateAll(es => es.map(e => e.getAttribute('aria-label'))), ['Commands']);
 const row = card.locator('[data-command-row]');
 assert.equal(await row.count(), 1);
 assert.equal(await row.getAttribute('data-kind'), 'command-bare');
 assert.equal(await row.getByRole('button',{name:/^Choose action/}).innerText(), 'Home');

 // Change icon opens the icon modal (1g): centred, titled for the item,
 // tabs stepped by LB / RB, a left-aligned grid; choosing writes the icon.
 await card.getByRole('button',{name:'Change icon'}).click();
 const modal = page.getByRole('dialog',{name:'Icon for “Home”'});
 await modal.waitFor();
 const box = await modal.boundingBox();
 const viewport = page.viewportSize();
 assert.ok(Math.abs(box.x + box.width / 2 - viewport.width / 2) < 2 && Math.abs(box.y + box.height / 2 - viewport.height / 2) < 2, 'the icon modal is not centred');
 await modal.getByRole('button',{name:'Media',exact:true}).click();
 const first = modal.getByRole('button',{name:'play',exact:true});
 await first.waitFor();
 const grid = await first.evaluate(tile => { const g = tile.parentElement; return { tile: tile.getBoundingClientRect().left, grid: g.getBoundingClientRect().left + parseFloat(getComputedStyle(g).paddingLeft), justify: getComputedStyle(g).justifyContent } });
 assert.equal(grid.justify, 'start', 'the icon grid is not left-aligned');
 assert.ok(Math.abs(grid.tile - grid.grid) < 1, 'the first icon does not start at the left edge');
 await first.click();
 await modal.waitFor({state:'detached'});

 // The label field writes the menu's label.
 await labelField.fill('Go home');
 await labelField.press('Enter');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(() => /# @label LT1 = Go home/.test(window.__lastSaved));
 assert.match(await page.evaluate(() => window.__lastSaved), /# @icon LT1 = lucide:play/);

 assert.deepEqual(errors,[]);
 console.log('PASS: a menu item card has its icon, its label, and a Commands lane only');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
