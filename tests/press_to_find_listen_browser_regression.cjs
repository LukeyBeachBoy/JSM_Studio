// Renderer regression: "Find a button" is an explicit, temporary listen mode.
// Holding the controller squeezes the 2026 Steam Controller's grip sensors
// (MISC5 / MISC6) and rests thumbs on the pads; none of that, nor any other
// press, may jump the app to an input unless the user asked to listen
// (nav/usePressToFind.ts, components/PressToFind.tsx). Driven through the
// mock's scripted pad, without hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'
const url = /\?/.test(base) ? base : `${base.replace(/\/$/, '')}/?mock`

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url)
    await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
    const keepThem = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keepThem.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)) await keepThem.click()
    const goTo = detail => page.evaluate(detail => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail })), detail)
    const tab = () => page.evaluate(() => document.querySelector('.page-tab[aria-current="page"]')?.textContent ?? document.querySelector('.page-header__title')?.textContent)
    const focused = () => page.evaluate(() => document.activeElement?.closest('[data-input-command]')?.getAttribute('data-input-command') ?? null)
    const listening = () => page.evaluate(() => document.body.dataset.padListening === 'true')
    const press = async (keys, ms = 120) => { await page.evaluate(([k, t]) => window.__pad.press(k, t), [keys, ms]); await page.waitForTimeout(250) }

    await goTo('buttons')
    await page.locator('.main-pane [data-input-command="MISC1"]').first().waitFor()
    await page.locator('[data-press-to-find]').waitFor()
    // Rest on a row that is not a grip or a paddle.
    await page.locator('.main-pane [data-input-command="N"]').first().evaluate(row => (row.matches('details') ? row.querySelector(':scope > summary') : row.querySelector('button, summary, [tabindex="0"]') ?? row).focus())
    const before = await focused()
    assert.equal(before, 'N')

    // Off by default: a grip squeeze, a held grip, or a paddle never jumps.
    await press(['MISC5'])
    await press(['MISC6'], 600)
    await press(['MISC1'])
    assert.equal(await focused(), before, 'nothing jumps outside listen mode (grips, paddles)')
    assert.equal(await listening(), false)
    await goTo('triggers'); await page.waitForTimeout(200)
    await press(['MISC5']); await press(['LSL'])
    assert.notEqual(await tab(), 'Buttons', 'a press on another page does not pull the app to Buttons')
    await goTo('buttons')
    await page.locator('[data-press-to-find]').waitFor()

    // Listen mode: the card starts it, the banner says how to cancel and counts down.
    const card = page.locator('[data-press-to-find]')
    assert.match(await card.innerText(), /Find a button/i)
    await card.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    const banner = page.locator('[data-press-to-find-banner]')
    await banner.waitFor()
    assert.match(await banner.innerText(), /Press any button on the controller/)
    assert.match(await banner.innerText(), /B to cancel/)
    assert.match(await banner.innerText(), /\b[78]s\b/, 'the banner counts down from 8 s')
    // Grips and pad contact are ignored while listening; it keeps listening.
    await press(['MISC5'])
    await press(['MISC6'])
    assert.equal(await listening(), true, 'a grip squeeze is not a deliberate press')
    assert.ok(!['MISC5', 'MISC6'].includes(await focused()), 'a grip squeeze does not find the grip')
    // A real button (a paddle) jumps to its row and ends listening.
    await press(['MISC1'])
    await page.waitForFunction(() => document.activeElement?.closest('[data-input-command]')?.getAttribute('data-input-command') === 'MISC1')
    assert.equal(await listening(), false, 'listening ends after the first deliberate press')
    await banner.waitFor({ state: 'detached' })
    // ...and once it has ended, presses stop jumping again.
    await page.locator('.main-pane [data-input-command="N"]').first().evaluate(row => (row.matches('details') ? row.querySelector(':scope > summary') : row.querySelector('button, summary, [tabindex="0"]') ?? row).focus())
    await press(['LSL'])
    assert.equal(await focused(), 'N', 'listen mode is temporary')

    // B cancels without finding anything.
    await card.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    await page.waitForTimeout(150)
    await press(['E'])
    assert.equal(await listening(), false, 'B cancels')
    assert.equal(await tab(), 'Buttons')
    // Escape cancels.
    await card.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    await page.keyboard.press('Escape')
    assert.equal(await listening(), false, 'Escape cancels')
    // The banner's Cancel cancels.
    await card.click()
    await banner.getByRole('button', { name: 'Cancel' }).click()
    assert.equal(await listening(), false, 'Cancel cancels')
    // A trigger pull counts, and goes to its page.
    await card.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    await page.waitForTimeout(150)
    await page.evaluate(() => window.__pad.trigger('right', 1)); await page.waitForTimeout(200)
    await page.evaluate(() => window.__pad.trigger('right', 0))
    await page.waitForFunction(() => document.querySelector('.page-tab[aria-current="page"]')?.textContent === 'Triggers')
    assert.equal(await listening(), false)

    // Below 1024px the aside is stacked away; the bar starts it instead.
    await goTo('buttons')
    await page.setViewportSize({ width: 900, height: 900 })
    const bar = page.locator('[data-find-button]')
    await bar.waitFor()
    assert.equal(await bar.isVisible(), true)
    await bar.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    await page.keyboard.press('Escape')

    // The timeout ends it on its own.
    await bar.click()
    await page.waitForFunction(() => document.body.dataset.padListening === 'true')
    await page.waitForFunction(() => document.body.dataset.padListening !== 'true', null, { timeout: 10000 })

    assert.deepEqual(errors, [])
    console.log('press_to_find_listen_browser_regression: ok')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
