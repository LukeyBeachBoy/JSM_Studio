const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const source=['RESET_MAPPINGS','VIRTUAL_CONTROLLER = XBOX','# @controller-layout type-24','# @controller-layout type-25','# @controller type-25 JOY2 = LSHIFT','# @controller type-25 JOY7 = LALT','# @controller type-25 JOY8 = NONE','# @controller type-25 JOY9 = F','# @controller type-25 # @label JOY2 = Sprint','# @controller type-25 # @label JOY9 = Interact',
 '# @controller type-25 # @layer '+JSON.stringify({id:'cyborg-driving',name:'Driving',overrides:{JOY2:'SPACE',JOY9:'!F\\ "LAYER_REMOVE cyborg-driving"_','# @label JOY9':'Exit vehicle'}}),
 '# @controller type-25 # @layer '+JSON.stringify({id:'cyborg-weapons',name:'Weapons',overrides:{JOY7:'2',JOY8:'3',JOY9:'4','# @label JOY8':'Weapon 3'}}),
 '# @controller type-25 # @layer-action JOY25 = toggle cyborg-driving','# @controller type-25 # @layer-action MOUSE_BACK = hold cyborg-weapons'].join('\n');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/platform/desktopBridge.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 const layerTestSource=${JSON.stringify(source)};
 desktopBridge.listLibraryProfiles=async()=>['Cyberpunk'];
 desktopBridge.getActiveProfile=async()=>({name:'Cyberpunk',path:'profiles-library/Cyberpunk.txt',content:layerTestSource});
 desktopBridge.loadLibraryProfile=async()=>({name:'Cyberpunk',content:layerTestSource});
 desktopBridge.saveLibraryProfile=async(name,content)=>({name});
 const layerTestSubscribe=desktopBridge.onTelemetrySample;
 desktopBridge.onTelemetrySample=callback=>layerTestSubscribe(sample=>callback({...sample,devices:[{...sample.devices?.[0],type:25,handle:25,controllerId:'type-25-device-test0001'}]}));
 `})});
 await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1422/?mock');await page.locator('.app-shell').waitFor();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'overview'})));
 await page.locator('[data-layer-selector]').getByRole('button',{name:'Driving',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'Controller to configure'}).click();
 assert.equal(await page.getByRole('option').filter({hasText:'Azeron Cyborg'}).count(),1,'One physical Cyborg, no duplicate model entry');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Buttons',exact:true}).click();
 const strip=page.locator('[data-layer-selector]');await strip.getByRole('button',{name:'Default',exact:true}).waitFor();
 const row=n=>page.locator(`details[data-input-command="JOY${n}"] > summary`).first();
 assert.match(await row(8).innerText(),/Not set/);assert.doesNotMatch(await row(8).innerText(),/Weapons|Weapon 3/);
 await strip.getByRole('button',{name:'Driving',exact:true}).click();
 await row(9).focus();await page.waitForTimeout(100);
 const text=await row(9).innerText();assert.match(text,/Hold: Turn off Driving/);assert.doesNotMatch(text,/cyborg-driving|LAYER_REMOVE|Driving layer press|Weapons active/);
 assert.doesNotMatch(await row(2).innerText(),/Sprint|Driving layer/,'A changed output must not inherit the old action name');
 const marker=row(9).locator('.origin-marker__dot');const art=page.locator('[data-command="JOY9"][data-layer-override="true"]').first();
 const colors=await page.evaluate(()=>{const dot=document.querySelector('details[data-input-command="JOY9"] .origin-marker__dot'),shape=document.querySelector('[data-command="JOY9"][data-layer-override="true"] path, [data-command="JOY9"][data-layer-override="true"] rect');return [getComputedStyle(dot).backgroundColor,getComputedStyle(shape).stroke]});
 assert.equal(colors[0],colors[1],'Row marker and controller override share the selected layer colour');
 await row(9).getByRole('button',{name:/Other layers/}).click();assert.match(await row(9).innerText(),/Weapons active: Keyboard 4/);
 const order=await row(9).innerText();assert(order.indexOf('Hold: Turn off Driving')<order.indexOf('Weapons active'));
 await strip.getByRole('button',{name:'Weapons',exact:true}).click();assert.match(await row(8).innerText(),/Weapon 3/);
 fs.mkdirSync('tests/tmp',{recursive:true});await page.screenshot({path:'tests/tmp/layer-context-weapons.png'});
 await page.setViewportSize({width:900,height:800});await strip.getByRole('button',{name:'Driving',exact:true}).click();await row(9).focus();
 assert(await strip.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:'tests/tmp/layer-context-driving.png'});
 assert.deepEqual(errors,[]);console.log('PASS: device selector, page layer selector, current-layer priority, friendly layer command, output labels, layer colours and narrow layout');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
