// Renderer-only interaction and focus tests. No controller or runtime is started.
// Console v2 (P5): the steadying floor is "Keep at least" in Gyro ▸ Fine-tune ▸
// Steadiness ▸ Advanced ▸ Ignore jitter; brake and press steadying are Snap & brake.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openRow, openPart, valueRow, save, valueText, eff, typeValue } = require('./gyro_v2_helpers.cjs')
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
      content += 'MIN_GYRO_SENS = 5 3\nMAX_GYRO_SENS = 21 6\nMIN_GYRO_THRESHOLD = 0\nMAX_GYRO_THRESHOLD = 80\nACCEL_CURVE = QUADRATIC\nGYRO_CUTOFF_RECOVERY = 5\nGYRO_STEADYING_FLOOR = 2 1.5\n'
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
    await openFineTune(page, 'steadiness')
    await openRow(page, 'Advanced')
    await openPart(page, 'Ignore jitter')
    const floorX = valueRow(top(page), 'Keep at least, left/right')
    const floorY = valueRow(top(page), 'Keep at least, up/down')
    assert.equal(await valueText(floorX), '2')
    assert.equal(await valueText(floorY), '1.5')
    await top(page).screenshot({ path: 'tmp/gyro-steadying-floor.png' })
    await typeValue(floorX, '2.1')
    await save(page, /GYRO_STEADYING_FLOOR = 2.1 1.5/)
    // The floor needs a fade-in band above the cutoff: without one it is kept but unavailable.
    const recovery = valueRow(top(page), 'Fade back in by')
    await typeValue(recovery, '0')
    assert.equal(await floorX.getAttribute('aria-disabled'), 'true')
    assert.match(await floorX.getAttribute('data-reason'), /Fade back in/)
    assert.equal(await valueText(floorX), '2.1')
    await typeValue(recovery, '5')
    assert.equal(await floorX.getAttribute('aria-disabled'), null)
    for (let n = 0; n < 2; n++) await page.keyboard.press('Escape')
    // Held: While holding LB has its own floor; the other axis follows the base.
    await page.locator('[data-gyro-front] section').first().locator('button').last().click()
    await page.locator('[data-while-holding="gyro"]').click()
    await top(page).locator('[data-held="L"]').click()
    await top(page).locator('button[data-group="steadiness"]').click()
    await openRow(page, 'Advanced')
    await openPart(page, 'Ignore jitter')
    await typeValue(valueRow(top(page), 'Keep at least, left/right'), '1')
    await save(page, /L,GYRO_STEADYING_FLOOR = 1 1.5/)
    assert.equal(eff(await page.evaluate(() => window.__paritySaved), 'L,GYRO_STEADYING_FLOOR'), '1 1.5')
    // Snap & brake owns brake and press steadying, not the floor.
    await openPart(page, 'Snap & brake')
    const rows = await top(page).locator('[data-part], section[aria-label="Snap & brake"]').last().locator('[role="slider"], [role="switch"]').evaluateAll(nodes => nodes.map(node => node.querySelector('span span')?.textContent?.trim() ?? node.textContent.trim().slice(0, 20)))
    assert.deepEqual(rows.filter(label => /Keep at least/.test(label)), [])
    for (const label of ['Snap within', 'Brake after flicks', 'Brake trigger', 'Steady while clicking', 'Coast slowdown']) await valueRow(top(page), label).waitFor()
    await top(page).screenshot({ path: 'tmp/gyro-dampening-section.png' })
    for (let n = 0; n < 4; n++) await page.keyboard.press('Escape')
    // The curve editor (Speed ▸ Advanced) draws the floor on the curve.
    await openFineTune(page, 'speed')
    await openRow(page, 'Advanced')
    await top(page).locator('[data-speed-advanced]').waitFor()
    await top(page).screenshot({ path: 'tmp/gyro-steadying-curve.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: Ignore jitter owns the steadying floor; Snap & brake owns brake/press steadying; floor editing, held axes and saving pass')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
