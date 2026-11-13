const assert = require('node:assert/strict');
const {chromium} = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:900,height:800}}), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const folder='C:\\Users\\Example user\\AppData\\Roaming\\com.lukeybeachboy.jsmstudio\\jsm-runtime\\profiles-library';
    await page.route('**/src/platform/desktopBridge.ts*',async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:await response.text()+`
        desktopBridge.getConfigDirectory=async()=>${JSON.stringify(folder)};
        desktopBridge.openConfigDirectory=async()=>{window.__configFolderOpened=true};
      `});
    });
    await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1425/?mock');
    await page.locator('.app-shell').waitFor();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'configurations'})));
    const disclosure=page.locator('[data-config-directory]');
    await disclosure.locator('summary').click();
    assert.equal(await disclosure.locator('p').innerText(),folder);
    assert(await disclosure.evaluate(el=>el.scrollWidth<=el.clientWidth),'folder path wraps at minimum window width');
    await disclosure.getByRole('button',{name:'Open folder',exact:true}).click();
    await page.waitForFunction(()=>window.__configFolderOpened);
    assert.deepEqual(errors,[]);
    console.log('PASS: native config path is visible, wraps at minimum width, and opens the same folder');
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
