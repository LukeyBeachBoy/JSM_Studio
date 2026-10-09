// Console v2 (V3): one status chip says the state ("Live · saved",
// "Unsaved · ☰ to save"); ☰ opens Review changes, Undo, Save and the rest of
// what the title bar used to hold; switching away cannot lose edits.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.__calls=[]; window.__lastSaved='';
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>{window.__calls.push('load:'+name);return {name,content:profiles[name]}},
   saveLibraryProfile:async(name,content)=>{window.__calls.push('save:'+name);window.__lastSaved=content;profiles[name]=content;return {name}},
   applyProfile:async(path,text)=>{window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  window.telemetry={onSample:cb=>{cb({console:'ready',activeProfile:'profiles-library/Desktop.txt',devices:[]});return()=>{}}};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 const chip = page.locator('.profile-chip');
 await chip.filter({hasText:'Desktop'}).waitFor();
 const titlebar = page.locator('.titlebar');

 // One way in, not a dropdown beside a Manage button doing the same job.
 assert.equal(await page.locator('.utility-profile-select').count(), 0, 'the separate profile dropdown is still there');
 assert.equal(await page.getByRole('button',{name:'Manage configurations'}).count(), 0, 'the separate Manage button is still there');

 // One state button in the bar (1e) and no Undo, Redo, Save or separate Apply
 // beside it. Saved and running, it says so.
 const state = titlebar.locator('.state-button');
 assert.equal(await state.count(), 1);
 assert.equal(await state.innerText(), 'Live · saved');
 assert.match(await state.getAttribute('data-caption'), /Desktop/, 'the status chip should name what is running');
 assert.equal(await state.getAttribute('title'), null, 'a focus caption, not a hover tooltip (V9)');
 for (const name of ['Undo','Redo','Save configuration','Apply'])
   assert.equal(await titlebar.getByRole('button',{name,exact:true}).count(), 0, `${name} is still in the title bar`);

 // The Configuration menu (from the chip) holds Undo, Redo and Save, idle and
 // saying why while there is nothing to do.
 const configMenu = page.locator('.config-menu');
 const openConfigMenu = async () => {
   await titlebar.locator('.menu-chip').click();
   await configMenu.waitFor();
 };
 const menuItem = label => configMenu.locator('.config-menu__item').filter({has:page.locator('.config-menu__label').getByText(label,{exact:true})});
 await openConfigMenu();
 assert.equal(await configMenu.locator('.config-menu__title').innerText(), 'Desktop');
 // Review changes, Undo and Save first (V3), then what the old title bar
 // held: the game, what games see, mapping on or off. No "Editing layer".
 const labels = (await configMenu.locator('.config-menu__label').allInnerTexts()).map(t => t.trim());
 assert.deepEqual(labels.slice(0, 3), ['Review changes','Undo','Redo'], labels.join(' | '));
 // Live and saved: the status is the header's line, not an item (UX review 2026-10-09, S1).
 assert.equal(await configMenu.locator('.config-menu__status').innerText(), 'Live · saved');
 assert.deepEqual(labels.slice(3),
   ['Save, not live yet','Save as copy…','Discard changes','Test it','Switch game','Virtual controller','Pause mapping','This controller only','Settings origin']);
 // Nothing to review: the pad lands on the first item that can act, not on "Review changes · Nothing unsaved".
 assert.equal(await configMenu.locator('.config-menu__item:focus .config-menu__label').innerText(), 'Save as copy…');
 // The footer names the menu's own buttons while it is open.
 assert.match(await page.locator('.hint-capsule').innerText(), /Select[\s\S]*Close/);
 assert.equal(labels.includes('Editing layer'), false, 'modes are switched on Layout and Modes, not here');
 for (const [label, reason] of [['Undo','Nothing to undo'],['Redo','Nothing to redo'],['Save, not live yet','No unsaved changes']]) {
   assert.equal(await menuItem(label).getAttribute('aria-disabled'), 'true', `${label} should idle`);
   assert.equal(await menuItem(label).getAttribute('data-reason'), reason);
 }
 await page.keyboard.press('Escape');
 await configMenu.waitFor({state:'detached'});

 // Edit something that lands in the configuration file, then walk away from
 // it: Gyro's turn speed, one step with the arrow.
 await page.locator('.page-tabs').getByRole('button',{name:'Gyro',exact:true}).click();
 const speed = page.locator('[data-setting="GYRO_SENS"]').first();
 await speed.waitFor();
 await speed.focus();
 await page.keyboard.press('ArrowRight');

 // Dirty: the chip says so and A saves and makes it live; the caption counts.
 await page.waitForFunction(() => /^Unsaved·(M)?Save$/.test((document.querySelector('.titlebar .state-button')?.textContent ?? '').replace(/\s/g, '')));
 assert.equal(await state.getAttribute('data-tone'), 'accent');
 assert.match(await state.getAttribute('data-caption'), /\d+ changes? to Desktop/, 'the chip should name what it writes to');
 // Undo names what it undoes; Save (Ctrl+S) and Discard wake up.
 await openConfigMenu();
 assert.equal(await menuItem('Undo').getAttribute('aria-disabled'), null);
 assert.doesNotMatch(await menuItem('Undo').locator('.config-menu__meta').innerText(), /Nothing to undo/);
 assert.equal(await menuItem('Save, not live yet').locator('.config-menu__meta').innerText(), 'Ctrl+S');
 assert.equal(await configMenu.locator('.config-menu__label').filter({hasText:/^Discard \d+ changes?$/}).count(), 1);
 await page.keyboard.press('Escape');
 await configMenu.waitFor({state:'detached'});

 // The Editing chip opens the configuration switcher; choosing another runs
 // the unsaved-changes guard first.
 const other = page.getByRole('menuitem').filter({hasText:'Game'});
 // Home's covers read the other configurations for their game art, so only
 // loads made from here on would be the switch happening.
 const loadsBefore = await page.evaluate(() => window.__calls.filter(c => c.startsWith('load:')).length);
 await chip.click();
 await other.click();
 const guard = page.getByRole('alertdialog');
 await guard.waitFor();
 assert.match(await guard.innerText(), /Desktop/, 'the guard should name the configuration holding the edits');
 assert.equal(await page.evaluate(() => window.__calls.filter(c => c.startsWith('load:')).length), loadsBefore, 'the switch happened anyway');

 // Cancel leaves you where you were, still dirty.
 await guard.getByRole('button',{name:'Cancel'}).click();
 await guard.waitFor({state:'detached'});
 await page.locator('.unsaved-dot').first().waitFor();
 assert.equal(await page.evaluate(() => window.__calls.filter(c => c.startsWith('load:')).length), loadsBefore);

 // Saving first keeps the edit and then switches.
 await chip.click();
 await other.click();
 await guard.waitFor();
 await guard.getByRole('button',{name:'Save and switch'}).click();
 await page.waitForFunction(() => window.__calls.some(c => c.startsWith('save:Desktop')) && window.__calls.some(c => c.startsWith('load:')));
 assert.match(await page.evaluate(() => window.__lastSaved), /GYRO_SENS = /, 'the edit was not saved before switching');

 assert.deepEqual(errors,[]);
 console.log('PASS: one game chip, one status chip, Review changes/Undo/Save first in ☰, guarded switching');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
