// Studio reads the pad itself while it has focus (design handoff, "native
// controller navigation"): LT/RT page, LB/RB section, D-pad moves, A opens,
// B backs out, View goes Home from anywhere, Menu opens the Configuration menu,
// and Test hands the pad to the configuration until View + Menu is held.
// Driven through the same telemetry stream the live preview uses, with a
// scripted pad.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
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
  // While Studio is in front the mapper runs Studio's navigation profile; a
  // held global chord swaps its own configuration in (activeProfile follows).
  window.__live='AppNavigation.txt';
  // Web builds record the controller feedback they would send (nav/feedback.ts).
  window.__padFeedback=[];
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'ready',activeProfile:window.__live,devices:[{handle:1,type:24,supportedButtons:8589934591,
     status:{buttons:[...window.__held].reduce((m,c)=>m+2**BITS[c],0),leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:window.__triggers,gyro:{x:0,y:0,z:0}}}]});
   emit();const timer=setInterval(emit,10);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await page.locator('.mapping-plate[data-state="studio"]').waitFor();

 const hold = async buttons => page.evaluate(b => b.forEach(x => window.__held.add(x)), buttons);
 const release = async buttons => page.evaluate(b => b ? b.forEach(x => window.__held.delete(x)) : window.__held.clear(), buttons);
 const press = async (...buttons) => { await hold(buttons); await page.waitForTimeout(60); await release(buttons); await page.waitForTimeout(80); };
 // A soft pull, half way: that is enough to turn a page (padNavigator's
 // TRIGGER_ON), well short of the full pull the Triggers page draws.
 const pull = async (side, amount = 0.5) => { await page.evaluate(([s, v]) => { window.__triggers[s] = v }, [side, amount]); await page.waitForTimeout(60); await page.evaluate(s => { window.__triggers[s] = 0 }, side); await page.waitForTimeout(80); };
 const title = () => page.locator('.page-header__title').innerText();
 const active = () => page.evaluate(() => { const a = document.activeElement; return { cls: String(a?.className ?? ''), text: (a?.textContent ?? '').trim().slice(0, 40), inTitlebar: Boolean(a?.closest('.titlebar')), inMain: Boolean(a?.closest('.main-pane')) }; });

 // RT / LT page through the tabs. Short of the page-turn point, nothing.
 await pull('right', 0.42);
 assert.equal(await title(), 'Overview', 'a pull under the page-turn point does not page');
 assert.deepEqual(await page.evaluate(() => window.__padFeedback.length), 0, 'and is not felt');
 await pull('right');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');
 await pull('left');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Overview');
 await pull('right');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');
 // Each page step is felt on the side of the trigger pulled: a firm click.
 const felt = async () => page.evaluate(() => window.__padFeedback.splice(0).map(f => `${f.effect}:${f.side}`));
 assert.deepEqual(await felt(), ['2:2', '2:1', '2:2'], 'RT, LT, RT each play a click on their own side');
 await pull('left'); await pull('left');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Overview');
 const ends = await page.evaluate(() => window.__padFeedback.splice(0).map(f => f.intensity));
 assert.ok(ends.length === 2 && ends[1] < ends[0], `LT on the first page is felt, but softer than a real page step: ${ends}`);
 await pull('right');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');
 await felt();

 // A global chord held: its configuration owns the pad (RT clicks the mouse
 // there), so Studio must not page -- not while held, and not when the chord
 // is released with RT still pulled.
 await page.evaluate(() => { window.__live = 'profiles-library/Quick Access Chord.txt' });
 await page.waitForTimeout(60);
 await page.evaluate(() => { window.__triggers.right = 1 });
 await page.waitForTimeout(150);
 assert.equal(await title(), 'Buttons', 'RT inside a held chord must not change page');
 await page.evaluate(() => { window.__live = 'AppNavigation.txt' });
 await page.waitForTimeout(150);
 assert.equal(await title(), 'Buttons', 'RT still held as the chord ends must not change page');
 assert.deepEqual(await felt(), [], 'and nothing is felt from Studio while the chord has the pad');
 await page.evaluate(() => { window.__triggers.right = 0 });
 await page.waitForTimeout(80);

 // The pad lands in the page, and its focus shows the controller ring.
 await press('DOWN');
 await page.waitForFunction(() => document.activeElement?.closest('.main-pane'));
 assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'controller');
 // The ring is the shared focus-glide highlight, sitting on the focused row.
 await page.waitForFunction(() => document.querySelector('.focus-glide')?.dataset.visible === 'true');
 const glide = await page.evaluate(() => {
  const highlight = document.querySelector('.focus-glide');
  const target = document.activeElement.closest('.setting-row') ?? document.activeElement;
  const a = highlight.getBoundingClientRect(), b = target.getBoundingClientRect();
  const probe = document.createElement('i'); probe.style.color = 'var(--focus-controller)'; document.body.append(probe);
  const focusColor = getComputedStyle(probe).color; probe.remove();
  return { focusColor, ring: getComputedStyle(highlight).boxShadow, visible: highlight.dataset.visible, off: Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width)) };
 });
 assert.ok(glide.ring.includes(glide.focusColor), `controller focus should draw the configured focus-controller ring: ${glide.ring}`);
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

 // View is Home from anywhere (console refinement D10); B on Home comes back
 // to where it was. Home's default focus is Continue editing.
 const group = () => page.evaluate(() => document.querySelector('.app-shell')?.dataset.pageGroup);
 await summary.focus();
 await press('-');
 await page.locator('.app-shell[data-page-group="home"]').waitFor();
 await page.waitForFunction(() => document.activeElement?.matches('[data-home-continue]'));
 await press('E');
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Buttons');
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));
 // Up from the page tabs still reaches the title bar.
 for (let step = 0; step < 6 && !(await active()).cls.includes('page-tab'); step++) await press('UP');
 assert.match((await active()).cls, /page-tab/, 'Up from the page walks out to the page tabs');
 await press('UP');
 await page.waitForFunction(() => document.activeElement?.closest('.titlebar'));
 // ... and View from the title bar is Home too.
 await press('-');
 await page.locator('.app-shell[data-page-group="home"]').waitFor();
 await press('E');
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));

 // Menu opens the Configuration menu; View closes it first, then goes Home.
 await press('+');
 await page.locator('.config-menu').waitFor();
 await page.waitForFunction(() => document.activeElement?.closest('.config-menu'));
 await press('-');
 await page.locator('.config-menu').waitFor({state:'detached'});
 await page.locator('.app-shell[data-page-group="home"]').waitFor();
 // A Studio page has no configuration menu, and B there is Home.
 await page.getByRole('button',{name:/^Press timing & polling/}).click();
 await page.waitForFunction(() => document.querySelector('.page-header__title')?.textContent === 'Press timing & polling');
 assert.equal(await group(), 'studio');
 await press('+');
 await page.waitForTimeout(150);
 assert.equal(await page.locator('.config-menu').count(), 0, 'Menu does nothing on a Studio page');
 await press('E');
 await page.locator('.app-shell[data-page-group="home"]').waitFor();
 await press('E');
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));

 // Test hands the pad to the configuration: navigation stops until View + Menu is held.
 // Test is in the Configuration menu now (1e), reached with the pad.
 await press('+');
 await page.locator('.config-menu').waitFor();
 for (let step = 0; step < 8 && !(await active()).text.includes('Test while editing'); step++) await press('DOWN');
 assert.match((await active()).text, /Test while editing/);
 await press('S');
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
 // Focus goes back to where it was before the test: not to the title bar,
 // and the View in the chord does not also go Home.
 await page.waitForFunction(() => document.activeElement?.closest('details[data-input-command="N"]'));
 assert.equal((await active()).inTitlebar, false, 'leaving Test must not also jump to the title bar');
 assert.equal(await group(), 'controls', 'leaving Test must not also go Home');
 assert.equal(await page.locator('.mapping-plate').getAttribute('data-state'), 'studio');

 // Keyboard Esc also ends a test (started with the mouse this time, from the
 // configuration chip's "Configuration menu…").
 await page.locator('.profile-chip').click();
 await page.getByRole('menuitem',{name:/^Configuration menu/}).click();
 await page.locator('.config-menu__item').filter({hasText:'Test while editing'}).click();
 await page.locator('.test-banner').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('.test-banner').waitFor({state:'detached'});
 assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'keyboard', 'a real key switches the ring back to keyboard');

 assert.deepEqual(errors,[]);
 console.log('PASS: LT/RT paging, pad focus with controller ring, A opens and B closes, RB sections, View Home and B back, Up to the title bar, Menu opens the Configuration menu (not on Studio), Test mode suspends navigation until View + Menu or Esc');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
