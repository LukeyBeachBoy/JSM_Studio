const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:360,height:112},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:1461/slottoast.html?demo');await page.getByRole('status').waitFor();
 for(const theme of ['dark','light']){
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.accent='amber'},theme);
 assert.equal(await page.locator('strong').innerText(),'Gaming');
 const geometry=await page.locator('.slot-confirmation').evaluate(el=>{const c=el.getBoundingClientRect(),text=el.querySelector('.slot-copy').getBoundingClientRect();return {x:c.x,y:c.y,right:c.right,bottom:c.bottom,textTop:text.top,textBottom:text.bottom,bg:getComputedStyle(el).backgroundColor,pointer:getComputedStyle(el).pointerEvents,animation:getComputedStyle(el).animationName}});
 assert(geometry.x>=0&&geometry.y>=0&&geometry.right<=360&&geometry.bottom<=112);
 assert(geometry.textTop>=geometry.y+12&&geometry.textBottom<=geometry.bottom-12);assert.notEqual(geometry.bg,'rgba(0, 0, 0, 0)');assert.equal(geometry.pointer,'none');assert.equal(geometry.animation,'none');
 await page.screenshot({path:`tests/tmp/slot-toast-${theme}.png`});
 }
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('slot-confirmation',{detail:{revision:2,id:2,name:'Desktop',profileName:'Desktop'}})));
 await page.waitForFunction(()=>document.querySelector('strong')?.textContent==='Desktop');assert.equal(await page.getByRole('status').count(),1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('slot-confirmation',{detail:{revision:1,id:1,name:'Old slot',profileName:'Old'}})));
 assert.equal(await page.locator('strong').innerText(),'Desktop');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('slot-confirmation',{detail:{revision:3,id:4,name:'An unusually long slot name '.repeat(4),profileName:'A very long configuration name '.repeat(5)}})));
 await page.waitForTimeout(100);assert(await page.locator('.slot-copy').evaluate(el=>el.getBoundingClientRect().right<=document.querySelector('.slot-check').getBoundingClientRect().left));
 await page.screenshot({path:'tests/tmp/slot-toast-long.png'});
 await page.emulateMedia({reducedMotion:'no-preference'});
 assert.equal(await page.locator('.slot-confirmation').evaluate(el=>getComputedStyle(el).animationName),'slot-confirmation');
 assert.deepEqual(errors,[]);console.log('PASS: toast geometry, light/dark, long names, reduced motion, latest-switch replacement and stale-event rejection');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
