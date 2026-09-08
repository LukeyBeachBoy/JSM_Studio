// The sidebar never scrolls sideways, collapses to icons, and remembers it.
// Isolated renderer check; mocks never invoke a physical controller or runtime.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
 const page = await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  const profiles={Desktop:'RESET_MAPPINGS\nN = SPACE\n'};
  window.electronAPI={
   getActiveProfile:async()=>({name:'Desktop',path:'profiles-library/Desktop.txt',content:profiles.Desktop}),
   listLibraryProfiles:async()=>Object.keys(profiles),
   loadLibraryProfile:async name=>({name,content:profiles[name]}),
   saveLibraryProfile:async(name,content)=>{profiles[name]=content;return {name}},
   applyProfile:async(path,text)=>({path,mappingEnabled:true}),
  };
  window.telemetry={onSample:cb=>{cb({console:'ready',activeProfile:'profiles-library/Desktop.txt',devices:[]});return()=>{}}};
 });
 await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420');
 const nav = page.locator('aside').first();
 await nav.waitFor();
 await page.locator('.profile-chip').waitFor();

 const sidewaysOverflow = () => nav.evaluate(node => node.scrollWidth - node.clientWidth);

 // Not merely hidden: the content has to actually fit, or collapsing it just
 // moves the clipping somewhere else.
 assert.equal(await sidewaysOverflow(), 0, 'the expanded sidebar overflows sideways');
 assert.equal(await nav.evaluate(n => getComputedStyle(n).overflowX), 'hidden');

 // Groups are labelled while there is room for labels.
 assert.equal(await nav.getByText('CONTROLS',{exact:true}).count(), 1);
 const expandedWidth = await nav.evaluate(n => n.getBoundingClientRect().width);

 await nav.getByRole('button',{name:'Collapse sidebar'}).click();
 await page.waitForFunction(w => document.querySelector('aside').getBoundingClientRect().width < w - 60, expandedWidth);

 assert.equal(await sidewaysOverflow(), 0, 'the collapsed sidebar overflows sideways');
 // The headings go, the grouping stays.
 assert.equal(await nav.getByText('CONTROLS',{exact:true}).count(), 0, 'group headings should be hidden when collapsed');
 assert.equal(await nav.locator('[class*=navSectionRule]').count(), 3, 'the three groups should still be separated');
 // The label leaves the screen but not the button.
 const buttons = nav.getByRole('button',{name:'Buttons'});
 assert.equal(await buttons.count(), 1, 'a collapsed item lost its accessible name');
 assert.equal(await buttons.evaluate(n => n.getAttribute('title')), 'Buttons', 'a collapsed item lost its tooltip');
 assert.equal(await buttons.innerText(), '', 'a collapsed item still renders its label');
 await buttons.click();
 await page.getByRole('heading',{name:/Face Buttons/}).first().waitFor();

 // The preference outlives the window.
 await page.reload();
 await nav.waitFor();
 await nav.getByRole('button',{name:'Expand sidebar'}).waitFor();
 assert.equal(await sidewaysOverflow(), 0);
 await nav.getByRole('button',{name:'Expand sidebar'}).click();
 await nav.getByText('CONTROLS',{exact:true}).waitFor();

 // The help dialog opens with its title at the top, not below a band of space.
 await nav.getByRole('button',{name:'Buttons'}).click();
 await page.getByRole('button',{name:/^Help: /}).first().waitFor();
 await page.getByRole('button',{name:/^Help: /}).first().click();
 const dialog = page.getByRole('dialog');
 await dialog.waitFor();
 const gap = await dialog.evaluate(node => {
   const title = node.querySelector('h2') ?? node.firstElementChild;
   return Math.round(title.getBoundingClientRect().top - node.getBoundingClientRect().top);
 });
 assert.ok(gap <= 28, `too much empty space above the help dialog title: ${gap}px`);

 assert.deepEqual(errors,[]);
 console.log('PASS: sidebar fits, collapses to labelled icons, remembers it; help dialog opens tight');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
