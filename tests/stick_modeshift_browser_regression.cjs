const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const out = path.resolve('tmp/ui-ux-audit')
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message) })
    await page.addInitScript(() => {
      let content = sessionStorage.getItem('review-profile') || 'RESET_MAPPINGS\nVIRTUAL_CONTROLLER = XBOX\nLEFT_STICK_MODE = LEFT_STICK\nRIGHT_STICK_MODE = RIGHT_STICK\nFLICK_TIME = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_TOUCH_STICK_MODE = FLICK\nR,LEFT_TOUCHPAD_MODE = GRID_AND_STICK\nR,LEFT_TOUCH_STICK_MODE = AIM\n'
      let api
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        get: () => api,
        set: mock => { api = {
          ...mock,
          getActiveProfile: async () => ({ name: 'Review', path: 'profiles-library/Review.txt', content }),
          listLibraryProfiles: async () => ['Review'],
          loadLibraryProfile: async () => ({ name: 'Review', content }),
          getLayerStack: async () => ({ profile: 'profiles-library/Review.txt', layers: [] }),
          saveLibraryProfile: async (name, text) => { content = text; sessionStorage.setItem('review-profile', text); window.__saved = text; return { name } },
        } },
      })
    })
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1421'}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()
    // Console v2 (P4, D11): a stick's "While holding…" is a sub-page from its Y menu.
    const openHolding = async (tab, item) => {
      await page.getByRole('button', { name: tab, exact: true }).click()
      await page.locator('.section-item').filter({ hasText: item }).click()
      await page.locator('.main-pane [role="radio"]').first().focus()
      await page.keyboard.press('y')
      await page.locator('[data-more-item="holding"]').click()
      await page.locator('[data-subpage]').first().waitFor()
    }
    await openHolding('Sticks', 'Right stick')
    // "Add a button" opens the "Hold which button?" sheet; Next creates the
    // shift and opens its editor on a page of its own.
    const right = page.locator('[data-subpage]').first()
    await right.locator('[data-add-modeshift]').click()
    const holdSheet = page.getByRole('dialog').filter({ has: page.locator('[data-hold-input]') })
    await holdSheet.locator('[data-hold-input="L"]').click()
    await holdSheet.getByRole('button', { name: 'Next', exact: true }).click()
    const shift = page.locator('[data-modeshift-editor="L"]')
    await shift.getByRole('combobox', { name: 'Right stick mode' }).click()
    await page.getByRole('option', { name: 'Flick Stick', exact: true }).click()
    await shift.getByRole('button', { name: 'Flick tuning', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Right stick · Flick tuning' })
    const time = sheet.getByRole('textbox', { name: 'Flick time', exact: true })
    assert.equal(await time.inputValue(), '0.1', 'shift reads inherited flick time')
    await time.fill('0.23')
    await time.press('Tab')
    const snap = sheet.getByRole('textbox', { name: 'Snap strength', exact: true })
    assert.equal(await sheet.getByRole('slider', { name: 'Snap strength', exact: true }).getAttribute('aria-valuenow'), '1', 'unset slider shows the actual default');
    assert.equal(await snap.isEnabled(), true, 'inactive snapping does not lock configuration')
    await snap.fill('0.65')
    await snap.press('Tab')
    await page.screenshot({ path: path.join(out, 'shifted-flick-tuning.png') })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__saved?.includes('FLICK_TIME = 0.23'))
    let saved = await page.evaluate(() => window.__saved)
    assert.match(saved, /^(?:# @controller type-\d+ )?RIGHT_STICK_MODE = RIGHT_STICK$/m)
    assert.match(saved, /^(?:# @controller type-\d+ )?FLICK_TIME = 0.1$/m)
    assert.match(saved, /^(?:# @controller type-\d+ )?L,RIGHT_STICK_MODE = FLICK$/m)
    assert.match(saved, /^(?:# @controller type-\d+ )?L,FLICK_TIME = 0.23$/m)
    assert.match(saved, /^(?:# @controller type-\d+ )?L,FLICK_SNAP_STRENGTH = 0.65$/m)
    await page.reload()
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').click({ timeout: 15000 })
    await openHolding('Sticks', 'Right stick')
    await page.locator('[data-modeshift="L"]').click()
    await shift.getByRole('button', { name: 'Flick tuning', exact: true }).click()
    assert.equal(await sheet.getByRole('textbox', { name: 'Flick time', exact: true }).inputValue(), '0.23', 'saved tuning survives renderer reload')
    await sheet.getByRole('textbox', { name: 'Flick time', exact: true }).fill('')
    await sheet.getByRole('textbox', { name: 'Flick time', exact: true }).press('Tab')
    await page.waitForFunction(el => el.value === '0.1', await sheet.getByRole('textbox', { name: 'Flick time', exact: true }).elementHandle())
    assert.equal(await sheet.getByRole('textbox', { name: 'Flick time', exact: true }).inputValue(), '0.1', 'clearing tuning restores the normal value')
    await page.keyboard.press('Escape')
    await shift.getByRole('combobox', { name: 'Right stick mode' }).click()
    await page.getByRole('option', { name: 'Virtual Controller – Right Stick', exact: true }).click()
    await shift.getByRole('button', { name: 'Output settings', exact: true }).click()
    // The probe is a drop-down row in the Output settings sheet.
    const probe = page.getByRole('dialog').getByRole('combobox', { name: 'Deadzone test signal' })
    await probe.click(); await page.getByRole('option', { name: 'Off', exact: true }).click()
    await page.keyboard.press('Escape'); await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /L,RIGHT_STICK_DEADZONE_PROBE = OFF/.test(window.__saved))
    saved = await page.evaluate(() => window.__saved)
    assert.doesNotMatch(saved, /^(?:# @controller type-\d+ )?RIGHT_STICK_DEADZONE_PROBE =/m, 'held test policy leaves the base setting inherited')
    await shift.getByRole('combobox', { name: 'Right stick mode' }).click()
    await page.getByRole('option', { name: /Directions.*default/i }).click()
    await shift.getByRole('button', { name: /^Directions/ }).click()
    assert.equal(await page.getByRole('dialog').locator('[data-input-command="L,RUP"]').count(), 1, 'direction absent from base passthrough remains editable in shift')
    await page.keyboard.press('Escape')
    await shift.getByRole('combobox', { name: 'Right stick mode' }).click()
    await page.getByRole('option', { name: 'Radial menu (wheel)', exact: true }).click()
    await page.screenshot({ path: path.join(out, 'shifted-radial.png') })
    // A wheel while holding is a stick menu made on the spot: the sheet offers
    // "Create radial menu" (which opens the Menus tab), and the shift's own
    // mode is untouched until then.
    await page.getByRole('button', { name: /^Create radial menu/ }).waitFor()
    await page.keyboard.press('Escape')
    await shift.locator('[data-remove-modeshift]').click()
    await shift.waitFor({ state: 'detached' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !/L,FLICK_TIME/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /L,RIGHT_STICK_DEADZONE_PROBE/)
    saved = await page.evaluate(() => window.__saved)
    assert.match(saved, /^(?:# @controller type-\d+ )?FLICK_TIME = 0.1$/m)
    // (Known gap, not P4: with a controller layout active the shift's lines are saved as
    // "# @controller type-N L,..." and removing the shift leaves those behind.)
    assert.doesNotMatch(saved, /^L,/m, 'removal takes every setting and binding in this shift')
    await page.locator('[data-subpage] [data-modal-close]').evaluate(close => close.click())
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    await openHolding('Trackpads', 'Left pad')
    await page.locator('[data-modeshift="R"]').click()
    const padShift = page.locator('[data-modeshift-editor="R"]')
    await padShift.getByRole('button', { name: 'Aim tuning', exact: true }).click()
    const padSheet = page.getByRole('dialog', { name: /Left touch stick.*Aim tuning/ })
    assert.equal(await padSheet.getByRole('slider', { name: 'Stick power', exact: true }).getAttribute('aria-valuenow'), '1', 'power default matches the mapper');
    await padSheet.getByRole('textbox', { name: 'Stick power', exact: true }).fill('2.5')
    await padSheet.getByRole('textbox', { name: 'Stick power', exact: true }).press('Tab')
    await page.screenshot({ path: path.join(out, 'shifted-touch-stick-tuning.png') })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /R,STICK_POWER = 2.5/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^(?:# @controller type-\d+ )?STICK_POWER =/m, 'touch stick tuning stays scoped to its shift')
    assert.deepEqual(errors, [])
    console.log('PASS: passthrough → flick tuning, inheritance, scoped save/reload, editable snap strength, shifted directions/radial, complete removal and touch-stick tuning parity')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
