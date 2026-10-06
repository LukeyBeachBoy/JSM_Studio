// Renderer-only interaction and focus tests. No controller or runtime is started.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
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
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    const panel = page.locator('[data-virtual-stick="LEFT_STICK"]')
    await panel.getByText(/The game decides whether that stick controls movement, steering or a camera/).waitFor()
    await panel.getByRole('button', { name: /^Set up tilt steering/ }).click()
    const motion = page.locator('#gyro-motion')
    await motion.getByText('Steering → left stick', { exact: true }).waitFor()
    assert.equal(await panel.count(), 0)
    await page.locator('#gyro-motion').getByRole('group', { name: 'Tilt activation', exact: true }).getByRole('button', { name: 'Always on', exact: true }).waitFor()
    assert.equal(await motion.getByText(/can overwrite tilt steering/).count(), 0)
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /MOTION_STICK_MODE = LEFT_STEER_X/.test(window.__paritySaved || ''))
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.match(saved, /^GYRO_OUTPUT = MOUSE$/m)
    assert.match(saved, /^GYRO_ON = NONE$/m)
    assert.match(saved, /^TILT_OFF = NONE$/m)
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    assert.match(saved, /LEFT_STICK_UNDEADZONE_INNER = 0.1/)
    await motion.getByRole('button', { name: /Tilt tuning/ }).click()
    await motion.getByText('Tilt response curve', { exact: true }).waitFor()
    assert.equal(await motion.getByText('Maximum game turn rate', { exact: true }).count(), 0)
    await motion.screenshot({ path: 'tmp/parity-verification/gyro-wheel-steering.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: steering setup selects horizontal tilt, prevents competing gyro output and preserves other configuration')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
