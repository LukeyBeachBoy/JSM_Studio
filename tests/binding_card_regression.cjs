// The binding sheet (console v2, BindingSheet): "When you…" selects the way of
// pressing, "<Press> sends" shows the eight kinds with the current one
// outlined, the row's Y menu holds Copy · Paste · Clear · Rename · Details,
// a command moves between activations from Fine-tune's Y ▸ Move to…, and a
// new command comes from the kind's picker.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(15000);
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\n'};
  window.__lastSaved='';
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{window.__lastSaved=content;profiles[name]=content;return {name}},
   applyProfile:async(path,text)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'Mapper ready',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:5000}).catch(()=>{});
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const save = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__lastSaved); };
 // Edits land in this controller's own layout while one is connected (console
 // v2, V4): an input does what its controller line says, else the shared one.
 const eff = (text, key) => {
   const lines = text.split('\n');
   const own = lines.filter(line => line.startsWith(`# @controller type-24 ${key} = `)).pop();
   const shared = lines.filter(line => line.startsWith(`${key} = `)).pop();
   const line = own ? own.slice('# @controller type-24 '.length) : shared;
   return line ? line.slice(key.length + 3).trim() : undefined;
 };

 // The row's Y: the menu of the rest, never something destructive at once.
 const summary = page.locator('details[data-input-command="N"] > summary');
 await summary.focus();
 await page.keyboard.press('y');
 const items = (await page.getByRole('menuitem').allInnerTexts()).map(text => text.split('\n')[0].trim());
 assert.deepEqual(items, ['Copy','Paste','Clear','Rename','Details'], `unexpected row menu: ${items.join(', ')}`);
 await page.keyboard.press('Escape');

 await summary.click();
 const open = page.locator('details[data-input-command="N"][open]');
 const sheet = open.locator('[data-binding-sheet]');
 await sheet.waitFor();
 // No cog and no Details button: the header has Rename (Y), nothing else.
 assert.equal(await open.getByRole('button',{name:'Binding settings'}).count(), 0, 'the old cog survived');
 assert.equal(await open.getByRole('button',{name:'Rename'}).count(), 1);
 const tiles = (await sheet.locator('[data-when]').allInnerTexts()).map(text => text.split('\n')[0].trim());
 assert.deepEqual(tiles, ['Press','Tap','Hold','Double-tap','More'], `the When you… strip: ${tiles.join(', ')}`);
 assert.match(await sheet.locator('[data-when="regular"]').innerText(), /Space/);
 assert.equal(await sheet.locator('[data-kind]').count(), 8, 'the eight sends kinds');
 assert.equal(await sheet.locator('[data-kind][data-current="true"]').getAttribute('data-kind'), 'key', 'Space is a keyboard key');
 assert.equal(await sheet.locator('[data-chip-command]').count(), 1);
 assert.match(await sheet.locator('[data-chip-command]').first().getAttribute('aria-label'), /Choose action: Space/);
 // Selecting another tile changes what the grid below edits.
 await sheet.locator('[data-when="hold"]').focus();
 assert.match(await sheet.locator('[aria-label="Hold sends"]').innerText(), /Hold sends/i);
 assert.equal(await sheet.locator('[data-kind][data-current="true"]').count(), 0, 'nothing is set on Hold');

 // Moving a command to another activation: Fine-tune ▸ Y ▸ Move to…
 const moveTo = async (from, to) => {
   await sheet.locator(`[data-when="${from}"]`).focus();
   await sheet.locator('[data-fold="fine-tune"]').click();
   const ft = page.locator('[data-fine-tune]');
   await ft.waitFor();
   await ft.locator('[role=radio]').first().focus();
   await page.keyboard.press('y');
   await page.getByRole('menuitem',{name:/Move to/}).click();
   await page.getByRole('menuitem',{name:to,exact:true}).click();
   await page.keyboard.press('Escape');
   await ft.waitFor({state:'detached'});
 };
 await moveTo('regular', 'Hold');
 await page.waitForFunction(() => /Space/.test(document.querySelector('details[data-input-command="N"][open] [data-when="hold"]')?.textContent ?? ''));
 assert.match(await sheet.locator('[data-when="regular"]').innerText(), /\+ Add|None/, 'the press stayed behind');
 await moveTo('hold', 'Double-tap');
 await page.waitForFunction(() => /Space/.test(document.querySelector('details[data-input-command="N"][open] [data-when="double"]')?.textContent ?? ''));
 assert.match(await sheet.locator('[data-when="hold"]').innerText(), /\+ Add|None/, 'moving the command to its own line left a copy behind');
 let saved = await save();
 assert.equal(eff(saved, 'N,N'), 'SPACE', `a double-tap is its own line:
${saved}`);

 // A new command: Press ▸ Keyboard key ▸ the key picker.
 await sheet.locator('[data-when="regular"]').focus();
 await sheet.locator('[data-kind="key"]').click();
 const picker = page.getByRole('dialog',{name:/Pick a key/});
 await picker.waitFor();
 assert.match(await picker.innerText(), /Press sends|N · Press|Press/i, 'a new command starts as a Press');
 await picker.getByRole('button',{name:/^Q( ·|$)/}).first().click();
 await picker.waitFor({state:'detached'});
 await page.waitForFunction(() => /Q/.test(document.querySelector('details[data-input-command="N"][open] [data-when="regular"]')?.textContent ?? ''));
 saved = await save();
 assert.equal(eff(saved, 'N'), 'Q', `the chosen key is a press:
${saved}`);
 assert.equal(eff(saved, 'N,N'), 'SPACE', 'the double-tap was disturbed');

 // X clears the selected activation only.
 await sheet.locator('[data-when="regular"]').focus();
 await page.keyboard.press('x');
 await page.waitForFunction(() => /\+ Add|None/.test(document.querySelector('details[data-input-command="N"][open] [data-when="regular"]')?.textContent ?? ''));
 saved = await save();
 assert.ok(['NONE', undefined].includes(eff(saved, 'N')), `X Clear left the press:
${saved}`);
 assert.equal(eff(saved, 'N,N'), 'SPACE', 'X Clear reached another activation');

 assert.deepEqual(errors,[]);
 console.log('PASS: binding sheet: When you… selects, the eight kinds, Y menu on the row, Move to…, picker adds, X clears one activation');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
