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
      // Y in the kind's picker: Search every action (console v2).
      await page.keyboard.press('y')
      const picker = page.getByRole('dialog', { name: 'Search every action', exact: true })
      await picker.getByRole('searchbox').fill(name)
      await picker.getByRole('button', { name, exact: true }).press('Enter')
      await picker.waitFor({ state: 'hidden' })
    }
    await choose('Gyro off')
    // Fine-tune (console v2): Y ▸ Move to… Hold, then How it is sent ▸ Toggle on/off.
    await north.locator('[data-fold="fine-tune"]').click()
    const fineTune = page.locator('[data-fine-tune]')
    await fineTune.waitFor()
    assert.match(await fineTune.innerText(), /Other controllers remain independent/)
    await fineTune.locator('[role="radio"]').first().focus()
    await page.keyboard.press('y')
    await page.getByRole('menuitem', { name: /Move to/ }).click()
    await page.getByRole('menuitem', { name: 'Hold', exact: true }).click()
    await fineTune.locator('[role="radio"][data-value="toggle"]').click()
    await page.keyboard.press('Escape')

    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = \^GYRO_OFF_$/m.test(window.__gyroActionSaved))
    assert.match(await page.evaluate(() => window.__gyroActionSaved), /^GYRO_ON = R3$/m)
    assert.doesNotMatch(await page.evaluate(() => window.__gyroActionSaved), /^GYRO_OFF = N$/m)
    await page.reload(); await openNorth()
    assert.match(await north.innerText(), /Gyro off/i)
    // It lives on the Hold tile now; selecting the tile shows its command.
    await north.locator('[data-when="hold"]').focus()
    await choose('Gyro on')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = \^GYRO_ON_$/m.test(window.__gyroActionSaved))
    const saved = await page.evaluate(() => window.__gyroActionSaved)
    assert.match(saved, /^GYRO_ON = R3$/m)
    assert.match(saved, /^UNKNOWN_GYRO_FUTURE = untouched$/m)
    assert.deepEqual(errors, [])
    console.log('PASS: graphical per-controller gyro outputs, Hold/Toggle, keyboard picker navigation, save/reload and independent activation-setting preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
