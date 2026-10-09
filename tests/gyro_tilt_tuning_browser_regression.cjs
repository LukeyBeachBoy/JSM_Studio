// Renderer-only interaction and focus tests. No controller or runtime is started.
// Console v2 (P5, D6): Tilt is Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt, a
// sub-page whose parts are Behaviour, Angles, Tuning, Orientation, When tilt is
// on and While holding.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openRow, openPart, valueRow, segmentRow, segment, step, save, valueText, eff } = require('./gyro_v2_helpers.cjs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nMOTION_STICK_MODE = ROTATE_ONLY\nGYRO_ON = MISC6\nGYRO_OUTPUT = MOUSE\nRIGHT_STICK_UNDEADZONE_INNER = 0.2\nRIGHT_STICK_UNPOWER = 2\nLEFT_STICK_UNDEADZONE_INNER = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_PARITY_SETTING = preserve_me\n'
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
    await openFineTune(page, 'direction')
    await openRow(page, 'Advanced')
    await openRow(page, 'Tilt')
    const motion = top(page).locator('#gyro-motion')
    await motion.locator('button[role="radio"][data-value="ROTATE_ONLY"][data-current="true"]').waitFor()
    // Every behaviour is a card (21, steering included), each explained.
    const cards = motion.locator('[data-tilt-behaviour] button[role="radio"]')
    assert.equal(await cards.count(), 21)
    assert.equal(await cards.filter({ hasText: /like a wheel/ }).count(), 2)
    assert.equal(await cards.filter({ hasText: 'Bind them under Buttons ▸ Tilt gestures' }).count(), 1)
    await motion.getByText(/Tilt uses your angle from neutral; gyro uses how fast you turn. Both can run together./).waitFor()
    // Tuning follows the behaviour: Rotate only has rotation smoothing and the flick output.
    await openPart(page, 'Tuning')
    const tuning = motion.locator('[data-tilt-tuning]')
    await tuning.locator('button.summary-row').filter({ hasText: 'Rotation smoothing threshold' }).first().waitFor()
    assert.equal(await valueRow(tuning, 'Left/right tilt mouse speed').count(), 0)
    for (const viewport of [{ width: 1024, height: 720 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport)
      const overflow = await top(page).evaluate(host => [...host.querySelectorAll('[role="slider"] b, .summary-row__value')].filter(value => value.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(value => value.textContent))
      assert.deepEqual(overflow, [])
    }
    await top(page).screenshot({ path: 'tmp/parity-verification/gyro-tilt-rotate-tuning.png' })
    // Tilt to mouse: its own speeds, X and Y independent.
    await openPart(page, 'Behaviour')
    await motion.locator('button[role="radio"][data-value="AIM"]').click()
    await openPart(page, 'Tuning')
    const horizontal = valueRow(tuning, 'Left/right tilt mouse speed')
    assert.equal(await valueText(horizontal), '360 °/s')
    assert.equal(await tuning.locator('button.summary-row').filter({ hasText: 'Rotation smoothing threshold' }).count(), 0)
    await step(horizontal, 1)
    await step(valueRow(tuning, 'Up/down tilt mouse speed'), 1, 2)
    await save(page, /STICK_SENS = 361 362/)
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.equal(eff(saved, 'MOTION_STICK_MODE'), 'AIM')
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    await top(page).screenshot({ path: 'tmp/parity-verification/gyro-tilt-mouse-tuning.png' })
    // Motion to game for gyro leaves tilt as it is.
    for (let n = 0; n < 2; n++) await page.keyboard.press('Escape')
    await top(page).locator('button[role="radio"][data-value="PS_MOTION"]').click()
    await top(page).getByText(/Your controller can be Steam, Nintendo or PlayStation/).waitFor()
    await openRow(page, 'Advanced')
    await openRow(page, 'Tilt')
    await openPart(page, 'Tuning')
    await valueRow(top(page).locator('[data-tilt-tuning]'), 'Left/right tilt mouse speed').waitFor()
    // When tilt is on: its own activation and combined inputs, gyro's untouched.
    await openPart(page, 'When tilt is on')
    const activation = segmentRow(top(page), 'Tilt is on')
    await segment(activation, 'Off')
    await save(page, /^(# @controller type-24 )?TILT_ON = NONE$/)
    await top(page).getByText('Choose While I hold or Unless I hold to use these inputs.', { exact: true }).waitFor()
    assert.equal(await top(page).locator('[data-add-condition]').getAttribute('aria-disabled'), 'true')
    await segment(activation, 'While I hold')
    await save(page, /^(# @controller type-24 )?TILT_ON = (?!NONE)[A-Z0-9_]+$/)
    await segment(activation, 'Unless I hold')
    await save(page, /^(# @controller type-24 )?TILT_OFF = (?!NONE)[A-Z0-9_]+$/)
    await top(page).locator('[data-add-condition]').click()
    const picker = page.getByRole('dialog').last()
    await picker.locator('[data-hold-input="TOUCH"]').focus()
    await page.keyboard.press('Enter')
    await save(page, /^(# @controller type-24 )?TILT_OFF = ANY [^\n]+$/)
    assert.equal(eff(await page.evaluate(() => window.__paritySaved), 'GYRO_ON'), 'MISC6')
    await segment(activation, 'Always')
    await save(page, /^(# @controller type-24 )?TILT_OFF = NONE$/)
    assert.equal(eff(await page.evaluate(() => window.__paritySaved), 'GYRO_OUTPUT'), 'PS_MOTION')
    await top(page).screenshot({ path: 'tmp/parity-verification/tilt-activation.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: rotate tuning, mode-specific controls, independent XY save, tilt alongside motion to game, tilt activation and compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
