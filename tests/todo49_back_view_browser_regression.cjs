// TODO-49: the mirrored back view beside the front art on Home keeps its
// drawing still while its legend gains rows ("Left grip held", "L5"...). The
// block is centred beside the front art, so the legend reserves the space its
// rows can take up front; before the fix the drawing slid up 39px as three
// rows appeared. The mock's telemetry does not hold grips, so the rows are
// injected into the legend the way the component renders them.
//
//   JSM_TEST_URL='http://127.0.0.1:1421/?mock' node tests/todo49_back_view_browser_regression.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await firstConnect.getByRole('button', { name: 'Keep them' }).click()
      await firstConnect.waitFor({ state: 'hidden' })
    }
    const back = page.getByRole('img', { name: 'Steam Controller back, mirrored' })
    await back.waitFor()
    const measure = () => page.evaluate(() => {
      const art = document.querySelector('svg[aria-label="Steam Controller back, mirrored"]')
      const view = art.parentElement
      const legend = view.querySelector('[class*="backLegend"]')
      return { artTop: art.getBoundingClientRect().top, legendMinHeight: parseFloat(getComputedStyle(legend).minHeight), rows: legend.querySelectorAll('[class*="backLegendItem"]').length }
    })
    const idle = await measure()
    assert.equal(idle.rows, 0, 'the mock holds nothing, so the legend starts empty')
    assert.ok(idle.legendMinHeight >= 100, `the legend reserves its rows' space up front (min-height ${idle.legendMinHeight})`)
    // Four rows is the most the legend lists (BACK_HOTSPOTS slice); add them all.
    await page.evaluate(() => {
      const legend = document.querySelector('svg[aria-label="Steam Controller back, mirrored"]').parentElement.querySelector('[class*="backLegend"]')
      const base = legend.className.split(' ').find(c => c.includes('backLegend'))
      for (const text of ['Left grip held', 'L5', 'Right grip held', 'R4']) {
        const row = document.createElement('span')
        row.className = base.replace('backLegend', 'backLegendItem')
        const mark = document.createElement('span')
        mark.className = base.replace('backLegend', 'backLegendMark')
        row.append(mark, document.createTextNode(text))
        legend.append(row)
      }
    })
    await page.waitForTimeout(150)
    const held = await measure()
    assert.equal(held.rows, 4)
    assert.ok(Math.abs(held.artTop - idle.artTop) < 1, `the drawing stays put as rows appear (moved ${held.artTop - idle.artTop}px)`)
    assert.deepEqual(errors, [])
    console.log('PASS: the mirrored back view holds still while its legend fills')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
