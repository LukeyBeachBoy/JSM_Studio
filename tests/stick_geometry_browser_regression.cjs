const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1200 }, reducedMotion: 'reduce' }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { SticksPage } = await import('/src/components/sticks/SticksPage.tsx')
      const { projectController, foldController } = await import('/src/utils/controllerLayouts.ts')
      const host = document.createElement('div'); host.id = 'geometry-test'
      host.style.cssText = 'position:fixed;inset:0;background:var(--bg-app,#10151b);color:var(--text-1);z-index:99999;overflow:auto;padding:32px;box-sizing:border-box'
      document.body.append(host)
      function Test() {
        const [source, setSource] = React.useState('LEFT_STICK_MODE = NO_MOUSE\n# @controller-layout type-25\n')
        const [live, setLive] = React.useState({x:0,y:.7,buttons:2**24})
        const [online, setOnline] = React.useState(true)
        window.setStickLive = setLive; window.setStickOnline = setOnline
        window.geometrySource = source
        window.steamGeometry = projectController(source, 'type-24')
        const text = projectController(source,'type-25')
        const setText = update => setSource(old => { const before = projectController(old,'type-25'); return foldController(old,'type-25',before,typeof update === 'function' ? update(before) : update) })
        return React.createElement(SticksPage, {
          readText: text, setText,
          liveDevice: {type:25,handle:2,nativeInputStatus:online?'active':undefined,supportedButtons:0xf03ffffff,
            status: online ? {buttons:live.buttons,leftStick:live,rightStick:{x:0,y:0},triggers:{left:0,right:0}} : undefined},
          inputs: {left:{directions:[],rotation:[]},right:{directions:[],rotation:[]}},
          onModeChange:()=>{}, renderButton:()=>null, renderModeshifts:()=>null,
          modeshiftTarget:()=>({kind:'leftStick'}), describe:()=>({binding:''}), wheelMenus:{}, wheelSegments:{left:[],right:[]}, virtualControllerType:'XBOX',
        })
      }
      createRoot(host).render(React.createElement(Test))
    })
    const host = page.locator('#geometry-test')
    const ring = host.getByRole('switch', {name:/Restrictor ring/})
    await ring.waitFor()
    assert.equal(await ring.getAttribute('aria-checked'),'false')
    await ring.click()
    assert.equal(await ring.getAttribute('aria-checked'),'true')
    await page.waitForFunction(() => window.geometrySource.includes('# @controller type-25 LEFT_STICK_RESTRICTOR_RING = ON'))
    assert(!(await page.evaluate(()=>window.steamGeometry)).includes('RESTRICTOR_RING'))
    const compass = host.locator('[data-adjusted-vector]')
    assert(Math.abs(Number(await compass.getAttribute('y2'))-28)<.01, '70% physical reaches full adjusted travel')
    const artVector = host.locator('[data-stick-vector="adjusted"]')
    const artStart = Number(await artVector.getAttribute('x2'))
    const rotation = host.getByRole('slider').filter({hasText:'Stick rotation'})
    await rotation.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Shift+ArrowRight')
    assert.equal(await rotation.getAttribute('aria-valuenow'),'1.1')
    assert(Number(await artVector.getAttribute('x2'))>artStart)
    await page.evaluate(()=>window.setStickLive({x:.5,y:.5,buttons:2**21}))
    await host.getByRole('button',{name:/Use current direction as up/}).click()
    assert.equal(await rotation.getAttribute('aria-valuenow'),'-45')
    assert(Math.abs(Number(await compass.getAttribute('x2'))-100)<.01)
    assert.equal(await host.locator('[data-command="JOY22"]').getAttribute('data-active'),'true')
    const range = host.getByRole('slider').filter({hasText:'Ring travel'})
    await range.focus(); await page.keyboard.press('ArrowLeft')
    assert.equal(await range.getAttribute('aria-valuenow'),'69')
    await ring.click()
    assert.equal(await range.count(),0)
    assert((await page.evaluate(()=>window.geometrySource)).includes('LEFT_STICK_RESTRICTOR_RING = OFF'))
    await ring.click()
    assert.equal(await range.getAttribute('aria-valuenow'),'69','toggle retains custom travel')
    assert(!(await page.evaluate(()=>window.steamGeometry)).includes('ROTATION'))
    fs.mkdirSync('build-jsm-sdl/azeron-acceptance',{recursive:true})
    await page.screenshot({path:'build-jsm-sdl/azeron-acceptance/stick-geometry-wide.png'})
    await page.setViewportSize({width:560,height:1200})
    assert(await host.locator('[data-controller-model="azeron-cyborg"]').isVisible())
    assert(await host.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal overflow on narrow layout')
    await page.screenshot({path:'build-jsm-sdl/azeron-acceptance/stick-geometry-narrow.png'})
    await page.evaluate(()=>window.setStickOnline(false))
    await host.getByText('Connect to see live input',{exact:true}).waitFor()
    assert.equal(await host.getByRole('button',{name:/Use current direction as up/}).getAttribute('aria-disabled'),'true')
    await ring.click()
    assert.equal(await ring.getAttribute('aria-checked'),'false','Disconnected layout remains editable')
    assert.deepEqual(errors,[])
    console.log('PASS: restrictor ring, custom range, rotation precision, cardinal alignment, SVG vectors, controller isolation, offline editing and narrow layout')
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exit(1)})
