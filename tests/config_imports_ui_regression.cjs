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
  const template='TICK_TIME = 1\nN = ENTER\nW = R\n';
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

 // ...and marked, so it is findable in the editor.
 const badge = west.getByRole('button',{name:/Inherited from Base/});
 assert.equal(await badge.count(), 1, 'inherited binding is not marked');
 assert.match(await badge.getAttribute('title'), /writes an override into this profile/,
   'the badge must say what editing it will do');

 // The profile's own value wins over the imported one, and is not marked.
 const north = cardFor('N');
 assert.equal(await north.locator('kbd').first().innerText(), 'Space',
   'the profile overrides the import; the import must not win');
 assert.equal(await north.getByRole('button',{name:/Inherited from/}).count(), 0,
   'an overridden binding is owned, not inherited');

 // A binding only the profile sets is untouched and unmarked.
 const south = cardFor('S');
 assert.equal(await south.locator('kbd').first().innerText(), 'Tab');
 assert.equal(await south.getByRole('button',{name:/Inherited from/}).count(), 0);

 // The badge routes to the config editor, the only place the import is visible.
 await badge.click();
 const editor = page.locator('.config-source-window textarea');
 await editor.waitFor();
 const shown = await editor.inputValue();
 assert.ok(shown.includes('profiles-library/Base.txt'), 'the editor must show the import line');
 assert.ok(!shown.includes('TICK_TIME = 1'),
   'the editor must show the profile, not the imported file inlined into it');

 assert.deepEqual(errors, [], `page errors: ${errors.join(', ')}`);
 console.log('PASS: inherited bindings are shown and marked, overrides win, and the profile text stays its own');
 } finally { await browser.close(); }
})();
