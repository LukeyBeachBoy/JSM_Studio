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
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const card = page.locator('[class*=commandCard]').first();
 await card.waitFor();

 // One trigger picker per card, not one in the header and another in the body.
 assert.equal(await card.getByRole('combobox',{name:'Trigger'}).count(), 1, 'the trigger is editable in more than one place');

 // A binding already written to the config is edited in place, so it offers
 // only the kinds that share its config line. The editor body used to offer
 // chord and the rest here too, where choosing one silently did nothing.
 await card.getByRole('combobox',{name:'Trigger'}).click();
 const options = (await page.getByRole('option').allInnerTexts()).map(text => text.trim());
 assert.deepEqual(options, ['Press','Tap','Hold','Double press'],
   `a written binding should not offer kinds it cannot become: ${options.join(', ')}`);
 await page.keyboard.press('Escape');

 // The output reads as the key it sends.
 assert.equal(await card.locator('kbd').first().innerText(), 'SPACE');

 // The menu carries what the header does not, and nothing that does nothing.
 await card.getByRole('button',{name:'Command actions'}).click();
 const items = (await page.getByRole('menuitem').allInnerTexts()).map(text => text.trim());
 assert.deepEqual(items, ['Rename command','Copy binding','Duplicate'], `unexpected command menu: ${items.join(', ')}`);
 await page.keyboard.press('Escape');

 // Copy and Duplicate moved into the menu; Remove stays a button.
 assert.equal(await card.getByRole('button',{name:'Duplicate'}).count(), 0, 'Duplicate is still duplicated in the header');
 assert.equal(await card.getByRole('button',{name:'Copy binding'}).count(), 0, 'Copy binding is still duplicated in the header');
 assert.equal(await card.getByRole('button',{name:'Remove'}).count(), 1);

 // Retargeting within the config line does stick.
 await card.getByRole('combobox',{name:'Trigger'}).click();
 await page.getByRole('option',{name:'Hold',exact:true}).click();
 await page.waitForFunction(() => document.querySelector('[class*=commandCard] [role=combobox]')?.textContent.includes('Hold'));

 // A fresh draft row is written from scratch, so it offers the wider set -- but
 // not chord, which this group's modeshift panel owns. A chord made here would
 // be filtered straight back out of the card and lost.
 await page.getByRole('button',{name:'Add command'}).first().click();
 const draft = page.locator('[class*=commandCard]').last();
 await draft.getByRole('combobox',{name:'Trigger'}).click();
 const draftOptions = (await page.getByRole('option').allInnerTexts()).map(text => text.trim());
 assert.ok(draftOptions.includes('Turbo'), `a draft row should offer the wider set: ${draftOptions.join(', ')}`);
 assert.ok(!draftOptions.includes('Chord'), 'the card offers a chord it cannot keep');
 // An open Radix listbox hides the rest of the page from the role queries, so
 // close it before looking for the panel that does own chords.
 await page.keyboard.press('Escape');
 assert.ok(await page.getByRole('button',{name:'Add modeshift'}).count() > 0, 'chords have nowhere else to be made');

 assert.deepEqual(errors,[]);
 console.log('PASS: one trigger picker offering only workable kinds, keycap output, menu without dead or duplicated actions');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
