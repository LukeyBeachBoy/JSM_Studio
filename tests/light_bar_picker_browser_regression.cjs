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
    const popover = page.getByRole('dialog', { name: 'Custom color', exact: true })
    const hex = popover.getByRole('textbox', { name: /hex/i })

    // ---- Preferences: Controller light ----
    await page.getByRole('button', { name: /^Preferences/ }).first().click()
    await page.getByText('Controller light', { exact: true }).first().waitFor()
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
    await page.getByText('Controller light', { exact: true }).first().click()
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

    // ---- A binding card: LED while held ----
    await page.getByRole('button', { name: /^Home/ }).first().click()
    await page.locator('[data-home-continue]').click({ timeout: 15000 })
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const card = page.locator('details[data-input-command="N"]').first()
    await card.waitFor()
    if (await card.getAttribute('open') === null) await card.locator('summary').first().click()
    // LED while held is a command (TODO-54): added from the picker's JSM tab,
    // its colour picked in the row's settings sheet, which opens on the add.
    await card.getByRole('button', { name: 'Add command' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose an action' })
    await picker.locator('.action-picker__tabs .action-tab').filter({ hasText: 'JSM' }).click()
    await picker.getByRole('button', { name: 'Change LED colour', exact: true }).click()
    await picker.waitFor({ state: 'detached' })
    let held = page.getByRole('dialog').filter({ has: page.getByRole('radiogroup', { name: 'LED activation', exact: true }) })
    await held.waitFor()
    await held.getByRole('radio', { name: 'While held', exact: true }).click()
    held = page.getByRole('dialog').filter({ has: page.getByRole('radiogroup', { name: 'LED activation', exact: true }) })
    const heldGroup = held.getByRole('radiogroup', { name: 'Light bar color' })
    await heldGroup.waitFor()
    assert.equal(await page.locator('[data-color-wall]').count(), 0, 'the sheet shows swatches only')
    assert.equal(await held.getByRole('spinbutton', { name: /Brightness while held/i }).count() + await held.getByLabel(/Brightness while held/i).count() > 0, true, 'Brightness while held stays beside the picker')
    await page.screenshot({ path: 'tmp/light-bar-picker-card-collapsed.png' })
    const heldCustom = heldGroup.getByRole('radio', { name: 'Custom', exact: true })
    await heldCustom.click()
    await popover.waitFor()
    await hex.fill('ff8800')
    await hex.press('Enter')
    await page.screenshot({ path: 'tmp/light-bar-picker-card-open.png' })
    await popover.getByRole('button', { name: 'Done', exact: true }).click()
    await popover.waitFor({ state: 'hidden' })
    assert.equal(await heldCustom.getAttribute('aria-checked'), 'true')
    assert.equal(await heldCustom.getAttribute('data-color'), '#ff8800')
    await held.locator('[data-modal-close]').click()
    await held.waitFor({ state: 'detached' })
    // The row reads the colour it was given.
    const heldRow = card.locator('[data-command-row][data-held-led="true"]')
    await heldRow.waitFor()
    assert.match(await heldRow.getByRole('button', { name: /^Choose action/ }).innerText(), /Change LED Color/)
    assert.match(await heldRow.getByRole('combobox', { name: 'LED activation', exact: true }).innerText(), /Hold/i)
    const swatch = heldRow.locator('[aria-hidden="true"][style*="background"]');
    assert.equal(await swatch.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 136, 0)', 'the held row previews its chosen color')
    await page.screenshot({ path: 'tmp/light-bar-picker-card-custom.png' })

    assert.deepEqual(errors, [])
    console.log('light bar picker regression: ok')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exit(1) })
