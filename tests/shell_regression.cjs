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
 const tabs = page.locator('.page-tabs');
 const title = page.locator('.page-header__title');
 const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
 const group = name => page.locator(`.app-shell[data-page-group="${name}"]`).waitFor();
 const homeChip = page.locator('.titlebar .home-chip');
 const studioColumn = page.locator('section[aria-labelledby="home-studio-title"]');
 const studioPages = ['Configurations','Associations','Global chords','Press timing & polling','AI assistant','Device visibility','Appearance','Preferences','Documentation','Credits','Debug console'];

 // Home (2a): the mark is a name, not a button, and there are no page tabs.
 // Studio is its own labelled column, nine tiles in Studio tab order.
 await page.locator('[data-home-continue]').waitFor({ timeout: 15000 });
 await group('home');
 assert.equal(await page.locator('.titlebar__brand').evaluate(el => el.tagName), 'DIV', 'the logo should not be clickable');
 assert.equal(await homeChip.count(), 0, 'Home has no Home chip');
 assert.equal(await page.locator('.titlebar .state-button').count(), 0, 'Home keeps Apply inside the card');
 assert.equal(await tabs.count(), 0);
 assert.deepEqual((await studioColumn.getByRole('button').allInnerTexts()).map(t => t.split('\n')[0].trim()), studioPages);
 // No controller: Test stays on screen (tiles never hide) but idles and says why.
 const test = page.getByRole('button',{name:'Test',exact:true});
 assert.equal(await test.getAttribute('aria-disabled'), 'true');
 assert.match(await test.getAttribute('data-reason'), /Connect a controller/);
 // Tuning is shortcuts in the configuration card that open sheets, not pages (D2).
 await page.getByRole('button',{name:/^Grip sensors/}).click();
 const sheet = page.locator('.sheet');
 assert.equal(await sheet.locator('.sheet__title').innerText(), 'Grip sensors');
 assert.match(await sheet.locator('.eyebrow').first().innerText(), /BUTTONS · GRIPS · DESKTOP/i);
 await page.keyboard.press('Escape');
 await sheet.waitFor({state:'detached'});
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
 assert.equal(await state.innerText(), '✓ Applied');
 assert.equal(await state.getAttribute('data-tone'), 'applied');
 for (const name of ['Undo','Redo','Save configuration'])
   assert.equal(await page.locator('.titlebar').getByRole('button',{name,exact:true}).count(), 0, `${name} is still in the title bar`);
 for (const name of ['Overview','Buttons','D-Pad','Triggers','Joysticks','Trackpads','Gyro','Layers'])
   assert.equal(await tabs.getByRole('button',{name,exact:true}).count(), 1, `${name} tab missing`);
 // LT/RT are the controller's own trigger art, never text (D11) -- while the
 // pad is the input in use. With the keyboard or mouse, they name the keys
 // that step pages instead (nav/inputSource.ts).
 await page.evaluate(() => { document.body.dataset.padConnected = 'true'; document.body.dataset.inputSource = 'controller' });
 assert.deepEqual(await tabs.locator('.trigger-mark svg').evaluateAll(els => els.map(el => el.dataset.glyph)), ['ZL','ZR']);
 await page.evaluate(() => { document.body.dataset.inputSource = 'keyboard' });
 assert.deepEqual(await tabs.locator('.trigger-mark kbd').allInnerTexts(), ['PgUp','PgDn'], 'the keyboard in use names its keys');
 assert.equal(await tabs.getByRole('button',{name:/^Tuning/}).count(), 0, 'the Tuning dropdown is back');
 assert.equal(await tabs.getByRole('button',{name:'Overview',exact:true}).getAttribute('aria-current'), 'page');
 for (const bar of ['.titlebar','.page-tabs'])
   assert.equal(Math.round((await page.locator(bar).boundingBox()).height), 56, `${bar} should be 56px`);
 assert.ok(await overflow() <= 1, 'the shell scrolls sideways at 1440');
 // No controller: the plate and the tab strip both say so, and Test is not in the bar.
 assert.match(await page.locator('.mapping-plate').innerText(), /No controller/);
 assert.match(await page.locator('.controller-status').innerText(), /No controller/);
 assert.equal(await page.getByRole('button',{name:'Test',exact:true}).count(), 0);
 // The capsule shows keys, not pad glyphs, with no controller connected.
 assert.ok(await page.locator('.hint-capsule kbd.hint-key').count() > 0, 'capsule should fall back to keyboard keys');
 assert.equal(await page.locator('.hint-capsule svg.hint-glyph').count(), 0);

 // A page with groups gets a section list; the first is current.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await title.filter({hasText:'Buttons'}).waitFor();
 assert.match(await page.locator('.page-header__eyebrow').innerText(), /DESKTOP · CONTROLS/i);
 assert.match(await page.locator('.page-header__purpose').innerText(), /Face buttons, bumpers/);
 const sections = page.locator('.section-list .section-item');
 assert.equal(await sections.count(), 6);
 assert.ok((await sections.allInnerTexts()).some(label => /Motion/.test(label)), 'the native motion inputs have a section');
 await page.waitForFunction(() => document.querySelector('.section-item[aria-current="true"]'));
 assert.equal(await sections.first().getAttribute('aria-current'), 'true');
 // Choosing a section scrolls to it and the list follows.
 await sections.last().click();
 await page.waitForFunction(() => document.querySelector('.section-list .section-item:last-child')?.getAttribute('aria-current') === 'true');
 // Trackpads sets its pads side by side instead (2b), so it has no list.
 await tabs.getByRole('button',{name:'Trackpads',exact:true}).click();
 await title.filter({hasText:'Trackpads'}).waitFor();
 assert.equal(await page.locator('.section-list').count(), 0, 'Trackpads should have no section list');
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

 // Studio is one press from Home: its own text-only tabs and a Studio title
 // bar with no configuration chip or state button (2f). The Home chip
 // replaces the back chip, and B on Studio goes Home.
 await tabs.getByRole('button',{name:'Buttons',exact:true}).click();
 await title.filter({hasText:'Buttons'}).waitFor();
 await homeChip.click();
 await group('home');
 await studioColumn.getByRole('button',{name:/^Configurations/}).click();
 await title.filter({hasText:'Configurations'}).waitFor();
 await group('studio');
 assert.equal(await tabs.getByRole('button',{name:'Buttons',exact:true}).count(), 0, 'configuration tabs stay out of Studio');
 assert.deepEqual((await tabs.locator('.page-tab').allInnerTexts()).map(t => t.trim()), studioPages);
 assert.equal(await tabs.locator('.page-tab svg').count(), 0, 'Studio tabs are words only');
 assert.match(await page.locator('.titlebar__studio').innerText(), /Studio\s*Applies to every configuration/);
 assert.equal(await page.locator('.titlebar .profile-chip, .titlebar .state-button').count(), 0);
 assert.equal(await page.locator('.back-chip').count(), 0, 'the back chip should be gone; Home replaces it');
 await page.locator('.shell-scroll').click({position:{x:5,y:5}});
 await page.keyboard.press('Escape');
 await group('home');
 // B on Home resumes the page you were editing.
 await page.keyboard.press('Escape');
 await title.filter({hasText:'Buttons'}).waitFor();

 // Below 1280: icons only, except the selected tab; the state button keeps its words.
 await page.setViewportSize({width:1100,height:720});
 await page.waitForFunction(() => document.querySelector('.app-shell')?.dataset.width === 'compact');
 assert.equal((await tabs.getByRole('button',{name:'Buttons',exact:true}).innerText()).trim(), 'Buttons');
 assert.equal((await tabs.getByRole('button',{name:'Triggers',exact:true}).innerText()).trim(), '', 'unselected tabs should be icons');
 assert.equal(await state.innerText(), '✓ Applied');
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
 console.log('PASS: Home with Studio tiles and tuning sheets, Home chip and state button, glyph LT/RT tabs, section list, Studio tabs and B to Home, compact tabs and the narrow drawer');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
