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

    // Console v2 (P5): gyro's held variants are When is gyro on? ▸ While holding a button, gyro is…
    // (held, or "let go"), each opening the Fine-tune screens scoped to that input.
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await page.locator('[data-gyro-front]').waitFor()
    const openHeld = async () => {
      await page.locator('[data-gyro-front] section').first().locator('button').last().click()
      await page.locator('[data-while-holding="gyro"]').click()
    }
    const subTop = () => page.locator('[data-subpage]').last()
    const addHeld = async (marker, input) => {
      await subTop().locator(marker).click()
      await page.getByRole('dialog').last().locator(`[data-hold-input="${input}"]`).focus()
      await page.keyboard.press('Enter')
      await subTop().locator('[data-gyro-fine-tune-page]').waitFor()
    }
    const typeSpeed = async value => {
      const row = subTop().locator('[role="slider"]').filter({ hasText: /^Turn speed/ }).first()
      await row.focus(); await row.press('Enter')
      await page.locator('[role="dialog"][aria-label^="Type:"]').waitFor()
      for (let n = 0; n < 8; n++) await page.keyboard.press('Backspace')
      await page.keyboard.type(String(value)); await page.keyboard.press('Enter')
      await page.locator('[role="dialog"][aria-label^="Type:"]').waitFor({ state: 'detached' })
    }
    await openHeld()
    await addHeld('[data-add-held]', 'L')
    assert.match(await subTop().locator(':scope > header').innerText(), /Mode shift · LB/)
    await typeSpeed(3)
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /L,GYRO_SENS = 3/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^GYRO_SENS =/m)
    await page.keyboard.press('Escape')
    // A variant that applies while a button is let go.
    await addHeld('[data-add-released]', 'R')
    assert.match(await subTop().locator(':scope > header').innerText(), /Mode shift · RB let go/)
    await typeSpeed(5)
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /!R,GYRO_SENS = 5/.test(window.__saved))
    assert.match(await page.evaluate(() => window.__saved), /^(# @controller type-24 )?L,GYRO_SENS = 3/m)
    await subTop().screenshot({ path: 'tmp/gyro-modeshift.png' })
    await page.keyboard.press('Escape')
    await page.reload()
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 2000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await openHeld()
    await subTop().locator('[data-held="!R"]').click()
    assert.equal(await subTop().locator('[role="slider"]').filter({ hasText: /^Turn speed/ }).first().getAttribute('aria-valuetext'), '5×')
    await page.keyboard.press('Escape')
    await subTop().locator('[data-held="!R"]').focus()
    await page.keyboard.press('x')
    await subTop().locator('[data-held="!R"]').waitFor({ state: 'detached' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !/!R,GYRO_/.test(window.__saved))
    assert.match(await page.evaluate(() => window.__saved), /^(# @controller type-24 )?L,GYRO_SENS = 3/m)
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape')
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    // Console v2 (P4, D11): a trigger's "While holding…" is a sub-page from its Y menu.
    await page.getByRole('button', { name: 'Triggers', exact: true }).click()
    await page.locator('#trigger-left [role="radio"]').first().focus()
    await page.keyboard.press('y')
    await page.locator('[data-more-item="holding"]').click()
    // "Add a button" opens the "Hold which button?" sheet; the new shift opens on
    // its own page, where "Mode while held" is a segmented row.
    const triggerGroup = page.locator('[data-subpage]').first().locator('[data-modeshift-list]')
    await triggerGroup.locator('[data-add-modeshift]').click()
    const holdSheet = page.getByRole('dialog').filter({ has: page.locator('[data-hold-input]') })
    await holdSheet.locator('[data-hold-input="R"]').click()
    await holdSheet.getByRole('button', { name: 'Next', exact: true }).click()
    const triggerShift = page.locator('[data-modeshift-editor="R"]')
    const shiftMode = triggerShift.getByRole('radiogroup', {name:'Mode while held',exact:true})
    const pickMode = label => shiftMode.getByText(label, { exact: true }).click()
    await pickMode('Quick full press skips half')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /R,ZL_MODE = MUST_SKIP/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^ZL_MODE = MUST_SKIP/m)
    assert.equal(await triggerGroup.locator('[data-modeshift="R"]').count(), 1, 'the shift is listed')
    await triggerShift.screenshot({path:'tmp/trigger-modeshift.png'})
    await pickMode('Gamepad trigger · left')
    await shiftMode.locator('button[data-current="true"]').filter({ hasText: 'Gamepad trigger · left' }).waitFor()
    for (const width of [1440, 1024, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await triggerShift.scrollIntoViewIfNeeded()
      assert.equal((await triggerShift.innerText()).includes('\uFFFD'), false, 'no corrupt label glyphs')
      const clipped = await triggerShift.evaluate(card => {
        const bounds = card.getBoundingClientRect()
        return [...card.querySelectorAll('button')].filter(button => {
          const box = button.getBoundingClientRect()
          return box.width > 0 && (box.left < bounds.left || box.right > bounds.right)
        }).map(button => button.textContent)
      })
      assert.deepEqual(clipped, [], `controls fit at ${width}px`)
      assert.equal(await shiftMode.evaluate(row => [...row.querySelectorAll('button')].every(segment => segment.scrollWidth <= segment.clientWidth + 1)), true, `full mode labels fit at ${width}px`)
      await triggerShift.screenshot({path:`tmp/trigger-modeshift-${width}.png`})
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.locator('[data-subpage] [data-modal-close]').last().evaluate(close => close.click())
    await triggerShift.waitFor({ state: 'detached' })
    await page.locator('[data-subpage] [data-modal-close]').evaluate(close => close.click())
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await openHeld()
    await subTop().locator('[data-held="L"]').click()
    await subTop().locator('button[data-group="direction"]').click()
    await subTop().locator('button[role="radio"][data-value="PS_MOTION"]').click()
    // The virtual pad is chosen in the same screen, but is global: never a held chord.
    const virtualPad = subTop().locator('[role="radiogroup"]').filter({ hasText: /^Virtual pad/ })
    await virtualPad.locator('button').filter({ hasText: /^PlayStation 4$/ }).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^(# @controller type-24 )?VIRTUAL_CONTROLLER = DS4$/m.test(window.__saved))
    const saved = await page.evaluate(() => window.__saved)
    assert.match(saved, /^(# @controller type-24 )?L,GYRO_OUTPUT = PS_MOTION$/m)
    assert.doesNotMatch(saved, /^(# @controller type-24 )?L,VIRTUAL_CONTROLLER/m, 'virtual device creation remains global')


    assert.deepEqual(errors, [])
    console.log('PASS: centered condition controls; multiple gyro shifts, released conditions, save/reload, scoped removal; trigger mode writes')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
