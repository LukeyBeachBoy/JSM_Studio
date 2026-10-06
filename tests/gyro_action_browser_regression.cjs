// Isolated renderer. Native gyro actions save as Mapping tokens, not settings.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let content = localStorage.getItem('__gyroActionProfile') || 'RESET_MAPPINGS\nGYRO_ON = R3\nN = SPACE\nUNKNOWN_GYRO_FUTURE = untouched\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Gyro actions', path: 'profiles-library/Gyro actions.txt', content }),
        listLibraryProfiles: async () => ['Gyro actions'], loadLibraryProfile: async () => ({ name: 'Gyro actions', content }),
        saveLibraryProfile: async (name, next) => { content = next; localStorage.setItem('__gyroActionProfile', next); window.__gyroActionSaved = next; return { name } },
        getRuntimeMappingState: async () => ({ firmwareSoundPromptDone: true }),
      }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    const openNorth = async () => {
      await page.locator('[data-home-continue]').click()
      await page.getByRole('button', { name: 'Buttons', exact: true }).click()
      await page.locator('details[data-input-command="N"]').first().locator(':scope > summary').click()
    }
    await openNorth()
    const north = page.locator('details[data-input-command="N"]').first()
    const choose = async name => {
      await north.getByRole('button', { name: /Choose action:/ }).first().click()
      const picker = page.getByRole('dialog', { name: 'Choose an action', exact: true })
      await picker.getByRole('searchbox').fill(name)
      await picker.getByRole('button', { name, exact: true }).press('Enter')
      await picker.waitFor({ state: 'hidden' })
    }
    await choose('Disable gyro (this controller)')
    await north.getByRole('combobox', { name: 'Trigger', exact: true }).first().click()
    await page.getByRole('option', { name: 'Hold', exact: true }).click()
    await north.getByRole('button', { name: 'Command settings', exact: true }).first().click()
    const settings = page.getByRole('dialog').last()
    assert.match(await settings.innerText(), /Other controllers remain independent/)
    await settings.getByRole('radio', { name: 'Toggle', exact: true }).click()
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = \^GYRO_OFF_$/m.test(window.__gyroActionSaved))
    assert.match(await page.evaluate(() => window.__gyroActionSaved), /^GYRO_ON = R3$/m)
    assert.doesNotMatch(await page.evaluate(() => window.__gyroActionSaved), /^GYRO_OFF = N$/m)
    await page.reload(); await openNorth()
    assert.match(await north.innerText(), /Gyro off/i)
    await choose('Enable gyro (this controller)')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = \^GYRO_ON_$/m.test(window.__gyroActionSaved))
    const saved = await page.evaluate(() => window.__gyroActionSaved)
    assert.match(saved, /^GYRO_ON = R3$/m)
    assert.match(saved, /^UNKNOWN_GYRO_FUTURE = untouched$/m)
    assert.deepEqual(errors, [])
    console.log('PASS: graphical per-controller gyro outputs, Hold/Toggle, keyboard picker navigation, save/reload and independent activation-setting preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
