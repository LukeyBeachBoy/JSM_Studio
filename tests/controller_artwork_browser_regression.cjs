const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true})
 try {
  const page=await browser.newPage({viewport:{width:1400,height:950}}), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1424/?mock')
  await page.waitForSelector('main')
  assert.equal(await page.locator('vite-error-overlay').count(),0)
  await page.evaluate(async()=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default
   const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
   const {ControllerStatusSvg: ModelControllerSvg}=await import('/src/components/ControllerStatusSvg.tsx')
   const {controllerArtworkModel}=await import('/src/utils/controllerArtwork.ts')
   window.resolveArt=controllerArtworkModel
   const host=document.createElement('div');host.id='art-test';host.style.cssText='position:fixed;inset:0;background:var(--bg-app,#10151b);z-index:99999;overflow:auto;padding:20px'
   document.body.append(host);const root=createRoot(host)
   window.drawArt=(type,vid,pid,buttons=0,axis=0,trigger=0)=>root.render(React.createElement(ModelControllerSvg,{device:{type,vid,pid,handle:1,status:{buttons,leftStick:{x:axis,y:axis},rightStick:{x:-axis,y:-axis},triggers:{left:trigger,right:trigger},gyro:{x:0,y:0,z:0}}},boundCommands:new Set(['ZLF','LUP']),onSelectCommand:c=>window.lastCommand=c}))
  })
  const cases=[[3,'switch-pro'],[4,'dualshock-4'],[5,'dualsense'],[7,'xbox-elite-2'],[8,'xbox-series'],[15,'8bitdo-pro-2'],[16,'8bitdo-pro-2'],[18,'8bitdo-ultimate-2'],[5,'dualsense-edge',0x054c,0x0df2]]
  for(const [type,key,vid,pid] of cases){
   await page.evaluate(args=>window.drawArt(...args),[type,vid,pid]);await page.waitForSelector(`[data-controller-model="${key}"]`)
   assert.equal(await page.locator('#art-test svg').count(),2)
   for(const c of ['N','W','E','S','UP','DOWN','LEFT','RIGHT','-','+','HOME','L3','R3','L','R','ZL','ZR']) assert.ok(await page.locator(`#art-test [data-command="${c}"]`).count(),`${key} ${c}`)
   const dot=page.locator('#art-test [data-stick="L3"]'), idle=await dot.getAttribute('cx')
   await page.evaluate(args=>window.drawArt(...args),[type,vid,pid,2**15+2**19,.6,.7])
   await page.waitForFunction(()=>document.querySelector('#art-test [data-command="N"]').dataset.active==='true')
   assert.notEqual(await dot.getAttribute('cx'),idle)
   assert.equal(await page.locator('#art-test [data-command="ZL"]').getAttribute('data-value'),'0.7')
   if(['xbox-elite-2','8bitdo-pro-2','8bitdo-ultimate-2','dualsense-edge'].includes(key))assert.equal(await page.locator('#art-test [data-command="LSL"]').getAttribute('data-active'),'true')
   await page.locator('#art-test [data-command="ZL"]').click()
   assert.equal(await page.evaluate(()=>window.lastCommand),'ZLF')
   await page.locator('#art-test [data-command="L3"]').focus();await page.keyboard.press('Enter')
   assert.equal(await page.evaluate(()=>window.lastCommand),'LUP')
   await page.screenshot({path:`tmp/controller-${key}.png`})
  }
  await page.evaluate(()=>window.drawArt(24));await page.waitForSelector('svg[aria-label="Steam Controller back, mirrored"]')
  await page.evaluate(()=>window.drawArt(0));await page.waitForSelector('svg[aria-label="Generic controller layout"]')
  await page.evaluate(()=>window.drawArt(5,0x054c,0x0df2));await page.waitForSelector('[data-controller-model="dualsense-edge"]')
  await page.setViewportSize({width:420,height:900})
  assert.ok(await page.locator('#art-test svg').first().isVisible())
  assert.equal(await page.evaluate(()=>window.resolveArt({type:24})),undefined)
  assert.equal(await page.evaluate(()=>window.resolveArt({type:0})),undefined)
  const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('#art-test [id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})
  assert.deepEqual(duplicates,[]);assert.deepEqual(errors,[])
  console.log('PASS: all nine device variants, front/back controls, live presses, paddles, analog sticks/triggers, binding clicks and keyboard selection; no browser errors')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)})
