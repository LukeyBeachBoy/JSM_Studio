// Isolated renderer, saving to a test service. No physical key output.
// The key picker (console v2, KeyPicker) keeps every key reachable: F13–F24
// sit under F-keys & system ▸ Extra F-keys, and Search every action finds them.
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
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const north = page.locator('details[data-input-command="N"]').first()
    await north.locator(':scope > summary').click()
    await north.locator('[data-kind="key"]').first().click()
    let picker = page.locator('[data-picker="key"]')
    await picker.waitFor()
    await picker.locator('[data-category="system"]').click()
    const extra = picker.locator('[data-section="Extra F-keys"]')
    assert.match(await extra.innerText(), /free for shortcuts/)
    assert.equal(await extra.locator('button.key-cap').count(), 12)
    await extra.locator('button.key-cap[data-token="F24"]').focus()
    await page.keyboard.press('Enter')
    await picker.waitFor({ state: 'detached' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = F24\\?$/m.test(window.__extendedSaved))
    assert.match(await page.evaluate(() => window.__extendedSaved), /UNKNOWN_KEY_FUTURE = untouched/)
    await page.reload()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    // Wait for the saved profile to finish loading before opening its card.
    await north.getByText('F24', { exact: true }).first().waitFor()
    await north.locator(':scope > summary').click()
    await north.locator('[data-kind="key"]').first().click()
    picker = page.locator('[data-picker="key"]')
    await picker.waitFor()
    // It reopens on the group the key is in, on the key.
    assert.equal(await picker.locator('[data-category][aria-pressed="true"]').innerText(), 'F-keys & system')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-token') === 'F24')
    // Y: Search every action, its full keyboard and search.
    await page.keyboard.press('y')
    const search = page.getByRole('dialog', { name: 'Search every action' })
    await search.waitFor()
    await search.getByRole('searchbox').fill('F13')
    await search.getByRole('button', { name: /F13/ }).last().press('Enter')
    await search.waitFor({ state: 'hidden' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^N = F13\\?$/m.test(window.__extendedSaved))
    console.log('PASS: extra F-keys in the key picker, keyboard activation, search, save/reload and unknown config preservation')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
