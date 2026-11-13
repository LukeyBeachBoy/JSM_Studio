// Real header components, with native window actions mocked: never closes a real window.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1428'
const out = path.resolve('tmp/frameless-header')
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(`${base}/?mock`)
    await page.locator('[data-home-continue]').waitFor()
    await page.evaluate(async () => {
      const React = await import('/node_modules/.vite/deps/react.js')
      const ReactDOM = await import('/node_modules/.vite/deps/react-dom_client.js')
      const createRoot = ReactDOM.createRoot ?? ReactDOM.default.createRoot
      const { TitleBar } = await import('/src/shell/TitleBar.tsx')
      const { PageTabs } = await import('/src/shell/PageTabs.tsx')
      const { ControllerSelector } = await import('/src/components/ControllerSelector.tsx')
      const { SubPage } = await import('/src/components/ui/console/SubPage.tsx')
      const { ShellContext } = await import('/src/shell/ShellContext.tsx')
      const { windowControls } = await import('/src/shell/windowControls.ts')
      const h = (React.default ?? React).createElement
      window.__nativeCalls = []
      let maximized = false, resized
      windowControls.minimize = async () => { window.__nativeCalls.push('minimize') }
      windowControls.toggleMaximize = async () => { maximized = !maximized; window.__nativeCalls.push('maximize'); resized?.() }
      windowControls.close = async () => { window.__nativeCalls.push('close') }
      windowControls.isMaximized = async () => maximized
      windowControls.onResized = async callback => { resized = callback; return () => {} }
      window.electronAPI.listAutoloadRules = async () => [{ kind: 'profile', profileName: 'Cyberpunk', processName: 'Cyberpunk2077', exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe', builtIn: false }]
      document.querySelector('#root').style.display = 'none'
      const host = document.createElement('div')
      host.id = 'native-header-fixture'
      document.body.append(host)
      const root = createRoot(host)
      const noop = () => {}
      const devices = [{ type: 24, handle: 1 }, { type: 25, handle: 2 }]
      window.__renderHeader = (width, variant = 'editing', state = 'applied', liveOther = false, subpage = false) => {
        const shellWidth = width < 1280 ? 'compact' : 'wide'
        const primary = variant === 'editing' ? 'buttons' : variant === 'home' ? 'home' : 'configurations'
        const tabs = variant === 'home' ? null : h(PageTabs, { width: shellWidth, current: primary, onSelect: noop, status: { kind: 'connected', name: 'Steam Controller' }, onOpenDrawer: noop, drawerOpen: false })
        root.render(h('div', { className: 'app-shell', 'data-page-group': variant === 'editing' ? 'controls' : variant, 'data-width': shellWidth },
          h(TitleBar, { width: shellWidth, frameless: true, variant, onHome: noop, studioTitle: 'Library', controllerLabel: { text: 'Steam Controller · 82%', connected: true },
            chipController: 'Steam Controller · controller layout', controllerSelector: h(ControllerSelector, { devices, target: 'type-24', text: '', onSelect: noop }), tabs,
            editingName: 'Cyberpunk', dirty: state === 'changes', profiles: [], appliedName: liveOther ? 'Project Zomboid - Viewpoint' : 'Cyberpunk', onSelectProfile: noop, onOpenLibrary: noop, onOpenConfigMenu: noop, onEditApplied: noop, mapping: 'studio',
            state: state === 'changes' ? { kind: 'changes', count: 4 } : state === 'apply' ? { kind: 'apply', name: 'Cyberpunk' } : { kind: 'applied' }, onStatePress: noop, onSave: noop, onSearch: noop }),
          subpage ? h(ShellContext.Provider, { value: { width: shellWidth, family: 'steam-controller-2026', controller: true, configName: 'Cyberpunk', statusChip: null } },
            h(SubPage, { open: true, onClose: noop, title: 'Real-world calibration (RWC)', trail: ['Gyro'] }, h('p', null, 'Calibration content'))) : null))
      }
    })
    for (const [width, height] of [[1452, 907], [1280, 800], [1100, 700], [900, 600]]) {
      await page.setViewportSize({ width, height })
      for (const [variant, state, liveOther] of [['editing', 'applied', false], ['editing', 'changes', false], ['editing', 'apply', true], ['home', 'applied', false], ['studio', 'applied', false]]) {
        await page.evaluate(args => window.__renderHeader(...args), [width, variant, state, liveOther])
        await page.waitForTimeout(180)
        const boxes = await page.locator('#native-header-fixture .titlebar').evaluate(header => {
          const rect = element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, width: b.width, height: b.height } }
          const primary = header.querySelector('.titlebar__primary')
          const controls = header.querySelector('.window-controls')
          return { header: rect(header), controls: rect(controls), buttons: [...primary.children].filter(el => el.checkVisibility()).map(rect), primaryOverflow: primary.scrollWidth - primary.clientWidth, labels: [...header.querySelectorAll('.page-tab__label')].filter(el => el.checkVisibility()).length, tabs: header.querySelector('.page-tabs') ? rect(header.querySelector('.page-tabs')) : null, gap: getComputedStyle(header).gap }
        })
        assert.equal(boxes.controls.right, width, JSON.stringify(boxes))
        assert.equal(boxes.controls.y, 0)
        assert.equal(boxes.controls.height, 44)
        assert.ok(boxes.primaryOverflow <= 1, `${width} ${variant} ${state} primary overflow: ${JSON.stringify(boxes)}`)
        assert.ok(boxes.buttons.every(box => box.y >= 0 && box.bottom <= 64 && box.right <= boxes.controls.x), `${width} ${variant} ${state} clips or overlaps native controls: ${JSON.stringify(boxes)}`)
        if (variant === 'editing') {
          assert.equal(boxes.labels, 8)
          assert.ok(boxes.tabs.y >= 64 && boxes.tabs.bottom <= boxes.header.bottom + 1, `tabs leave reserved row: ${JSON.stringify(boxes)}`)
          await page.locator('#native-header-fixture .game-chip img[data-app-icon]').waitFor()
          assert.equal(await page.locator('#native-header-fixture .configuration-mark').count(), 0, 'available executable icon replaces fallback')
        }
        if (variant === 'editing' && liveOther) await page.screenshot({ path: path.join(out, `${width}-header.png`), clip: { x: 0, y: 0, width, height: 112 } })
      }
    }
    await page.getByRole('button', { name: 'Minimise', exact: true }).click()
    await page.getByRole('button', { name: 'Maximise', exact: true }).click()
    await page.getByRole('button', { name: 'Restore', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => window.__nativeCalls), ['minimize', 'maximize', 'close'])
    // Enable only the frameless detection for SubPage after the isolated mock
    // mounts; native calls remain the mocked windowControls methods above.
    await page.evaluate(() => { window.__TAURI_INTERNALS__ = {}; window.__renderHeader(900, 'editing', 'applied', false, true) })
    const sub = page.locator('[data-subpage]')
    await sub.getByRole('button', { name: 'Close', exact: true }).waitFor()
    await page.waitForTimeout(300)
    assert.equal((await sub.locator('.window-controls').boundingBox()).x + 138, 900)
    await page.screenshot({ path: path.join(out, '900-subpage.png') })
    console.log('PASS: frameless controls anchored, no row wrapping/overlap at four sizes and five states, game icon, native action routing and subpage controls')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
