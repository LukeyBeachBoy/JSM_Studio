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
      let content = 'RESET_MAPPINGS\nGYRO_OUTPUT = RIGHT_STICK\nRIGHT_STICK_UNDEADZONE_INNER = 0.2\nRIGHT_STICK_UNPOWER = 2\nLEFT_STICK_UNDEADZONE_INNER = 0.1\nTOUCHPAD_MODE = MOUSE\nUNKNOWN_PARITY_SETTING = preserve_me\n'
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
        const emit = () => callback({ omega: 12, activeProfile: 'profiles-library/Parity.txt', devices: [{ handle: 1, type: 5, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            virtualSticks: { left: { x: 0.1, y: 0 }, right: { x: 0.3, y: -0.2 } } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Trackpads', exact: true }).click()
    // Console v2 (P4): a one-pad controller gets the same Trackpads front, with
    // a one-item rail; its "While holding…" is a sub-page from the Y menu (D11).
    const pad = page.locator('#trackpad-shared')
    await pad.waitFor()
    assert.equal(await page.locator('.section-item').count(), 1, 'one pad, one rail item')
    assert.equal(await pad.locator('[role="radio"][data-current="true"]').getAttribute('data-value'), 'MOUSE')
    await pad.locator('[role="radio"]').first().focus()
    await page.keyboard.press('y')
    await page.locator('[data-more-item="holding"]').click()
    // The list is a "<pad> while holding" section; "Add a button" opens the
    // "Hold which button?" sheet, and the new shift opens on its own page.
    const group = page.locator('[data-subpage]').first().locator('[data-modeshift-list]')
    await group.locator('[data-add-modeshift]').click()
    const sheet = page.getByRole('dialog').filter({ has: page.locator('[data-hold-input]') })
    await sheet.locator('[data-hold-input="L"]').click()
    await sheet.getByRole('button', {name:'Next',exact:true}).click()
    await page.locator('[data-modeshift-editor="L"]').waitFor()
    assert.equal(await group.locator('[data-modeshift="L"]').count(), 1, 'the shift is listed')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /L,TOUCHPAD_MODE = MOUSE/.test(window.__paritySaved))
    await page.screenshot({path:'tmp/single-pad-modeshift.png'})
    assert.deepEqual(errors, [])
    console.log('PASS: single-trackpad modeshift is visible and saved')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
