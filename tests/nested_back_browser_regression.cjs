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
    await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    await page.evaluate(async () => {
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts')
      desktopBridge.listGlobalChords = async () => [{ id: 'back-test', buttons: ['HOME'], profilePath: 'profiles-library/Wardogs.txt' }]
    })
    const press = async key => {
      await page.evaluate(key => window.__pad.press([key]), key)
      await page.waitForTimeout(200)
    }
    await page.getByRole('button', { name: /^Global chords/ }).click()
    const chord = page.locator('[data-nav-disclosure]').first()
    const opener = chord.locator('[data-nav-disclosure-trigger]')
    await opener.focus()
    await press('S')
    assert.equal(await opener.getAttribute('aria-expanded'), 'true')
    await chord.getByRole('button', { name: 'Add OR alternative', exact: true }).focus()
    await press('E')
    assert.equal(await opener.getAttribute('aria-expanded'), 'false')
    assert.equal(await opener.evaluate(element => element === document.activeElement), true)
    assert.equal(await page.locator('.page-header__title').innerText(), 'Global chords')
    // Back also folds when focus stays on the opening row itself.
    await press('S')
    await press('E')
    assert.equal(await opener.getAttribute('aria-expanded'), 'false')
    // Only a subsequent Back leaves the page.
    await press('E')
    await page.locator('[data-home-continue]').waitFor()
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    const expand = page.locator('[data-nav-disclosure-trigger]').filter({ hasText: 'Activation conditions' }).first()
    await expand.focus()
    await press('S')
    assert.equal(await expand.getAttribute('aria-expanded'), 'true')
    // A native disclosure nested inside a React accordion must fold first.
    await expand.locator('xpath=../..').locator('.expand-row__children').evaluate(element => {
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
    assert.equal(await expand.getAttribute('aria-expanded'), 'true')
    await press('E')
    assert.equal(await expand.getAttribute('aria-expanded'), 'false')
    assert.equal(await expand.evaluate(element => element === document.activeElement), true)
    assert.equal(await page.locator('.page-header__title').innerText(), 'Gyro')
    // A dropdown consumes Back before the surrounding accordion.
    await press('S')
    const select = page.getByRole('combobox', { name: 'Activation input', exact: true })
    await select.click()
    await press('E')
    assert.equal(await page.getByRole('listbox').count(), 0)
    assert.equal(await expand.getAttribute('aria-expanded'), 'true')
    await expand.focus()
    await press('E')
    assert.equal(await expand.getAttribute('aria-expanded'), 'false')
    await page.getByRole('button', { name: 'Overview', exact: true }).click()
    const activation = page.locator('.summary-row').filter({ hasText: 'Controller light' })
    await activation.click()
    const sheet = page.getByRole('dialog', { name: 'Controller light', exact: true })
    await sheet.waitFor()
    await sheet.locator('.sheet__body').evaluate(element => {
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
    assert.equal(await activation.evaluate(element => element === document.activeElement), true)
    assert.equal(await page.locator('.page-header__title').innerText(), 'Overview')
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
