// Isolated renderer, saving to a test service. No physical key output.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await page.addInitScript(() => {
      let content = localStorage.getItem('__extendedKeyProfile') || 'RESET_MAPPINGS\nN = SPACE\nUNKNOWN_KEY_FUTURE = untouched\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Extended keys', path: 'profiles-library/Extended keys.txt', content }),
        listLibraryProfiles: async () => ['Extended keys'], loadLibraryProfile: async () => ({ name: 'Extended keys', content }),
        saveLibraryProfile: async (name, next) => { content = next; localStorage.setItem('__extendedKeyProfile', next); window.__extendedSaved = next; return { name } },
        getRuntimeMappingState: async () => ({ firmwareSoundPromptDone: true }),
      }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const north = page.locator('details[data-input-command="N"]').first()
    await north.locator(':scope > summary').click()
    await north.getByRole('button', { name: /Choose action:/ }).first().click()
    let picker = page.getByRole('dialog', { name: 'Choose an action', exact: true })
    await picker.locator('.action-tab').filter({ hasText: /^Keyboard$/ }).click()
    const extended = picker.locator('details').filter({ hasText: 'Extended function keys' })
    assert.equal(await extended.getAttribute('open'), null)
    await extended.locator('summary').press('Enter')
    assert.equal(await extended.locator('.key-cap').count(), 12)
    await extended.locator('.key-cap[title="F24"]').press('Enter')
    await picker.waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = F24\\?$/m.test(window.__extendedSaved))
    assert.match(await page.evaluate(() => window.__extendedSaved), /UNKNOWN_KEY_FUTURE = untouched/)
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    // Wait for the saved profile to finish loading before toggling its card.
    await north.getByText('F24', { exact: true }).first().waitFor()
    await north.locator(':scope > summary').click()
    await north.getByRole('button', { name: /Choose action:.*F24/ }).first().waitFor()
    assert.match(await north.innerText(), /F24/)
    await north.getByRole('button', { name: /Choose action:/ }).first().click()
    picker = page.getByRole('dialog', { name: 'Choose an action', exact: true })
    await picker.locator('.action-tab').filter({ hasText: /^Keyboard$/ }).click()
    await picker.getByRole('searchbox').fill('F13')
    await picker.getByRole('button', { name: /F13/ }).last().press('Enter')
    await picker.waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = F13\\?$/m.test(window.__extendedSaved))
    console.log('PASS: extended function-key disclosure, keyboard activation, search, save/reload and unknown config preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
