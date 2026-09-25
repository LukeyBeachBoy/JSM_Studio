// The console-tab shell (design handoff, JSM Shell 1c): title bar, page tabs
// stepped by LT/RT, a section list per page, Tuning behind a menu, Studio
// behind the app mark with a back chip, icon-only tabs below 1280px and a
// drawer below 1024px. Replaces sidebar_regression, whose rail no longer exists.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\n', Game:'RESET_MAPPINGS\nN = ENTER\n'};
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;return {name}},
   applyProfile:async(path)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{cb({console:'ready',activeProfile:'profiles-library/Desktop.txt',devices:[]});return()=>{}}};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();

 const tabs = page.locator('.page-tabs');
 const title = page.locator('.page-header__title');
 const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

 // Title bar answers what is being edited and what is applied; tabs carry the pages.
 assert.equal(await page.locator('.titlebar').count(), 1);
 assert.match(await page.locator('.context-segment--applied').innerText(), /Applied\s+Desktop/);
 for (const name of ['Overview','Buttons','D-Pad','Triggers','Joysticks','Trackpads','Gyro','Layers'])
   assert.equal(await tabs.getByRole('button',{name,exact:true}).count(), 1, `${name} tab missing`);
 assert.equal(await tabs.locator('.trigger-mark').allInnerTexts().then(t => t.join(' ')), 'LT RT');
 assert.equal(await tabs.getByRole('button',{name:'Overview',exact:true}).getAttribute('aria-current'), 'page');
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 1440');
 // No controller: the plate and the tab strip both say so, and Test is hidden.
 assert.match(await page.locator('.mapping-plate').innerText(), /No controller/);
 assert.match(await page.locator('.controller-status').innerText(), /No controller/);
 assert.equal(await page.getByRole('button',{name:'Test'}).count(), 0);
 // The capsule shows keys, not pad glyphs, with no controller connected.
 assert.ok(await page.locator('.hint-capsule kbd').count() > 0, 'capsule should fall back to keyboard keys');

 // A page with groups gets a section list; the first is current.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await title.filter({hasText:'Buttons'}).waitFor();
 assert.match(await page.locator('.page-header__eyebrow').innerText(), /DESKTOP · CONTROLS/i);
 assert.match(await page.locator('.page-header__purpose').innerText(), /Face buttons, bumpers/);
 const sections = page.locator('.section-list .section-item');
 assert.equal(await sections.count(), 5);
 await page.waitForFunction(() => document.querySelector('.section-item[aria-current="true"]'));
 assert.equal(await sections.first().getAttribute('aria-current'), 'true');
 // Choosing a section scrolls to it and the list follows.
 await sections.last().click();
 await page.waitForFunction(() => document.querySelector('.section-list .section-item:last-child')?.getAttribute('aria-current') === 'true');
 // Overview has no groups, so its column goes away.
 await tabs.getByRole('button',{name:'Overview',exact:true}).click();
 await title.filter({hasText:'Overview'}).waitFor();
 assert.equal(await page.locator('.section-list').count(), 0);

 // Page Down / Page Up (RT / LT) walk the tabs in order.
 await page.locator('.shell-scroll').click({position:{x:5,y:5}});
 await page.keyboard.press('PageDown');
 await title.filter({hasText:'Buttons'}).waitFor();
 await page.keyboard.press('PageUp');
 await title.filter({hasText:'Overview'}).waitFor();

 // Tuning pages sit behind the Tuning tab's menu.
 await tabs.getByRole('button',{name:/^Tuning/}).click();
 const tuning = (await page.getByRole('menuitem').allInnerTexts()).map(t => t.trim());
 assert.deepEqual(tuning, ['Grip sensors','Trackpad tuning','Menu layout','Press timing & polling','AI assistant']);
 await page.getByRole('menuitem',{name:'Grip sensors'}).click();
 await title.filter({hasText:'Grip sensors'}).waitFor();
 assert.equal(await tabs.locator('.page-tab--menu').getAttribute('aria-current'), 'page');

 // Studio is behind the app mark: its own tabs, and a chip back to where you were.
 await page.locator('.titlebar__brand').click();
 await title.filter({hasText:'Configurations'}).waitFor();
 assert.equal(await tabs.getByRole('button',{name:'Buttons',exact:true}).count(), 0, 'configuration tabs stay out of Studio');
 for (const name of ['Configurations','Associations','Global chords','Device visibility','Debug console','Preferences','Documentation'])
   assert.equal(await tabs.getByRole('button',{name,exact:true}).count(), 1, `${name} Studio tab missing`);
 assert.match(await page.locator('.back-chip').innerText(), /Desktop · Grip sensors/);
 await page.locator('.back-chip').click();
 await title.filter({hasText:'Grip sensors'}).waitFor();

 // Below 1280: icons only, except the selected tab; Applied folds away.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await page.setViewportSize({width:1100,height:720});
 await page.waitForFunction(() => document.querySelector('.app-shell')?.dataset.width === 'compact');
 assert.equal((await tabs.getByRole('button',{name:'Buttons',exact:true}).innerText()).trim(), 'Buttons');
 assert.equal((await tabs.getByRole('button',{name:'Triggers',exact:true}).innerText()).trim(), '', 'unselected tabs should be icons');
 assert.equal(await page.locator('.context-segment--applied').count(), 0);
 assert.equal(Math.round((await page.locator('.section-list').boundingBox()).width), 184);
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 1100');

 // Below 1024: one drawer button naming page and section; the drawer traps and returns focus.
 await page.setViewportSize({width:900,height:700});
 const drawerButton = page.locator('.page-tabs__drawer-button');
 await drawerButton.waitFor();
 assert.match(await drawerButton.innerText(), /Buttons\s*·\s*\S/);
 assert.equal(await page.locator('.section-list').count(), 0);
 await drawerButton.click();
 const drawer = page.getByRole('dialog',{name:'Navigation'});
 await drawer.waitFor();
 assert.ok(await drawer.locator('.nav-subitem').count() >= 5, 'the current page should unfold its sections');
 await page.keyboard.press('Escape');
 await drawer.waitFor({state:'detached'});
 assert.equal(await drawerButton.evaluate(el => el === document.activeElement), true, 'focus should return to the drawer button');
 await drawerButton.click();
 await drawer.getByRole('button',{name:'Triggers',exact:true}).click();
 await title.filter({hasText:'Triggers'}).waitFor();
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 900');

 assert.deepEqual(errors,[]);
 console.log('PASS: title bar context, page tabs with LT/RT stepping, section list, Tuning menu, Studio tabs with back chip, compact tabs and the narrow drawer');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
