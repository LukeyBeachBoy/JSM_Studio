// Isolated renderer checks; mocks never invoke a physical controller or runtime.
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
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_GRID_SIZE = 2 2\nLT1 = ENTER\nLT3 = TAB\nRIGHT_TOUCHPAD_MODE = MOUSE\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.__calls=[]; window.__lastApplied=''; window.__lastSaved='';
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{window.__lastSaved=content;window.__calls.push('save');if(window.__delaySave) await new Promise(resolve=>window.__finishSave=resolve);profiles[name]=content;window.__saved=true;return {name}},
   applyProfile:async(path,text)=>{window.__lastApplied=text;window.__calls.push('apply');return {path,mappingEnabled:true}},
  };
  window.telemetry={onSample:cb=>{
   const emit=()=>cb({console:'Mapper ready\nProfile loaded',activeProfile:'profiles-library/Desktop.txt',devices:[{handle:1,type:24,supportedButtons:8589934591,status:{buttons:0,leftStick:{x:0,y:0},rightStick:{x:0,y:0},triggers:{left:0,right:0},gyro:{x:0,y:0,z:0},leftPad:{x:0,y:0,touched:false},rightPad:{x:0,y:0,touched:true,pressure:0.02,speed:420}}}]});
   emit();const timer=setInterval(emit,100);return()=>clearInterval(timer);
  }};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.addLocatorHandler(page.getByRole('button',{name:'Keep them',exact:true}),async()=>{ await page.getByRole('button',{name:'Keep them',exact:true}).click() })
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})


 page.setDefaultTimeout(10000);
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 assert.equal(await page.locator('aside').getByText('Navigate with controller',{exact:true}).count(),0);
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-overview.png'),fullPage:true});
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const normal = page.locator('details[data-input-command="N"]');
 assert.equal(await normal.getAttribute('open'),null);
 await normal.locator(':scope > summary').click();
 // Console v2: a row opens its binding sheet in place ("When you…" and what each way of pressing sends).
 await normal.locator('[data-binding-sheet]').waitFor();
 assert.equal(await normal.getByRole('button',{name:/icon/i}).count(),0,'ordinary inputs cannot assign menu icons');
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-bindings.png'),fullPage:true});
 await page.getByRole('button',{name:'Trackpads',exact:true}).click();
 const left = page.locator('#trackpad-left');
 // Console v2 (P4): the touch stick is a card on the pad's front ("Touch
 // stick": the pad as one zone with a stick on it). Choose it and back to
 // "Zones you bind", and nothing is left behind in the file.
 const card = value => left.locator(`[role="radio"][data-value="${value}"]`);
 await card('ZONES').waitFor();
 assert.equal(await left.locator('[role="radio"][data-current="true"]').getAttribute('data-value'),'ZONES');
 await card('TOUCH_STICK').click();
 assert.equal(await left.locator('[role="radio"][data-current="true"]').getAttribute('data-value'),'TOUCH_STICK','the card writes a one-zone pad with a touch stick on it');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>/LEFT_TOUCH_STICK_MODE = NO_MOUSE/.test(window.__lastSaved));
 await card('ZONES').click();
 assert.equal(await left.locator('[role="radio"][data-current="true"]').getAttribute('data-value'),'ZONES');
 await page.keyboard.press('Control+s');
 await page.waitForFunction(()=>!/LEFT_TOUCH_STICK_MODE\s*=\s*\S/.test(window.__lastSaved));
 assert.match(await page.evaluate(()=>window.__lastSaved),/LEFT_GRID_SIZE = 2 2/);
 // A menu's look and where it sits on screen are one place now (2d): the
 // pad's On-screen menu row opens the On-screen menus view with this pad's
 // menu selected, and B (Escape) hands focus back to the row.
 const menuRowIn = scope => scope.locator('button').filter({has:page.locator('[class*="label"]',{hasText:/^On-screen menu$/})});
 assert.equal(await left.getByRole('button',{name:'Menu appearance',exact:true}).count(),0,'the Menu appearance disclosure is gone');
 await page.locator('.section-item').filter({hasText:'Right pad'}).click();
 await page.locator('#trackpad-right').waitFor();
 assert.equal(await menuRowIn(page.locator('#trackpad-right')).count(),0,'a mouse pad has no On-screen menu row');
 await page.locator('.section-item').filter({hasText:'Left pad'}).click();
 const menuRow = menuRowIn(left);
 assert.match(await menuRow.innerText(),/Arrange/);
 // The row names its own B ("A:Arrange;...;B:Back"); nothing adds a second (1h).
 assert.equal((await menuRow.getAttribute('data-hints')).match(/(^|;)B:/g).length,1,'B is declared once on the row');
 await menuRow.click();
 // The view is a console sub-page now (UX review I5): "Trackpads · Left pad ▸ On-screen menu".
 const menus = page.getByRole('dialog',{name:/On-screen menu$/});
 await menus.waitFor();
 assert.match(await menus.locator('.menus-chip[data-state="selected"]').innerText(),/Left pad/,'the menu it was opened from is selected');
 assert.equal(await menus.locator('.menus-screen__menu[data-state="selected"]').count(),1);
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-menus.png'),fullPage:true});
 await page.keyboard.press('Escape');
 await menus.waitFor({state:'detached'});
 assert.match(await page.evaluate(()=>document.activeElement?.textContent||''),/^On-screen menu/,'closing returns to the row that opened it');
 // Preferences is a Studio page, reached from Home (2a): the app mark is no
 // longer clickable; the Home chip is.
 assert.equal(await page.locator('.titlebar__brand').count(),0,'the editing title bar leads with the Home chip, not the app mark');
 await page.locator('.home-chip').click();
 await page.locator('.titlebar__brand').waitFor();
 assert.equal(await page.locator('.titlebar__brand').evaluate(el=>el.matches('button, [role=button], a')||!!el.closest('button, a')),false,'Home names the app; the mark is not a button');
 // Console v2: Settings ▸ Controller; the rows are switches, not toggle buttons.
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })));
 await page.getByRole('switch',{name:/^Navigate this app with the controller/}).waitFor();
 await page.screenshot({path:path.join(__dirname,'../tmp/redesign-settings.png'),fullPage:true});
 // Polling left Preferences for Studio's Press timing & polling page (2f).
 assert.equal(await page.getByText('Controller polling',{exact:true}).count(),0,'polling is not on the Controller page');
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'timing' })));
 await page.locator('[data-timing-row="polling"]').waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS: compact bindings, non-menu icons hidden, clearable modes, on-screen menus from the pad row, settings and polling in Studio');
 } finally { await browser.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
