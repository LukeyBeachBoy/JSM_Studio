// Studio reads the pad itself while it has focus (design handoff, "native
// controller navigation"): LT/RT page, LB/RB section, D-pad moves, A opens,
// B backs out, View jumps to the title bar and back, and Test hands the pad to
// the configuration until View + Menu is held. Driven through the same
// telemetry stream the live preview uses, with a scripted pad.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\nS = ENTER\nL = Q\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.__calls=[];
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;window.__calls.push('save');return {name}},
   applyProfile:async(path)=>{window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  // Raw button bits, as utils/controllerStatus decodes them.
  const BITS={UP:0,DOWN:1,LEFT:2,RIGHT:3,'+':4,'-':5,L:8,R:9,S:12,E:13,W:14,N:15};
  window.__held=new Set(); window.__triggers={left:0,right:0};
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'ready',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,
     status:{buttons:[...window.__held].reduce((m,c)=>m+2**BITS[c],0),leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:window.__triggers,gyro:{x:0,y:0,z:0}}}]});
   emit();const timer=setInterval(emit,10);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.locator('.mapping-plate[data-state="studio"]').waitFor();

 const hold = async buttons => page.evaluate(b => b.forEach(x => window.__held.add(x)), buttons);
 const release = async buttons => page.evaluate(b => b ? b.forEach(x => window.__held.delete(x)) : window.__held.clear(), buttons);
 const press = async (...buttons) => { await hold(buttons); await page.waitForTimeout(60); await release(buttons); await page.waitForTimeout(80); };
 const pull = async side => { await page.evaluate(s => { window.__triggers[s] = 1 }, side); await page.waitForTimeout(60); await page.evaluate(s => { window.__triggers[s] = 0 }, side); await page.waitForTimeout(80); };
 const title = () => page.locator('.page-header__title').innerText();
 const active = () => page.evaluate(() => { const a = document.activeElement; return { cls: String(a?.className ?? ''), text: (a?.textContent ?? '').trim().slice(0, 40), inTitlebar: Boolean(a?.closest('.titlebar')), inMain: Boolean(a?.closest('.main-pane')) }; });

 // RT / LT page through the tabs.
 await pull('right');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');
 await pull('left');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Overview');
 await pull('right');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');

 // The pad lands in the page, and its focus shows the controller ring.
 await press('DOWN');
 await page.waitForFunction(() => document.activeElement?.closest('.main-pane'));
 assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'controller');
 // The ring is the shared focus-glide highlight, sitting on the focused row.
 await page.waitForTimeout(350);
 const glide = await page.evaluate(() => {
  const highlight = document.querySelector('.focus-glide');
  const target = document.activeElement.closest('.setting-row') ?? document.activeElement;
  const a = highlight.getBoundingClientRect(), b = target.getBoundingClientRect();
  return { ring: getComputedStyle(highlight).boxShadow, visible: highlight.dataset.visible, off: Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width)) };
 });
 assert.match(glide.ring, /rgb\(154, 216, 255\)/, `controller focus should draw the focus-controller ring: ${glide.ring}`);
 assert.equal(glide.visible, 'true');
 assert.ok(glide.off <= 2, `the focus highlight should sit on the focused control (off by ${glide.off}px)`);

 // A opens a binding row, B closes it again.
 const summary = page.locator('details[data-input-command="N"] > summary');
 await summary.focus();
 await press('S');
 await page.waitForFunction(() => document.querySelector('details[data-input-command="N"]')?.open);
 await press('E');
 await page.waitForFunction(() => !document.querySelector('details[data-input-command="N"]')?.open);

 // RB steps to the next section.
 const current = () => page.locator('.section-item[aria-current="true"]').innerText();
 const first = await current();
 await press('R');
 await page.waitForFunction(f => document.querySelector('.section-item[aria-current="true"]')?.textContent !== f, first);

 // View jumps to the title bar, View again comes back to where it was.
 await summary.focus();
 await press('-');
 await page.waitForFunction(() => document.activeElement?.closest('.titlebar'));
 assert.match((await active()).cls, /context-segment--editing/, 'the title bar is entered at its first item');
 await press('-');
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));

 // Test hands the pad to the configuration: navigation stops until View + Menu is held.
 await page.getByRole('button',{name:'Test'}).click();
 await page.locator('.test-banner').waitFor();
 await page.waitForFunction(() => window.__calls.includes('apply'));
 assert.equal(await page.locator('.mapping-plate').getAttribute('data-state'), 'testing');
 const before = await title();
 await pull('right');
 await page.waitForTimeout(150);
 assert.equal(await title(), before, 'the pad must not navigate while testing');
 await hold(['-', '+']);
 await page.locator('.test-banner').waitFor({state:'detached'});
 await release();
 await page.waitForTimeout(150);
 // Focus goes back to where it was before the test, not to the title bar.
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));
 assert.equal((await active()).inTitlebar, false, 'leaving Test must not also jump to the title bar');
 assert.equal(await page.locator('.mapping-plate').getAttribute('data-state'), 'studio');

 // Keyboard Esc also ends a test.
 await page.getByRole('button',{name:'Test'}).click();
 await page.locator('.test-banner').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('.test-banner').waitFor({state:'detached'});
 assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'keyboard', 'a real key switches the ring back to keyboard');

 assert.deepEqual(errors,[]);
 console.log('PASS: LT/RT paging, pad focus with controller ring, A opens and B closes, RB sections, View title-bar round trip, Test mode suspends navigation until View + Menu or Esc');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
