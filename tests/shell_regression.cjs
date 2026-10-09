// Console v2 (V1-V3, V6): one header row (game chip, tabs, status chip),
// tabs on LB/RB and sections on LT/RT, Settings as a rail of categories.
// The console-tab shell (console refinement 2a/2b/2f): the app opens on Home,
// whose Studio tiles lead to the Studio strip; a title bar with a Home chip and
// one state button; page tabs stepped by LT/RT, drawn as trigger glyphs; a
// section list per page; tuning as sheets rather than a Tuning menu;
// icon-only tabs below 1280px and a drawer below 1024px. Replaces
// sidebar_regression, whose rail no longer exists.
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
 await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
 const tabs = page.locator('.page-tabs');
 const title = page.locator('.page-header__title');
 const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
 const group = name => page.locator(`.app-shell[data-page-group="${name}"]`).waitFor();
 const homeChip = page.locator('.titlebar .home-chip');
 const studioColumn = page.locator('[aria-labelledby="home-studio-title"]');
 // Console v2 (V6): Studio is the Library (tabs) and Settings (rail).
 const libraryTabs = ['Games','Bases','Launch with game'];
 const settingsCategories = ['Controller','Hold to swap','Press timing','Hide the real controller','Look & language','Startup','Assistant','Guides & reference','Troubleshooting log','About & credits'];

 // Home (2a): the mark is a name, not a button, and there are no page tabs.
 // Studio is its own labelled column, nine tiles in Studio tab order.
 await page.locator('[data-home-continue]').waitFor({ timeout: 15000 });
 await group('home');
 assert.equal(await page.locator('.titlebar__brand').evaluate(el => el.tagName), 'DIV', 'the logo should not be clickable');
 assert.equal(await homeChip.count(), 0, 'Home has no Home chip');
 assert.equal(await page.locator('.titlebar .state-button').count(), 0, 'Home keeps Apply inside the card');
 assert.equal(await tabs.count(), 0);
 // Home v2: Your games ends on New for a game and the Library, then two doors.
 const homeButtons = (await studioColumn.getByRole('button').allInnerTexts()).map(t => t.split('\n')[0].trim());
 assert.deepEqual(homeButtons.slice(-4), ['New for a game','Library','Settings','Ask the assistant']);
 // No controller: Test stays on screen (tiles never hide) but idles and says why.
 const test = page.getByRole('button',{name:/^Test it/});
 assert.equal(await test.getAttribute('aria-disabled'), 'true');
 assert.match(await test.getAttribute('data-reason'), /Connect a controller/);
 // Home v2: A Edit layout, X Test it, Y Switch game; no "profiles · templates".
 assert.equal(await page.getByRole('button',{name:/^Edit layout/}).count(), 1);
 assert.equal(await page.getByRole('button',{name:/^Switch game/}).count(), 1);
 assert.doesNotMatch(await page.locator('.home-body').innerText(), /profiles|templates|Applied/i);
 // Quick tune changes gyro speed in place with Left and Right (changes apply live).
 const speed = page.getByRole('slider',{name:'Gyro speed'});
 const before = Number(await speed.getAttribute('aria-valuenow'));
 await speed.focus();
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(b => Number(document.querySelector('[aria-label="Gyro speed"]').getAttribute('aria-valuenow')) > b, before);
 // Home's footer: Edit layout, Test, Switch game and ☰ Options; no clock-less title bar.
 assert.match(await page.locator('.titlebar__clock').innerText(), /^\d\d:\d\d$/);
 assert.equal(await page.locator('.titlebar .mapping-plate').count(), 0, 'no mapping plate on Home');
 await page.locator('[data-home-continue]').focus();
 await page.waitForFunction(() => /Options/.test(document.querySelector('.hint-capsule')?.textContent ?? ''));
 await group('home');
 // The app opens on Home (console refinement 2a); these checks start in the editing shell.
 await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
 await page.locator('.profile-chip').filter({hasText:'Desktop'}).waitFor();
 await group('controls');

 // Title bar answers what is being edited and what pressing it will do: no
 // Undo/Redo/Save, and Applied is the one state button, not a segment.
 assert.equal(await page.locator('.titlebar').count(), 1);
 assert.equal(await homeChip.count(), 1);
 assert.equal(await page.locator('.context-segment--applied').count(), 0);
 const state = page.locator('.titlebar .state-button');
 // The quick tune above left an unsaved change only when something else was
 // unsaved; here it saved and went live by itself.
 await page.waitForFunction(() => document.querySelector('.titlebar .state-button')?.textContent === 'Live · saved', null, { timeout: 8000 });
 assert.equal(await state.innerText(), 'Live · saved');
 assert.equal(await state.getAttribute('data-tone'), 'applied');
 for (const name of ['Undo','Redo','Save configuration'])
   assert.equal(await page.locator('.titlebar').getByRole('button',{name,exact:true}).count(), 0, `${name} is still in the title bar`);
 for (const name of ['Layout','Buttons','Sticks','Triggers','Trackpads','Gyro','Menus','Layers'])
   assert.equal(await tabs.getByRole('button',{name,exact:true}).count(), 1, `${name} tab missing`);
 // LT/RT are the controller's own trigger art, never text (D11) -- while the
 // pad is the input in use. With the keyboard or mouse, they name the keys
 // that step pages instead (nav/inputSource.ts).
 await page.evaluate(() => { document.body.dataset.padConnected = 'true'; document.body.dataset.inputSource = 'controller' });
 assert.deepEqual(await tabs.locator('.trigger-mark svg').evaluateAll(els => els.map(el => el.dataset.glyph)), ['L','R']);
 await page.evaluate(() => { document.body.dataset.inputSource = 'keyboard' });
 assert.deepEqual(await tabs.locator('.trigger-mark kbd').allInnerTexts(), ['PgUp','PgDn'], 'the keyboard in use names its keys');
 assert.equal(await tabs.getByRole('button',{name:/^Tuning/}).count(), 0, 'the Tuning dropdown is back');
 assert.equal(await tabs.getByRole('button',{name:'Layout',exact:true}).getAttribute('aria-current'), 'page');
 // V3: one header row. The tabs live inside the title bar, which is 64px.
 assert.equal(await page.locator('.titlebar .page-tabs').count(), 1, 'the tabs are in the title bar row');
 assert.equal(Math.round((await page.locator('.titlebar').boundingBox()).height), 64, 'the one header row is 64px');
 assert.equal(await page.locator('.titlebar').getByRole('button',{name:/^Editing layer/}).count(), 0, 'the Editing layer dropdown is gone');
 assert.equal(await page.locator('.titlebar .mapping-plate').count(), 0, 'the Mapping dropdown folded into ☰');
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 1440');
 // No controller: the game chip says so, and Test is not in the bar.
 assert.match(await page.locator('.game-chip').innerText(), /No controller/);
 assert.equal(await page.getByRole('button',{name:'Test',exact:true}).count(), 0);
 // The capsule shows keys, not pad glyphs, with no controller connected.
 assert.ok(await page.locator('.hint-capsule kbd.hint-key').count() > 0, 'capsule should fall back to keyboard keys');
 assert.equal(await page.locator('.hint-capsule svg.hint-glyph').count(), 0);

 // A page with groups gets a section list; the first is current.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Buttons'}).waitFor();
 const sections = page.locator('.section-list .section-item');
 // Console v2 (V5): the D-pad is a section of Buttons.
 assert.equal(await sections.count(), 7);
 assert.ok((await sections.allInnerTexts()).some(label => /D-pad/i.test(label)), 'the D-pad has a section');
 assert.ok((await sections.allInnerTexts()).some(label => /Tilt|Motion/.test(label)), 'the native motion inputs have a section');
 await page.waitForFunction(() => document.querySelector('.section-item[aria-current="true"]'));
 assert.equal(await sections.first().getAttribute('aria-current'), 'true');
 // Choosing a section scrolls to it and the list follows.
 await sections.last().click();
 await page.waitForFunction(() => document.querySelector('.section-list .section-item:last-child')?.getAttribute('aria-current') === 'true');
 // Trackpads sets its pads side by side instead (2b), so it has no list.
 await tabs.getByRole('button',{name:'Trackpads',exact:true}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Trackpads'}).waitFor();
 // (Whether Trackpads has a rail is P4's call; console v2 Trackpads.)
 // Overview has no groups, so its column goes away.
 await tabs.getByRole('button',{name:'Layout',exact:true}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Layout'}).waitFor();
 assert.equal(await page.locator('.section-list').count(), 0);

 // Page Down / Page Up (RT / LT) walk the tabs in order.
 await page.locator('.shell-scroll').click({position:{x:5,y:5}});
 await page.keyboard.press('PageDown');
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Buttons'}).waitFor();
 await page.keyboard.press('PageUp');
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Layout'}).waitFor();

 // Studio is one press from Home: its own text-only tabs and a Studio title
 // bar with no configuration chip or state button (2f). The Home chip
 // replaces the back chip, and B on Studio goes Home.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Buttons'}).waitFor();
 await homeChip.click();
 await group('home');
 await studioColumn.getByRole('button',{name:/^Library/}).click();
 await title.filter({hasText:'Games'}).waitFor();
 await group('studio');
 assert.equal(await tabs.getByRole('button',{name:'Buttons',exact:true}).count(), 0, 'configuration tabs stay out of Studio');
 assert.deepEqual((await tabs.locator('.page-tab').allInnerTexts()).map(t => t.trim()), libraryTabs);
 // Every tab carries its icon for when the names do not fit (PageTabs' fit); at 1440 none shows.
 assert.equal(await tabs.locator('.page-tab svg').evaluateAll(els => els.filter(el => el.getClientRects().length > 0).length), 0, 'Studio tabs are words only');
 assert.match(await page.locator('.titlebar__studio').innerText(), /Library\s*For every configuration/);
 // Settings has no tab strip; its categories are the rail.
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })));
 await title.filter({hasText:'Controller'}).waitFor();
 assert.equal(await tabs.count(), 0, 'Settings has no tab strip');
 assert.deepEqual((await page.locator('.section-list .section-item').allInnerTexts()).map(t => t.trim()), settingsCategories);
 // LT/RT step the categories (the rail says "Category"); LB/RB do nothing here.
 assert.match(await page.locator('.section-list__keys').innerText(), /Category/);
 await page.locator('.shell-scroll').click({position:{x:5,y:5}});
 await page.keyboard.press('PageDown');
 await page.waitForTimeout(400);
 assert.equal((await title.innerText()).trim(), 'Controller', 'LB/RB do not step Settings categories');
 await page.keyboard.press(']');
 await title.filter({hasText:'Hold to swap'}).waitFor();
 await page.keyboard.press('[');
 await title.filter({hasText:/^Controller$/}).waitFor();
 await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'configurations' })));
 await title.filter({hasText:'Games'}).waitFor();
 assert.equal(await page.locator('.titlebar .profile-chip, .titlebar .state-button').count(), 0);
 assert.equal(await page.locator('.back-chip').count(), 0, 'the back chip should be gone; Home replaces it');
 await page.locator('.shell-scroll').click({position:{x:5,y:5}});
 await page.keyboard.press('Escape');
 await group('home');
 // B on Home goes nowhere: Home is the root, never a step forward into the
 // editor (UX review 2026-10-09, B6). Edit layout opens the last page edited.
 await page.keyboard.press('Escape');
 await page.waitForTimeout(300);
 await group('home');
 await page.locator('[data-home-continue]').click();
 await page.locator('.page-tab[aria-current="page"]').waitFor();
 await page.locator('.page-tabs').getByRole('button',{name:'Buttons',exact:true}).click();
 await page.locator('.page-tab[aria-current="page"]').filter({hasText:'Buttons'}).waitFor();

 // Below 1280: icons only, except the selected tab; the state button keeps its words.
 await page.setViewportSize({width:1100,height:720});
 await page.waitForFunction(() => document.querySelector('.app-shell')?.dataset.width === 'compact');
 assert.equal((await tabs.getByRole('button',{name:'Buttons',exact:true}).innerText()).trim(), 'Buttons');
 assert.equal((await tabs.getByRole('button',{name:'Triggers',exact:true}).innerText()).trim(), '', 'unselected tabs should be icons');
 assert.equal(await state.innerText(), 'Live · saved');
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
 await page.locator('.page-tabs__drawer-button').filter({hasText:'Triggers'}).waitFor();
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 900');

 assert.deepEqual(errors,[]);
 console.log('PASS: Home with Studio tiles and tuning sheets, Home chip and state button, glyph LT/RT tabs, section list, Studio tabs and B to Home, compact tabs and the narrow drawer');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
