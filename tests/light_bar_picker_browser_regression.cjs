// TODO-47: colour pickers show swatches only; the hue wall, sliders and hex
// field live in a popover behind the "custom" swatch. Checked on the
// Preferences page (Controller light) and on a binding card's LED while held.
// Isolated renderer checks; the mock never reaches a physical controller.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => { errors.push(`Browser dialog opened: ${dialog.type()}`); void dialog.dismiss() })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await firstConnect.getByRole('button', { name: 'Keep them' }).click()
      await firstConnect.waitFor({ state: 'hidden' })
    }
    fs.mkdirSync('tmp', { recursive: true })
    const press = async key => { await page.evaluate(key => window.__pad.press([key]), key); await page.waitForTimeout(250) }
    const popover = page.getByRole('dialog', { name: 'Custom colour', exact: true })
    const hex = popover.getByRole('textbox', { name: /hex/i })

    // ---- Preferences: Controller light ----
    // Console v2: Settings ▸ Controller ▸ Light colour opens its own page.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'settings' })))
    await page.getByRole('button', { name: /^Light colour when a configuration/ }).click()
    await page.getByText('Light colour', { exact: true }).first().waitFor()
    const group = page.getByRole('radiogroup', { name: 'Light bar color' }).first()
    await group.waitFor()
    // Collapsed: the swatch row and nothing else.
    assert.equal(await page.locator('[data-color-wall]').count(), 0, 'no hue wall until custom is chosen')
    assert.equal(await page.getByRole('slider', { name: 'Hue', exact: true }).count(), 0, 'no sliders until custom is chosen')
    assert.equal(await page.getByRole('textbox', { name: /hex/i }).count(), 0, 'no hex field until custom is chosen')
    assert.equal(await group.getByRole('radio').count(), 10, 'nine presets plus custom')
    const custom = group.getByRole('radio', { name: 'Custom', exact: true })
    await group.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'tmp/light-bar-picker-collapsed.png' })

    // Custom opens the popover, anchored to the row, with focus inside it.
    await custom.click()
    await popover.waitFor()
    assert.equal(await popover.locator('[data-color-wall]').count(), 1, 'the wall is in the popover')
    await popover.getByRole('slider', { name: 'Hue', exact: true }).waitFor()
    await popover.getByRole('slider', { name: 'Saturation', exact: true }).waitFor()
    await popover.getByRole('slider', { name: 'Color value', exact: true }).waitFor()
    assert.ok(await popover.evaluate(el => el.contains(document.activeElement)), 'focus moved into the popover')
    assert.equal(await popover.getAttribute('data-focus-trap'), 'true')
    const rowBox = await group.boundingBox(), popBox = await popover.boundingBox()
    assert.ok(popBox.y >= rowBox.y + rowBox.height - 1 || popBox.y + popBox.height <= rowBox.y + 1, 'the popover sits beside the swatch row, not over it')
    assert.ok(popBox.x >= 0 && popBox.x + popBox.width <= 1360 && popBox.y >= 0 && popBox.y + popBox.height <= 900, 'the popover stays within the window')
    await hex.fill('123abc')
    await hex.press('Tab')
    assert.equal(await popover.getByRole('img', { name: 'Selected color #123abc' }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(18, 58, 188)')
    await page.screenshot({ path: 'tmp/light-bar-picker-open.png' })

    // Done collapses it; the custom swatch shows the colour and keeps focus.
    await popover.getByRole('button', { name: 'Done', exact: true }).click()
    await popover.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('[data-color-wall]').count(), 0)
    assert.equal(await custom.getAttribute('aria-checked'), 'true', 'the custom swatch is the selected one')
    assert.equal(await custom.getAttribute('data-color'), '#123abc')
    // A shell-wide button transition can still be settling: match the channels.
    assert.match(await custom.evaluate(el => getComputedStyle(el).backgroundColor), /^rgba?\(18, 58, 188/)
    assert.ok(await custom.evaluate(el => el === document.activeElement), 'focus returns to the custom swatch')
    await page.screenshot({ path: 'tmp/light-bar-picker-custom.png' })

    // Clicking it again reopens with the current colour; Escape closes.
    await custom.click()
    await popover.waitFor()
    assert.equal(await hex.inputValue(), '123abc', 'reopened with the current colour')
    await page.keyboard.press('Escape')
    await popover.waitFor({ state: 'hidden' })
    assert.equal(await custom.getAttribute('data-color'), '#123abc', 'Escape keeps the colour')

    // A click outside closes; a preset unchecks custom.
    await custom.click()
    await popover.waitFor()
    await page.getByText('Light colour', { exact: true }).first().click()
    await popover.waitFor({ state: 'hidden' })
    await group.getByRole('radio', { name: 'Green', exact: true }).click()
    assert.equal(await custom.getAttribute('aria-checked'), 'false')
    assert.equal(await group.getByRole('radio', { name: 'Green', exact: true }).getAttribute('aria-checked'), 'true')
    assert.equal(await custom.getAttribute('data-color'), null, 'a preset leaves the custom swatch empty')

    // The pad: Right from the last preset lands on Custom, A opens, B closes.
    await group.getByRole('radio', { name: 'Pink', exact: true }).focus()
    await press('RIGHT')
    assert.ok(await custom.evaluate(el => el === document.activeElement), 'Right from Pink reaches Custom')
    await press('S')
    await popover.waitFor()
    assert.ok(await popover.evaluate(el => el.contains(document.activeElement)), 'A opens the popover with focus inside')
    await press('E')
    await popover.waitFor({ state: 'hidden' })
    assert.ok(await custom.evaluate(el => el === document.activeElement), 'B closes it and hands focus back')

    // ---- A binding: Light in the Controller action picker (console v2) ----
    // Change light colour, Light while held and Light brightness are tiles of
    // the Light group; the colour starts as the configuration's and is picked
    // in the binding sheet's Fine-tune (BIND).
    await page.keyboard.press('Escape')
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: /^Home/ }).first().click()
    await page.locator('[data-home-continue]').click({ timeout: 15000 })
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = page.locator('details[data-input-command="N"]').first()
    await card.waitFor()
    if (await card.getAttribute('open') === null) await card.locator(':scope > summary').click()
    await card.locator('[data-kind="controller"]').first().click()
    const picker = page.locator('[data-picker="controller"]')
    await picker.waitFor()
    await picker.locator('[data-category="light"]').click()
    assert.deepEqual(await picker.locator('[data-action] [class*="tileTitle"]').allInnerTexts(), ['Change light colour', 'Light while held', 'Light brightness'])
    assert.match(await picker.innerText(), /The light the rest of the time/)
    await picker.locator('[data-action="LIGHT_BAR"]').focus()
    assert.match(await picker.locator('aside').innerText(), /Colours to pick from next/)
    await page.screenshot({ path: 'tmp/light-bar-picker-card-collapsed.png' })
    await picker.locator('[data-action="LIGHT_BAR"]').click()
    await page.locator('[data-picker="light"] [data-light-use]').click()
    await picker.waitFor({ state: 'detached' })
    // The binding reads as a light change, not as the raw command.
    await page.waitForFunction(() => /light|LED/i.test(document.querySelector('details[data-input-command="N"]')?.textContent ?? ''))
    await page.screenshot({ path: 'tmp/light-bar-picker-card-custom.png' })

    assert.deepEqual(errors, [])
    console.log('light bar picker regression: ok')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
