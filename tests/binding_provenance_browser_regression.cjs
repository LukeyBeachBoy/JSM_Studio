const assert=require('node:assert/strict');const fs=require('node:fs');const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base='N = SPACE\nE = F\nW = Q\nS = NONE\nJOY1 = SPACE\nJOY2 = Q\nJOY3 = F\nJOY4 = NONE\nLUP = W\nLEFT_STICK_MODE = NO_MOUSE\n';
const source=['RESET_MAPPINGS','profiles-library/FPS.txt','W = R','JOY2 = R','LEFT_STICK_DEADZONE_INNER = 0.25','# @layer '+JSON.stringify({id:'driving',name:'Driving',overrides:{E:'C',S:'NONE',JOY3:'C',JOY4:'NONE'}})].join('\n');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{for(const type of [24,5,25,6,3]){
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/src/platform/desktopBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
const sourceTest=${JSON.stringify(source)},baseTest=${JSON.stringify(base)};
desktopBridge.listLibraryProfiles=async()=>['Source test'];desktopBridge.getActiveProfile=async()=>({name:'Source test',path:'profiles-library/Source test.txt',content:sourceTest});desktopBridge.loadLibraryProfile=async()=>({name:'Source test',content:sourceTest});desktopBridge.saveLibraryProfile=async name=>({name});
const baseRead=desktopBridge.readConfigFile;desktopBridge.readConfigFile=async path=>path==='profiles-library/FPS.txt'?baseTest:baseRead(path);
const sourceSub=desktopBridge.onTelemetrySample;desktopBridge.onTelemetrySample=callback=>sourceSub(sample=>callback({...sample,devices:[{...sample.devices?.[0],type:${type},handle:${type},vid:0,pid:0,controllerId:'type-${type}-device-1111111111111111'}]}));
`})});
await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1461/?mock');await page.locator('.app-shell').waitFor();
const go=async id=>{await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail})),id);await page.waitForTimeout(500)};
await go('buttons');await page.getByRole('list',{name:'Binding sources'}).getByText('Base',{exact:true}).waitFor();
const keys=type===25?['JOY1','JOY2','JOY3','JOY4']:['N','W','E','S'];const row=key=>page.locator(`details[data-input-command="${key}"] > summary`).first();
const marker=key=>row(key).locator('.origin-marker').first();
for(const theme of ['dark','light']){
await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.accent='amber'},theme);
await page.getByRole('group',{name:'Editing layer'}).getByRole('button',{name:'Default',exact:true}).click();
assert.equal(await marker(keys[0]).getAttribute('data-binding-source'),'base');assert.equal(await marker(keys[1]).getAttribute('data-binding-source'),'game');assert.equal(await marker(keys[2]).getAttribute('data-binding-source'),'base');assert.equal(await marker(keys[3]).count(),0);
assert.match(await marker(keys[0]).getAttribute('title'),/FPS/);
await page.getByRole('group',{name:'Editing layer'}).getByRole('button',{name:'Driving',exact:true}).click();
for(const [i,kind] of [[0,'base'],[1,'game'],[2,'layer'],[3,'layer']]){
assert.equal(await marker(keys[i]).getAttribute('data-binding-source'),kind,`${type}/${theme} row source ${keys[i]}`);
const art=page.locator(`svg [data-command="${keys[i]}"][data-binding-source], svg [data-input-command="${keys[i]}"][data-binding-source]`).first();assert.equal(await art.getAttribute('data-binding-source'),kind,`${type} artwork source`);
const colors=await page.evaluate(key=>{const row=document.querySelector(`details[data-input-command="${key}"] .origin-marker`);const art=document.querySelector(`svg [data-command="${key}"][data-binding-source], svg [data-input-command="${key}"][data-binding-source]`);const p=document.createElement('span');p.style.color=getComputedStyle(art).getPropertyValue('--input-color');document.body.appendChild(p);const c=getComputedStyle(p).color;p.remove();return[getComputedStyle(row).color,c]},keys[i]);assert.equal(colors[0],colors[1]);
}
const colors=await Promise.all(keys.slice(0,3).map(k=>marker(k).evaluate(el=>getComputedStyle(el).color)));assert.equal(new Set(colors).size,3,'Three distinct source colours');
const shapes=await Promise.all(keys.slice(0,3).map(k=>marker(k).locator('.binding-source-mark').evaluate(el=>({border:getComputedStyle(el).borderRadius,fill:getComputedStyle(el).backgroundColor,transform:getComputedStyle(el).transform}))));assert.equal(shapes[0].fill,'rgba(0, 0, 0, 0)');assert.notEqual(shapes[0].transform,'none');assert.notEqual(shapes[1].border,shapes[2].border,'Game circle and layer square differ');
await page.screenshot({path:`tests/tmp/sources-${type}-${theme}.png`});
}
await go('overview');assert.equal(await page.getByRole('list',{name:'Binding sources'}).count(),1);assert.equal(await page.locator('[aria-label*="[object Object]"]').count(),0);
if(type===25){const baseCallout=page.locator(`[data-overview-input="${keys[0]}"]`);assert.equal(await baseCallout.getAttribute('data-binding-source'),'base')}
await page.setViewportSize({width:900,height:800});await go('buttons');assert(await page.getByRole('list',{name:'Binding sources'}).evaluate(el=>el.scrollWidth<=el.clientWidth+1));
assert.deepEqual(errors,[]);console.log(`PASS ${type}: inherited/game/layer source persists across views; row/art colours; accessible shapes; light/dark and narrow layout`);await page.close();
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
