// Synthetic telemetry only: validates graph math/reactivity, not physical gyro feel.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, typeValue } = require('./gyro_v2_helpers.cjs')
const fs = require('node:fs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(10000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      localStorage.setItem('jsm-accent', 'amber'); localStorage.setItem('jsm-theme', 'dark')
      let content = ['RESET_MAPPINGS', 'TILT_OFF = NONE', 'RIGHT_TOUCHPAD_MODE = MOUSE', 'MIN_GYRO_SENS = 5 3', 'MAX_GYRO_SENS = 21 6', 'ACCEL_CURVE = QUADRATIC', 'MAX_GYRO_THRESHOLD = 80', 'GYRO_CUTOFF_RECOVERY = 5', 'GYRO_STEADYING_FLOOR = 2 1.5', 'GYRO_SMOOTH_THRESHOLD = 20', 'GYRO_SMOOTH_TIME = 0.2', 'MOTION_DEADZONE_INNER = 15', 'MOTION_DEADZONE_OUTER = 135'].join('\n')
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Graphs', path: 'profiles-library/Graphs.txt', content }),
        listLibraryProfiles: async () => ['Graphs'], loadLibraryProfile: async name => ({ name, content }),
        getRuntimeState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.__graph = { omega: 1, tilt: 25, derivative: 100, input: 8, wave: false, connected: true }
      window.telemetry = { onSample: callback => {
        const emit = () => {
          const state = window.__graph, t = performance.now()
          const x = state.wave ? Math.sin(t / 150) * state.input : state.input
          callback({ t, omega: 999, activeProfile: 'profiles-library/Graphs.txt', devices: state.connected ? [{ handle: 1, type: 24, supportedButtons: 8589934591,
            status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 10, z: 0 },
              motion: { timestampMs: t, input: { x, y: x * .4 }, filtered: { x: state.omega, y: 0 }, derivative: { x: state.derivative, y: 0 }, snapInput: { x: 10, y: 2 }, omega: state.omega, sensX: 2.1739048, sensY: 1.58690715, tiltAngle: state.tilt } } }] : [] })
        }
        emit(); const timer = setInterval(emit, 30); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1428')
    await openGyro(page)
    const go = async key => {
      await page.evaluate(async key => {
        const { gyroRouteForKey } = await import('/src/utils/gyroRoutes.ts')
        window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: gyroRouteForKey(key) }))
      }, key)
      await page.waitForTimeout(220)
    }
    const setLive = patch => page.evaluate(patch => Object.assign(window.__graph, patch), patch)
    const row = key => top(page).locator(`[role="slider"][data-setting="${key}"]`).first()
    const curvePath = () => top(page).locator('.curve-plot__curve')
    const chartPath = () => top(page).locator('svg[role="img"] path[class*="_curve_"]').first()
    await go('MAX_GYRO_THRESHOLD')
    await top(page).locator('.curve-plot__bubble[data-tone="live"]').getByText(/2.17×/).waitFor()
    const liveBefore = await top(page).locator('.curve-plot__live circle').getAttribute('cx')
    await setLive({ omega: 40 })
    await page.waitForFunction(before => document.querySelector('[data-speed-advanced] .curve-plot__live circle')?.getAttribute('cx') !== before, liveBefore)
    const before = await curvePath().getAttribute('d')
    await typeValue(row('MAX_GYRO_SENS'), 30)
    assert.notEqual(await curvePath().getAttribute('d'), before, 'configuration edit redraws curve immediately')
    await go('GYRO_STEADYING_FLOOR')
    const floorBefore = await chartPath().getAttribute('d')
    await typeValue(row('GYRO_STEADYING_FLOOR'), 4)
    assert.notEqual(await chartPath().getAttribute('d'), floorBefore, 'steadying floor changes Sensitivity response graph')
    await go('GYRO_SMOOTH_TIME')
    await typeValue(row('GYRO_SMOOTH_TIME'), 0)
    const zeroPath = await chartPath().getAttribute('d')
    await typeValue(row('GYRO_SMOOTH_TIME'), .2)
    assert.notEqual(await chartPath().getAttribute('d'), zeroPath, 'zero smoothing time must be a bypass')
    const dot = top(page).locator('circle[data-live-value]')
    const inputBefore = await dot.getAttribute('cx')
    await setLive({ input: 30 })
    await page.waitForFunction(before => [...document.querySelectorAll('[data-subpage]')].at(-1)?.querySelector('circle[data-live-value]')?.getAttribute('cx') !== before, inputBefore)
    await go('ONE_EURO_SPEED_COEFF')
    const offPath = await chartPath().getAttribute('d')
    await top(page).locator('[role="switch"][data-setting="ONE_EURO_FILTER"]').click()
    await page.waitForTimeout(200)
    assert.notEqual(await chartPath().getAttribute('d'), offPath, 'One Euro off plots zero previous-output weight')
    const euroBefore = await chartPath().getAttribute('d')
    await typeValue(row('ONE_EURO_SPEED_COEFF'), .7)
    assert.notEqual(await chartPath().getAttribute('d'), euroBefore)
    await top(page).locator('svg').filter({ hasText: 'Filtered angular acceleration' }).waitFor()
    await setLive({ derivative: 350 })
    await top(page).locator('circle[data-live-value="350"]').waitFor()
    await top(page).locator('button[data-modal-close]').click()
    await top(page).locator('button[data-group="steadiness"]').click()
    await top(page).locator('[data-gyro-fine-tune-page][data-group="steadiness"]').waitFor()
    await setLive({ wave: true })
    const sweep = top(page).locator('[data-smoothing-panel="after"] path[data-axis="horizontal"]')
    await sweep.waitFor(); const sweepBefore = await sweep.getAttribute('d')
    await page.waitForTimeout(160)
    assert.notEqual(await sweep.getAttribute('d'), sweepBefore, 'filter preview follows recent real input samples')
    await go('MOTION_DEADZONE_INNER')
    await top(page).locator('[data-tilt-angle="25"]').waitFor()
    const tiltBefore = await top(page).locator('[data-tilt-angle]').getAttribute('cy')
    await typeValue(row('MOTION_DEADZONE_INNER'), 24)
    assert.notEqual(await top(page).locator('[data-tilt-angle]').getAttribute('cy'), tiltBefore, 'tilt deadzone edit reprojects live angle')
    await setLive({ tilt: 100 })
    await top(page).locator('[data-tilt-angle="100"]').waitFor()
    fs.mkdirSync('tmp/graph-verification', { recursive: true })
    const theme = process.env.JSM_TEST_THEME || 'dark'
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 900, height: 600 }]) {
      await page.setViewportSize(viewport)
      for (const [name, key] of [['tilt', 'MOTION_DEADZONE_INNER'], ['curve', 'MAX_GYRO_THRESHOLD'], ['smoothing', 'GYRO_SMOOTH_TIME'], ['adaptive', 'ONE_EURO_SPEED_COEFF']]) {
        await go(key)
        assert.ok(await top(page).evaluate(host => host.querySelector('main').scrollWidth <= host.querySelector('main').clientWidth + 1), `${name} has no horizontal overflow at ${viewport.width}`)
        await top(page).locator(name === 'curve' ? '.curve-plot' : 'svg[role="img"]').first().scrollIntoViewIfNeeded()
        await top(page).screenshot({ path: `tmp/graph-verification/${name}-${viewport.width}-${theme}.png` })
      }
    }
    await go('MAX_GYRO_THRESHOLD'); await setLive({ connected: false })
    await top(page).locator('.curve-plot__live').waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log('PASS: native per-device signal selection, live/config curve redraw, steadying floor, smoothing bypass/input, One Euro toggle/beta/derivative, sampled filter replay, tilt live/config and disconnect; 1440x1000 and 900x600')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
