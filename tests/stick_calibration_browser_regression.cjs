const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true})
 try {
  const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}), errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1461/?mock')
  await page.waitForSelector('main')
  await page.evaluate(async()=>{
   const React=(await import('/node_modules/.vite/deps/react.js')).default, {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
   const {StickGeometryControls}=await import('/src/components/sticks/StickGeometryControls.tsx')
   const geometry=await import('/src/utils/stickGeometry.ts')
   const {projectController,foldController}=await import('/src/utils/controllerLayouts.ts')
   window.geometryTools=geometry
   const host=document.createElement('div');host.id='calibration-fixture';host.style.cssText='position:fixed;inset:0;z-index:1;padding:32px;background:var(--surface-frame);overflow:auto';document.body.append(host)
   function Test(){
    const [source,setSource]=React.useState('# @controller type-25 LEFT_STICK_ROTATION = 15\n')
    const [raw,setRaw]=React.useState(null);window.setCalibrationRaw=setRaw;window.calibrationSource=source
    window.calibrationSteam=projectController(source,'type-24')
    const text=projectController(source,'type-25')
    const setText=change=>setSource(old=>{const before=projectController(old,'type-25');return foldController(old,'type-25',before,typeof change==='function'?change(before):change)})
    return React.createElement(StickGeometryControls,{side:'LEFT',geometry:geometry.readStickGeometry(text,'LEFT'),raw,setText,cyborg:true})
   }
   createRoot(host).render(React.createElement(Test))
  })
  await page.getByRole('button',{name:/Natural direction calibration/}).click()
  const panel=page.locator('[data-stick-calibration]')
  await panel.waitFor()
  const toggle=panel.getByRole('switch',{name:/Use natural directions/})
  assert.equal(await toggle.getAttribute('aria-checked'),'false')
  assert.equal(await panel.getByRole('button',{name:'Record forward direction',exact:false}).getAttribute('aria-disabled'),'true')
  await toggle.click()
  await panel.getByRole('radiogroup',{name:'Direction to calibrate'}).focus(); await page.keyboard.press('ArrowRight')
  await page.evaluate(()=>window.setCalibrationRaw({x:Math.sin(Math.PI/3)*.6,y:Math.cos(Math.PI/3)*.6}))
  await panel.getByRole('button',{name:/Record right direction/}).click()
  const slider=panel.getByRole('slider').filter({hasText:'Right adjustment'})
  assert.equal(await slider.getAttribute('aria-valuenow'),'15')
  await panel.getByText(/30° total correction/).waitFor()
  assert((await page.evaluate(()=>window.calibrationSource)).includes('# @controller type-25 LEFT_STICK_CALIBRATION_RIGHT_ANGLE = 15'))
  assert(!(await page.evaluate(()=>window.calibrationSteam)).includes('CALIBRATION'))
  const vector=panel.locator('[data-adjusted-vector]')
  assert(Math.abs(Number(await vector.getAttribute('y2'))-100)<.001)
  assert(Math.abs(Number(await vector.getAttribute('x2'))-143.2)<.001)
  await panel.getByRole('button',{name:/Record right full travel/}).click()
  assert.equal(await panel.getByRole('slider').filter({hasText:'Right travel'}).getAttribute('aria-valuenow'),'60')
  assert(Math.abs(Number(await vector.getAttribute('x2'))-172)<.001)
  assert.equal(await panel.locator('[data-calibration-outline]').count(),1)
  await toggle.click();assert.equal(await panel.locator('[data-calibration-outline]').count(),0)
  await toggle.click();assert.equal(await slider.getAttribute('aria-valuenow'),'15')
  const parity=await page.evaluate(()=>{
   const {readStickGeometry,transformStickGeometry}=window.geometryTools
   const g=readStickGeometry('LEFT_STICK_ROTATION = 15\nLEFT_STICK_CALIBRATION = ON\nLEFT_STICK_CALIBRATION_RIGHT_ANGLE = 15','LEFT')
   const forward=transformStickGeometry({x:-Math.sin(Math.PI/12)*.5,y:Math.cos(Math.PI/12)*.5},g)
   const right=transformStickGeometry({x:Math.sin(Math.PI/3)*.5,y:Math.cos(Math.PI/3)*.5},g)
   return {forward,right}
  })
  assert(Math.abs(parity.forward.x)<1e-6&&Math.abs(parity.forward.y-.5)<1e-6)
  assert(Math.abs(parity.right.x-.5)<1e-6&&Math.abs(parity.right.y)<1e-6)
  fs.mkdirSync('tests/tmp',{recursive:true})
  await page.screenshot({path:'tests/tmp/stick-calibration-wide.png'})
  await page.setViewportSize({width:900,height:600})
  assert(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow at minimum app size')
  await panel.getByRole('button',{name:/Reset natural directions/}).scrollIntoViewIfNeeded()
  await page.screenshot({path:'tests/tmp/stick-calibration-small.png'})
  await panel.getByRole('button',{name:/Reset natural directions/}).click()
  assert.equal(await slider.getAttribute('aria-valuenow'),'0')
  assert((await page.evaluate(()=>window.calibrationSource)).includes('LEFT_STICK_ROTATION = 15'))
  await page.evaluate(()=>window.setCalibrationRaw({x:0,y:0}))
  assert.equal(await panel.getByRole('button',{name:/Record right direction/}).getAttribute('aria-disabled'),'true')
  await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'})
  assert.deepEqual(errors,[])
  console.log('PASS: independent capture, total correction, analog magnitude, custom reach, toggle retention, scoped persistence, reset, offline guard, 900x600 and Escape')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)})


