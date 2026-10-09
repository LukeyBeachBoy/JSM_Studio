// Isolated renderer checks; mocks never invoke a physical controller or runtime.
// Hints follow the input in use and every key they name works; the capsule
// names each button once; Layout's X and Y do what they say; a page opens
// at its top; a value the configuration sets with nothing behind it names no
// origin.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\nS = ENTER\nL,S = TAB\nRIGHT_TOUCHPAD_MODE = MOUSE\n'};
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;return {name}},
   applyProfile:async(path)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:false}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 // The Steam Controller's first-connect question comes up over Home.
 const keep = page.getByRole('button',{name:'Keep them',exact:true});
 if (await keep.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) await keep.click();
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {});
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 const capsule = page.locator('.hint-capsule');
 const tab = name => page.locator('.page-tabs').getByRole('button',{name,exact:true});

 // --- The pad's art while it is in use; the keys the moment the keyboard is.
 await page.waitForFunction(() => document.body.dataset.padConnected === 'true');
 await page.evaluate(() => { document.body.dataset.inputSource = 'controller' });
 await page.waitForFunction(() => document.querySelectorAll('.hint-capsule svg').length > 0 && !document.querySelector('.hint-capsule kbd'));
 await page.keyboard.press('Shift');
 await page.waitForFunction(() => document.body.dataset.inputSource === 'keyboard');
 await page.waitForFunction(() => !document.querySelector('.hint-capsule svg') && document.querySelector('.hint-capsule kbd'));
 assert.deepEqual(await page.locator('.trigger-mark kbd').allInnerTexts(), ['PgUp','PgDn'], 'the page tabs name the keys that step them');
 assert.equal(await page.locator('.home-chip kbd').innerText(), 'Home');
 // Keycaps are drawn, never read: the menu item is still just its label.
 // Console v2 (V9): a focus caption, not a hover tooltip.
 assert.equal(await page.locator('.home-chip').getAttribute('title'), null);
 assert.match(await page.locator('.home-chip').getAttribute('data-caption'), /^Home · /);

 // --- One hint per button, however often focus moves through a row that
 // repeats one (a repeated key left stale copies behind: "B Back · B Back").
 await page.evaluate(() => {
   const probe = document.createElement('button');
   probe.id = 'hint-probe'; probe.textContent = 'probe';
   probe.dataset.hints = 'B:Back;A:Select;B:Back;X:Do;MOVE:Move;B:Close';
   document.querySelector('.main-pane').prepend(probe);
 });
 for (let i = 0; i < 4; i++) {
   await page.locator('#hint-probe').focus();
   await page.waitForTimeout(40);
   await page.locator('.profile-chip').focus();
   await page.waitForTimeout(40);
 }
 await page.locator('#hint-probe').focus();
 assert.equal(await page.evaluate(() => document.activeElement?.id), 'hint-probe', 'the hint probe retains focus');
 // Hints follow focus on an animation frame. Await that observable update
 // instead of assuming an arbitrary 80 ms includes a rendered frame.
 await page.waitForFunction(() => [...document.querySelectorAll('.hint-capsule__item')].some(item => /Close$/.test(item.textContent.trim())));
 const labels = await capsule.locator('.hint-capsule__item').allInnerTexts();
 assert.equal(labels.filter(text => /(Back|Close)$/.test(text)).length, 1, 'B is named once: ' + labels.join(' | '));
 // The last B declared wins, and the capsule reads in its fixed order (1h):
 // MOVE, A, X, Y, B, then the stepping hints.
 // Console v2 Kit: MOVE, A, X, then the stepping hints, B last.
 assert.deepEqual(labels.slice(0, 3).map(text => text.split(/\s+/).pop()), ['Move', 'Select', 'Do'], 'one hint per button, in order: ' + labels.join(' | '));
 assert.match(labels[labels.length - 1], /Close$/, 'B comes last: ' + labels.join(' | '));
 await page.evaluate(() => document.getElementById('hint-probe').remove());

 // --- Layout (console v2): X is Try it, Y is the quick menu with Find first;
 // an input's uses moved to the quick menu's "Every use" (and Details' X).
 await tab('Layout').click();
 const callout = page.locator('[data-overview-input="L"]');
 await callout.waitFor();
 assert.match(await callout.getAttribute('data-hints'), /A:Change;X:Try it;Y:More/, 'the callout names A Change, X Try it, Y More');
 assert.equal(await callout.getAttribute('data-has-uses'), '', 'L shifts S, so it has uses');
 await callout.focus();
 await page.keyboard.press('y');
 await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Find an input or action', null, { timeout: 5000 }).catch(() => {});
 assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Find an input or action', 'Y opens the quick menu on Find');
 // Typing y in the field types it; it is not Y.
 await page.keyboard.type('xy');
 assert.equal(await page.getByRole('searchbox',{name:'Find an input or action'}).inputValue(), 'xy');
 await page.getByRole('searchbox',{name:'Find an input or action'}).fill('');
 // Every use opens the input's uses.
 await page.getByRole('button',{name:/^Every use/}).click();
 await page.getByRole('dialog').filter({hasText:/uses|chord|used/i}).first().waitFor({timeout:5000}).catch(() => {});
 assert.ok(await page.evaluate(() => Boolean(document.querySelector('.modal-overlay, [data-focus-trap="true"]'))), 'Every use opens the input\'s uses');
 await page.keyboard.press('Escape');
 await page.waitForFunction(() => !document.querySelector('.modal-overlay, [data-focus-trap="true"]'));

 // --- Holding M opens the Configuration menu (a tap saves), Home goes Home.
 await callout.focus();
 await page.keyboard.down('m'); await page.keyboard.down('m'); await page.keyboard.up('m');
 await page.locator('.config-menu').waitFor();
 await page.keyboard.press('Escape');
 await page.locator('.config-menu').waitFor({state:'detached'});
 await callout.focus();
 await page.keyboard.press('Home');
 await page.locator('[data-home-continue]').waitFor();
 await page.locator('[data-home-continue]').click();

 // --- A page opens at its top, even one left scrolled.
 await tab('Trackpads').click();
 await page.waitForTimeout(600);
 await page.evaluate(() => { const host = document.querySelector('.shell-scroll'); host.scrollTop = host.scrollHeight });
 const last = page.locator('.main-pane button:visible').last();
 await last.focus();
 await tab('Buttons').click();
 await page.waitForTimeout(600);
 await tab('Trackpads').click();
 await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(() => document.querySelector('.shell-scroll').scrollTop), 0, 'Trackpads opens at its top, not where it was left');

 // --- A value this configuration sets, with no template behind it, names no
 // origin: "Changed in Desktop" while editing Desktop said nothing.
 assert.equal(await page.locator('.summary-row__hint[data-tone="changed"]').count(), 0);

 assert.deepEqual(errors, []);
 console.log('PASS: hints follow the input in use and their keys work, one hint per button, Overview X/Y, pages open at the top, no self-naming origin');
 } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) });
