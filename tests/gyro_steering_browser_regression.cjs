// Renderer-only interaction and focus tests. No controller or runtime is started.
// Console v2 (P5): Direction ▸ Left stick offers "Set up tilt steering", which
// opens Direction ▸ Advanced ▸ Tilt on its Behaviour part.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openPart, segmentRow, valueRow, save, eff } = require('./gyro_v2_helpers.cjs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nGYRO_OUTPUT = LEFT_STICK\nRIGHT_STICK_UNDEADZONE_INNER = 0.2\nRIGHT_STICK_UNPOWER = 2\nLEFT_STICK_UNDEADZONE_INNER = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nRIGHT_TOUCHPAD_MODE = MOUSE\nUNKNOWN_PARITY_SETTING = preserve_me\n'
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
    await top(page).getByText(/For wheel-style driving, Tilt ▸ Behaviour ▸ Steering → left stick uses lean for steering/).waitFor()
    await top(page).locator('[data-steering-shortcut]').click()
    const motion = top(page).locator('#gyro-motion')
    await motion.locator('button[role="radio"][data-value="LEFT_STEER_X"][data-current="true"]').waitFor()
    assert.equal(await motion.getByText(/can overwrite tilt steering/).count(), 0)
    await openPart(page, 'When tilt is on')
    assert.equal(await segmentRow(motion, 'Tilt is on').locator('button[data-current="true"]').innerText(), 'Always')
    await save(page, /MOTION_STICK_MODE = LEFT_STEER_X/)
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.equal(eff(saved, 'GYRO_OUTPUT'), 'MOUSE')
    assert.equal(eff(saved, 'GYRO_ON'), 'NONE')
    assert.equal(eff(saved, 'TILT_OFF'), 'NONE')
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    assert.equal(eff(saved, 'LEFT_STICK_UNDEADZONE_INNER'), '0.1')
    await openPart(page, 'Tuning')
    await valueRow(motion, 'Tilt response curve').waitFor()
    assert.equal(await motion.getByText('Game turn rate at full stick', { exact: true }).count(), 0)
    // Gyro now sends the mouse: Direction shows it once Tilt closes.
    await page.keyboard.press('Escape')
    await top(page).locator('button[role="radio"][data-value="MOUSE"][data-current="true"]').waitFor()
    await page.screenshot({ path: 'tmp/parity-verification/gyro-wheel-steering.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: steering setup selects horizontal tilt, prevents competing gyro output and preserves other configuration')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
