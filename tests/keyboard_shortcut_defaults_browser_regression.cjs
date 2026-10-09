const assert = require('node:assert/strict')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true})
 try {
  const page = await browser.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message))
  for (const layout of ['standard','split']) for (const width of [550,750,1000]) {
   await page.setViewportSize({width,height:Math.round(width*260/750)})
   await page.goto(`http://127.0.0.1:1420/keyboard.html?preview=1&layout=${layout}`)
   await page.locator('.vk-shell').waitFor()
   assert.equal(await page.locator('[data-action=caps] .vk-key-label').innerText(),'Caps')
   assert.equal(await page.locator('[data-action=space] .vk-key-label').first().innerText(),'Space')
   assert.ok(await page.locator('.vk-footer').innerText().then(t=>t.includes('Symbols')))
   const geometry=await page.locator('.vk-key[data-action]').evaluateAll(keys=>keys.map(key=>{
    const r=key.getBoundingClientRect(),l=key.querySelector('.vk-key-label').getBoundingClientRect(),g=key.querySelector('.vk-key-shortcut').getBoundingClientRect()
    return {label:key.getAttribute('aria-label'),fits:l.left>=r.left&&g.right<=r.right,aligned:Math.abs((l.top+l.height/2)-(g.top+g.height/2))<1}
   }))
   assert.ok(geometry.every(k=>k.fits&&k.aligned),`${layout}/${width}: ${JSON.stringify(geometry)}`)
   if(width===750&&layout==='split')await page.screenshot({path:'tmp/keyboard-shortcuts-updated.png'})
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:1420/?mock')
  const onboarding=page.getByRole('dialog',{name:'Controller power-on sound'})
  if(await onboarding.waitFor({state:'visible',timeout:2500}).then(()=>true).catch(()=>false))await onboarding.getByRole('button',{name:'Keep them',exact:true}).click()
  // Console v2: Settings ▸ Controller; the shortcut legend's rows open a list
  // of buttons, and Advanced resets them.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'settings'})))
  const section=page.locator('.keyboard-settings');await section.waitFor()
  const getPrefs=()=>page.evaluate(async()=>await(await import('/src/keyboard/bridge.ts')).keyboard.getPreferences())
  await section.getByRole('group',{name:'Controller shortcuts'}).getByRole('button',{name:/^Backspace/}).click()
  await page.getByRole('radiogroup',{name:'Backspace'}).getByRole('radio',{name:/East face button/}).click()
  await page.waitForFunction(async()=>(await(await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).shortcuts.split.backspace==='E')
  await section.getByRole('button',{name:/^Advanced/}).click()
  await page.getByRole('button',{name:/^Reset the shortcuts to defaults/}).click()
  await page.waitForFunction(async()=>(await(await import('/src/keyboard/bridge.ts')).keyboard.getPreferences()).shortcuts.split.backspace==='W')
  await page.keyboard.press('Escape')
  const p=await getPrefs()
  assert.equal(p.shortcuts.split.backspace,'W');assert.equal(p.shortcuts.split.space,'N');assert.equal(p.shortcuts.split.caps,'L3');assert.equal(p.shortcuts.split.shift,'ZL')
  assert.equal(p.hapticIntensity,35);assert.equal(p.layout,'split')
  await section.screenshot({path:'tmp/keyboard-shortcuts-settings.png'})
  assert.deepEqual(errors,[]);assert.equal(await page.locator('vite-error-overlay').count(),0)
  console.log('PASS: explicit labels, centered glyphs at all sizes, Steam defaults and shortcut reset')
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
