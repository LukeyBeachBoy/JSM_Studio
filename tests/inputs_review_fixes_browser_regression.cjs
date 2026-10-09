// UX review 2026-10-09, Sticks / Triggers / Trackpads (I1–I3, I10, I13): the
// Fine-tune rail, the hero row's Y, the Default chip and the steppers, the
// one-press Click required switch and the zone row's caption, driven with the
// mock pad and the mouse in the dev mock (?mock, simulated Steam Controller).
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.setDefaultTimeout(12000)
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock')
    await page.waitForFunction(() => window.__pad && document.querySelector('.titlebar'))
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => { await page.getByRole('button', { name: 'Keep them', exact: true }).click() })
    await page.waitForTimeout(800)
    const go = async id => { await page.evaluate(id => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: id })), id); await page.waitForTimeout(900) }
    const pad = async (buttons, ms = 90) => { await page.evaluate(([b, ms]) => window.__pad.press(b, ms), [buttons, ms]); await page.waitForTimeout(220) }
    const trigger = async side => { await page.evaluate(s => window.__pad.trigger(s, 1), side); await page.waitForTimeout(150); await page.evaluate(s => window.__pad.trigger(s, 0), side); await page.waitForTimeout(300) }
    const footer = () => page.evaluate(() => {
      const caps = Array.from(document.querySelectorAll('.hint-capsule')).filter(c => c.offsetParent !== null)
      const cap = caps[caps.length - 1]
      const sq = s => (s || '').replace(/\s+/g, ' ').trim()
      return { where: sq(cap?.querySelector('.hint-capsule__where')?.textContent), text: sq(cap?.textContent) }
    })
    const activeInfo = () => page.evaluate(() => {
      const a = document.activeElement
      return { tag: a?.tagName, text: (a?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), region: a?.closest('[data-nav-region]')?.getAttribute('data-nav-region') ?? '', hints: a?.closest('[data-hints]')?.getAttribute('data-hints') ?? '' }
    })

    // ---- I2 / I3: the hero row's Y is Use Default; the chip resets; ◂ ▸ keep the row's focus.
    await go('joysticks')
    const hero = page.locator('[data-stick-page] [role="slider"]').first()
    await hero.focus(); await page.waitForTimeout(200)
    assert.match((await activeInfo()).hints, /Y:Use Default/, 'the hero row answers Y itself')
    assert.doesNotMatch((await activeInfo()).hints, /Y:(Change keys|More)/, 'the page Y is not merged onto the row')
    assert.match((await footer()).text, /Use Default/, 'the footer says Y Use Default')
    const before = await hero.getAttribute('aria-valuetext')
    await hero.locator('button', { hasText: '▸' }).click(); await page.waitForTimeout(200)
    assert.notEqual(await hero.getAttribute('aria-valuetext'), before, 'clicking ▸ steps the value')
    assert.equal(await hero.evaluate(row => row === document.activeElement), true, 'clicking ▸ leaves focus on the row')
    assert.match((await footer()).text, /Ignore small movement/, 'the footer keeps the row caption')
    const chip = hero.locator('button[aria-label="Use Default"]')
    assert.equal(await chip.count(), 1, 'a changed value shows a clickable chip')
    await chip.click(); await page.waitForTimeout(250)
    assert.equal(await hero.getAttribute('aria-valuetext'), before, 'the chip puts the default back')
    assert.equal(await hero.evaluate(row => row === document.activeElement), true, 'the chip leaves focus on the row')
    assert.equal(await chip.count(), 0, 'at the default there is nothing to reset')
    // B on a front is labelled: it goes to Layout.
    assert.match((await activeInfo()).hints, /B:Layout/)

    // ---- I1: Fine-tune: Down past the last setting stays in the settings; LT/RT with focus on the rail move focus with the group.
    await page.evaluate(() => document.querySelector('[data-stick-page] button[class*="card"]')?.focus())
    await pad(['RIGHT']); await pad(['S'])
    await page.evaluate(() => document.querySelector('[data-stick-fine-tune-row]')?.focus())
    await pad(['S'])
    const fineTune = page.locator('[data-subpage] [data-stick-fine-tune]')
    await fineTune.waitFor()
    const group = () => page.locator('[data-subpage] nav[aria-label="Groups"] button[aria-current="true"]').getAttribute('data-group')
    assert.equal(await group(), 'speed')
    for (let i = 0; i < 8; i++) await pad(['DOWN'])
    assert.equal((await activeInfo()).region, 'fine-tune-content', 'Down past the end stays in the settings column')
    assert.equal(await group(), 'speed', 'the open group did not change')
    await pad(['LEFT'])
    assert.equal((await activeInfo()).region, 'fine-tune-rail', 'Left reaches the rail')
    await trigger('right')
    assert.equal(await group(), 'speedup')
    const railFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-group'))
    assert.equal(railFocused, 'speedup', 'RT with focus on the rail moves focus to the open group')
    assert.match((await footer()).where, /Speed-up$/, 'the footer names the same group')
    await trigger('left'); await trigger('left')
    assert.equal(await group(), 'touch')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-group')), 'touch')
    // Right from the settings column never leaves the Fine-tune frame.
    await pad(['RIGHT']); await pad(['RIGHT']); await pad(['RIGHT'])
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-stick-fine-tune]'))), true, 'sideways moves stay inside Fine-tune')
    await pad(['E']); await page.waitForTimeout(400)
    await fineTune.waitFor({ state: 'detached' })

    // ---- I10 / I13: Trackpads: Click required flips in one press without marking the file; X Next zone updates the caption.
    await go('touchpad')
    const left = page.locator('#trackpad-left')
    await left.waitFor()
    const chipText = () => page.locator('.titlebar').innerText()
    const clickRequired = left.locator('[role="switch"]').filter({ hasText: /^Click required/ })
    await clickRequired.focus(); await page.waitForTimeout(200)
    const statusBefore = await chipText()
    assert.doesNotMatch(statusBefore, /Unsaved/, 'focusing the switch marks nothing')
    const wasOn = await clickRequired.getAttribute('aria-checked')
    await pad(['S'])
    assert.notEqual(await clickRequired.getAttribute('aria-checked'), wasOn, 'A flips the switch in one press')
    await pad(['S'])
    assert.equal(await clickRequired.getAttribute('aria-checked'), wasOn, 'and back')
    const zone = left.locator('[data-input-command]').first()
    await zone.locator('summary, button, [tabindex="0"]').first().focus(); await page.waitForTimeout(200)
    const zoneBefore = (await footer()).text
    assert.match(zoneBefore, /Zone 1 of 4/, 'the zone row shows a state line')
    await pad(['W'])
    const zoneAfter = (await footer()).text
    assert.notEqual(zoneAfter, zoneBefore, 'X Next zone updates the footer caption')
    assert.match(zoneAfter, /Zone 2 of 4/)

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '))
    console.log('PASS: inputs review fixes (Fine-tune rail, hero Y, Default chip, steppers, Click required, zone caption)')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
