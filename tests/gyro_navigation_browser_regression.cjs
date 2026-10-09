// Console v2 (P5; front redesigned after the 2026-10-09 UX review): the Gyro
// tab's navigation with the mock pad (no hardware). The front has the same frame
// as the other input tabs (cards, a one-item rail, rows); A on the current
// "While I hold…" card picks its button, A / B / ◂ ▸ / X / Y answer on the rows,
// Fine-tune ▸ Advanced stack as sub-pages that B pops one at a time (folding a
// nested disclosure first and handing focus back to the row that opened them),
// LT / RT step the groups and parts, and the footer names them.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click().catch(() => {})
    const press = async key => {
      await page.evaluate(key => window.__pad.press([key]), key)
      await page.waitForTimeout(220)
    }
    const trigger = async (side, value) => { await page.evaluate(([side, value]) => window.__pad.trigger(side, value), [side, value]); await page.waitForTimeout(220) }
    const tap = async side => { await trigger(side, 1); await trigger(side, 0) }
    const active = () => page.evaluate(() => document.activeElement?.closest('[data-question]')?.dataset.question ?? document.activeElement?.closest('[role="dialog"]')?.getAttribute('aria-label') ?? '')
    const hints = () => page.locator('.hint-capsule').last().innerText()
    await page.locator('[data-home-continue]').click()
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await page.locator('[data-gyro-front]').waitFor()

    // ---- The front: the same frame as Sticks (h1, cards, rows); Y is More on every card and row.
    void active
    assert.match(await page.locator('[data-gyro-front] h1').innerText(), /^Gyro is on/)
    await page.locator('[data-q1="always"]').focus()
    assert.match(await hints(), /More/)
    assert.doesNotMatch(await hints(), /Question|Pick button/)
    // A chooses a card; A again on the current hold card picks the input to hold.
    await page.locator('[data-q1="unless"]').focus()
    await press('S')
    assert.equal(await page.locator('[data-q1="unless"]').getAttribute('aria-checked'), 'true')
    assert.match(await hints(), /Change button/)
    await press('S')
    const picker = page.getByRole('dialog').last()
    await picker.waitFor()
    await press('E')
    await picker.waitFor({ state: 'detached' })
    // The hold row names the button and opens the same picker.
    const holdRow = page.locator('[data-gyro-front] [data-hold-button]')
    assert.match(await holdRow.innerText(), /Gyro pauses while I hold/)
    await holdRow.focus(); await press('S')
    await picker.waitFor()
    await press('E')
    await picker.waitFor({ state: 'detached' })
    // ◂ ▸ on Turn speed changes it, Y is Use Default.
    await page.locator('[role="slider"][data-hero]').first().focus()
    const speed = await page.locator('[data-gyro-front] [role="slider"]').first().getAttribute('aria-valuetext')
    await press('RIGHT')
    assert.notEqual(await page.locator('[data-gyro-front] [role="slider"]').first().getAttribute('aria-valuetext'), speed)

    // ---- Fine-tune ▸ Advanced stack; B pops one at a time.
    const fineRow = page.locator('[data-gyro-fine-tune]')
    await fineRow.focus()
    await press('S')
    const fineTune = page.locator('[data-subpage] [data-gyro-fine-tune-page]')
    await fineTune.waitFor()
    assert.match(await hints(), /Group/)
    const group = () => fineTune.getAttribute('data-group')
    assert.equal(await group(), 'speed')
    await tap('right')
    assert.equal(await group(), 'steadiness')
    await tap('right'); await tap('right')
    assert.equal(await group(), 'tilt', 'Tilt is a group of its own (UX review I7)')
    await tap('right')
    assert.equal(await group(), 'rumble')
    await tap('right')
    assert.equal(await group(), 'speed', 'the groups wrap, as the kit steps them')
    const advancedRow = page.locator('[data-subpage] button').filter({ hasText: /^AdvancedExact speeds/ }).first()
    await advancedRow.focus()
    await press('S')
    const advanced = page.locator('[data-speed-advanced]')
    await advanced.waitFor()
    assert.match(await hints(), /Part/)
    await tap('right')
    assert.equal(await page.locator('[role="tab"][aria-selected="true"]').innerText().then(text => text.split('\n')[0]), 'Shape')
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
    assert.equal(await advanced.count(), 1)
    await press('E')
    await advanced.waitFor({ state: 'detached' })
    assert.equal(await fineTune.count(), 1, 'Back from Advanced leaves Fine-tune open')
    assert.equal(await advancedRow.evaluate(element => element === document.activeElement), true, 'focus returns to the row that opened Advanced')
    await press('E')
    await fineTune.waitFor({ state: 'detached' })
    assert.equal(await fineRow.evaluate(element => element === document.activeElement), true, 'focus returns to Fine-tune on the front')
    // LB / RB stay tabs on the front; inside a sub-page they do nothing (D3).
    await press('R')
    assert.equal(await page.locator('button.page-tab[aria-current="page"]').innerText(), 'Menus')
    assert.deepEqual(errors, [])
    console.log('PASS: gyro front has the input-front frame with A picking the hold button, Fine-tune groups (with Tilt) and Advanced parts step with LT/RT, B pops one sub-page at a time with focus restored, LB/RB stay tabs')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
