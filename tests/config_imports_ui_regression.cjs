// A profile that imports another file shows the bindings it inherits, marks
// them as inherited, and still saves only its own text.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  // Desktop imports Base. W is inherited; N is set in both, so the profile's
  // own value must win; S exists only in the profile.
  const template='TICK_TIME = 1\nN = ENTER\nW = R\nRIGHT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_GRID_SIZE = 3 3\nRT1 = A\n';
  const profiles={Desktop:'RESET_MAPPINGS\nprofiles-library/Base.txt\nN = SPACE\nS = TAB\n'};
  window.__saved=[];
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   readConfigFile:async path=>(path==='profiles-library/Base.txt'?template:null),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;window.__saved.push(content);return {name}},
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

 // Cards are keyed by the JSM command, not by their displayed label -- the
 // label is controller-family specific ("XSquare / X" for W).
 const cardFor = command => page.locator(`[data-input-command="${command}"]`);

 // The whole point: a binding the profile never mentions is still shown.
 const west = cardFor('W');
 await west.waitFor();
 // The compact row carries the output; the badge is inside the card, so open
 // it to reach the badge.
 await west.locator(':scope > summary').click();
 await west.locator('kbd').first().waitFor();
 assert.equal(await west.locator('kbd').first().innerText(), 'R',
   'an inherited binding must be visible, not blank');

 // ...and marked with the row's origin marker (Buttons Content), which names the file.
 const badge = west.locator('.origin-marker[data-origin="inherited"]').first();
 assert.equal(await badge.count(), 1, 'inherited binding is not marked');
 assert.match(await badge.innerText(), /Inherited . Base/, 'the marker must name where the value comes from');

 // The profile's own value wins over the imported one, and is not marked.
 const north = cardFor('N');
 assert.equal(await north.locator('kbd').first().innerText(), 'Space',
   'the profile overrides the import; the import must not win');
 assert.equal(await north.locator('.origin-marker[data-origin="inherited"]').count(), 0,
   'an overridden binding is owned, not inherited');

 // A binding only the profile sets is untouched and unmarked.
 const south = cardFor('S');
 assert.equal(await south.locator('kbd').first().innerText(), 'Tab');
 assert.equal(await south.locator('.origin-marker[data-origin="inherited"]').count(), 0);

 // TODO-1: the indicator belongs on every control that exposes a value, not
 // only on button cards. A pad's mode, its grid size and a grid cell all take
 // their effective value from the same import here. On Trackpads (console
 // refinement 2b) each is a summary row, and a row whose value is not Default
 // says where it comes from on its second line: "From Base" (inherited) or
 // "Overrides Base" -- this replaced the separate origin markers.
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const sheet = page.locator('.sheet');
 const row = (scope, label) => scope.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText(label,{exact:true})}).first();
 const line = r => r.locator('.summary-row__hint');
 const assertInherited = async (r, what) => {
   assert.equal(await line(r).getAttribute('data-tone'), 'inherited', `${what} must say it is inherited`);
   assert.equal(await line(r).innerText(), 'From Base', `${what} must say where its effective value comes from`);
 };
 const right = page.locator('#trackpad-right');
 const padMode = right.locator('button.summary-row[data-input-command="RIGHT_PAD"]');
 await padMode.waitFor();
 await assertInherited(padMode, 'RIGHT_TOUCHPAD_MODE');
 // A grid cell: the region's row opens its binding editor in a sheet, where
 // the card carries the same origin marker as on Buttons.
 const regionOrigin = async () => {
   await right.locator('button.summary-row').filter({has:page.locator('.summary-row__label').getByText(/^Region 1 · /)}).click();
   const marker = sheet.locator('details[data-input-command="RT1"] .origin-marker[data-origin="inherited"]').first();
   await marker.waitFor();
   const text = await marker.innerText();
   await page.keyboard.press('Escape');
   await sheet.waitFor({state:'detached'});
   return text;
 };
 assert.match(await regionOrigin(), /Inherited . Base/, 'RT1 must say where its effective value comes from');
 // Columns and rows are in the Mode sheet.
 await padMode.click();
 const columns = row(sheet, 'Columns');
 await columns.waitFor();
 await assertInherited(columns, 'RIGHT_GRID_SIZE');
 await assertInherited(row(sheet, 'Mode'), 'RIGHT_TOUCHPAD_MODE in its sheet');

 // Overriding one value claims that control alone; the rest stay inherited.
 await columns.focus(); await page.keyboard.press('Enter');
 await page.waitForFunction(() => document.activeElement?.getAttribute('data-adjusting') === 'true');
 await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
 assert.equal((await columns.locator('.summary-row__value').innerText()).trim(), '2');
 // An override is marked as one: the import it overrides.
 assert.equal(await line(columns).getAttribute('data-tone'), 'changed');
 assert.equal(await line(columns).innerText(), 'Overrides Base', 'named by what it overrides, not by the configuration being edited');
 await assertInherited(row(sheet, 'Mode'), 'editing the grid size must not mark the mode as owned');

 // ...and the value can be handed back to the import from the control itself:
 // Y (Use Default) on the row.
 await columns.focus(); await page.keyboard.press('y');
 await page.waitForFunction(() => [...document.querySelectorAll('.sheet button.summary-row')].find(r => r.querySelector('.summary-row__label')?.textContent === 'Columns')?.querySelector('.summary-row__hint')?.getAttribute('data-tone') === 'inherited');
 await assertInherited(columns, 'RIGHT_GRID_SIZE after Use Default');
 assert.equal((await columns.locator('.summary-row__value').innerText()).trim(), '3', 'restoring inheritance restores the imported value');
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
 await assertInherited(padMode, 'RIGHT_TOUCHPAD_MODE after the grid edit');
 assert.match(await regionOrigin(), /Inherited . Base/, 'editing the grid size must not mark the inherited grid cell as owned');

 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 await west.locator(':scope > summary').click();

 // The import line is visible in the source editor, opened from the
 // configuration's detail panel in Studio (Studio Home 8a) -- Home, then its
 // Configurations tile; the row's origin marker is a label, not a link.
 await page.locator('.home-chip').click();
 await page.getByRole('button',{name:/^Configurations/}).click();
 await page.getByRole('button',{name:'Edit source',exact:true}).click();
 const editor = page.locator('.config-source-window textarea');
 await editor.waitFor();
 const shown = await editor.inputValue();
 assert.ok(shown.includes('profiles-library/Base.txt'), 'the editor must show the import line');
 assert.ok(!shown.includes('TICK_TIME = 1'),
   'the editor must show the profile, not the imported file inlined into it');

 assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
 console.log('PASS: inherited bindings, pad mode, grid size and grid cells all say where they come from, per-row override and Use Default, overrides win, and the profile text stays its own');
 } finally { await browser.close(); }
})();
