// TODO-44: the Preferences page splits its sections over two columns from
// 1280px up, and the split is by height: neither column may trail the other
// by more than a section's worth. Before the fix the right column ran to
// 2.4x the left (2004px against 840px in the mock).
//
//   JSM_TEST_URL='http://127.0.0.1:1421/?mock' node tests/todo44_prefs_columns_browser_regression.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const width of [1280, 1600]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
      const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
      if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
        await firstConnect.getByRole('button', { name: 'Keep them' }).click()
        await firstConnect.waitFor({ state: 'hidden' })
      }
      await page.getByRole('button', { name: /^Preferences/ }).first().click()
      await page.getByText('Controller sounds', { exact: true }).first().waitFor()
      await page.getByText('Trackpad orientation', { exact: true }).first().waitFor()
      await page.waitForTimeout(300)
      const columns = await page.evaluate(() => [...document.querySelectorAll('.prefs-columns > .prefs-column')].map(column => {
        const box = column.getBoundingClientRect()
        return { region: column.dataset.navRegion, top: box.top, height: box.height, headings: [...column.querySelectorAll('.prefs-eyebrow')].map(h => h.textContent.trim()) }
      }))
      assert.equal(columns.length, 2, `${width}px: two columns side by side`)
      const [left, right] = columns
      assert.ok(Math.abs(left.top - right.top) < 1, `${width}px: both columns start on the same line (${left.top} vs ${right.top})`)
      const shorter = Math.min(left.height, right.height), taller = Math.max(left.height, right.height)
      assert.ok(shorter / taller >= 0.75, `${width}px: columns are balanced, shorter is ${Math.round(shorter)} of ${Math.round(taller)}`)
      // Startup and the pad's own switches read first; the hardware sections sit together.
      assert.deepEqual(left.headings.slice(0, 2), ['Startup', 'Controller'], `${width}px: left column order`)
      assert.ok(left.headings.includes('Controller sounds'), `${width}px: sounds are on the left`)
      assert.ok(right.headings.includes('Gyro calibration') && right.headings.includes('Trackpad orientation'), `${width}px: the long sensor sections are on the right`)
      assert.deepEqual(errors, [])
      await page.close()
    }
    console.log('PASS: Preferences columns start level and end within a quarter of each other at 1280 and 1600')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
