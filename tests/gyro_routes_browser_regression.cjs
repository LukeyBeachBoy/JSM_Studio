// Console v2 (P5): links into the Gyro tab (Review changes' A, a configuration
// error's Open, the curve editor's Gyro chip) land on the Fine-tune group or
// Advanced part that edits the key: utils/gyroRoutes.ts, asked for with
// requestGyroRoute. Renderer only, with the mock desktop.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click().catch(() => {})
    await page.locator('[data-home-continue]').click()
    // The same module instance the app uses: the one it imports by this URL.
    // The route rides on the event (Vite may serve this module under another ?t= than the app's copy).
    const go = key => page.evaluate(async key => {
      const routes = await import('/src/utils/gyroRoutes.ts')
      const route = routes.gyroRouteForKey(key)
      if (!route) return 'no route'
      window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: route }))
      return 'ok'
    }, key)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'gyro' })))
    await page.locator('[data-gyro-front]').waitFor()
    const where = () => page.evaluate(() => {
      const subs = [...document.querySelectorAll('[data-subpage]')]
      const top = subs[subs.length - 1]
      if (!top) return { sub: 'front', group: '', active: '' }
      const title = top.querySelector(':scope > header b')?.textContent?.trim() ?? ''
      const current = top.querySelector('nav[aria-label="Groups"] [aria-current="true"] span')?.textContent?.trim()
        ?? top.querySelector('[role="tab"][aria-selected="true"] b')?.textContent?.trim()
        ?? top.querySelector('[data-gyro-fine-tune-page]')?.getAttribute('data-group') ?? ''
      return { sub: title, depth: subs.length, active: current }
    })
    const close = async () => { for (let n = 0; n < 6 && (await page.locator('[data-subpage]').count()) > 0; n++) { await page.keyboard.press('Escape'); await page.waitForTimeout(150) } }
    const cases = [
      ['GYRO_SENS', { sub: 'Fine-tune', active: 'Speed' }],
      ['MAX_GYRO_THRESHOLD', { sub: 'Advanced', active: 'Speeds' }],
      ['ACCEL_SIGMOID_WIDTH', { sub: 'Advanced', active: 'Shape' }],
      ['IN_GAME_SENS', { sub: 'Advanced', active: 'Game & lean' }],
      ['GYRO_SMOOTH_TIME', { sub: 'Advanced', active: 'Smoothing' }],
      ['GYRO_STEADYING_FLOOR', { sub: 'Advanced', active: 'Ignore jitter' }],
      ['ONE_EURO_SPEED_COEFF', { sub: 'Advanced', active: 'Adaptive filter' }],
      ['DECEL_BRAKE_THRESHOLD', { sub: 'Advanced', active: 'Snap & brake' }],
      ['GYRO_HAPTIC_INTERVAL', { sub: 'Fine-tune', active: 'Rumble' }],
      ['GYRO_AXIS_Y', { sub: 'Fine-tune', active: 'Direction' }],
      ['TICK_TIME', { sub: 'Advanced', active: '' }],
      ['MOTION_DEADZONE_INNER', { sub: 'Tilt', active: 'Angles' }],
      ['TILT_ON', { sub: 'Tilt', active: 'When tilt is on' }],
      ['GYRO_DEFLECTION_RANGE', { sub: 'Right stick settings', active: 'Setup' }],
      ['GYRO_ON', { sub: 'When is gyro on?', active: '' }],
      ['GYRO_CALIBRATION_TIME', { sub: 'Recalibrate', active: '' }],
    ]
    for (const [key, expected] of cases) {
      assert.equal(await go(key), 'ok', key)
      await page.locator('[data-subpage]').last().waitFor()
      await page.waitForTimeout(300)
      const got = await where()
      assert.equal(got.sub.replace(/^Right stick settings$/, 'Right stick settings'), expected.sub.replace(/^Right stick settings$/, 'Right stick settings'), `${key} opens ${expected.sub}, got ${JSON.stringify(got)}`)
      if (expected.active) assert.equal(got.active, expected.active, `${key} lands on ${expected.active}, got ${JSON.stringify(got)}`)
      await close()
    }
    // A held gyro setting opens the held button's own variant.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: { view: 'while-holding', trigger: 'L' } })))
    await page.locator('[data-subpage] [data-gyro-fine-tune-page]').waitFor()
    assert.match(await page.locator('[data-subpage]').last().locator(':scope > header').innerText(), /Mode shift · L/, 'a held setting opens the held button’s own variant')
    assert.deepEqual(errors, [])
    console.log('PASS: every key opens the Fine-tune group or Advanced part that edits it')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
