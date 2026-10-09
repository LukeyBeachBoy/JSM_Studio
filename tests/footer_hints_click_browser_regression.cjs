// The footer's shortcuts are buttons: clicking one does exactly what that
// button does on the pad (or its key), to whatever has focus, without taking
// focus from it. LB / RB (PgUp / PgDn) are two halves, previous and next.
// Renderer-only mock validation; does not launch the mapper or physical hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const BASE = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '') + '/?mock'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(BASE)
    await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
    const keep = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keep.isVisible()) await keep.click()
    await page.locator('[data-home-continue]').click()
    await page.locator('.profile-chip').waitFor()
    const current = () => page.locator('.titlebar .page-tab[aria-current="page"]').getAttribute('aria-label')
    const shellFooter = page.locator('.app-shell .hint-capsule')
    await page.waitForFunction(() => document.querySelector('.titlebar .page-tab[aria-current="page"]'))
    const start = await current()

    // --- A: the focused row is pressed, and keeps focus.
    await page.evaluate(() => {
      window.__probeClicks = 0
      const probe = document.createElement('button')
      probe.id = 'footer-probe'
      probe.textContent = 'probe'
      probe.dataset.hints = 'A:Select;B:Back'
      probe.addEventListener('click', () => { window.__probeClicks++ })
      document.querySelector('.main-pane').prepend(probe)
      probe.focus()
    })
    const pressA = shellFooter.locator('[data-hint-press="A"]')
    await pressA.waitFor()
    assert.equal(await pressA.evaluate(el => el.tagName), 'BUTTON', 'A is a button')
    await pressA.click()
    assert.equal(await page.evaluate(() => window.__probeClicks), 1, 'clicking A presses the focused row once')
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'footer-probe', 'clicking a hint does not take focus')

    // --- LB / RB: two halves, previous and next tab.
    const next = shellFooter.locator('[data-hint-press="RB"]')
    const previous = shellFooter.locator('[data-hint-press="LB"]')
    await next.waitFor()
    await next.click()
    await page.waitForFunction(was => document.querySelector('.titlebar .page-tab[aria-current="page"]')?.getAttribute('aria-label') !== was, start)
    const stepped = await current()
    assert.notEqual(stepped, start, 'RB moves to the next tab')
    await previous.click()
    await page.waitForFunction(was => document.querySelector('.titlebar .page-tab[aria-current="page"]')?.getAttribute('aria-label') === was, start)

    // Keyboard chips split the same way: PgUp and PgDn are each a button.
    await page.evaluate(() => { document.body.dataset.padConnected = 'false' })
    await page.waitForFunction(() => document.querySelector('.app-shell .hint-capsule [data-hint-press="RB"] kbd'))
    assert.deepEqual(await shellFooter.locator('[data-hint-press="LB"], [data-hint-press="RB"]').allInnerTexts(), ['PgUp', 'PgDn'])
    await page.evaluate(() => { document.body.dataset.padConnected = 'true' })

    // --- A on a real row opens it; B in the sub-page's own footer closes it.
    await page.locator('.home-chip').click()
    await page.locator('section[aria-labelledby="home-studio-title"]').getByRole('button', { name: /^Settings/ }).click()
    await page.locator('.section-list .section-item').filter({ hasText: 'About & credits' }).click()
    const more = page.locator('[data-credits-more]')
    await more.waitFor()
    await more.focus()
    await shellFooter.locator('[data-hint-press="A"]').click()
    const sub = page.locator('[data-subpage]')
    await sub.waitFor()
    const back = sub.locator('.hint-capsule [data-hint-press="B"]')
    await back.waitFor()
    await back.click()
    await sub.waitFor({ state: 'detached' })

    // Move is only said: it is not a button.
    assert.equal(await page.locator('.hint-capsule [data-hint-press="MOVE"]').count(), 0)
    assert.deepEqual(errors, [])
    console.log('footer hints click regression passed')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
