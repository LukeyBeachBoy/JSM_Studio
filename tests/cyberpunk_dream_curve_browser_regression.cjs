// Reads an optional real profile, but all interactions use an isolated browser mock.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { prepare, openGyro, top } = require('./gyro_v2_helpers.cjs')
const source = process.env.JSM_CYBERPUNK_CONFIG
const fixture = 'RESET_MAPPINGS\nMIN_GYRO_SENS = 5 3\nMAX_GYRO_SENS = 21 6\nACCEL_CURVE = QUADRATIC\nMIN_GYRO_THRESHOLD = 0\nMAX_GYRO_THRESHOLD = 80\nGYRO_CUTOFF_SPEED = 0\nGYRO_CUTOFF_RECOVERY = 5\nGYRO_STEADYING_FLOOR = 2 2\n'
const content = source ? fs.readFileSync(source, 'utf8') : fixture
const hash = text => crypto.createHash('sha256').update(text).digest('hex')
const originalHash = hash(content)
const expected = speed => {
  const t = Math.min(1, speed / 80), u = Math.min(1, speed / 5)
  const blend = 6 * u ** 5 - 15 * u ** 4 + 10 * u ** 3
  return [2 + blend * (5 + 16 * t * t - 2), 2 + blend * (3 + 3 * t * t - 2)]
}
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    page.setDefaultTimeout(10000)
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await prepare(page)
    await page.addInitScript(content => {
      let api, telemetry
      const profile = new URLSearchParams(location.search).has('floorOnly')
        ? content.replace(/^MIN_GYRO_SENS = .*$/m, 'MIN_GYRO_SENS = 5 5').replace(/^MAX_GYRO_SENS = .*$/m, 'MAX_GYRO_SENS = 21 21').replace(/^GYRO_STEADYING_FLOOR = .*$/m, 'GYRO_STEADYING_FLOOR = 2 1.5') : content
      Object.defineProperty(window, 'electronAPI', { configurable: true, get: () => api, set: mock => {
        api = { ...mock,
          getActiveProfile: async () => ({ name: 'Cyberpunk', path: 'profiles-library/Cyberpunk.txt', content: profile }),
          loadLibraryProfile: async () => ({ name: 'Cyberpunk', content: profile }),
          listLibraryProfiles: async () => ['Cyberpunk'],
          getLayerStack: async () => ({ profile: 'profiles-library/Cyberpunk.txt', layers: [] }),
        }
      } })
      window.__dreamSpeed = 1
      Object.defineProperty(window, 'telemetry', { configurable: true, get: () => telemetry, set: () => {
        telemetry = { onSample: callback => {
          const emit = () => { const t = performance.now(); callback({ t, activeProfile: 'profiles-library/Cyberpunk.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
            status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 },
              motion: { timestampMs: t, input: { x: window.__dreamSpeed, y: 0 }, filtered: { x: window.__dreamSpeed, y: 0 }, derivative: { x: 0, y: 0 }, omega: window.__dreamSpeed, sensX: 2.1739048, sensY: 2.05794715 } } }] }) }
          emit(); const timer = setInterval(emit, 30); return () => clearInterval(timer)
        } }
      } })
    }, content)
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1428'}/?mock`)
    await openGyro(page)
    await page.evaluate(async () => {
      const { gyroRouteForKey } = await import('/src/utils/gyroRoutes.ts')
      window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: gyroRouteForKey('MAX_GYRO_THRESHOLD') }))
    })
    await top(page).locator('.curve-plot__curve').waitFor()
    await top(page).locator('[data-steadying-summary]').filter({ hasText: /Steadying floor: 2× horizontal \/ 2× vertical/ }).waitFor()
    await top(page).locator('[data-steadying-summary]').filter({ hasText: /Smooth S-shaped transition/ }).waitFor()
    // Compare every rendered SVG point with an independent equation, not a redraw-only assertion.
    const readings = await top(page).locator('.curve-plot').evaluate(host => {
      const frame = host.querySelector('.curve-plot__frame')
      const x = +frame.getAttribute('x'), y = +frame.getAttribute('y'), w = +frame.getAttribute('width'), h = +frame.getAttribute('height')
      const ticks = [...host.querySelectorAll('.curve-plot__ticks text')].filter(t => t.getAttribute('text-anchor') === 'end' && !t.classList.contains('curve-plot__axis-name'))
      const yMax = Math.max(...ticks.map(t => +t.textContent))
      const points = selector => [...host.querySelector(selector).getAttribute('d').matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => ({ speed: (+m[1] - x) / w * 100, sens: (y + h - +m[2]) / h * yMax }))
      return { horizontal: points('.curve-plot__curve'), vertical: points('.curve-plot__secondary'), output: !!host.querySelector('.curve-plot__output') }
    })
    assert.equal(readings.output, false, 'sensitivity chart has no unrelated normalised output-speed trace')
    for (const [axis, points] of Object.entries(readings).filter(([k]) => k !== 'output')) {
      for (const p of points) assert.ok(Math.abs(p.sens - expected(p.speed)[axis === 'horizontal' ? 0 : 1]) < .035, `${axis} at ${p.speed}: ${p.sens}`)
    }
    const table = await page.evaluate(async content => {
      const { effectiveGyroCurveParams } = await import('/src/utils/gyroSpeed.ts')
      const { accelSensitivityAt } = await import('/src/utils/accelCurve.ts')
      const { projectController } = await import('/src/utils/controllerLayouts.ts')
      const text = projectController(content, 'type-24')
      return [0, 1, 3, 5, 20, 40, 60, 80].map(speed => ({ speed, x: accelSensitivityAt(speed, effectiveGyroCurveParams(text)), y: accelSensitivityAt(speed, effectiveGyroCurveParams(text, text, 'y')) }))
    }, content)
    for (const p of table) { const [x, y] = expected(p.speed); assert.ok(Math.abs(p.x - x) < 1e-7); assert.ok(Math.abs(p.y - y) < 1e-7) }
    const output = path.resolve(__dirname, '../tmp/cyberpunk-dream-curve'); fs.mkdirSync(output, { recursive: true })
    fs.writeFileSync(path.join(output, 'verified-values.json'), JSON.stringify({ source: source || 'canonical fixture', profileSha256: originalHash, table }, null, 2))
    // Drag bubble reports the editable curve value (5x), rather than the effective floor (2x).
    const handle = top(page).locator('.curve-plot__handle[data-handle="min"]')
    const box = await handle.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
    await top(page).locator('.curve-plot__bubble[data-tone="handle"]').getByText(/Curve minimum · 0.0 °\/s → 5×/).waitFor()
    await page.mouse.up(); await page.mouse.move(0, 0)
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async theme => {
        const { persistAppearance } = await import('/src/appearanceStorage.ts')
        await persistAppearance('jsm-theme', theme)
        window.dispatchEvent(new StorageEvent('storage', { key: 'jsm-theme', newValue: theme }))
      }, theme)
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      for (const width of [1440, 900]) {
        await page.setViewportSize({ width, height: width === 900 ? 600 : 900 }); await page.waitForTimeout(300)
        assert.equal(await top(page).locator('main').evaluate(n => n.scrollWidth <= n.clientWidth + 1), true)
        await top(page).locator('.curve-plot').scrollIntoViewIfNeeded()
        await top(page).screenshot({ path: path.join(output, `curve-${theme}-${width}.png`) })
      }
    }
    await page.keyboard.press('Escape')
    await top(page).locator('[data-gyro-fine-tune-page]').waitFor()
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1428'}/?mock&floorOnly`)
    await openGyro(page)
    await page.evaluate(async () => {
      const { gyroRouteForKey } = await import('/src/utils/gyroRoutes.ts')
      window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: gyroRouteForKey('MAX_GYRO_THRESHOLD') }))
    })
    await top(page).locator('.curve-plot__secondary').waitFor()
    assert.notEqual(await top(page).locator('.curve-plot__curve').getAttribute('d'), await top(page).locator('.curve-plot__secondary').getAttribute('d'), 'different floors need two curves even when both base sensitivities match')
    await top(page).locator('[data-steadying-summary]').filter({ hasText: /2× horizontal \/ 1.5× vertical/ }).waitFor()
    assert.deepEqual(errors, [])
    if (source) assert.equal(hash(fs.readFileSync(source, 'utf8')), originalHash, 'real saved profile is read-only')
    console.log('PASS: actual projected Cyberpunk curve, both axes, every rendered point, handle readout, four theme/size captures and Back; profile unchanged')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
