const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({viewport:{width:1400,height:1200},reducedMotion:'reduce'}), errors=[]
    page.on('pageerror', error=>errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React=(await import('/node_modules/.vite/deps/react.js')).default
      const {createRoot}=(await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const {directionsGroup}=await import('/src/components/sticks/stickGroups.tsx')
      const {projectController,foldController}=await import('/src/utils/controllerLayouts.ts')
      const host=document.createElement('div');host.id='direction-test'
      host.style.cssText='position:fixed;inset:0;z-index:99999;overflow:auto;padding:32px;background:var(--bg-app,#10151b);color:var(--text-1)'
      document.body.append(host)
      function Test() {
        const [source,setSource]=React.useState('LEFT_STICK_MODE = LEFT_STICK\n# @controller-layout type-25\n# @controller type-25 LEFT_STICK_MODE = NO_MOUSE\n# @controller type-25 LEFT_STICK_CARDINAL_WIDTH = 70\n# @controller type-25 LEFT_STICK_DIRECTION_HYSTERESIS = 5\n# @controller type-25 LEFT_STICK_DIRECTION_DEADZONE = 0.35\n# @controller type-25 LEFT_STICK_DIRECTION_RELEASE_MARGIN = 0.17\n')
        const [live,setLive]=React.useState({x:0,y:.8})
        window.directionSource=source;window.setDirectionLive=setLive
        window.directionSteam=projectController(source,'type-24')
        const setText=update=>setSource(old=>{const before=projectController(old,'type-25');return foldController(old,'type-25',before,typeof update==='function'?update(before):update)})
        const group=directionsGroup({SIDE:'LEFT',side:'left',name:'Analog stick',text:projectController(source,'type-25'),setText,live,
          buttons:{directions:[]},describe:()=>({binding:''}),renderButton:()=>null})
        return React.createElement('section',null,React.createElement('h2',null,'Directions'),group.visual,group.content)
      }
      createRoot(host).render(React.createElement(Test))
    })
    const host=page.locator('#direction-test')
    const width=host.getByRole('slider').filter({hasText:'Cardinal direction width'})
    await width.waitFor();assert.equal(await width.getAttribute('aria-valuenow'),'70')
    await width.focus();await page.keyboard.press('ArrowRight')
    await page.waitForFunction(()=>window.directionSource.includes('# @controller type-25 LEFT_STICK_CARDINAL_WIDTH = 71'))
    const stability=host.getByRole('slider').filter({hasText:'Direction stability'})
    await stability.focus();await page.keyboard.press('ArrowRight')
    assert.equal(await stability.getAttribute('aria-valuenow'),'6')
    const activation=host.getByRole('slider').filter({hasText:'Start keyboard movement'})
    await activation.focus();await page.keyboard.press('ArrowRight')
    assert.equal(await activation.getAttribute('aria-valuenow'),'36')
    await host.getByText(/Movement stops below 19% travel/).waitFor()
    assert(!(await page.evaluate(()=>window.directionSteam)).includes('CARDINAL_WIDTH'))
    assert((await page.evaluate(()=>window.directionSteam)).includes('LEFT_STICK_MODE = LEFT_STICK'))
    const before=await host.locator('[data-stick-diagram]').getAttribute('aria-label')
    await page.evaluate(()=>window.setDirectionLive({x:.7,y:0}))
    await page.waitForFunction(()=>document.querySelector('#direction-test [data-stick-diagram]').getAttribute('aria-label').includes('70%'))
    assert.notEqual(await host.locator('[data-stick-diagram]').getAttribute('aria-label'),before)
    await page.setViewportSize({width:560,height:1200})
    assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow')
    fs.mkdirSync('build-jsm-sdl/wasd-diagnostics',{recursive:true})
    await page.screenshot({path:'build-jsm-sdl/wasd-diagnostics/direction-controls.png'})
    assert.deepEqual(errors,[])
    console.log('PASS: keyboard direction controls, scoped persistence, live vector, release threshold, keyboard access and narrow layout')
  } finally {await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)})
