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
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    const motion = page.locator('#gyro-motion')
    await motion.getByRole('combobox', { name: 'Tilt behaviour' }).filter({ hasText: /Rotate/ }).waitFor()
    const row = label => motion.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) })
    const expand = async () => { await motion.locator('button.summary-row').filter({ hasText: 'Tilt tuning ·' }).click() }
    await expand()
    await row('Rotation smoothing threshold').waitFor()
    await motion.getByRole('combobox', { name: 'Flick output', exact: true }).waitFor()
    assert.equal(await row('Horizontal tilt mouse speed').count(), 0)
    await row('Rotation smoothing threshold').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    for (const viewport of [{ width: 1024, height: 720 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport)
      const overflow = await motion.evaluate(host => [...host.querySelectorAll('.summary-row__value')].filter(value => value.getBoundingClientRect().right > document.documentElement.clientWidth + 1).map(value => value.textContent))
      assert.deepEqual(overflow, [])
    }
    await motion.screenshot({ path: 'tmp/parity-verification/gyro-tilt-rotate-tuning.png' })
    const picker = motion.getByRole('combobox', { name: 'Tilt behaviour' })
    await picker.click()
    const options = page.getByRole('option')
    assert.equal(await options.count(), 21)
    assert.equal(await options.filter({ hasText: 'No mouse or stick output' }).count(), 1)
    assert.equal(await options.filter({ hasText: 'wheel-style lean' }).count(), 2)
    for (const viewport of [{ width: 1024, height: 720 }, { width: 1440, height: 1000 }]) {
      await page.setViewportSize(viewport)
      if (!(await page.getByRole('listbox').count())) await picker.click()
      const bounds = await page.getByRole('listbox').boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1)
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 1)
    }
    await page.getByRole('listbox').screenshot({ path: process.env.JSM_MOTION_SCREENSHOT || 'tmp/parity-verification/gyro-tilt-picker.png' })
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    assert.match(await picker.innerText(), /Rotate/i)
    await picker.click()
    await page.getByRole('option', { name: 'Tilt to mouse', exact: true }).click()
    await expand()
    await row('Horizontal tilt mouse speed').waitFor()
    assert.equal(await row('Rotation smoothing threshold').count(), 0)
    await row('Horizontal tilt mouse speed').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Escape')
    assert.match(await row('Horizontal tilt mouse speed').innerText(), /360/)
    await row('Horizontal tilt mouse speed').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    await row('Vertical tilt mouse speed').click(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /STICK_SENS = 361 362/.test(window.__paritySaved || ''))
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.match(saved, /^MOTION_STICK_MODE = AIM$/m)
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    await motion.screenshot({ path: 'tmp/parity-verification/gyro-tilt-mouse-tuning.png' })
    await page.getByRole('combobox', { name: 'Output', exact: true }).click()
    await page.getByRole('option', { name: /PlayStation motion passthrough/ }).click()
    await page.getByText(/The physical controller can be Steam, Nintendo or PlayStation/).first().waitFor()
    await row('Horizontal tilt mouse speed').waitFor()
    await motion.getByRole('button', { name: 'Help: Tilt and gyro' }).click()
    await page.getByRole('dialog').getByText(/Each input has its own activation and modeshifts/).waitFor()
    await page.getByRole('button', { name: 'Got it', exact: true }).click()
    await motion.getByRole('group', { name: 'Tilt activation', exact: true }).getByRole('button', { name: 'Always off', exact: true }).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^TILT_ON = NONE$/m.test(window.__paritySaved || ''))
    assert.equal(await motion.getByRole('combobox', { name: 'Tilt activation input' }).isDisabled(), true)
    await motion.getByText(/Tilt output is disabled/).waitFor()
    const activation = motion.getByRole('group', { name: 'Tilt activation', exact: true })
    await activation.getByRole('button', { name: 'Hold to enable', exact: true }).click()
    const input = motion.getByRole('combobox', { name: 'Tilt activation input' })
    assert.equal(await input.isDisabled(), false)
    await input.click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^TILT_ON = (?!NONE)[A-Z0-9_]+$/m.test(window.__paritySaved || ''))
    await activation.getByRole('button', { name: 'Hold to disable', exact: true }).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^TILT_OFF = (?!NONE)[A-Z0-9_]+$/m.test(window.__paritySaved || ''))
    await motion.getByRole('button', { name: /^Tilt activation conditions/ }).click()
    const several = motion.getByRole('button', { name: /^Use several inputs/ })
    await several.click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^TILT_OFF = ANY [^\n]+$/m.test(window.__paritySaved || ''))
    assert.match(await page.evaluate(() => window.__paritySaved), /^GYRO_ON = MISC6$/m)
    await motion.getByRole('group', { name: 'Tilt activation', exact: true }).getByRole('button', { name: 'Always on', exact: true }).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^TILT_OFF = NONE$/m.test(window.__paritySaved || ''))
    assert.match(await page.evaluate(() => window.__paritySaved), /^GYRO_OUTPUT = PS_MOTION$/m)
    await motion.screenshot({ path: 'tmp/parity-verification/tilt-activation.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: rotate tuning, mode-specific controls, cancel/commit, independent XY save, non-PlayStation passthrough and compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
