// Console v2 (P4): Sticks, Triggers, Trackpads and the grip sheet, driven the
// way a person drives them. What each card writes, what each named preset
// writes (D7), "Both sticks" dead zones, the flick-to-gamepad game dead zone,
// the touch stick (D9) and its shared directions page, "Turn the zones" (D10),
// the trackpad acceleration presets, the Feel strengths, the trigger Advanced
// Skip window, the grip sheet, and the Home "Trackpad feel" jump.
//
// The mock Steam Controller (2026) is used with a profile this test supplies;
// every check reads the text the app saves, so it checks the config file and
// not the widgets' own idea of it.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const out = path.resolve(__dirname, '../tmp/console-v2-p4')
fs.mkdirSync(out, { recursive: true })

const PROFILE = [
  'RESET_MAPPINGS', 'VIRTUAL_CONTROLLER = XBOX',
  'LEFT_STICK_MODE = NO_MOUSE', 'RIGHT_STICK_MODE = AIM',
  'LEFT_TOUCHPAD_MODE = GRID_AND_STICK', 'RIGHT_TOUCHPAD_MODE = MOUSE',
  'ZL_MODE = NO_SKIP', 'ZR_MODE = NO_FULL', '',
].join('\n')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message) })
    await page.addInitScript(profile => {
      let content = profile
      let api
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        get: () => api,
        set: mock => { api = {
          ...mock,
          getActiveProfile: async () => ({ name: 'P4', path: 'profiles-library/P4.txt', content }),
          listLibraryProfiles: async () => ['P4'],
          loadLibraryProfile: async () => ({ name: 'P4', content }),
          getLayerStack: async () => ({ profile: 'profiles-library/P4.txt', layers: [] }),
          saveLibraryProfile: async (name, text) => { content = text; window.__saved = text; window.__saveCount = (window.__saveCount || 0) + 1; return { name } },
        } },
      })
    }, PROFILE)
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()
    await page.locator('.profile-chip').waitFor()

    // ---- helpers
    const saved = async () => {
      const before = await page.evaluate(() => window.__saveCount || 0)
      await page.keyboard.press('Control+s')
      await page.waitForFunction(count => (window.__saveCount || 0) > count, before, { timeout: 3000 }).catch(() => {})
      return page.evaluate(() => window.__saved || '')
    }
    // A value for the connected controller only is saved as "# @controller type-N KEY = value"
    // (Layout's variant scope); it is the one in effect, so it wins over the shared line.
    const keyOf = (text, key) => {
      const scoped = text.match(new RegExp(`^# @controller type-\\d+(?:-edge)? ${key} = ([^\\r\\n]*?)\\s*$`, 'm'))
      if (scoped) return scoped[1]
      const plain = text.match(new RegExp(`^${key}\\s*=\\s*([^#\\r\\n]*?)\\s*(#.*)?$`, 'm'))
      return plain ? plain[1] : null
    }
    const nav = name => page.getByRole('button', { name, exact: true }).click()
    const rail = async name => { await page.locator('.section-item').filter({ hasText: name }).first().click(); await page.waitForTimeout(250) }
    const card = (scope, value) => page.locator(`${scope} [role="radio"][data-value="${value}"]`)
    const current = scope => page.locator(`${scope} [role="radio"][data-current="true"]`).first().getAttribute('data-value')
    const sub = () => page.locator('[data-subpage]').last()
    const group = async id => { await sub().locator(`[data-group="${id}"]`).click(); await page.waitForTimeout(200) }
    const pick = async (label, option) => { await sub().locator(`[role="radiogroup"][aria-label="${label}"] button`, { hasText: option }).first().click(); await page.waitForTimeout(150) }
    const slider = label => sub().locator('[role="slider"]').filter({ hasText: label }).first()
    const closeSub = async () => { await sub().locator('[data-modal-close]').evaluate(close => close.click()); await page.waitForTimeout(250) }
    const shot = name => page.screenshot({ path: path.join(out, `${name}.png`) })

    // =============================================================== Sticks
    await nav('Sticks')
    await page.locator('#mapping-section-leftStick').waitFor()
    assert.equal(await current('#mapping-section-leftStick'), 'MOVING', 'NO_MOUSE is the Moving card')
    await rail('Right stick')
    const right = '#mapping-section-rightStick'
    assert.equal(await current(right), 'LOOK', 'AIM is the Looking around card')
    assert.equal(await page.locator('.main-pane h1').first().innerText(), 'Right stick is for…', 'the front asks one question')
    assert.equal(await page.locator('.page-header__title').count(), 0, 'no page header on Sticks (D4)')

    // Each front card writes its mode.
    for (const [value, mode] of [['GAMEPAD', 'RIGHT_STICK'], ['FLICK', 'FLICK'], ['MOVING', 'NO_MOUSE'], ['LOOK', 'AIM']]) {
      await card(right, value).click(); await page.waitForTimeout(150)
      assert.equal(keyOf(await saved(), 'RIGHT_STICK_MODE'), mode, `${value} writes RIGHT_STICK_MODE = ${mode}`)
    }
    assert.equal(await current(right), 'LOOK')

    // Fine-tune ▸ Speed: "How a push becomes speed" (STICK_POWER 0.5 / 1 / 2).
    await page.locator(`${right} [data-stick-fine-tune-row]`).click()
    await group('speed')
    await pick('How a push becomes speed', 'Quick start')
    assert.equal(keyOf(await saved(), 'STICK_POWER'), '0.5', 'Quick start is STICK_POWER 0.5')
    await pick('How a push becomes speed', 'Precise centre')
    assert.equal(keyOf(await saved(), 'STICK_POWER'), '2', 'Precise centre is STICK_POWER 2')
    await pick('How a push becomes speed', 'Even')
    assert.equal(keyOf(await saved(), 'STICK_POWER'), null, 'Even is the default and writes nothing')
    // The old mojibake is gone: speeds read in °/s.
    assert.match(await slider('Turn speed').getAttribute('aria-valuetext'), /^\d+°\/s$/, 'turn speed reads in degrees per second')
    assert.equal(/Â/.test(await sub().innerText()), false, 'no mojibake anywhere in Fine-tune')

    // Speed-up (rate / cap).
    await group('speedup')
    await pick('How much', 'Gentle')
    let text = await saved()
    assert.deepEqual([keyOf(text, 'STICK_ACCELERATION_RATE'), keyOf(text, 'STICK_ACCELERATION_CAP')], ['1', '2'], 'Gentle is rate 1, top 2')
    await pick('How much', 'Strong')
    text = await saved()
    assert.deepEqual([keyOf(text, 'STICK_ACCELERATION_RATE'), keyOf(text, 'STICK_ACCELERATION_CAP')], ['2', '3'], 'Strong is rate 2, top 3')
    await pick('How much', 'Off')
    text = await saved()
    assert.deepEqual([keyOf(text, 'STICK_ACCELERATION_RATE'), keyOf(text, 'STICK_ACCELERATION_CAP')], [null, null], 'Off removes both')

    // Dead zone & edge: Both sticks writes the shared keys, one stick its own.
    await group('deadzone')
    await slider('Ignore small movement').focus()
    await page.keyboard.press('ArrowRight')
    text = await saved()
    assert.ok(keyOf(text, 'STICK_DEADZONE_INNER') !== null, 'Both sticks (the default) writes STICK_DEADZONE_INNER')
    assert.equal(keyOf(text, 'RIGHT_STICK_DEADZONE_INNER'), null)
    await pick('Applies to', 'Right stick only')
    text = await saved()
    assert.ok(keyOf(text, 'RIGHT_STICK_DEADZONE_INNER') !== null && keyOf(text, 'RIGHT_STICK_DEADZONE_OUTER') !== null, 'one stick gets its own pair')
    await pick('Applies to', 'Both sticks')
    text = await saved()
    assert.equal(keyOf(text, 'RIGHT_STICK_DEADZONE_INNER'), null, 'Both sticks clears the per-stick pair')
    assert.ok(keyOf(text, 'STICK_DEADZONE_INNER') !== null && keyOf(text, 'STICK_DEADZONE_OUTER') !== null)
    await shot('sticks-deadzone')

    // Advanced ▸ Exact curve and Match a full turn.
    await group('speed')
    await sub().locator('button').filter({ hasText: /^Advanced/ }).click()
    const advanced = sub()
    await advanced.getByText('Exact curve', { exact: false }).first().waitFor()
    await advanced.locator('button').filter({ hasText: /^Match a full turn/ }).first().click()
    await page.getByText('Match a full turn', { exact: false }).first().waitFor()
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    if (await page.locator('[data-subpage]').count()) await closeSub()

    // Flick to turn → gamepad stick output reaches the game's dead zone (and curve).
    await card(right, 'FLICK').click(); await page.waitForTimeout(200)
    await page.locator(`${right} [data-stick-fine-tune-row]`).click()
    await group('output')
    await sub().locator('[role="radio"][data-value="RIGHT_STICK"]').click(); await page.waitForTimeout(200)
    assert.equal(keyOf(await saved(), 'FLICK_STICK_OUTPUT'), 'RIGHT_STICK', 'turning output goes through the right gamepad stick')
    const gameDead = slider('Game’s dead zone')
    await gameDead.waitFor()
    await gameDead.focus(); await page.keyboard.press('ArrowRight')
    assert.ok(keyOf(await saved(), 'RIGHT_STICK_UNDEADZONE_INNER') !== null, 'the game’s dead zone is writable from the flick’s output')
    await pick('Response curve', 'Undo square')
    assert.equal(keyOf(await saved(), 'RIGHT_STICK_UNPOWER'), '2', 'Undo square is UNPOWER 2')
    await closeSub()
    await card(right, 'LOOK').click()

    // The Y menu on the front reaches While holding….
    await card(right, 'LOOK').focus()
    await page.keyboard.press('y')
    await page.locator('[data-more-item="holding"]').waitFor()
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)

    // =============================================================== Triggers
    await nav('Triggers')
    await page.locator('#trigger-left').waitFor()
    assert.equal(await page.locator('.page-header__title').count(), 0, 'no page header on Triggers (D4)')
    assert.equal(await current('#trigger-left'), 'NO_SKIP', 'ZL_MODE = NO_SKIP is Half then full press')
    for (const value of ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R', 'GAMEPAD']) {
      assert.equal(await card('#trigger-left', value).count(), 1, `trigger card ${value}`)
    }
    await card('#trigger-left', 'MUST_SKIP').click(); await page.waitForTimeout(150)
    assert.equal(keyOf(await saved(), 'ZL_MODE'), 'MUST_SKIP')
    await card('#trigger-left', 'GAMEPAD').click(); await page.waitForTimeout(150)
    assert.equal(keyOf(await saved(), 'ZL_MODE'), 'X_LT', 'Gamepad trigger sends as the Xbox left trigger')
    await card('#trigger-left', 'NO_SKIP').click(); await page.waitForTimeout(150)
    assert.equal(keyOf(await saved(), 'ZL_MODE'), 'NO_SKIP')
    // Half press / Full press vocabulary; the old words are gone.
    const triggerText = await page.locator('.main-pane').innerText()
    assert.match(triggerText, /Half press/)
    assert.equal(/soft pull/i.test(triggerText), false, 'no “soft pull” on the Triggers front')
    // Fine-tune ▸ Advanced always has the Skip window (TRIGGER_SKIP_DELAY).
    await page.locator('#trigger-left [data-trigger-fine-tune]').click()
    await group('press')
    await sub().locator('button').filter({ hasText: /^Advanced/ }).click()
    await sub().getByText('Quick full press window', { exact: false }).first().waitFor()
    const skip = sub().locator('[role="slider"]').filter({ hasText: /^Window/ }).first()
    await skip.focus(); await page.keyboard.press('ArrowRight')
    assert.ok(keyOf(await saved(), 'TRIGGER_SKIP_DELAY') !== null, 'TRIGGER_SKIP_DELAY is reachable in every trigger mode')
    await shot('triggers-advanced')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    if (await page.locator('[data-subpage]').count()) await closeSub()
    if (await page.locator('[data-subpage]').count()) await closeSub()
    // Y ▸ Calibrate: on the mock Steam Controller the item says why it can't run (UX review I6); the guided flow needs a DualSense.
    await card('#trigger-left', 'NO_SKIP').focus()
    await page.keyboard.press('y')
    const calibrateItem = page.locator('[data-more-item="calibrate"]')
    await calibrateItem.waitFor()
    assert.equal(await calibrateItem.getAttribute('aria-disabled'), 'true', 'Calibrate is unavailable on a non-DualSense')
    assert.match(await calibrateItem.getAttribute('data-reason'), /DualSense/)
    await shot('triggers-calibrate')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    if (await page.locator('[data-subpage]').count()) await closeSub()

    // =============================================================== Trackpads
    await nav('Trackpads')
    assert.equal(await page.locator('.page-header__title').count(), 0, 'no page header on Trackpads (D4)')
    const left = '#trackpad-left'
    await page.locator(left).waitFor()
    assert.equal(await current(left), 'ZONES')
    // Touch stick (D9): a one-zone grid with a touch stick on it, undone on the way back.
    await card(left, 'TOUCH_STICK').click(); await page.waitForTimeout(200)
    text = await saved()
    assert.deepEqual([keyOf(text, 'LEFT_TOUCHPAD_MODE'), keyOf(text, 'LEFT_GRID_SIZE'), keyOf(text, 'LEFT_TOUCH_STICK_MODE')], ['GRID_AND_STICK', '1 1', 'NO_MOUSE'], 'Touch stick = GRID_AND_STICK, one zone, a touch stick')
    // Its directions are one shared page, and it says so.
    await page.locator(`${left} button`).filter({ hasText: /^Directions/ }).first().click()
    const directions = sub()
    await directions.getByText(/Shared by every touch stick/).waitFor()
    await shot('trackpads-touch-stick-directions')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    await card(left, 'ZONES').click(); await page.waitForTimeout(200)
    text = await saved()
    assert.equal(keyOf(text, 'LEFT_TOUCH_STICK_MODE'), null, 'back to zones removes the touch stick mode it set')
    assert.equal(keyOf(text, 'LEFT_GRID_SIZE'), '2 2', 'and restores a 2 × 2 grid')
    // Cards write their pad mode.
    for (const [value, mode] of [['MOUSE', 'MOUSE'], ['MOUSE_AREA', 'MOUSE_AREA'], ['ZONES', 'GRID_AND_STICK']]) {
      await card(left, value).click(); await page.waitForTimeout(150)
      assert.equal(keyOf(await saved(), 'LEFT_TOUCHPAD_MODE'), mode, `${value} writes LEFT_TOUCHPAD_MODE = ${mode}`)
    }
    assert.equal(await card(left, 'PS_TOUCHPAD').getAttribute('aria-disabled'), 'true', 'PlayStation touchpad is unavailable on a two-pad controller')
    // Turn the zones (D10): Zones ▸ Layout.
    await page.locator(`${left} [data-trackpad-fine-tune]`).click()
    await group('zones')
    const turn = slider('Turn the zones')
    await turn.waitFor()
    await turn.focus(); await page.keyboard.press('ArrowRight')
    assert.ok(keyOf(await saved(), 'LEFT_TOUCHPAD_ROTATION') !== null, 'Turn the zones writes LEFT_TOUCHPAD_ROTATION')
    await shot('trackpads-zones-layout')
    await closeSub()

    // Mouse pad: acceleration presets (D7) and the Feel strengths.
    await rail('Right pad')
    const rightPad = '#trackpad-right'
    await page.locator(rightPad).waitFor()
    assert.equal(await current(rightPad), 'MOUSE')
    await page.locator(`${rightPad} [data-trackpad-fine-tune]`).click()
    await group('speed')
    await pick('Speed up fast swipes', 'Gentle')
    text = await saved()
    assert.deepEqual([keyOf(text, 'TOUCHPAD_ACCEL_CURVE'), keyOf(text, 'TOUCHPAD_ACCEL_MAX_GAIN')], ['NATURAL', '1.6'], 'Gentle is a natural curve up to 1.6×')
    await pick('Speed up fast swipes', 'Strong')
    assert.equal(keyOf(await saved(), 'TOUCHPAD_ACCEL_MAX_GAIN'), '2.5', 'Strong is up to 2.5×')
    await pick('Speed up fast swipes', 'Off')
    text = await saved()
    assert.deepEqual([keyOf(text, 'TOUCHPAD_ACCEL_CURVE'), keyOf(text, 'TOUCHPAD_ACCEL_MAX_GAIN')], [null, null], 'Off removes the curve')
    // Advanced: TOUCHPAD_ACCELERATION is reachable.
    await sub().locator('button').filter({ hasText: /^Advanced/ }).click()
    await sub().last().getByText('TOUCHPAD_ACCELERATION', { exact: false }).first().waitFor().catch(async () => {
      await sub().last().locator('[role="slider"]').filter({ hasText: /speed-up/i }).first().waitFor()
    })
    await shot('trackpads-speed-advanced')
    await page.keyboard.press('Escape'); await page.waitForTimeout(250)
    await group('feel')
    await shot('trackpads-feel')
    await closeSub()

    // =============================================================== Home ▸ Trackpad feel
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:open-sheet', { detail: 'mouseFeel' })))
    await sub().locator('[data-group="glide"][aria-current="true"]').waitFor({ timeout: 5000 })
    assert.equal(await page.locator('[data-trackpad-page]').count() > 0, true, 'the Trackpad feel link lands on Trackpads')
    await closeSub()

    // =============================================================== Grip sensors
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:open-sheet', { detail: 'gripSensors' })))
    const grips = page.getByRole('dialog', { name: 'Grip sensors', exact: true })
    await grips.waitFor()
    const range = grips.locator('[role="slider"]').filter({ hasText: 'How close counts as touching' })
    await range.waitFor()
    await range.focus(); await page.keyboard.press('ArrowRight')
    assert.ok(keyOf(await saved(), 'GRIP_SENSOR_RANGE') !== null, 'the proximity range is written')
    const guard = grips.locator('[role="slider"]').filter({ hasText: 'Flicker guard' })
    await guard.focus(); await page.keyboard.press('ArrowRight')
    assert.ok(keyOf(await saved(), 'GRIP_FLICKER_GUARD') !== null, 'the flicker guard is written')
    for (const label of ['Keep holding after you let go', 'Squeeze rumble', 'Let-go rumble', 'Rumble on']) {
      assert.ok(await grips.getByText(label, { exact: false }).count(), `grip sheet has ${label}`)
    }
    await shot('grip-sensors')
    await page.keyboard.press('Escape')
    await grips.waitFor({ state: 'detached' })

    assert.deepEqual(errors, [], 'no page errors')
    console.log('PASS: Sticks/Triggers/Trackpads cards, presets, shared dead zones, flick-to-gamepad, touch stick, trigger skip window, grip sheet')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
