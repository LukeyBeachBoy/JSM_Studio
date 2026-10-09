// Renderer-only interaction and focus tests. No controller or runtime is started.
// Console v2 (P5): Hold the angle (GYRO_STICK_DEFLECTION) is a behaviour card in
// Gyro ▸ Fine-tune ▸ Direction ▸ Right stick settings ▸ Setup; settings it makes
// meaningless (turn speed, snap, brake, click steadying) stay visible and say why.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openRow, openPart, valueRow, switchRow, step, save, valueText, eff, typeValue } = require('./gyro_v2_helpers.cjs')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nGYRO_OUTPUT = RIGHT_STICK\nVIRTUAL_CONTROLLER = XBOX\nGYRO_STICK_DEFLECTION = OFF\nGYRO_DEFLECTION_RANGE = 30 45 # base travel\nL,GYRO_STICK_DEFLECTION = ON\nL,GYRO_DEFLECTION_RANGE = 15 20 # ADS travel\nGYRO_SENS = 2 3\nUNKNOWN_DEFLECTION = preserve exactly\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Deflection', path: 'profiles-library/Deflection.txt', content }),
        listLibraryProfiles: async () => ['Deflection'], loadLibraryProfile: async () => ({ name: 'Deflection', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__saved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      window.telemetry = { onSample: cb => {
        const emit = () => cb({ omega: 12, activeProfile: 'profiles-library/Deflection.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591, status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 }, virtualSticks: { left: { x: 0, y: 0 }, right: { x: .2, y: -.1 } } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await openGyro(page)
    await openFineTune(page, 'direction')
    await openRow(page, 'Right stick settings')
    // Hold the angle: the deflection rows replace the game turn rate.
    await top(page).locator('button[role="radio"][data-value="ON"]').click()
    const horizontal = valueRow(top(page), 'Full stick at, left/right')
    await horizontal.waitFor()
    assert.equal(await valueRow(top(page), 'Game turn rate at full stick').count(), 0)
    assert.equal(await valueText(horizontal), '30°')
    await step(horizontal, 1)
    assert.equal(await valueText(horizontal), '31°')
    await switchRow(top(page), 'Lock at the limits').click()
    assert.equal(await switchRow(top(page), 'Lock at the limits').getAttribute('aria-checked'), 'false')
    await top(page).getByText(/Bind Recenter gyro deflection to a button to capture a fresh neutral/).waitFor()
    await page.keyboard.press('Escape')
    // Turn speed and the snap / brake / click steadying no longer apply, and say so.
    await top(page).locator('button[data-group="speed"]').click()
    assert.match(await valueRow(top(page), 'Turn speed').getAttribute('data-reason'), /Hold the angle/)
    await top(page).locator('button[data-group="steadiness"]').click()
    assert.match(await switchRow(top(page), 'Snap to straight lines').getAttribute('data-reason'), /Hold the angle/)
    await openRow(page, 'Advanced')
    await openPart(page, 'Snap & brake')
    assert.match(await valueRow(top(page), 'Snap within').getAttribute('data-reason'), /Hold the angle/)
    // Smoothing: the native default stays implicit until written.
    await openPart(page, 'Smoothing')
    const smooth = valueRow(top(page), 'Smoothing time')
    assert.equal(await valueText(smooth), '0.125 s')
    assert.match(await smooth.innerText(), /Default/)
    await typeValue(smooth, '0.125')
    await typeValue(valueRow(top(page), 'Smooth below this speed'), '75')
    await openPart(page, 'Ignore jitter')
    await typeValue(valueRow(top(page), 'Ignore turns slower than'), '12')
    await typeValue(valueRow(top(page), 'Fade back in by'), '20')
    assert.equal(await valueText(valueRow(top(page), 'Fade back in by')), '20 °/s')
    for (let n = 0; n < 2; n++) await page.keyboard.press('Escape')
    // The held range: While holding LB, the stick holds its own angle.
    await page.locator('[data-gyro-front] section').first().locator('button').last().click()
    await page.locator('[data-while-holding="gyro"]').click()
    await top(page).locator('[data-held="L"]').click()
    await top(page).locator('button[data-group="direction"]').click()
    await openRow(page, 'Right stick settings')
    const held = valueRow(top(page), 'Full stick at, left/right')
    assert.equal(await valueText(held), '15°')
    await step(held, 1)
    assert.equal(await valueText(held), '16°')
    await page.keyboard.press('Escape')
    await top(page).locator('button[data-group="steadiness"]').click()
    await openRow(page, 'Advanced')
    await openPart(page, 'Smoothing')
    assert.equal(await valueText(valueRow(top(page), 'Smoothing time')), '0.125 s')
    await typeValue(valueRow(top(page), 'Smoothing time'), '0.25')
    for (let n = 0; n < 4; n++) await page.keyboard.press('Escape')
    // Base values are untouched by the held edits.
    await openFineTune(page, 'direction')
    await openRow(page, 'Right stick settings')
    assert.equal(await valueText(valueRow(top(page), 'Full stick at, left/right')), '31°')
    await save(page, /GYRO_DEFLECTION_RANGE = 31 45/)
    const saved = await page.evaluate(() => window.__saved)
    assert.equal(eff(saved, 'GYRO_STICK_DEFLECTION'), 'ON')
    assert.match(eff(saved, 'GYRO_DEFLECTION_RANGE'), /^31 45/)
    assert.match(eff(saved, 'L,GYRO_DEFLECTION_RANGE'), /^16 20/)
    assert.equal(eff(saved, 'GYRO_DEFLECTION_LOCK_EXTENTS'), 'OFF')
    assert.equal(eff(saved, 'GYRO_SENS'), '2 3')
    assert.equal(eff(saved, 'GYRO_SMOOTH_TIME'), '0.125')
    assert.equal(eff(saved, 'L,GYRO_SMOOTH_TIME'), '0.25')
    assert.equal(eff(saved, 'GYRO_SMOOTH_THRESHOLD'), '75')
    assert.equal(eff(saved, 'GYRO_CUTOFF_SPEED'), '12')
    assert.equal(eff(saved, 'GYRO_CUTOFF_RECOVERY'), '20')
    assert.match(saved, /UNKNOWN_DEFLECTION = preserve exactly/)
    await page.screenshot({ path: 'tmp/parity-verification/gyro-angular-deflection-controls.png' })
    // Camera speed again: turn speed applies, the deflection rows go.
    await top(page).locator('button[role="radio"][data-value="OFF"]').click()
    await valueRow(top(page), 'Game turn rate at full stick').waitFor()
    assert.equal(await valueRow(top(page), 'Full stick at, left/right').count(), 0)
    await page.keyboard.press('Escape')
    await top(page).locator('button[data-group="speed"]').click()
    assert.equal(await valueRow(top(page), 'Turn speed').getAttribute('data-reason'), null, 'camera gain returns when applicable')
    assert.equal(await valueText(valueRow(top(page), 'Turn speed')), '2×')
    assert.deepEqual(errors, [])
    console.log('PASS: deflection mode-dependent controls, held range edit, comments, latent camera gain and saved ordinary configuration')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
