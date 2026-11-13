const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/src/platform/desktopBridge.ts*',async route=>{
   const response=await route.fetch(); await route.fulfill({response,body:await response.text()+`
    desktopBridge.listLibraryProfiles=async()=>['Cyberpunk','Desktop','Gamepad'];
    const slotsSource='RESET_MAPPINGS\\n# @controller-layout type-25\\n# @controller type-25 JOY9 = F\\n';
    desktopBridge.getActiveProfile=async()=>({name:'Cyberpunk',path:'profiles-library/Cyberpunk.txt',content:slotsSource});
    desktopBridge.loadLibraryProfile=async name=>({name,content:slotsSource});
    desktopBridge.listAutoloadRules=async()=>[{processName:'Cyberpunk2077',fileName:'Cyberpunk2077.txt',profileName:'Cyberpunk',kind:'profile',paused:false,builtIn:false,missingProfile:false,slot:1}];
    desktopBridge.saveAutoloadRule=async(processName,profileName,options)=>{window.__slotRule=options;return {processName,profileName,fileName:processName+'.txt',kind:'profile',slot:options?.slot,paused:false}};
    const subscribe=desktopBridge.onTelemetrySample;
    desktopBridge.onTelemetrySample=callback=>subscribe(sample=>callback({...sample,devices:[{...sample.devices?.[0],type:25,handle:25,controllerId:'type-25-device-0123456789abcdef'}]}));
   `})
  });
  await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1425/?mock');await page.locator('.app-shell').waitFor();
  const go=detail=>page.evaluate(detail=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail})),detail);
  await go('slots'); const settings=page.locator('[data-slots-page]');await settings.waitFor();
  assert.equal(await settings.locator('[data-slot-card]').count(),4);
  const confirmation=settings.getByRole('switch',{name:/Show slot-change confirmation/});
  assert.equal(await confirmation.getAttribute('aria-checked'),'true');
  await confirmation.click();await page.waitForFunction(()=>[...document.querySelectorAll('[role="switch"]')].some(el=>el.textContent.includes('Show slot-change confirmation')&&el.getAttribute('aria-checked')==='false'));
  await go('controller-settings');await go('slots');
  assert.equal(await confirmation.getAttribute('aria-checked'),'false');
  await confirmation.click();await page.waitForFunction(()=>[...document.querySelectorAll('[role="switch"]')].some(el=>el.textContent.includes('Show slot-change confirmation')&&el.getAttribute('aria-checked')==='true'));

  await settings.getByRole('button',{name:/Set up Gaming \+ Desktop/}).click();
  const bar=page.locator('[data-slots-bar]');await bar.waitFor();
  assert.match(await bar.innerText(),/Gaming.*Cyberpunk/s);assert.match(await bar.innerText(),/Desktop/);
  const slot=id=>bar.locator(`[data-slot="${id}"]`);
  assert.equal(await slot(1).getAttribute('aria-pressed'),'true');
  await slot(2).click();await page.waitForFunction(()=>document.querySelector('[data-slots-bar] [data-slot="2"]')?.getAttribute('aria-pressed')==='true');
  await slot(1).click();await page.waitForFunction(()=>document.querySelector('[data-slots-bar] [data-slot="1"]')?.getAttribute('aria-pressed')==='true');
  await settings.locator('[data-slot-card="2"]').getByRole('button',{name:'Choose hotkey',exact:true}).click();
  const hotkey=page.getByRole('dialog',{name:/Slot 2 hotkey/});await hotkey.waitFor();
  assert.match(await hotkey.innerText(),/any order/);
  await hotkey.getByRole('button',{name:'Done',exact:true}).click();
  const desktopCard=settings.locator('[data-slot-card="2"]');
  await desktopCard.getByRole('combobox',{name:'Slot 2 hotkey controller'}).click();
  await page.getByRole('option',{name:'Steam Controller',exact:true}).click();
  await desktopCard.getByRole('button',{name:'Choose hotkey',exact:true}).click();
  await hotkey.waitFor();
  await hotkey.getByRole('group',{name:'Buttons to hold together'}).getByRole('button',{name:/Quick Access/}).click();
  await page.waitForTimeout(150);
  await hotkey.getByRole('group',{name:'Buttons to hold together'}).getByRole('button',{name:'Down',exact:true}).click();
  await page.waitForTimeout(150);
  await hotkey.getByRole('button',{name:'Done',exact:true}).click();
  assert.match(await desktopCard.innerText(),/Mouse Back \+ Down/,'Cyborg hotkey is preserved alongside the Steam shortcut');
  assert.match(await desktopCard.innerText(),/MISC1|Quick Access|Extra|Misc/i);
  await desktopCard.getByRole('combobox',{name:'Slot 2 hotkey controller'}).click();
  await page.getByRole('option',{name:/Azeron Cyborg/}).click();
  await desktopCard.getByRole('button',{name:'Choose hotkey',exact:true}).click();
  await hotkey.waitFor();
  assert.equal(await hotkey.locator('[data-mouse-input="MOUSE_BACK"]').getAttribute('aria-pressed'),'true');
  await hotkey.getByRole('button',{name:'Done',exact:true}).click();
  fs.mkdirSync('tests/tmp',{recursive:true});
  await page.screenshot({path:'tests/tmp/slots-controller-shortcuts-desktop.png'});
  await go('associations');
  const destination=page.getByRole('combobox',{name:'Cyberpunk2077.exe destination slot'});await destination.click();
  await page.getByRole('option',{name:'Slot 2 · Desktop',exact:true}).click();
  await page.waitForFunction(()=>window.__slotRule?.slot===2);
  assert.match(await page.locator('[data-process="__fallback__"]').innerText(),/Paused while slots are on/);
  await go('slots');await page.setViewportSize({width:900,height:600});await page.waitForTimeout(500);
  assert(await settings.evaluate(el=>el.scrollWidth<=el.clientWidth),'slot cards fit the minimum app width');
  await desktopCard.scrollIntoViewIfNeeded();await page.screenshot({path:'tests/tmp/slots-controller-shortcuts-minimum.png'});
  await confirmation.scrollIntoViewIfNeeded();await page.waitForTimeout(300);assert(await confirmation.evaluate(el=>{const b=el.getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.bottom<=innerHeight}));fs.mkdirSync('tests/tmp',{recursive:true});await page.screenshot({path:'tests/tmp/slots-settings.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: four slots, Gaming/Desktop setup, active-slot switching, hotkey editor, per-game target slots and minimum window width');
 } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
