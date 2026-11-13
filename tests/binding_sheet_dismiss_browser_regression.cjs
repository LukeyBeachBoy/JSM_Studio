const assert=require('node:assert/strict')
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(process.env.JSM_TEST_URL||'http://127.0.0.1:1420/?mock')
  await page.getByRole('button',{name:'Keep them',exact:true}).click({timeout:3000}).catch(()=>{})
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('jsm:navigate-page',{detail:'overview'})))
  const callout=page.locator('[data-overview-input="S"]').first()
  await callout.waitFor();await callout.click()
  const row=page.locator('details[data-input-command="S"]').first(),summary=row.locator('summary').first()
  await summary.waitFor()
  // Overview navigation opens the sheet asynchronously; wait before clicking the row again.
  await row.locator('.sheet-layer').waitFor({state:'visible'})
  const buttons=page.getByRole('button',{name:'Buttons',exact:true})
  for(const dismissal of ['escape','backdrop','close']) {
   if(!await row.locator('.sheet-layer').isVisible()) await summary.click()
   const sheet=row.locator('.sheet-layer');await sheet.waitFor()
   const scroll=await page.locator('.shell-scroll').evaluate(el=>el.scrollTop)
   if(dismissal==='escape')await page.keyboard.press('Escape')
   else if(dismissal==='backdrop')await sheet.click({position:{x:10,y:100}})
   else await sheet.locator('[data-modal-close]').first().click()
   await sheet.waitFor({state:'hidden'})
   await page.waitForTimeout(150)
   assert(await summary.isVisible(),`${dismissal} preserves underlying Buttons page`)
   assert.equal(await page.locator('.shell-scroll').evaluate(el=>el.scrollTop),scroll,`${dismissal} preserves scroll`)
   assert(await summary.evaluate(el=>el===document.activeElement),`${dismissal} restores row focus`)
  }
  await page.keyboard.press('Escape')
  await callout.waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS: Escape, backdrop and close dismiss only the binding sheet; page/scroll/focus persist; subsequent Back returns to Layout')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)})
