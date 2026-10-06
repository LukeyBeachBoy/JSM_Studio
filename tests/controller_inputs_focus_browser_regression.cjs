// Sweep every enabled input/textarea rendered on the main app pages.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const expectControllerInputRing = require('./controller_input_focus_helper.cjs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1421'}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()
    const controls = ['Overview', 'Buttons', 'D-Pad', 'Triggers', 'Joysticks', 'Trackpads', 'Gyro', 'Layers', 'Virtual menus']
    const studio = ['Configurations', 'Associations', 'Global chords', 'Press timing & polling', 'AI assistant', 'Device visibility', 'Appearance', 'Preferences', 'Documentation', 'Debug console']
    let checked = 0
    for (const name of [...controls, ...studio]) {
      await page.getByRole('button', { name: 'Home', exact: true }).first().click()
      if (controls.includes(name)) {
        await page.locator('[data-home-continue]').click()
        await page.getByRole('button', { name, exact: true }).first().click()
      } else await page.getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
      await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(300)
      const fields = page.locator('input:not([disabled]):not([type="hidden"]):not([type="file"]), textarea:not([disabled])')
      let count = 0
      for (let index = 0; index < await fields.count(); index++) {
        const field = fields.nth(index)
        if (!await field.isVisible() || await field.getAttribute('tabindex') === '-1') continue
        await expectControllerInputRing(page, field, `${name}: ${await field.getAttribute('aria-label') || index}`)
        count++; checked++
      }
      console.log(`${name}: ${count} inputs checked`)
      if (name === 'Preferences') {
        await page.getByRole('radiogroup', { name: 'Light bar color' }).first().getByRole('radio', { name: 'Custom', exact: true }).click()
        const customColor = page.getByRole('dialog', { name: 'Custom color', exact: true })
        await customColor.waitFor()
        const colorInputs = customColor.locator('input')
        for (let index = 0; index < await colorInputs.count(); index++) {
          await expectControllerInputRing(page, colorInputs.nth(index), `Custom color: ${index}`)
          checked++
        }
        await customColor.getByRole('button', { name: 'Done', exact: true }).click()
      }
    }
    assert.ok(checked > 10, 'audit reaches real input controls')
    assert.deepEqual(errors, [])
    console.log(`PASS: ${checked} inputs across ${controls.length + studio.length} pages have one controller ring`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
