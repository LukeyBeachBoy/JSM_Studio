// Save and Apply say what they act on, and switching away cannot lose edits.
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
 const chip = page.locator('.profile-chip');
 await chip.filter({hasText:'Desktop'}).waitFor();

 // One way in, not a dropdown beside a Manage button doing the same job.
 assert.equal(await page.locator('.utility-profile-select').count(), 0, 'the separate profile dropdown is still there');
 assert.equal(await page.getByRole('button',{name:'Manage configurations'}).count(), 0, 'the separate Manage button is still there');

 // Save and Apply are their own buttons, and each names its target.
 const save = page.getByRole('button',{name:'Save configuration',exact:true});
 const apply = page.getByRole('button',{name:'Apply',exact:true});
 assert.equal(await save.innerText(), '', 'Save should be icon-only');
 assert.match(await save.getAttribute('title'), /Desktop/, 'Save should name what it writes to');
 assert.match(await apply.getAttribute('title'), /Desktop/, 'Apply should name what it applies');
 assert.equal(await page.getByRole('button',{name:/Save and apply/}).count(), 0, 'the combined button is still there');

 // Undo and redo are icons with their names kept for hover and screen readers.
 for (const name of ['Undo','Redo']) {
   const button = page.getByRole('button',{name,exact:true});
   assert.equal(await button.count(), 1, `${name} button is missing`);
   assert.equal(await button.innerText(), '', `${name} should be icon-only`);
 }

 // Edit something that lands in the configuration file, then walk away from it.
 await page.getByRole('button',{name:'Triggers',exact:true}).click();
 const threshold = page.getByRole('textbox',{name:'Soft press point',exact:true}).first();
 await threshold.waitFor();
 await threshold.fill('0.1');
 await threshold.press('Tab');
 await page.locator('.pill--warning').first().waitFor();

 await chip.click();
 await page.getByRole('button',{name:'Load',exact:true}).nth(1).click();
 const guard = page.getByRole('alertdialog');
 await guard.waitFor();
 assert.match(await guard.innerText(), /Desktop/, 'the guard should name the configuration holding the edits');
 assert.equal(await page.evaluate(() => window.__calls.filter(c => c.startsWith('load:')).length), 0, 'the switch happened anyway');

 // Cancel leaves you where you were, still dirty.
 await guard.getByRole('button',{name:'Cancel'}).click();
 await guard.waitFor({state:'detached'});
 await page.locator('.pill--warning').first().waitFor();
 assert.equal(await page.evaluate(() => window.__calls.filter(c => c.startsWith('load:')).length), 0);

 // Cancelling the guard leaves the configuration dialog open, so the next
 // attempt starts from there rather than reopening it.
 // Saving first keeps the edit and then switches.
 await page.getByRole('button',{name:'Load',exact:true}).nth(1).click();
 await guard.waitFor();
 await guard.getByRole('button',{name:'Save and switch'}).click();
 await page.waitForFunction(() => window.__calls.some(c => c.startsWith('save:Desktop')) && window.__calls.some(c => c.startsWith('load:')));
 assert.match(await page.evaluate(() => window.__lastSaved), /TRIGGER_THRESHOLD = 0.1/, 'the edit was not saved before switching');

 assert.deepEqual(errors,[]);
 console.log('PASS: one profile control, separate named Save and Apply, icon undo/redo, guarded switching');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
