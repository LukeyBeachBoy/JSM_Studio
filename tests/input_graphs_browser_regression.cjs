// Controlled component inputs; no native runtime or physical controller required.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1428/?mock')
    await page.evaluate(async () => {
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { SpeedUpChart } = await import('/src/components/sticks/visuals.tsx')
      const { speedUpGroup } = await import('/src/components/sticks/stickGroups.tsx')
      const { useTurned } = await import('/src/components/gyro/visuals.tsx')
      const { TrackpadFineTune } = await import('/src/components/trackpads/TrackpadFineTune.tsx')
      const host = document.createElement('div'); host.id = 'input-graphs'
      host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg-app,#10151b);color:var(--text-1);padding:32px;overflow:auto'
      document.body.append(host)
      function Test() {
        const [state, setState] = React.useState({ view: 'stick', held: 1, cap: 12, rate: .5, sens: 300, ts: 1000, handle: 1, speed: 600, maxGain: 4, link: '', group: 'speed', text: 'RIGHT_TOUCHPAD_MODE = MOUSE\nTOUCHPAD_TRACKBALL_DECAY = 4\nACCEL_CURVE = LINEAR\nMIN_GYRO_THRESHOLD = 10\nMAX_GYRO_THRESHOLD = 40' })
        window.patchInputGraph = patch => setState(old => ({ ...old, ...patch }))
        host.style.zIndex = state.view === 'pad' ? '0' : '99999'
        const turned = useTurned({ ts: state.ts, t: .25, devices: [{ handle: state.handle, status: { gyro: { x: 0, y: 10, z: 0 } } }] })
        const pad = { side: 'right', card: {}, live: null, regions: [], menuKey: '', speed: state.speed, pressure: state.pressure ?? .2, modeshiftTarget: { kind: 'rightTouchpad' } }
        return React.createElement(React.Fragment, null,
          React.createElement('output', { id: 'turned' }, turned.degrees),
          state.view === 'stick' ? React.createElement('div', { style: { width: 600, maxWidth: '100%' } }, React.createElement(SpeedUpChart, { sens: state.sens, rate: state.rate, cap: state.cap, held: state.held, presets: [{ label: 'Fast', rate: 3, cap: 30 }] }))
          : state.view === 'hold' ? speedUpGroup({ text: 'STICK_SENS = 300\nSTICK_ACCELERATION_RATE = 1\nSTICK_DEADZONE_OUTER = 0', SIDE: 'LEFT', side: 'left', controllerHandle: state.handle, live: { x: state.push ?? .995, y: 0 } }).visual
          : React.createElement(TrackpadFineTune, { pad, name: 'Right pad', group: state.group, onGroup: group => setState(old => ({ ...old, group })), onClose: () => {}, selected: null,
              page: { liveDevice: state.online === false ? undefined : { handle: state.handle, status: {} }, readText: state.text, setText: update => setState(old => ({ ...old, text: typeof update === 'function' ? update(old.text) : update })), pads: [pad], padAspect: 1, stickButtons: [], warnings: [], virtualControllerType: 'XBOX',
                accel: { link: state.link, values: { curve: 'QUADRATIC', minGain: 1, maxGain: state.maxGain, minThreshold: 200, maxThreshold: 2200, naturalVHalf: 1200, powerVRef: 1200, powerExponent: 2, sigmoidMid: 1200, sigmoidWidth: 300, jumpTau: 200 } },
                renderButton: () => null, renderModeshifts: () => null, describe: () => ({ binding: '' }) } }))
      }
      createRoot(host).render(React.createElement(Test))
    })
    const patch = async update => { await page.evaluate(update => window.patchInputGraph(update), update); await page.waitForTimeout(70) }
    const host = page.locator('#input-graphs')
    await host.locator('svg').waitFor()
    await patch({ ts: 1100 }); assert.equal(await host.locator('#turned').innerText(), '1')
    await patch({ sens: 400 }); assert.equal(await host.locator('#turned').innerText(), '1', 'configuration rerender cannot integrate the same telemetry twice')
    await patch({ ts: 2100 }); assert.equal(await host.locator('#turned').innerText(), '1', 'long missing-packet gap is ignored')
    await patch({ handle: 2, ts: 2200 }); assert.equal(await host.locator('#turned').innerText(), '0', 'controller change resets turn history')
    const graph = host.locator('svg')
    assert.match(await graph.textContent(), /22 s/, 'slow acceleration must show the time needed to reach the cap')
    const dot = graph.locator('circle'); const before = await dot.getAttribute('cx')
    await patch({ held: 10 }); assert.notEqual(await dot.getAttribute('cx'), before)
    for (const d of await graph.locator('path').evaluateAll(paths => paths.map(p => p.getAttribute('d')))) {
      for (const match of d.matchAll(/(?:M|L)([\d.]+),([\d.]+)/g)) assert.ok(Number(match[2]) >= 29 && Number(match[2]) <= 200, 'high-cap comparison fits the plot')
    }
    await patch({ view: 'hold' }); await page.waitForTimeout(220)
    assert.match(await host.locator('svg').getAttribute('aria-label'), /Held 0.0 seconds/, '99.5% is not pegged with zero outer deadzone')
    await patch({ push: 1 }); await page.waitForTimeout(300)
    assert.doesNotMatch(await host.locator('svg').getAttribute('aria-label'), /Held 0.0 seconds/)
    await patch({ handle: 9 })
    assert.match(await host.locator('svg').getAttribute('aria-label'), /Held 0.0 seconds/, 'selected controller change resets observed hold')
    await patch({ view: 'pad' })
    const padGraph = page.locator('[data-trackpad-fine-tune-page] svg[role="img"]').first()
    await padGraph.waitFor()
    const padDot = padGraph.locator('circle'); const padBefore = await padDot.getAttribute('cx')
    await patch({ speed: 1800 }); assert.notEqual(await padDot.getAttribute('cx'), padBefore)
    const currentPath = () => padGraph.locator('path[stroke="var(--accent)"]')
    const curveBefore = await currentPath().getAttribute('d')
    await patch({ link: 'TOUCHPAD_USES_GYRO' }); assert.notEqual(await currentPath().getAttribute('d'), curveBefore, 'borrowed gyro shape changes the pad preview')
    const borrowedBefore = await currentPath().getAttribute('d')
    await patch({ maxGain: 8 }); assert.notEqual(await currentPath().getAttribute('d'), borrowedBefore, 'gain edit redraws borrowed curve')
    await patch({ group: 'glide' })
    await padGraph.getByText('Time after lift →').waitFor()
    const glideBefore = await padGraph.textContent()
    await patch({ text: 'RIGHT_TOUCHPAD_MODE = MOUSE\nTOUCHPAD_TRACKBALL_DECAY = 8' })
    assert.notEqual(await padGraph.textContent(), glideBefore, 'decay changes predicted duration on the fitted time axis')
    await patch({ speed: 100 })
    for (const point of (await currentPath().getAttribute('d')).matchAll(/(?:M|L)([\d.]+),([\d.]+)/g)) assert.equal(Number(point[2]), 170, 'below launch threshold must not coast')
    fs.mkdirSync('tmp/graph-verification', { recursive: true })
    const theme = process.env.JSM_TEST_THEME || 'dark'
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const width of [1440, 900]) {
      await page.setViewportSize({ width, height: width === 900 ? 600 : 1000 })
      for (const group of ['speed', 'glide']) {
        await patch({ group, speed: 1800 })
        await padGraph.scrollIntoViewIfNeeded()
        await page.locator('[data-subpage]').last().screenshot({ path: `tmp/graph-verification/trackpad-${group}-${width}-${theme}.png` })
      }
    }
    await patch({ group: 'click', pressure: .3 })
    await padGraph.getByText('Last 2 seconds →').waitFor()
    const pressurePath = padGraph.locator('path[stroke="var(--telemetry)"]')
    await patch({ pressure: .9 })
    assert.match(await pressurePath.getAttribute('d'), /,44(?:\D|$)/, 'live pressure updates trace height')
    await patch({ handle: 3 })
    assert.ok(!(await pressurePath.getAttribute('d')).includes('L'), 'changing controller clears pressure history')
    await patch({ online: false })
    assert.equal(await padGraph.getAttribute('aria-label'), 'No live pressure')
    assert.equal(await pressurePath.getAttribute('d'), '')
    await patch({ group: 'speed' })
    assert.equal(await padGraph.locator('circle').count(), 0, 'disconnected pad has no live marker')
    assert.deepEqual(errors, [])
    console.log('PASS: timestamp integration/reset, stick time/cap range, trackpad live speed/gain/borrowed shape, glide decay/threshold and pressure history/reset/disconnect; 1440/900 widths')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
