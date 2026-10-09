// TODO-44, console v2 edition: Settings ▸ Controller is one readable column
// (the two-column Preferences split is gone with Startup having its own
// category), and its sections come in the design's order. Pages with a
// preview or a test beside them (Press timing, Look & language) keep their
// two columns starting on the same line at 1280 and 1600.
//
//   JSM_TEST_URL='http://127.0.0.1:1420' node tests/todo44_prefs_columns_browser_regression.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const width of [1280, 1600]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '') + '/?mock')
      const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
      if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
        await firstConnect.getByRole('button', { name: 'Keep them' }).click()
        await firstConnect.waitFor({ state: 'hidden' })
      }
      const go = async id => { await page.evaluate(d => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: d })), id); await page.waitForTimeout(700) }
      await go('settings')
      await page.getByText('Controller sounds', { exact: true }).first().waitFor()
      const sections = await page.evaluate(() => [...document.querySelectorAll('main section h2')].map(h => h.textContent.trim()))
      const wanted = ['On-screen keyboard', 'Calibration and light', 'Controller sounds', 'Trackpad rotation']
      assert.deepEqual(sections.filter(title => wanted.includes(title)), wanted, `${width}px: sections in the design's order (${sections.join(' | ')})`)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px: no sideways scroll`)
      // The category's own switches come before any section.
      const switches = await page.getByRole('switch').evaluateAll(nodes => nodes.map(n => n.textContent.split('\n')[0].trim()).slice(0, 2))
      assert.ok(switches[0].startsWith('Navigate this app with the controller') && switches[1].startsWith('Stop the Steam Controller recalibrating its gyro'), `${width}px: first switches (${switches.join(' | ')})`)
      for (const id of ['timing', 'appearance']) {
        await go(id)
        const boxes = await page.evaluate(() => [document.querySelector('[data-nav-region="settings"]'), document.querySelector('aside[data-nav-region="aside"]')].map(el => el?.getBoundingClientRect()).map(box => box && { top: box.top, left: box.left }))
        assert.ok(boxes[0] && boxes[1], `${id}: main column and aside`)
        assert.ok(Math.abs(boxes[0].top - boxes[1].top) < 2, `${id} ${width}px: both columns start on the same line (${boxes[0].top} vs ${boxes[1].top})`)
        assert.ok(boxes[1].left > boxes[0].left + 300, `${id} ${width}px: the aside sits beside the settings`)
      }
      assert.deepEqual(errors, [])
      await page.close()
    }
    console.log('PASS: Settings ▸ Controller is one column in the design\'s order; Press timing and Look & language keep their aside level at 1280 and 1600')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
