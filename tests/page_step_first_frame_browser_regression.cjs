// LB / RB (PgUp / PgDn) land on the new page's first control on the very first
// frame the page is drawn: no beat with nothing selected, then the row
// expanding after the slide-in.
// Renderer-only mock validation; does not launch the mapper or physical hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const BASE = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '') + '/?mock'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(BASE)
    await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
    const keep = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keep.isVisible()) await keep.click()
    await page.locator('[data-home-continue]').click()
    await page.locator('.profile-chip').waitFor()
    await page.waitForTimeout(1500)

    // Every frame from here: which tab is current and what has focus.
    const record = () => page.evaluate(() => new Promise(resolve => {
      window.__frames = []
      window.__startTab = document.querySelector('.titlebar .page-tab[aria-current="page"]')?.getAttribute('aria-label')
      const loop = () => {
        window.__frames.push({ tab: document.querySelector('.titlebar .page-tab[aria-current="page"]')?.getAttribute('aria-label'), active: document.activeElement })
        if (window.__frames.length === 2) resolve()
        if (window.__frames.length < 180) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }))
    const check = async (how) => {
      const result = await page.evaluate(() => {
        const frames = window.__frames
        const start = window.__startTab
        const first = frames.findIndex(frame => frame.tab !== start)
        const final = document.activeElement
        const describe = element => element === document.body ? 'body' : `${element?.tagName}.${element?.className}:${(element?.textContent ?? '').trim().slice(0, 30)}`
        return {
          changed: first >= 0,
          inPage: Boolean(document.querySelector('.main-pane')?.contains(final)),
          firstFrame: first >= 0 ? describe(frames[first].active) : null,
          final: describe(final),
          same: first >= 0 && frames[first].active === final,
        }
      })
      assert.ok(result.changed, `${how}: the tab changed`)
      assert.ok(result.inPage, `${how}: focus ends in the new page (${result.final})`)
      assert.ok(result.same, `${how}: the first frame of the new page already has its first control focused (first frame: ${result.firstFrame}, settled: ${result.final})`)
    }

    // The keyboard's PgDn / PgUp.
    await page.locator('.shell-scroll').click({ position: { x: 5, y: 5 } })
    for (const key of ['PageDown', 'PageDown', 'PageUp']) {
      await record()
      await page.keyboard.press(key)
      await page.waitForTimeout(1600)
      await check(key)
    }
    // The pad's RB / LB (the mock pad drives native navigation).
    for (const button of ['R', 'L']) {
      await record()
      await page.evaluate(b => window.__pad.press([b]), button)
      await page.waitForTimeout(1600)
      await check(button === 'R' ? 'RB' : 'LB')
    }
    assert.deepEqual(errors, [])
    console.log('page step first frame regression passed')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
