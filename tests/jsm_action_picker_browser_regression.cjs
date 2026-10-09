// Renderer-only: the Controller action picker (console v2, ControllerActions*)
// keeps native tokens, groups them in five flat groups with counts, names
// them in the design's words, and Search every action (Y) still finds them.
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
    // The binding sheet's "sends" kinds: Controller action opens its picker.
    await card.locator('[data-kind="controller"]').first().click()
    const picker = page.locator('[data-picker="controller"]')
    await picker.waitFor()
    assert.equal(await picker.locator('h2').innerText(), 'Controller action')
    const groups = (await picker.locator('[data-category]').allInnerTexts()).map(text => text.replace(/\s+/g, ' '))
    assert.deepEqual(groups.map(text => text.replace(/ [\d+]+$/, '')), ['Gyro', 'Calibrate', 'Rumble & sound', 'Light', 'Other'])
    assert.deepEqual(groups.filter((_, at) => at !== 2), ['Gyro 10', 'Calibrate 7', 'Light 3', 'Other 6'])
    const titles = () => picker.locator('[data-action] [class*="tileTitle"]').allInnerTexts()
    assert.deepEqual(await titles(), ['Gyro on', 'Gyro off', 'Gyro on everywhere', 'Gyro off everywhere', 'Invert both ways', 'Invert left-right', 'Invert up-down', 'Glide', 'Glide left-right', 'Glide up-down'])
    // Flat tiles: no expanding families, no "Advanced actions" disclosure.
    assert.equal(await picker.locator('details').count(), 0)
    assert.ok(await picker.evaluate(el => el.contains(document.activeElement)), 'focus starts on a tile')
    // The conflict note: R3 already turns gyro on in this configuration.
    assert.match(await picker.locator('aside').innerText(), /already turns gyro on/)
    await picker.locator('[data-category="other"]').click()
    assert.deepEqual(await titles(), ['Open keyboard', 'Pause / resume mapping', 'Cycle through keys', 'Turn off controller', 'Left stick mode shift', 'Right stick mode shift'])
    const artifacts = path.resolve(__dirname, '../tmp/jsm-action-picker')
    fs.mkdirSync(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, 'other.png') })
    // Y: Search every action finds the renamed tile and writes the native token.
    await page.keyboard.press('y')
    const search = page.getByRole('dialog', { name: 'Search every action' })
    await search.waitFor()
    await search.getByRole('searchbox').fill('up-down')
    await search.getByRole('button', { name: 'Invert up-down', exact: true }).click()
    await search.waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__pickerSaved?.includes('GYRO_INV_Y'))
    assert.match(await page.evaluate(() => window.__pickerSaved), /^GYRO_ON = R3$/m)
    assert.deepEqual(errors, [])
    console.log('PASS: five flat groups with counts, renamed tiles, conflict note, Search every action and native-token save')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
