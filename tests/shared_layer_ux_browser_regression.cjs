const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=['RESET_MAPPINGS','N = SPACE','E = F','JOY2 = LSHIFT','LEFT_STICK_MODE = NO_MOUSE','LEFT_STICK_DEADZONE_INNER = 0.15','LEFT_TOUCHPAD_MODE = MOUSE_AREA',
 '# @layer '+JSON.stringify({id:'driving',name:'Driving',overrides:{N:'BMOUSE',JOY2:'BMOUSE',LEFT_STICK_DEADZONE_INNER:'0.25',LSL:'FMOUSE',ZL_MODE:'NO_FULL',LEFT_TOUCHPAD_MODE:'NO_MOUSE'}}),
 '# @layer '+JSON.stringify({id:'weapons',name:'Weapons',overrides:{E:'3',JOY7:'3'}}),
 '# @layer-action MOUSE_BACK = hold weapons'].join('\n');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 for(const type of [24,5,25]){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/platform/desktopBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 const uxSource=${JSON.stringify(source)};
 desktopBridge.listLibraryProfiles=async()=>['UX test'];
 desktopBridge.getActiveProfile=async()=>({name:'UX test',path:'profiles-library/UX test.txt',content:uxSource});
 desktopBridge.loadLibraryProfile=async()=>({name:'UX test',content:uxSource});
 desktopBridge.saveLibraryProfile=async(name,content)=>({name});
 const uxSubscribe=desktopBridge.onTelemetrySample;
 desktopBridge.onTelemetrySample=callback=>uxSubscribe(sample=>callback({...sample,devices:[{...sample.devices?.[0],type:${type},handle:${type},vid:0,pid:0,controllerId:'type-${type}-device-ux'}]}));
 `})});
 await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1459/?mock');await page.locator('.app-shell').waitFor();
 const go=async id=>{await page.evaluate(detail=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail})),id);await page.waitForTimeout(500)};
 await go('overview');
 const strip=page.locator('[data-layer-selector]');await strip.getByRole('button',{name:'Driving',exact:true}).click();
 const input=type===25?'JOY2':'N';
 for(const theme of ['dark','light']){
 await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.accent='amber'},theme);
 for(const id of ['overview','buttons','joysticks','triggers','touchpad','gyro']){
  await go(id);assert.equal(await strip.count(),1,`${type} ${id}: one shared selector`);
  assert.equal(await strip.getByRole('button',{name:'Driving',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await strip.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)','No opaque selector rectangle');
  if(id==='buttons'){
   const row=page.locator(`details[data-input-command="${input}"] > summary`).first();await row.focus();
   assert(await row.locator('svg[aria-label="Mouse Back"]').count()>0,'Mouse output is an accessible icon');
   const art=page.locator(`[data-command="${input}"][data-layer-override], [data-input-command="${input}"][data-layer-override]`).first();
   assert(await art.count()>0,`${type}: changed physical control uses layer context`);
   const colors=await page.evaluate(input=>{const dot=document.querySelector(`details[data-input-command="${input}"] .origin-marker__dot`);const art=document.querySelector(`[data-command="${input}"][data-layer-override], [data-input-command="${input}"][data-layer-override]`);const probe=document.createElement('span');probe.style.color=getComputedStyle(art).getPropertyValue('--input-color');art.appendChild(probe);const color=getComputedStyle(probe).color;probe.remove();return[getComputedStyle(dot).backgroundColor,color]},input);
   assert.equal(colors[0],colors[1],`${type} ${theme}: row and art use same layer colour`);
   if(type===24 && theme==='dark'){
    const inherited=page.locator('details[data-input-command="E"]').first();
    await inherited.evaluate(el=>el.dispatchEvent(new Event('jsm:binding-details')));
    const details=page.getByRole('dialog');await details.waitFor();
    const used=details.locator('[data-used="true"]');assert.match(await used.innerText(),/Game · UX test/);assert.match(await used.innerText(),/F/);assert.doesNotMatch(await used.innerText(),/Weapons|JoyShockMapper/);
    assert(await details.getByText('When active: 3',{exact:true}).count()>0,'Other layers explicitly describe their active result');
    await page.keyboard.press('Escape');await details.waitFor({state:'hidden'});
   }
  }
 }
 await go('buttons');await page.locator('details[data-input-command]').first().waitFor({state:'visible'});await page.screenshot({path:`tests/tmp/ux-${type}-${theme}.png`});
 }
 await page.setViewportSize({width:900,height:800});await go('joysticks');assert(await strip.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
 await strip.getByRole('button',{name:'Default',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await strip.getByRole('button',{name:'Default',exact:true}).getAttribute('aria-pressed'),'true');
 await go('layers');assert.equal(await strip.count(),0,'All-layer management does not imply editing one layer');
 assert(await page.locator('svg[aria-label="Mouse Back"]').count()>0,'Layer activation uses mouse artwork');
 await go('settings');assert.equal(await strip.count(),0,'Global settings do not imply editing a game layer');
 assert.deepEqual(errors,[]);console.log(`PASS ${type}: shared context across six pages, mouse output/activation icons, override artwork, light/dark amber, narrow keyboard selection, global context`);await page.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
