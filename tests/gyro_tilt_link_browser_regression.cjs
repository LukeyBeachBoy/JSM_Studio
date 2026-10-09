// Console v2 (P5, D6; UX review I7): Buttons ▸ Tilt gestures ▸ Tilt settings opens Gyro ▸ Fine-tune ▸ Tilt
// (the Tilt group, with its parts page over it; event jsm:gyro-tilt), and B goes back one at a time. Mock desktop.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click().catch(() => {})
    await page.locator('[data-home-continue]').click()
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'gyro' })); window.setTimeout(() => window.dispatchEvent(new CustomEvent('jsm:gyro-tilt')), 120) })
    const tilt = page.locator('[data-subpage] [data-tilt]')
    await tilt.waitFor()
    assert.match(await page.locator('[data-subpage]').last().locator(':scope > header').innerText(), /Tilt/)
    assert.equal(await tilt.locator('button[data-group="behaviour"][aria-current="true"]').count(), 1)
    // B pops the Tilt parts page, leaving Fine-tune open on its Tilt group; B again closes Fine-tune.
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    await tilt.waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-subpage] [data-gyro-fine-tune-page][data-group="tilt"]').count(), 1, 'Tilt is a Fine-tune group of its own')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log('PASS: Tilt settings from Buttons opens Gyro ▸ Fine-tune ▸ Tilt')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
