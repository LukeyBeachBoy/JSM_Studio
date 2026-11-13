const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    fs.mkdirSync('build-jsm-sdl/azeron-acceptance', { recursive: true })
    const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.waitForSelector('main')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { ControllerStatusSvg } = await import('/src/components/ControllerStatusSvg.tsx')
      const host = document.createElement('div'); host.id = 'azeron-art-test'
      host.style.cssText = 'position:fixed;inset:0;background:var(--bg-app,#10151b);color:var(--text-1,#eee);z-index:99999;overflow:auto;padding:24px'
      document.body.append(host); const root = createRoot(host)
      window.drawCyborg = (buttons = 0, x = 0, selected = null, nativeInputStatus = 'active', bound = ['JOY1', 'JOY22', 'JOY25']) => root.render(React.createElement(ControllerStatusSvg, {
        device: { type: 25, handle: 2, nativeInputStatus, supportedButtons: 0xf03ffffff, status: { buttons, leftStick: { x, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 } } },
        selectedCommand: selected, boundCommands: new Set(bound),
        bindingLabels: { JOY1: 'Jump', JOY22: 'Toggle Driving', JOY25: 'Escape' },
        onSelectCommand: command => window.lastCyborgCommand = command,
      }))
      window.drawCyborg()
    })
    await page.waitForSelector('[data-controller-model="azeron-cyborg"]')
    assert.equal(await page.locator('#azeron-art-test svg').count(), 1)
    assert.match(await page.locator('#azeron-art-test [role="status"]').innerText(), /JSM has native control/)
    assert.equal(await page.locator('#azeron-art-test details').count(), 0)
    await page.evaluate(() => window.drawCyborg(0, 0, null, 'vendor-app-open'))
    await page.waitForFunction(() => document.querySelector('#azeron-art-test [role="status"]').textContent.includes('Quit Azeron Software'))
    await page.evaluate(() => window.drawCyborg())
    for (let i = 1; i <= 26; i++) assert.equal(await page.locator(`#azeron-art-test [data-command="JOY${i}"]`).count(), 1)
    for (const direction of ['UP', 'DOWN', 'LEFT', 'RIGHT']) assert.equal(await page.locator(`#azeron-art-test [data-command="${direction}"]`).count(), 0)
    // Rotated keycaps must keep their actual pointer targets, with no overlap
    // from the thumb assembly or another finger tower.
    for (const command of Array.from({length:26},(_,i)=>`JOY${i+1}`)) {
      await page.locator(`#azeron-art-test [data-command="${command}"]`).click()
      assert.equal(await page.evaluate(() => window.lastCyborgCommand), command)
    }
    const dot = page.locator('#azeron-art-test [data-stick="LUP"]'), initial = await dot.getAttribute('cx')
    await page.evaluate(() => window.drawCyborg(2 ** 21 + 2 ** 24, .8, 'JOY22'))
    await page.waitForFunction(() => document.querySelector('[data-command="JOY22"]').dataset.active === 'true')
    assert.notEqual(await dot.getAttribute('cx'), initial)
    await page.locator('#azeron-art-test [data-command="JOY25"]').click()
    assert.equal(await page.evaluate(() => window.lastCyborgCommand), 'JOY25')
    await page.locator('#azeron-art-test [data-command="JOY22"]').focus(); await page.keyboard.press('Enter')
    assert.equal(await page.evaluate(() => window.lastCyborgCommand), 'JOY22')
    await page.screenshot({ path: 'build-jsm-sdl/azeron-acceptance/cyborg-dark.png' })
    await page.setViewportSize({ width: 500, height: 950 })
    assert(await page.locator('[data-controller-model="azeron-cyborg"]').isVisible())
    await page.screenshot({ path: 'build-jsm-sdl/azeron-acceptance/cyborg-narrow.png' })
    await page.locator('#azeron-art-test svg').screenshot({ path: 'build-jsm-sdl/azeron-acceptance/cyborg-art-preview.png' })
    // All five knob inputs being bound must not produce a stack of orange boxes.
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark'
      document.documentElement.dataset.accent = 'amber'
      window.drawCyborg(0, 0, null, 'active', ['UP','DOWN','LEFT','RIGHT','JOY20','JOY21','LUP','LDOWN','LLEFT','LRIGHT'])
    })
    await page.mouse.move(1, 1)
    await page.waitForFunction(() => document.querySelector('#azeron-art-test [data-five-way-nub]'))
    assert.equal(await page.locator('#azeron-art-test [data-command="JOY20"]').count(),1,'One visual target represents the complete five-way nub')
    const outline = await page.locator('#azeron-art-test [data-command="JOY20"] path').evaluate(element=>element.style.strokeOpacity)
    assert.equal(outline,'0','The grouped nub avoids separate direction outlines')
    await page.evaluate(()=>document.activeElement?.blur())
    assert.equal(await page.locator('#azeron-art-test [data-stick="LUP"]').locator('..').getAttribute('transform'), null, 'The analog stick stays circular')
    assert.equal(await page.locator('#azeron-art-test [data-command="JOY21"] circle').count(), 1, 'Stick click stays on the circular cap')
    assert.equal(await page.locator('#azeron-art-test [data-analog-cap="40"]').count(), 1)
    const crowded = await page.locator('#azeron-art-test text[data-button-label]').evaluateAll(labels => labels.flatMap(label => {
      const command=label.getAttribute('data-button-label')
      if (command==='JOY20' || command==='JOY21') return []
      const shape=document.querySelector(`#azeron-art-test [data-command="${command}"] rect`)
      if (!shape) return []
      const b=label.getBBox(),inverse=shape.getScreenCTM().inverse(),matrix=label.getScreenCTM()
      const points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(matrix).matrixTransform(inverse))
      const x=Number(shape.getAttribute('x')),y=Number(shape.getAttribute('y')),w=Number(shape.getAttribute('width')),h=Number(shape.getAttribute('height'))
      const padding=Math.min(...points.map(p=>Math.min(p.x-x,x+w-p.x,p.y-y,y+h-p.y)))
      return padding<3 ? [{command,padding}] : []
    }))
    assert.deepEqual(crowded, [], 'Numbers have breathing room inside their rotated keycaps')
    await page.evaluate(()=>window.drawCyborg(2**32,0,'UP'))
    await page.waitForFunction(()=>document.querySelector('#azeron-art-test [data-command="JOY20"]').dataset.active === 'true')
    await page.evaluate(()=>window.drawCyborg(0,0,null,'active',['JOY20','UP','DOWN','LEFT','RIGHT','JOY21','LUP']))

    await page.locator('#azeron-art-test svg').screenshot({path:'build-jsm-sdl/azeron-acceptance/cyborg-thumb-highlight-preview.png'})
    assert.deepEqual(errors, [])
    console.log('PASS: Cyborg SVG labels, hit targets, live feedback, analog dot, keyboard selection and narrow layout')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
