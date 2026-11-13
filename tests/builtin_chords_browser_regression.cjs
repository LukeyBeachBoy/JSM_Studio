// Settings ▸ Hold to swap (console v2, SettingsHoldToSwap / SettingsHoldToSwapCopy):
// cards, the built-in Quick tools, buttons picked by pressing them (or from a
// list), the order where the higher card wins, Make my own copy, removing an
// entry, and Startup's Reset everything with Cancel first.
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/platform/desktopBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+'\nwindow.__chordTestBridge=desktopBridge; if(window.__installChordFixture) window.__installChordFixture(desktopBridge);\n'});});
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock');
 const onboarding=page.getByRole('dialog',{name:'Controller power-on sound'});if(await onboarding.waitFor({state:'visible',timeout:3000}).then(()=>true).catch(()=>false))await onboarding.getByRole('button',{name:'Keep them',exact:true}).click();
 await page.evaluate(async()=>{
  const install=bridge=>{
  window.testChords=[{id:'builtin-default',buttons:[],triggerGroups:[['HOME'],['MISC1']],profilePath:'profiles-library/Default Global Chords.txt'},{id:'photo',buttons:[],triggerGroups:[['LSR','RSL']],profilePath:'profiles-library/Photo mode.txt'}];
  window.testProfiles={'Default Global Chords':'RESET_MAPPINGS\nW = "OPEN_KEYBOARD"\nRSL = "TOGGLE_MAPPING"\nRSR = "CALIBRATE_GYRO"\n','Photo mode':'RESET_MAPPINGS\n'};
  bridge.listGlobalChords=async()=>window.testChords;
  bridge.listLibraryProfiles=async()=>Object.keys(window.testProfiles);
  bridge.loadLibraryProfile=async name=>({name,content:window.testProfiles[name]});
  bridge.createLibraryProfile=async name=>({name,path:`profiles-library/${name}.txt`,content:''});
  bridge.saveLibraryProfile=async(name,content)=>{window.testProfiles[name]=content;return {name}};
  bridge.saveGlobalChord=async chord=>{const i=window.testChords.findIndex(c=>c.id===chord.id);if(i>=0)window.testChords[i]=chord;else window.testChords.push(chord);return [...window.testChords]};
  bridge.deleteGlobalChord=async id=>{window.testChords=window.testChords.filter(c=>c.id!==id);return [...window.testChords]};
  // The order (shellBridge, ?mock): top to bottom.
  window.electronAPI.reorderGlobalChords=async ids=>{window.testChords=ids.map(id=>window.testChords.find(c=>c.id===id)).filter(Boolean).map((c,rank)=>({...c,rank}));return [...window.testChords]};
  };window.__installChordFixture=install;install(window.__chordTestBridge);
 });
 const go=async()=>{await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'globalChords'})));await page.locator('[data-chord-card]').first().waitFor()};
 await go();
 // Cards: the built-in one is Quick tools, never "chord" or its file name.
 const cards=page.locator('[data-chord-card]');
 assert.equal(await cards.count(),2);
 assert.match(await cards.first().innerText(),/Quick tools/);
 assert.equal(await page.getByText('Built-in',{exact:true}).count(),1);
 assert.doesNotMatch(await page.locator('.main-pane').innerText(),/chord|combo|Default Global Chords/i,'Hold to swap never says chord or combo');
 assert.match(await page.locator('.main-pane').innerText(),/When two match, the higher card wins/);
 // Mouse-clicking the footer Cancel must bypass the capture navigation gate.
 const beforeCancel=await page.evaluate(()=>JSON.stringify(window.testChords));
 await cards.nth(1).click();
 const picker=page.getByRole('dialog',{name:/Choose inputs to hold/});await picker.waitFor();
 assert.equal(await page.evaluate(()=>document.body.dataset.padListening==='true'),false,'Visual picking opens without listening');
 await picker.getByRole('combobox',{name:'Controller picture',exact:true}).selectOption('type-25');
 await picker.locator('[data-command="JOY21"]').click();
 await page.waitForFunction(()=>window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('JOY21'));
 await picker.locator('[data-command="JOY21"]').click();
 await page.waitForFunction(()=>!window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('JOY21'));
 await picker.locator('[data-command="JOY20"]').click();
 const nub=picker.getByRole('region',{name:'Five-way nub inputs',exact:true});await nub.waitFor();
 assert(!await page.evaluate(()=>window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('JOY20')),'Opening the grouped nub does not assign click automatically');
 await nub.getByRole('button',{name:'Up',exact:true}).click();
 await page.waitForFunction(()=>window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('UP'));
 await nub.getByRole('button',{name:'Up',exact:true}).click();
 await page.waitForFunction(()=>!window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('UP'));
 await picker.locator('[data-mouse-input="MOUSE_BACK"]').click();
 await page.waitForFunction(()=>window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('MOUSE_BACK'));
 await picker.locator('[data-mouse-input="MOUSE_BACK"]').click();
 await page.waitForFunction(()=>!window.testChords.find(c=>c.id==='photo').triggerGroups[0].includes('MOUSE_BACK'));
 require('node:fs').mkdirSync('build-jsm-sdl/hold-picker-acceptance',{recursive:true});
 await page.screenshot({path:'build-jsm-sdl/hold-picker-acceptance/visual-picker.png'});
 await picker.getByRole('button',{name:'Listen for input instead'}).click();
 await page.waitForFunction(()=>document.body.dataset.padListening==='true');
 await page.locator('[data-subpage] .hint-capsule [data-hint-press="B"]').click();
 await page.waitForFunction(()=>document.body.dataset.padListening!=='true');
 assert.equal(await page.locator('[data-subpage]').count(),0,'Cancel closes the capture sheet');
 assert.equal(await page.evaluate(()=>JSON.stringify(window.testChords)),beforeCancel,'Cancel preserves the saved trigger');
 // Listening remains an explicit option: press A and B together, let go.
 await cards.nth(1).click();
 await picker.getByRole('button',{name:'Listen for input instead'}).click();
 await page.waitForFunction(()=>document.body.dataset.padListening==='true');
 await page.evaluate(()=>window.__pad.hold(['S','E']));await page.waitForTimeout(250);await page.evaluate(()=>window.__pad.release());
 await page.waitForFunction(()=>{const groups=window.testChords.find(c=>c.id==='photo').triggerGroups;return groups.length===1&&[...groups[0]].sort().join()==='E,S'});
 // Y opens the entry: another way to hold it, from a list too.
 await cards.first().focus();await page.keyboard.press('y');
 const entry=page.locator('[data-subpage]');await entry.waitFor();
 assert.match(await entry.innerText(),/Make your own copy/);
 assert.match(await entry.innerText(),/Order · higher wins/);
 await entry.getByRole('button',{name:/^Another way to hold it/}).click();
 await picker.waitFor();
 assert.equal(await page.evaluate(()=>document.body.dataset.padListening==='true'),false,'Another way also opens visual picking');
 await picker.getByRole('button',{name:'Back',exact:true}).click();
 const configChoices=entry.getByRole('radiogroup',{name:'Configuration'});
 const spacing=await configChoices.locator(':scope > button').evaluateAll(buttons=>buttons.slice(1).map((button,i)=>button.getBoundingClientRect().top-buttons[i].getBoundingClientRect().bottom));
 assert(spacing.length>0 && spacing.every(gap=>gap>=7),'Configuration choices have visible space between rows');

 await entry.getByRole('button',{name:/^One way/}).first().click();
 const list=page.getByRole('group',{name:'Buttons to hold together'});await list.waitFor();
 await list.getByRole('button',{name:/^A$|A button|^A /}).first().click().catch(async()=>{await list.locator('button').first().click()});
 await page.waitForFunction(()=>window.testChords.find(c=>c.id==='builtin-default').triggerGroups[0].length===2);
 await page.keyboard.press('Escape');
 // Order: Quick tools moves down below Photo mode; the higher card wins.
 await entry.getByRole('button',{name:/Move Quick tools down/}).click();
 await page.waitForFunction(()=>window.testChords.map(c=>c.id).join()==='photo,builtin-default');
 assert.deepEqual(await page.evaluate(()=>window.testChords.map(c=>c.rank)),[0,1]);
 // Make my own copy: "My Quick tools", swapped in instead, opened to edit.
 await entry.getByRole('button',{name:/^Make my own copy/}).first().click();
 await page.waitForFunction(()=>window.testProfiles['My Quick tools']?.includes('W = "OPEN_KEYBOARD"'));
 assert.equal(await page.evaluate(()=>window.testChords.find(c=>c.id==='builtin-default').profilePath),'profiles-library/My Quick tools.txt');
 // Remove from Hold to swap: Keep it first; the configuration stays.
 await go();
 await cards.first().focus();await page.keyboard.press('y');await entry.waitFor();
 await entry.getByRole('button',{name:/^Remove from Hold to swap/}).click();
 const remove=page.getByRole('alertdialog');await remove.waitFor();
 assert.equal(await remove.getByRole('button').first().innerText(),'Keep it');
 await remove.getByRole('button',{name:'Remove',exact:true}).click();
 await page.waitForFunction(()=>window.testChords.length===1);
 // Startup ▸ Reset everything: Cancel comes first, so a stray press changes nothing.
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'startup'})));
 await page.getByRole('button',{name:/^Reset everything to defaults/}).click();
 const reset=page.getByRole('alertdialog');await reset.waitFor();
 await page.waitForFunction(()=>/Cancel/.test(document.activeElement?.textContent??''));
 await page.evaluate(()=>window.__pad.press(['E']));await reset.waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);console.log('PASS: visual controller/mouse picking by default, optional listening, footer Cancel, configuration spacing, priority, copy and removal.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
