const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,timeout:15000});
 try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const layout of ['standard','split','daisywheel']) for(const appearance of ['theme','dark','light']){
   await page.setViewportSize(layout==='daisywheel'?{width:420,height:440}:{width:1000,height:350});
   await page.goto(`http://127.0.0.1:1420/keyboard.html?preview=1&layout=${layout}&appearance=${appearance}&theme=light`);
   await page.locator('.vk-shell').waitFor();
   assert.equal(await page.locator('.vk-header').count(),0);
   if(layout==='daisywheel') {assert.equal(await page.locator('.vk-petal').count(),8);assert.equal(await page.locator('.vk-char').count(),32);assert.equal(await page.locator('.vk-dpad').count(),1);}
   else {assert.equal(await page.locator('.vk-key').count(),layout==='split'?56:55);assert.equal(await page.locator('[data-action="space"]').count(),layout==='split'?2:1);assert.equal(await page.locator('[data-action="caps"]').count(),1);assert.equal(await page.locator('.vk-thumb').count(),2);assert.ok(await page.locator('.vk-key-shortcut svg').count()>5);assert.equal(await page.locator('[data-action="close"] svg[aria-label="Close keyboard"]').count(),1);}
   const bounds=await page.evaluate(()=>[...document.querySelectorAll('.vk-key,.vk-petal,.vk-footer')].every(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1}));assert.ok(bounds,`${layout}/${appearance} stays within viewport`);
   await page.screenshot({path:path.join(__dirname,`../tmp/keyboard-${layout}-${appearance}.png`)});
  }
  for (const layout of ['standard','split','daisywheel']) {
   await page.setViewportSize(layout==='daisywheel'?{width:231,height:242}:{width:550,height:193});
   await page.goto(`http://127.0.0.1:1420/keyboard.html?preview=1&layout=${layout}`);
   await page.locator('.vk-shell').waitFor();
   assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.vk-key,.vk-petal,.vk-footer')].every(e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth+1&&r.bottom<=innerHeight+1})),layout+' fits minimum resize');
  }
  for (const viewport of [{width:420,height:839},{width:840,height:240},{width:840,height:880}]) {
   await page.setViewportSize(viewport);
   await page.goto('http://127.0.0.1:1420/keyboard.html?preview=1&layout=daisywheel');
   await page.locator('.vk-wheel').waitFor();
   const circle=await page.locator('.vk-wheel').boundingBox();assert.ok(Math.abs(circle.width-circle.height)<1,'wheel remains circular in every host aspect ratio');
   assert.ok(circle.x>=-1&&circle.y>=-1&&circle.x+circle.width<=viewport.width+1&&circle.y+circle.height<=viewport.height+1);
  }
  // Selected petals keep readable characters without button badges.
  for(const appearance of ['dark','light']) for(const viewport of [{width:231,height:242},{width:420,height:440},{width:840,height:880}]) {
   await page.setViewportSize(viewport);
   await page.goto(`http://127.0.0.1:1420/keyboard.html?preview=1&layout=daisywheel&appearance=${appearance}`);
   await page.locator('.vk-petal').first().waitFor();
   for(let petal=0;petal<8;petal++) {
    await page.locator('.vk-petal').evaluateAll((nodes,active)=>nodes.forEach((n,i)=>n.toggleAttribute('data-active',i===active)),petal);
    const badges=await page.locator('.vk-petal[data-active] .vk-char').evaluateAll(nodes=>nodes.map(n=>{
     const range=document.createRange();range.selectNodeContents(n.lastChild);
     const letter=range.getBoundingClientRect();
     return {text:n.lastChild.textContent,visible:getComputedStyle(n).visibility==='visible',noBadge:!n.querySelector('.vk-char-glyph'),width:letter.width};
    }));
    assert.equal(badges.length,4);
    assert.ok(badges.every(b=>b.text.trim()&&b.visible&&b.noBadge&&b.width>0),`selected petal ${petal} letters remain uncovered: ${JSON.stringify(badges)}`);
   }
   if(appearance==='dark'&&viewport.width===420) await page.screenshot({path:path.join(__dirname,'../tmp/keyboard-selected-petal-dark.png')});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:1420/?mock');
  const onboarding=page.getByRole('dialog',{name:'Controller power-on sound'});if(await onboarding.waitFor({state:'visible',timeout:2500}).then(()=>true).catch(()=>false))await onboarding.getByRole('button',{name:'Keep them',exact:true}).click();
  // Console v2: Settings ▸ Controller ▸ On-screen keyboard.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'settings'})));
  await page.locator('.keyboard-settings').waitFor();
  await page.locator('.keyboard-settings').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('.keyboard-settings .vk-shell').count(),1);
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  // The preview sits on the page's own sunken well, which follows the theme.
  const well=await page.locator('.keyboard-settings-preview').evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(well,'rgb(228, 233, 238)');
  // The controller shortcuts are ten rows, each one stop.
  const legend=page.locator('.keyboard-settings').getByRole('group',{name:'Controller shortcuts'});
  assert.equal(await legend.getByRole('button').count(),10);
  await page.screenshot({path:path.join(__dirname,'../tmp/keyboard-preferences.png'),fullPage:true});
  await page.locator('.keyboard-settings').getByRole('radio',{name:/^Daisywheel/}).click();
  const grouping=page.getByRole('radiogroup',{name:'Character grouping'});await grouping.waitFor();
  await grouping.focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(async()=>(await(await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).daisywheelVariant==='inputlabs');
  const rightStick=page.getByRole('switch',{name:/^Right stick as D-pad/});
  await rightStick.click();
  assert.equal(await rightStick.getAttribute('aria-checked'),'true');
  assert.deepEqual(await page.locator('.vk-char-3').evaluateAll(es=>es.map(e=>e.lastChild.textContent)),['a','e','o','w','u','q','i',',']);
  const wheel=await page.locator('.keyboard-settings .vk-wheel').boundingBox();assert.ok(Math.abs(wheel.width-wheel.height)<1);
  await page.screenshot({path:path.join(__dirname,'../tmp/keyboard-inputlabs-preferences.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS: layouts, appearances, compact bounds, key glyphs, touch blobs, Caps/close icons, preview and theme-aware preferences.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
