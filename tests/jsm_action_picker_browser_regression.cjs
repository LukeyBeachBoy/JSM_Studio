// Renderer-only: grouped choices must keep native tokens and controller focus.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nGYRO_ON = R3\nN = SPACE\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Picker', path: 'profiles-library/Picker.txt', content }),
        listLibraryProfiles: async () => ['Picker'], loadLibraryProfile: async () => ({ name: 'Picker', content }),
        saveLibraryProfile: async (name, next) => { content = next; window.__pickerSaved = next; return { name } },
        getRuntimeMappingState: async () => ({ firmwareSoundPromptDone: true }),
      }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = page.locator('details[data-input-command="N"]').first()
    await card.locator(':scope > summary').click()
    await card.getByRole('button', { name: /Choose action:/ }).first().click()
    const picker = page.getByRole('dialog', { name: 'Choose an action', exact: true })
    await picker.locator('.action-picker__tabs').getByRole('button', { name: 'JSM', exact: true }).click()
    const primary = picker.locator('.action-picker__content > .action-grid--jsm')
    assert.deepEqual(await primary.getByRole('button').allTextContents(), [
      'Gyro control›', 'Calibrate gyro›', 'Open keyboard', 'Pause / resume mapping', 'Cycle actions', 'Change LED colour', 'Turn off controller',
    ])
    const advanced = picker.locator('.action-jsm-advanced')
    assert.equal(await advanced.getAttribute('open'), null)
    await primary.getByRole('button', { name: 'Gyro control', exact: true }).click()
    const variants = picker.locator('.action-jsm-variants')
    assert.equal(await variants.getByRole('button').count(), 4)
    assert.ok(await variants.evaluate(el => el.contains(document.activeElement)), 'group opening focuses a variant')
    assert.ok(await picker.isVisible(), 'opening a family must not commit an action')
    await primary.getByRole('button', { name: 'Calibrate gyro', exact: true }).click()
    assert.equal(await variants.getByRole('button').count(), 2)
    await advanced.locator('summary').click()
    // Stick mode shift is available when adding a command, not replacing one.
    assert.equal(await advanced.locator(':scope > .action-grid button').count(), 6)
    await advanced.getByRole('button', { name: 'Invert gyro', exact: true }).click()
    assert.equal(await variants.getByRole('button').count(), 3)
    await advanced.getByRole('button', { name: 'Continuous gyro calibration', exact: true }).click()
    assert.equal(await variants.getByRole('button').count(), 2)
    const artifacts = path.resolve(__dirname, '../tmp/jsm-action-picker')
    fs.mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'advanced.png') })
    await advanced.locator('summary').click()
    await primary.getByRole('button', { name: 'Calibrate gyro', exact: true }).click()
    await primary.getByRole('button', { name: 'Calibrate gyro', exact: true }).click()
    await page.screenshot({ path: path.join(artifacts, 'condensed.png') })
    await picker.getByRole('searchbox').fill('gyro')
    await page.waitForFunction(() => [...document.querySelectorAll('.action-picker__content .action-choice')].every(button => button.querySelector('svg[viewBox="0 0 24 24"]')))
    assert.equal(await picker.getByRole('button', { name: 'Invert gyro Y axis', exact: true }).count(), 1)
    await picker.getByRole('button', { name: 'Invert gyro Y axis', exact: true }).click()
    await picker.waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__pickerSaved?.includes('GYRO_INV_Y'))
    assert.match(await page.evaluate(() => window.__pickerSaved), /^GYRO_ON = R3$/m)
    assert.deepEqual(errors, [])
    console.log('PASS: seven primary actions, advanced families, variant focus, bundled icons, search and native-token save')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
