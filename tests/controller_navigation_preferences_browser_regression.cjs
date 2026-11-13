const assert = require('node:assert/strict');
const fs = require('node:fs');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 try {
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/platform/desktopBridge.ts',async route=>{
   const response=await route.fetch();
   await route.fulfill({response,body:(await response.text())+`
    window.navState={activeProfilePath:'profiles-library/Game.txt',mappingEnabled:true,autoloadEnabled:true,controllerNavEnabled:true};
    window.navInputs={cyborg:0,steam:0};window.navSaves=[];
    desktopBridge.getRuntimeMappingState=async()=>({...window.navState});
    desktopBridge.setControllerNavEnabled=async(enabled,controller)=>{
     window.navSaves.push({enabled,controller});
     window.navState={...window.navState,controllerNavOverrides:{...window.navState.controllerNavOverrides,[controller]:enabled}};
     return {...window.navState};
    };
    const subscribe=desktopBridge.onTelemetrySample;
    desktopBridge.onTelemetrySample=cb=>subscribe(sample=>cb({...sample,activeProfile:'AppNavigation.txt',devices:[
     {...sample.devices[0],handle:25,type:25,controllerId:'type-25-device-0000000000000001',activeProfile:'profiles-library/Game.txt',status:{...sample.devices[0].status,buttons:window.navInputs.cyborg,leftStick:{x:0,y:window.navInputs.cyborg?1:0}}},
     {...sample.devices[0],handle:24,type:24,controllerId:'type-24-device-0000000000000002',activeProfile:'AppNavigation.txt',status:{...sample.devices[0].status,buttons:window.navInputs.steam,leftStick:{x:0,y:0}}}
    ]}));
   `});
  });
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421/?mock');
  await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:3000}).catch(()=>{});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'settings'})));
  const scope=page.getByRole('radiogroup',{name:'Controller for app navigation'});
  await scope.waitFor({timeout:30000});
  const toggle=page.getByRole('switch',{name:/Navigate this app with the controller/});
  const choose=async value=>{await scope.locator('button').filter({hasText:value}).click();};
  await choose('Azeron Cyborg 2 defaults');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  await toggle.click();
  await page.waitForFunction(()=>window.navSaves.length===1);
  assert.deepEqual(await page.evaluate(()=>window.navSaves[0]),{enabled:true,controller:'type-25'});
  await toggle.click();
  await page.waitForFunction(()=>window.navSaves.length===2);
  await choose('Steam Controller defaults');
  assert.equal(await toggle.getAttribute('aria-checked'),'true','Azeron off leaves Steam on');
  await choose('Azeron Cyborg 2 defaults');
  assert.equal(await toggle.getAttribute('aria-checked'),'false');
  // Editing the Azeron must not decide which controller can navigate.
  await page.evaluate(()=>import('/src/utils/controllerSelection.ts').then(module=>module.selectController('type-25-device-0000000000000001')));
  await scope.focus();await page.waitForTimeout(300);
  await page.evaluate(()=>{window.navInputs.cyborg=2});await page.waitForTimeout(250);
  assert.equal(await scope.evaluate(node=>document.activeElement===node),true,'disabled Azeron input leaves focus alone');
  await page.evaluate(()=>{window.navInputs.cyborg=0;window.navInputs.steam=2});await page.waitForTimeout(250);
  assert.equal(await scope.evaluate(node=>document.activeElement===node),false,'Steam navigates while Azeron is selected for editing');
  await page.evaluate(()=>{window.navInputs.steam=0});
  fs.mkdirSync('tmp/controller-navigation',{recursive:true});
  for(const [width,height] of [[1440,900],[900,600]]) {
   await page.setViewportSize({width,height});
   await scope.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
   const boxes=await page.evaluate(()=>{
    const scope=document.querySelector('[role="radiogroup"][aria-label="Controller for app navigation"]');
    const toggle=[...document.querySelectorAll('[role="switch"]')].find(node=>node.textContent.includes('Navigate this app'));
    const box=node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}};
    return {scope:box(scope),toggle:box(toggle),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
   });
   assert.equal(boxes.overflow,false);
   assert.equal(boxes.scope.x,boxes.toggle.x,'rows share gutters');
   assert.ok(boxes.scope.right<=width && boxes.toggle.right<=width);
   assert.ok(boxes.scope.bottom<=boxes.toggle.y,'rows do not overlap');
   await page.screenshot({path:`tmp/controller-navigation/settings-${width}x${height}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: per-controller save isolation, Steam navigation while editing disabled Azeron, and 1440x900 / 900x600 settings geometry');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
