// The dropdown help panel must not move the options it describes.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('node:path');
const fs = require('node:fs');
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
 await page.locator('.utility-profile-select').getByRole('combobox').filter({hasText:'Desktop'}).waitFor();
 await page.getByRole('button',{name:'Buttons',exact:true}).click();

 // The press-type dropdown: its options carry help text of very different
 // lengths, which is what used to resize the popup.
 await page.getByRole('combobox').filter({hasText:/^Press$/}).first().click();
 const list = page.getByRole('listbox').first();
 await list.waitFor();
 const anchor = page.getByRole('option',{name:'Press',exact:true});
 const help = page.locator('[aria-live="polite"]').last();
 await help.waitFor();

 const boxOf = async locator => { const box = await locator.boundingBox(); return {x:Math.round(box.x), y:Math.round(box.y), height:Math.round(box.height)}; };
 const measure = async name => {
  await page.getByRole('option',{name,exact:true}).hover();
  await page.waitForFunction(text => [...document.querySelectorAll('[aria-live="polite"]')].pop()?.textContent.startsWith(text), name);
  return {list: await boxOf(list), anchor: await boxOf(anchor), help: await boxOf(help)};
 };

 // Tap's help runs to two lines, Press's to one. Under the old bottom
 // placement that difference resized the popup and re-anchored it.
 const chord = await measure('Tap');
 const release = await measure('Press');
 const double = await measure('Double press');

 assert.deepEqual(release.list, chord.list, 'the option list moved or resized when the help text changed');
 assert.deepEqual(double.list, chord.list, 'the option list moved or resized when the help text changed');
 assert.deepEqual(release.anchor, chord.anchor, 'an option moved out from under the pointer');
 assert.deepEqual(double.anchor, chord.anchor, 'an option moved out from under the pointer');

 // Beside the list, not below it. Within a pixel of its top edge, and clear of
 // it horizontally on one side or the other.
 assert.ok(Math.abs(chord.help.y - chord.list.y) <= 1, 'the help panel should be top-aligned with the list');
 assert.ok(chord.help.x >= chord.list.x + 100 || chord.help.x + 280 <= chord.list.x, 'the help panel should sit beside the list');

 const artifacts=path.resolve(__dirname,'../tmp/feedback-review'); fs.mkdirSync(artifacts,{recursive:true});
 await page.getByRole('option',{name:'Tap',exact:true}).hover();
 await page.screenshot({path:path.join(artifacts,'select-help-panel.png')});

 // A dropdown near the right edge must flip its panel to the left rather than
 // push it off-screen.
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:1000,height:1000});
 await page.getByRole('combobox').filter({hasText:/^Press$/}).first().click();
 await page.getByRole('option',{name:'Tap',exact:true}).hover();
 await page.waitForFunction(() => [...document.querySelectorAll('[aria-live="polite"]')].pop()?.textContent.startsWith('Tap'));
 const narrow = await boxOf(help);
 const width = await help.evaluate(node => node.getBoundingClientRect().width);
 assert.ok(narrow.x >= 0 && narrow.x + width <= 1000, `help panel ran off-screen at x=${narrow.x} width=${width}`);
 await page.screenshot({path:path.join(artifacts,'select-help-panel-narrow.png')});

 assert.deepEqual(errors,[]);
 console.log('PASS: dropdown help panel is stable across options and sits beside the list');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
