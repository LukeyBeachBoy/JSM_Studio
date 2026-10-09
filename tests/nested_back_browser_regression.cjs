// Renderer regression: drive East through Studio's telemetry, without hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
    const keepThem = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keepThem.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) await keepThem.click()
    await page.evaluate(async () => {
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts')
      desktopBridge.listGlobalChords = async () => [{ id: 'back-test', buttons: ['HOME'], profilePath: 'profiles-library/Wardogs.txt' }]
    })
    const press = async key => {
      await page.evaluate(key => window.__pad.press([key]), key)
      await page.waitForTimeout(200)
    }
    // Hold to swap (was Global chords) is a Settings page now.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'globalChords' })))
    // Console v2: Y on a card opens its entry as a sub-page; B closes it and hands focus
    // back to the card, and only a subsequent B leaves the page.
    const card = page.locator('[data-chord-card]').first()
    await card.focus()
    await press('N')
    const entryPage = page.locator('[data-subpage]')
    await entryPage.waitFor()
    await entryPage.getByRole('button', { name: /^Another way to hold it/ }).focus()
    await press('E')
    await entryPage.waitFor({ state: 'detached' })
    assert.equal(await card.evaluate(element => element === document.activeElement), true, 'focus returns to the card')
    assert.equal(await page.locator('.page-header__title').innerText(), 'Hold to swap')
    // Only a subsequent Back leaves the page.
    await press('E')
    await page.locator('[data-home-continue]').waitFor()
    await page.locator('[data-home-continue]').click()
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await page.locator('[data-gyro-front]').waitFor()
    // Console v2 (P5): Gyro ▸ Fine-tune ▸ Speed ▸ Advanced stack as sub-pages.
    // East folds what is open inside one first, then closes it, and hands focus
    // back to the row that opened it.
    const fineRow = page.locator('[data-gyro-fine-tune]')
    await fineRow.focus()
    await press('S')
    const fineTune = page.locator('[data-subpage] [data-gyro-fine-tune-page]')
    await fineTune.waitFor()
    const advancedRow = page.locator('[data-subpage] button').filter({ hasText: /^AdvancedExact speeds/ }).first()
    await advancedRow.focus()
    await press('S')
    const advanced = page.locator('[data-speed-advanced]')
    await advanced.waitFor()
    // A native disclosure nested inside the sub-page must fold first.
    await advanced.locator('[data-part]').evaluate(element => {
      const details = document.createElement('details')
      details.id = 'nested-back-test'
      details.open = true
      details.innerHTML = '<summary>Nested test</summary><button>Nested action</button>'
      element.append(details)
      details.querySelector('button').focus()
    })
    await press('E')
    assert.equal(await page.locator('#nested-back-test').evaluate(element => element.open), false)
    assert.equal(await page.locator('#nested-back-test > summary').evaluate(element => element === document.activeElement), true)
    assert.equal(await advanced.count(), 1)
    await press('E')
    await advanced.waitFor({ state: 'detached' })
    assert.equal(await fineTune.count(), 1, 'Back from Advanced leaves Fine-tune open')
    assert.equal(await advancedRow.evaluate(element => element === document.activeElement), true, 'focus returns to the row that opened Advanced')
    await press('E')
    await fineTune.waitFor({ state: 'detached' })
    assert.equal(await fineRow.evaluate(element => element === document.activeElement), true, 'focus returns to Fine-tune on the front')
    assert.equal(await page.locator('button.page-tab[aria-current="page"]').innerText(), 'Gyro')
    await page.getByRole('button', { name: 'Layout', exact: true }).click()
    // Layout's light lives behind Y ▸ Controller light & sounds (console v2 QuickMenu).
    await page.locator('[data-overview-slot]').first().focus()
    await page.keyboard.press('y')
    await page.getByRole('button', { name: /^Controller light & sounds/ }).click()
    // Controller light & sounds is a full page (console v2): Back folds what is
    // open inside it first, then closes it.
    const sheet = page.getByRole('dialog', { name: /Controller light & sounds$/ })
    await sheet.waitFor()
    await sheet.locator('main').evaluate(element => {
      const details = document.createElement('details')
      details.id = 'sheet-back-test'
      details.open = true
      details.innerHTML = '<summary>Sheet accordion</summary><button>Sheet action</button>'
      element.append(details)
      details.querySelector('button').focus()
    })
    await press('E')
    assert.equal(await page.locator('#sheet-back-test').evaluate(element => element.open), false)
    assert.equal(await page.locator('#sheet-back-test > summary').evaluate(element => element === document.activeElement), true)
    assert.equal(await sheet.count(), 1)
    await press('E')
    await sheet.waitFor({ state: 'detached' })
    assert.equal(await page.locator('.page-header__title').innerText(), 'Layout')
    // The legacy keyboard dialog must also defer to its inner disclosure.
    await page.evaluate(async () => {
      const { default: React } = await import('/node_modules/.vite/deps/react.js')
      const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js')
      const { KeyboardBindingModal } = await import('/src/components/keymap/KeyboardBindingModal.tsx')
      const host = document.createElement('div')
      document.body.append(host)
      const root = ReactDOM.createRoot(host)
      root.render(React.createElement(KeyboardBindingModal, { isOpen: true, value: '', onSelect: () => {}, onClose: () => { root.unmount(); host.remove() } }))
    })
    const keyboard = page.locator('.modal-overlay').last()
    const extended = keyboard.locator('details').filter({ hasText: 'Extended function keys' })
    await extended.locator('summary').click()
    await press('E')
    assert.equal(await extended.evaluate(element => element.open), false)
    assert.equal(await extended.locator('summary').evaluate(element => element === document.activeElement), true)
    assert.equal(await keyboard.count(), 1)
    await press('E')
    await keyboard.waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log('PASS: East folds Global Chords, nearest nested accordion, then sheet; restores opener focus and preserves dropdown priority')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
