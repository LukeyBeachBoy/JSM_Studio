// The binding card offers each control once, under an honest name.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\n'};
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

 // The open card (3c): a header with the card's cog and Details, no text-only
 // buttons, and no reorder grip -- commands are not reorderable.
 const head = open.locator(':scope > summary');
 assert.equal(await head.getByRole('button',{name:'Binding settings'}).count(), 1, 'the header has one cog');
 assert.equal(await head.getByRole('button',{name:'Details'}).count(), 1);
 assert.equal(await head.getByRole('button',{name:/^(Copy|Paste)$/}).count(), 0, 'Copy and Paste are still text buttons in the header');
 assert.equal(await open.locator('[data-icon="reorder"]').count(), 0, 'the reorder grip survived');
 await head.getByRole('button',{name:'Binding settings'}).click();
 const cardItems = (await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim());
 assert.deepEqual(cardItems, ['Copy','Paste','Reset to inherited'], `unexpected card menu: ${cardItems.join(', ')}`);
 await page.keyboard.press('Escape');

 // One activation chip per row. Every kind this input can keep is offered:
 // one that lives on another config line moves the command there. The
 // group's modeshift panel owns chords, so no chord kind is offered here.
 assert.equal(await card.getByRole('combobox',{name:'Trigger'}).count(), 1, 'the trigger is editable in more than one place');
 await card.getByRole('combobox',{name:'Trigger'}).click();
 const options = (await page.getByRole('option').allInnerTexts()).map(text => text.trim());
 assert.deepEqual(options, ['Press','Tap','Hold','Double press','Release','Turbo'],
   `the chip should offer every kind this row can keep: ${options.join(', ')}`);
 await page.keyboard.press('Escape');

 // The output reads as the key it sends -- by the legend on that key, not by
 // JoyShockMapper's name for it.
 assert.equal(await card.getByRole('button',{name:/^Choose action/}).innerText(), 'Space');

 // No ··· and no text-only Remove: the row has one cog, and its sheet holds
 // the rest.
 assert.equal(await card.getByRole('button',{name:'Command actions'}).count(), 0, 'the ··· menu survived');
 assert.equal(await card.getByRole('button',{name:'Remove'}).count(), 0, 'Remove is still inline');
 await card.getByRole('button',{name:'Command settings'}).click();
 const sheet = page.getByRole('dialog',{name:'Space'});
 await sheet.waitFor();
 for (const name of ['Duplicate','Copy binding','Remove']) assert.equal(await sheet.getByRole('button',{name}).count(), 1, `the settings sheet has no ${name}`);
 assert.equal(await sheet.getByRole('radio',{name:'Hold'}).count(), 1, 'output mode lives in the sheet');
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});

 // Retargeting within the config line sticks, and so does a kind on another
 // line of the same input (Release shares it; Double is a line of its own).
 const chip = () => open.locator('[data-command-row] [role=combobox]').first();
 await chip().click();
 await page.getByRole('option',{name:'Hold',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('details[data-input-command="N"][open] [data-command-row] [role=combobox]')?.textContent.includes('Hold'));
 await chip().click();
 await page.getByRole('option',{name:'Double press',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('details[data-input-command="N"][open] [data-command-row] [role=combobox]')?.textContent.includes('Double'));
 assert.equal(await open.locator('[data-command-row]').count(), 1, 'moving the command to its own line left a copy behind');
 assert.equal(await open.locator('[data-command-row]').getByRole('button',{name:/^Choose action/}).innerText(), 'Space');

 // Adding a command is one button; with commands there it offers the kinds,
 // and never a chord here.
 await open.getByRole('button',{name:'Add command'}).click();
 const addItems = (await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim());
 assert.ok(!addItems.some(item => /chord/i.test(item)), `the card offers a chord it cannot keep: ${addItems.join(', ')}`);
 await page.keyboard.press('Escape');
 assert.ok(await open.getByRole('button',{name:'Add modeshift'}).count() > 0, 'chords have nowhere else to be made');

 assert.deepEqual(errors,[]);
 console.log('PASS: lanes card: one chip per row with every keepable kind, keycap output, cog sheets, no text-only buttons');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
