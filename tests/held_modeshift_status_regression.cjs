// Holding a modeshift trigger (binding card refresh 2a, 2g): the inputs it
// changes swap to their shifted name and value in place, the trigger's own
// callout says Held, and the title bar and capsule fill a slot they already
// keep -- nothing grows or moves.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  // L sits in a column of full, two-line callouts (the shoulder group).
  const profiles={Desktop:'RESET_MAPPINGS\nL = SPACE\n# @label L = Jump\nLSL,L = V\n# @label LSL,L = Melee\nLSL,E = C\nLSL = NONE\n'};
  window.__buttons=0;
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;return {name}},
   applyProfile:async(path)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:window.__buttons,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,50);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // A Steam Controller's first connection asks about its power-on sound.
 await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}), async () => { await page.getByRole('button',{name:'Keep them',exact:true}).click() });
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.locator('.page-tabs').getByRole('button',{name:'Layout',exact:true}).click();
 const jump = page.locator('[data-overview-input="L"]');
 const trigger = page.locator('[data-overview-input="LSL"]');
 await jump.waitFor();
 const status = page.locator('.shift-status');
 const capsule = page.locator('.hint-capsule');
 // Mouse clicks render keyboard hint keycaps; a physical pad takeover renders
 // controller glyphs of different widths. Compare both states in pad mode.
 await page.evaluate(() => { document.body.dataset.inputSource = 'controller'; });
 await page.waitForTimeout(300);

 // The shell has no live modeshift indicator or reserved slot.
 assert.equal(await status.count(), 0, 'the title bar still draws a live modeshift indicator');
 const before = { jump: await jump.boundingBox(), capsule: await capsule.boundingBox() };
 assert.match(await jump.innerText(), /Jump/);

 // Hold L4.
 await page.evaluate(() => { window.__buttons = 1 << 19 });
 await page.waitForFunction(() => document.querySelector('[data-overview-input="L"]')?.dataset.shifted === 'true');
 const text = (await jump.innerText()).replace(/\s+/g, ' ');
 assert.match(text, /Melee/, 'the shifted name replaces the callout\'s');
 assert.match(text, /was Jump/, 'and says what it was');
 assert.match(text, /\bV\b/, 'with the shifted value');
 assert.match(await trigger.innerText(), /Held/, 'the trigger says Held');
 assert.equal(await status.count(), 0, 'holding a trigger restores the removed indicator');
 // The capsule has no alternate live indicator either.
 assert.equal(await capsule.locator('.hint-capsule__status').count(), 0, 'the capsule repeats the title bar\'s held status');
 assert.doesNotMatch((await capsule.innerText()).replace(/\s+/g, ' '), /L4 held/);
 const after = { jump: await jump.boundingBox(), capsule: await capsule.boundingBox() };
 for (const key of ['jump', 'capsule']) {
  assert.deepEqual([after[key].width, after[key].height].map(Math.round), [before[key].width, before[key].height].map(Math.round), `${key} changed size while L4 was held`);
 }

 // Let go: back as it was.
 await page.evaluate(() => { window.__buttons = 0 });
 await page.waitForFunction(() => !document.querySelector('[data-overview-input="L"]')?.dataset.shifted);
 assert.equal(await status.count(), 0);

 assert.deepEqual(errors,[]);
 console.log('PASS: a held modeshift swaps its inputs in place and leaves the shell free of live shift indicators');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
