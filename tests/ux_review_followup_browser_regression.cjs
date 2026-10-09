// Remaining UX review paths, exercised with the dev mock and real browser input.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(base + '/?mock')
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => page.getByRole('button', { name: 'Keep them', exact: true }).click())
    await page.locator('[data-home-continue]').waitFor()
    await page.waitForTimeout(900)
    const go = async id => {
      await page.evaluate(id => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: id })), id)
      await page.waitForTimeout(700)
    }
    const pad = async buttons => { await page.evaluate(buttons => window.__pad.press(buttons, 90), buttons); await page.waitForTimeout(300) }
    const trigger = async side => { await page.evaluate(side => window.__pad.trigger(side, 1), side); await page.waitForTimeout(150); await page.evaluate(side => window.__pad.trigger(side, 0), side); await page.waitForTimeout(400) }
    const inDialog = () => page.evaluate(() => {
      const traps = [...document.querySelectorAll('.modal-overlay, [data-focus-trap="true"]')]
      return traps.at(-1)?.contains(document.activeElement) ?? false
    })

    // B1, B5, B6: cold landing, Back on Home, visible stop and pad exit.
    assert.equal(await page.locator('[data-home-continue]').evaluate(node => node === document.activeElement), true)
    await page.keyboard.press('Escape')
    await page.locator('[data-home-continue]').waitFor()
    await page.getByRole('button', { name: 'Test it', exact: true }).click()
    await page.locator('.test-banner__stop').waitFor()
    await pad(['E'])
    await page.locator('.test-banner__stop').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: 'Test it', exact: true }).click()
    await page.locator('.test-banner__stop').click()
    await page.locator('.test-banner__stop').waitFor({ state: 'detached' })

    // S2: Home has a discoverable Options button and the menu traps focus.
    await page.getByRole('button', { name: 'Options: review changes, undo, save' }).click()
    assert.equal(await inDialog(), true)
    await page.keyboard.press('Escape')

    // S3, S5: a click selects without loading, and Make live is explicit.
    await go('configurations')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:library-select', { detail: 'Cyberpunk' })))
    await page.waitForFunction(() => document.activeElement?.closest('[data-profile="Cyberpunk"]'))
    await page.locator('[data-profile="Cyberpunk"] > button').click()
    await page.locator('[data-library-detail]').filter({ hasText: 'Cyberpunk' }).waitFor()
    assert.equal(await page.locator('[data-library-view="games"]').count(), 1)
    await page.getByRole('button', { name: /^Edit/ }).filter({ hasText: 'Edit' }).last().click()
    await go('home')
    await page.getByRole('button', { name: 'Make live', exact: true }).waitFor()
    assert.match(await page.locator('[class*="tune"]').first().innerText(), /editing this configuration/i)
    assert.equal(await page.locator('[class*="tuneGrid"]').evaluate(node => node.getBoundingClientRect().bottom <= document.querySelector('.app-shell > .hint-capsule').getBoundingClientRect().top), true, 'Quick tune fits above the footer')
    await page.screenshot({ path: 'tools/ux-review-followup-home-1100.png' })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.dataset.accent = 'amber' })
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'tools/ux-review-followup-home-light-amber-1100.png' })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.accent = 'cyan' })

    // S4: browsing a shipped base does not create a profile.
    await go('bases')
    const before = await page.evaluate(() => window.electronAPI.listLibraryProfiles())
    await page.locator('[data-builtin-base]').first().click()
    assert.deepEqual(await page.evaluate(() => window.electronAPI.listLibraryProfiles()), before)
    await page.getByRole('button', { name: /Copy to make your own/ }).last().waitFor()

    // S11/S13: categories remain reachable from Guides, including at 900px.
    await go('help')
    await page.locator('[data-topic]').first().focus()
    await trigger('right')
    assert.match(await page.locator('.page-header__title').innerText(), /Troubleshooting/)
    await page.setViewportSize({ width: 900, height: 700 })
    const categories = page.getByRole('navigation', { name: 'Settings categories' })
    await categories.waitFor()
    assert.equal(await categories.isVisible(), true)
    await categories.getByRole('button', { name: /^Controller/ }).click()
    await page.locator('[data-open-light-sounds]').click()
    const light = page.getByRole('dialog', { name: /Controller light & sounds$/ })
    await light.waitFor()
    assert.match(await light.innerText(), /Back to Settings/)
    await light.locator('[role="slider"]').first().focus()
    await page.keyboard.press('ArrowDown')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') === 'Light colour'), false)
    await page.waitForTimeout(300) // capture the settled sub-page, after its entrance transition
    await page.screenshot({ path: 'tools/ux-review-followup-light-900.png' })
    await page.keyboard.press('Escape')

    // S17: keyboard start acts immediately; Tab cannot strand focus on body.
    await page.goto(base + '/?mock&nopad')
    await page.locator('[data-home-continue]').waitFor()
    await page.waitForTimeout(900)
    await page.keyboard.press('Enter')
    await page.locator('[data-layout-page]').waitFor()
    await page.locator('[data-focus-scope="page-tabs"] button').last().focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.locator('.titlebar .state-button').evaluate(node => node === document.activeElement), true, 'B4: Right from the last tab reaches status')
    await page.keyboard.press('ArrowRight')
    assert.equal(await page.getByRole('button', { name: 'Options: review changes, undo, save' }).evaluate(node => node === document.activeElement), true, 'B4: Right then reaches Options')
    assert.doesNotMatch(await page.locator('.home-chip').innerText(), /Home\s+Home/)
    await page.evaluate(() => [...document.querySelectorAll('button:not([tabindex="-1"]):not([disabled])')].filter(node => node.getClientRects().length).at(-1)?.focus())
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement === document.body), false)
    assert.deepEqual(errors, [])
    console.log('PASS: UX follow-up: test exits, Home landing/back/options, Library selection/copy, inactive tuning, Settings categories/light, keyboard focus')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
