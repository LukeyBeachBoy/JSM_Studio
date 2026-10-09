// Renderer-only interaction and focus tests. No controller or runtime is started.
// Console v2 (P5): gyro to a virtual stick lives under Gyro ▸ Fine-tune ▸
// Direction ▸ Right stick settings (Setup, Deadzone & curve); held filter and
// rumble values under When is gyro on? ▸ While holding a button.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openRow, openPart, valueRow, switchRow, segmentRow, step, segment, save, valueText, eff } = require('./gyro_v2_helpers.cjs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nGYRO_OUTPUT = RIGHT_STICK\nRIGHT_STICK_UNDEADZONE_INNER = 0.2\nRIGHT_STICK_UNPOWER = 2\nLEFT_STICK_UNDEADZONE_INNER = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_PARITY_SETTING = preserve_me\n'
      content += 'ONE_EURO_FILTER\nONE_EURO_MIN_CUTOFF = 6 # base smoothing\nONE_EURO_SPEED_COEFF = 0.3\nL,ONE_EURO_MIN_CUTOFF = 0.5 # ADS smoothing\nL,ONE_EURO_SPEED_COEFF = 0.1 # ADS response\n'
      content += 'GYRO_HAPTIC_INTENSITY = 0\nL,GYRO_HAPTIC_INTENSITY = 20 # ADS feedback\nL,GYRO_HAPTIC_INTERVAL = 10\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Parity', path: 'profiles-library/Parity.txt', content }),
        listLibraryProfiles: async () => ['Parity'], loadLibraryProfile: async () => ({ name: 'Parity', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__paritySaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.telemetry = { onSample: callback => {
        const emit = () => callback({ omega: 12, activeProfile: 'profiles-library/Parity.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            virtualSticks: { left: { x: 0.1, y: 0 }, right: { x: 0.3, y: -0.2 } } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await openGyro(page)
    // A stick output has no mouse calibration: Match a full turn says why.
    const match = page.locator('[data-gyro-front] button').filter({ hasText: 'Match a full turn' })
    assert.equal(await match.getAttribute('aria-disabled'), 'true')
    assert.match(await match.getAttribute('data-reason'), /Only while gyro sends the mouse/)

    await openFineTune(page, 'direction')
    await openRow(page, 'Right stick settings')
    const panel = top(page).locator('[data-virtual-stick="RIGHT_STICK"]')
    await panel.waitFor()
    await top(page).getByText('Gyro to a stick needs a virtual pad. Choose Xbox 360 or PlayStation 4.', { exact: true }).waitFor()
    // Live processed output from telemetry, under Deadzone & curve.
    await openPart(page, 'Deadzone & curve')
    await top(page).getByText('0.30, -0.20', { exact: true }).waitFor()
    const inner = valueRow(top(page), 'Skip the game’s deadzone')
    assert.equal(await valueText(inner), '20%')
    await step(inner, 1)
    assert.equal(await valueText(inner), '21%')
    const probe = switchRow(top(page), 'Deadzone test signal')
    assert.equal(await probe.getAttribute('aria-checked'), 'true')
    await probe.click()
    assert.equal(await probe.getAttribute('aria-checked'), 'false')
    await probe.click()
    assert.equal(await probe.getAttribute('aria-checked'), 'true')
    await openPart(page, 'Setup')
    await segment(segmentRow(top(page), 'Virtual pad'), 'Xbox 360')
    assert.equal(await segmentRow(top(page), 'Virtual pad').locator('button[data-current="true"]').innerText(), 'Xbox 360')
    // The six-step guide (shared with Sticks): Next, then B goes back here with focus.
    await openRow(page, 'Tune for this game')
    await top(page).getByText('Choose controller output', { exact: true }).first().waitFor()
    await openRow(page, 'Next step')
    await top(page).getByText('Set the game’s camera sensitivity', { exact: true }).first().waitFor()
    await page.keyboard.press('Escape')
    await top(page).locator('[data-virtual-stick="RIGHT_STICK"]').waitFor()
    // The complete guide writes ordinary settings and turns its test signal off.
    await openRow(page, 'Tune for this game')
    for (let n = 0; n < 5; n++) await openRow(page, 'Next step')
    await openRow(page, 'Finish')
    await openPart(page, 'Deadzone & curve')
    assert.equal(await switchRow(top(page), 'Deadzone test signal').getAttribute('aria-checked'), 'false')
    for (const viewport of [{ width: 1024, height: 720 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport)
      const clipped = await top(page).evaluate(host => [...host.querySelectorAll('[role="slider"] b, [role="switch"]')].filter(value => {
        const rect = value.getBoundingClientRect()
        return rect.width && rect.right > document.documentElement.clientWidth + 1
      }).map(value => value.textContent))
      assert.deepEqual(clipped, [], `every tuning value must remain inside the window at ${viewport.width}px`)
    }
    fs.mkdirSync(path.resolve(__dirname, '../tmp/parity-verification'), { recursive: true })
    await top(page).screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/gyro-stick-idle-controls.png') })
    await save(page, /RIGHT_STICK_DEADZONE_PROBE = OFF/)
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.equal(eff(saved, 'RIGHT_STICK_UNDEADZONE_INNER'), '0.21')
    assert.equal(eff(saved, 'RIGHT_STICK_DEADZONE_PROBE'), 'OFF')
    assert.doesNotMatch(saved, /LEFT_STICK_DEADZONE_PROBE/)
    assert.equal(eff(saved, 'LEFT_STICK_UNDEADZONE_INNER'), '0.1')
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    assert.equal(eff(saved, 'VIRTUAL_CONTROLLER'), 'XBOX')
    assert.equal(eff(saved, 'GYRO_OUTPUT'), 'RIGHT_STICK')

    // Back to Direction: send the mouse; stick settings say to choose a stick first.
    await page.keyboard.press('Escape')
    await top(page).locator('[data-gyro-fine-tune-page][data-group="direction"]').waitFor()
    await top(page).locator('button[role="radio"][data-value="MOUSE"]').click()
    const stickRow = top(page).locator('[data-stick-settings]')
    await page.waitForFunction(() => document.querySelector('[data-stick-settings]')?.getAttribute('aria-disabled') === 'true')
    assert.equal(await stickRow.getAttribute('aria-disabled'), 'true')
    await page.keyboard.press('Escape')

    // Held filter and rumble values: the native scoped keys, base values intact.
    await page.locator('[data-gyro-front] section').first().locator('button').last().click()
    await page.locator('[data-while-holding="gyro"]').click()
    await top(page).locator('[data-held="L"]').click()
    await top(page).locator('button[data-group="steadiness"]').click()
    await openRow(page, 'Advanced')
    await openPart(page, 'Adaptive filter')
    const cutoff = valueRow(top(page), 'Smoothing at rest')
    const coefficient = valueRow(top(page), 'How fast it lets go')
    assert.equal(await valueText(cutoff), '0.5 Hz')
    await step(cutoff, 1, 1) // 0.5 → 1
    await step(coefficient, 1, 2) // 0.1 → 0.2
    await page.keyboard.press('Escape')
    await top(page).locator('button[data-group="rumble"]').click()
    const feedback = top(page).locator('[data-gyro-rotation-feedback]')
    assert.equal(await valueText(valueRow(feedback, 'Strength')), '20%')
    await step(valueRow(feedback, 'Strength'), 1)
    await step(valueRow(feedback, 'Pulse every'), 1)
    await segment(segmentRow(feedback, 'Which side'), 'Right pad')
    await feedback.screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/gyro-rotation-feedback.png') })
    for (let n = 0; n < 3; n++) await page.keyboard.press('Escape')
    // Base values are untouched.
    await openFineTune(page, 'steadiness')
    await openRow(page, 'Advanced')
    await openPart(page, 'Adaptive filter')
    assert.equal(await valueText(valueRow(top(page), 'Smoothing at rest')), '6 Hz')
    assert.equal(await valueText(valueRow(top(page), 'How fast it lets go')), '0.3')
    await page.keyboard.press('Escape')
    await save(page, /L,ONE_EURO_MIN_CUTOFF = 1\b/)
    const filtered = await page.evaluate(() => window.__paritySaved)
    assert.match(eff(filtered, 'L,ONE_EURO_MIN_CUTOFF'), /^1\b/)
    assert.match(eff(filtered, 'L,ONE_EURO_SPEED_COEFF'), /^0.2\b/)
    assert.match(filtered, /^ONE_EURO_MIN_CUTOFF = 6 # base smoothing$/m)
    assert.match(filtered, /^ONE_EURO_SPEED_COEFF = 0.3$/m)
    assert.match(filtered, /^GYRO_HAPTIC_INTENSITY = 0$/m)
    assert.match(eff(filtered, 'L,GYRO_HAPTIC_INTENSITY'), /^25\b/)
    assert.match(eff(filtered, 'L,GYRO_HAPTIC_INTERVAL'), /^11\b/)
    assert.match(eff(filtered, 'L,GYRO_HAPTIC_SIDE'), /^2\b/)

    // Motion to game: the PlayStation explanation and its requirement; speed does not apply.
    await top(page).locator('button[data-group="direction"]').click()
    await top(page).locator('button[role="radio"][data-value="PS_MOTION"]').click()
    await top(page).getByText(/The real gyro and accelerometer go to a virtual PlayStation 4 controller/).waitFor()
    await top(page).getByText('Motion to game needs the PlayStation 4 virtual pad. Set Virtual pad to PlayStation 4.', { exact: true }).waitFor()
    await top(page).locator('button[data-group="speed"]').click()
    assert.match(await valueRow(top(page), 'Turn speed').getAttribute('data-reason'), /Motion to game sends the raw motion/)
    await page.keyboard.press('Escape')
    await page.locator('[data-gyro-front]').getByText('Motion to game always sends the motion; this turns Rumble while aiming on and off.', { exact: true }).waitFor()

    await page.getByRole('button', { name: 'Buttons', exact: true }).first().click()
    await page.locator('#mapping-section-motion').waitFor()
    assert.equal(await page.locator('[data-input-command="LEAN_LEFT"]').count() > 0, true)
    assert.equal(await page.locator('[data-input-command="MRING"]').count() > 0, true)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2)
    assert.equal(overflow, false)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: path.resolve(__dirname, '../tmp/parity-verification/motion-input-bindings.png') })
    console.log('PASS: stick settings, live output, dependency warnings, guide and focus, save order, held filter and rumble scope, motion to game')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
