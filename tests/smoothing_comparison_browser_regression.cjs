// Controlled telemetry: this validates the comparison, not hardware feel.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, top } = require('./gyro_v2_helpers.cjs')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.route('**/smoothing-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><script type="module">import "/src/index.css"; import "/src/App.css";</script></head><body></body></html>' }))
    await page.goto(new URL('/smoothing-fixture', process.env.JSM_TEST_URL || 'http://127.0.0.1:1428').href)
    await page.evaluate(async () => {
      const refresh = (await import('/@react-refresh')).default
      refresh.injectIntoGlobalHook(window)
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type
      window.__vite_plugin_react_preamble_installed__ = true
      const React = (await import('/node_modules/.vite/deps/react.js')).default
      const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default
      const { GyroFineTune } = await import('/src/components/gyro/GyroFineTune.tsx')
      const { GyroEnvProvider } = await import('/src/components/gyro/GyroContext.tsx')
      const { gyroRouteForKey } = await import('/src/utils/gyroRoutes.ts')
      await (await import('/src/i18n/index.ts')).initI18n()
      document.documentElement.dataset.theme = 'dark'
      const host = document.createElement('div'); document.body.append(host)
      window.__smooth = { connected: true, handle: 1, paused: false, counter: 0, mode: 'noise' }
      function Test() {
        const [text, setText] = React.useState('RESET_MAPPINGS\nGYRO_SENS = 4\nGYRO_SMOOTH_THRESHOLD = 100\nGYRO_SMOOTH_TIME = 0.18\nONE_EURO_FILTER = OFF')
        const [group, setGroup] = React.useState('steadiness')
        const [route, setRoute] = React.useState({ key: 0 })
        const [sample, setSample] = React.useState(null)
        window.__routeSmoothing = key => setRoute(v => ({ key: v.key + 1, sub: gyroRouteForKey(key)?.sub }))
        React.useEffect(() => {
          const emit = () => {
            const s = window.__smooth
            if (s.paused) return
            const n = s.counter++, t = performance.now()
            const x = s.mode === 'noise' ? (n % 2 ? 12 : -12) + 4 : 6
            const y = s.mode === 'noise' ? ((n % 3) - 1) * 8 : -3
            setSample({ t, devices: s.connected ? [{ handle: s.handle, type: 24, status: {
              gyro: { x: y, y: x, z: 0 }, motion: { timestampMs: t, input: { x, y }, filtered: { x: 999, y: 999 }, omega: Math.hypot(x, y) }
            } }] : [] })
          }
          emit(); const timer = setInterval(emit, 30); return () => clearInterval(timer)
        }, [])
        return React.createElement(GyroEnvProvider, { value: { text, setText, rootText: text, setRootText: setText, held: null, ownKeys: new Set(), family: 'steam', sample,
          callbacks: { counterOsMouseSpeed: false, onCounterOsMouseSpeedChange: () => {} } } },
          React.createElement(GyroFineTune, { open: true, onClose: () => {}, trail: ['Smoothing', 'Gyro'], group, onGroup: setGroup, routeKey: route.key, initialSub: route.sub }))
      }
      createRoot(host).render(React.createElement(Test))
    })
    const patch = next => page.evaluate(next => Object.assign(window.__smooth, next), next)
    const comparison = () => top(page).locator('[data-smoothing-comparison]')
    const panel = id => comparison().locator(`[data-smoothing-panel="${id}"]`)
    const path = (id, axis = 'horizontal') => panel(id).locator(`path[data-axis="${axis}"]`)
    await page.waitForTimeout(500)
    if (errors.length) throw new Error(errors.join('\n'))
    await comparison().waitFor(); await page.waitForTimeout(1200); await patch({ paused: true })
    assert.equal(await comparison().getAttribute('data-smoothing-comparison'), 'live')
    assert.notEqual(await path('before').getAttribute('d'), await path('after').getAttribute('d'))
    assert.notEqual(await path('before', 'vertical').getAttribute('d'), await path('after', 'vertical').getAttribute('d'))
    assert.equal(await panel('before').locator('svg').getAttribute('data-scale'), await panel('after').locator('svg').getAttribute('data-scale'))
    assert.ok(await panel('before').getByText('Before smoothing', { exact: true }).isVisible())
    assert.ok(await panel('after').getByText('After smoothing', { exact: true }).isVisible())
    const before = await path('before').getAttribute('d')
    await comparison().getByRole('button', { name: 'Pause trace' }).press('Enter')
    await patch({ paused: false }); await page.waitForTimeout(150)
    assert.equal(await path('before').getAttribute('d'), before, 'Pause trace freezes input while telemetry continues')
    await patch({ paused: true })
    fs.mkdirSync('tmp/smoothing-comparison', { recursive: true })
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme)
      for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 600 }]) {
        await page.setViewportSize(viewport); await comparison().scrollIntoViewIfNeeded()
        assert.ok(await top(page).locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1))
        for (const id of ['before', 'after']) {
          const box = await panel(id).boundingBox(); assert.ok(box.width > 250 && box.height > 90)
        }
        await top(page).screenshot({ path: `tmp/smoothing-comparison/comparison-${theme}-${viewport.width}.png` })
      }
    }
    // Current settings must replay the existing window without changing input.
    const route = async key => {
      await page.evaluate(async key => {
        window.__routeSmoothing(key)
      }, key)
      await page.waitForTimeout(250)
    }
    const returnToFilters = async () => {
      await top(page).locator('button[data-modal-close]').click()
      await top(page).locator('button[data-group="steadiness"]').click()
      await comparison().waitFor()
    }
    await route('GYRO_SMOOTH_TIME')
    const time = () => top(page).locator('[role="slider"][data-setting="GYRO_SMOOTH_TIME"]')
    await time().focus(); for (let i = 0; i < 8; i++) await time().press('ArrowLeft')
    await returnToFilters()
    assert.equal(await path('before').getAttribute('d'), before, 'editing filters retains raw sample window')
    assert.equal(await path('before').getAttribute('d'), await path('after').getAttribute('d'))
    await comparison().getByText('Smoothing is off: input and output are identical.', { exact: true }).waitFor()
    await route('GYRO_SMOOTH_TIME')
    await time().focus(); for (let i = 0; i < 12; i++) await time().press('ArrowRight')
    await returnToFilters()
    assert.notEqual(await path('before').getAttribute('d'), await path('after').getAttribute('d'))
    await comparison().getByRole('button', { name: 'Resume live' }).press('Enter')
    // A replacement selected device must never inherit the previous trace.
    await patch({ handle: 2, mode: 'constant', paused: false })
    await page.waitForTimeout(160); await patch({ paused: true })
    const replacement = await path('before').getAttribute('d')
    assert.ok((replacement.match(/L/g) || []).length < 100, 'source replacement clears old2s history')
    assert.notEqual(replacement, before)
    await patch({ connected: false, paused: false })
    await comparison().filter({ has: page.locator('[data-smoothing-panel="before"]') }).waitFor()
    await page.waitForFunction(() => document.querySelector('[data-smoothing-comparison]')?.dataset.smoothingComparison === 'simulation')
    await top(page).getByText('Smoothing example', { exact: true }).waitFor()
    assert.deepEqual(errors, [])
    console.log('PASS: visible signed before/after, common scales/time, noisy response, live edit/bypass with retained input, source reset, disconnect and dark/light1440/900')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
