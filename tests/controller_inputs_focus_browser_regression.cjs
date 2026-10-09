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
    const controls = ['Layout', 'Buttons', 'Sticks', 'Triggers', 'Trackpads', 'Gyro', 'Menus', 'Layers']
    const studio = ['Games', 'Bases', 'Launch with game', 'Hold to swap', 'Press timing', 'Assistant', 'Hide the real controller', 'Look & language', 'Controller', 'Startup', 'Guides & reference', 'Troubleshooting log']
    const STUDIO_IDS = { 'Games': 'configurations', 'Bases': 'bases', 'Launch with game': 'associations', 'Hold to swap': 'globalChords', 'Press timing': 'timing', 'Assistant': 'ai', 'Hide the real controller': 'deviceVisibility', 'Look & language': 'appearance', 'Controller': 'settings', 'Startup': 'startup', 'Guides & reference': 'help', 'About & credits': 'credits', 'Troubleshooting log': 'debugConsole' }
    let checked = 0
    for (const name of [...controls, ...studio]) {
      await page.getByRole('button', { name: 'Home', exact: true }).first().click()
      if (controls.includes(name)) {
        await page.locator('[data-home-continue]').click()
        await page.getByRole('button', { name, exact: true }).first().click()
      } else await page.evaluate(id => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: id })), STUDIO_IDS[name])
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
      if (name === 'Controller') {
        // Settings ▸ Controller ▸ Light colour opens its sub-page (console v2).
        await page.getByRole('button', { name: /^Light colour when a configuration/ }).click()
        await page.getByRole('radiogroup', { name: 'Light bar color' }).first().getByRole('radio', { name: 'Custom', exact: true }).click()
        const customColor = page.getByRole('dialog', { name: 'Custom colour', exact: true })
        await customColor.waitFor()
        const colorInputs = customColor.locator('input')
        for (let index = 0; index < await colorInputs.count(); index++) {
          await expectControllerInputRing(page, colorInputs.nth(index), `Custom colour: ${index}`)
          checked++
        }
        await customColor.getByRole('button', { name: 'Done', exact: true }).click()
        await page.keyboard.press('Escape')
        await page.locator('[data-subpage]').waitFor({ state: 'detached' })
      }
    }
    // Console v2 replaced most typing with choices and the on-screen keyboard
    // ("Typing where choosing would do"); the fields left are the assistant's,
    // the log's command line and the custom light colour.
    assert.ok(checked > 3, `audit reaches real input controls (${checked})`)
    assert.deepEqual(errors, [])
    console.log(`PASS: ${checked} inputs across ${controls.length + studio.length} pages have one controller ring`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
