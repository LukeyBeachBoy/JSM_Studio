const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1450, height: 1100 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { SticksPage } = await import('/src/components/sticks/SticksPage.tsx')
      const { usePressCapture } = await import('/src/components/settings/usePressCapture.ts')
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts')
      const { patchRuntimePreferences } = await import('/src/platform/preferenceStore.ts')
      const { withCyborgDefaults } = await import('/src/utils/stickGeometry.ts')
      const { getKeymapValue } = await import('/src/utils/keymap.ts')
      const inherited = withCyborgDefaults('STICK_DEADZONE_INNER = .3', {LEFT_STICK_DEADZONE_INNER:'.1',LEFT_STICK_ROTATION:'15'})
      if (getKeymapValue(inherited,'LEFT_STICK_DEADZONE_INNER') || getKeymapValue(inherited,'LEFT_STICK_ROTATION') !== '15') throw Error('Common game deadzone must win')
      patchRuntimePreferences(await desktopBridge.setCyborgStickDefaults({ LEFT_STICK_ROTATION: '15', LEFT_STICK_RESTRICTOR_RING: 'ON' }))
      desktopBridge.onTelemetrySample = callback => {
        const sample = { devices: [] }
        const timer = setTimeout(() => callback(sample), 0)
        window.captureTelemetry = callback
        return () => clearTimeout(timer)
      }
      const host = document.createElement('div'); host.id = 'defaults-mouse-test'
      host.style.cssText = 'position:fixed;inset:0;background:#10151b;z-index:39;overflow:auto;padding:30px'
      document.body.append(host)
      function Test() {
        const [text,setText] = React.useState('')
        const capture = usePressCapture(result => { window.capturedMouse = result }, {buttonsOnly:true,mouseButtons:true})
        window.localStickText = text
        return React.createElement(React.Fragment, null,
          React.createElement('button',{id:'capture-mouse',onClick:()=>{window.capturedMouse=null;capture.start()}},'Capture mouse'),
          React.createElement('span',{id:'captured-held'},capture.held.join(',')),
          React.createElement(SticksPage, {
            readText:text,setText,liveDevice:{type:25,handle:2,status:{buttons:0,leftStick:{x:0,y:.7},rightStick:{x:0,y:0},triggers:{left:0,right:0}}},
            inputs:{left:{directions:[],rotation:[]},right:{directions:[],rotation:[]}},
            onModeChange:value=>{},renderButton:()=>null,renderModeshifts:()=>null,
            modeshiftTarget:()=>({kind:'leftStick'}),describe:()=>({binding:''}),wheelMenus:{},wheelSegments:{left:[],right:[]},virtualControllerType:'XBOX'
          }))
      }
      createRoot(host).render(React.createElement(Test))
    })
    const host = page.locator('#defaults-mouse-test')
    const rotation = host.getByRole('slider').filter({hasText:'Stick rotation'})
    await rotation.waitFor()
    await page.waitForFunction(()=>[...document.querySelectorAll('#defaults-mouse-test [role=slider]')].find(el=>el.textContent.includes('Stick rotation'))?.getAttribute('aria-valuenow') === '15')
    assert.equal(await rotation.getAttribute('aria-valuenow'),'15')
    assert.equal(await host.getByRole('switch',{name:/Restrictor ring/}).getAttribute('aria-checked'),'true')
    await rotation.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await rotation.getAttribute('aria-valuenow'),'16')
    assert((await page.evaluate(()=>window.localStickText)).includes('LEFT_STICK_ROTATION = 16'))
    await host.getByRole('button',{name:/Global Cyborg stick defaults/}).click()
    const dialog = page.getByRole('dialog',{name:/Global Cyborg stick defaults/})
    await dialog.getByRole('switch',{name:/Restrictor ring/}).click()
    await page.waitForFunction(async () => (await (await import('/src/platform/desktopBridge.ts')).desktopBridge.getRuntimeMappingState()).cyborgStickDefaults.LEFT_STICK_RESTRICTOR_RING === 'OFF')
    await dialog.getByRole('button',{name:'Back',exact:true}).click()
    assert.equal(await host.getByRole('switch',{name:/Restrictor ring/}).getAttribute('aria-checked'),'false')
    assert.equal(await rotation.getAttribute('aria-valuenow'),'16','Game override survives a global edit')
    for (const [button, expected] of [[3,'MOUSE_BACK'],[4,'MOUSE_FORWARD']]) {
      await host.locator('#capture-mouse').click()
      await page.waitForFunction(()=>document.body.dataset.padListening === 'true')
      await page.waitForTimeout(60)
      await page.evaluate(button=>window.dispatchEvent(new MouseEvent('mousedown',{button,cancelable:true})),button)
      await page.waitForFunction(expected=>document.querySelector('#captured-held').textContent === expected,expected)
      await page.evaluate(button=>window.dispatchEvent(new MouseEvent('mouseup',{button,cancelable:true})),button)
      await page.waitForFunction(()=>window.capturedMouse?.length)
      assert.deepEqual(await page.evaluate(()=>window.capturedMouse),[expected])
    }
    assert.deepEqual(errors,[])
    console.log('PASS: global Cyborg defaults, game precedence, common deadzones, persisted edits, mouse Back/Forward capture and release')
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exit(1)})
