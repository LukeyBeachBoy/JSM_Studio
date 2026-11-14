// Renderer-only interaction and focus tests. No controller or runtime is started.
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
        window.__testOmega = 12
        const emit = () => callback({ omega: window.__testOmega, activeProfile: 'profiles-library/Parity.txt', devices: [{ handle: 1, type: 24, supportedButtons: 8589934591,
          status: { buttons: 0, leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 }, triggers: { left: 0, right: 0 }, gyro: { x: 0, y: 0, z: 0 },
            virtualSticks: { left: { x: 0.1, y: 0 }, right: { x: 0.3, y: -0.2 } } } }] })
        emit(); const timer = setInterval(emit, 100); return () => clearInterval(timer)
      } }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await openGyro(page)
    await openFineTune(page, 'speed')
    const row = label => valueRow(top(page), label)
    const floorX = row('Steadying floor, horizontal (RWS)')
    const floorY = row('Steadying floor, vertical (RWS)')
    const cutoff = row('Gyro cutoff speed')
    const recovery = row('Steadying recovery threshold')
    assert.equal(await valueText(floorX), '2×')
    assert.equal(await valueText(floorY), '1.5×')

    for (const advanced of [false, true]) {
      if (advanced) await openRow(page, 'Advanced')
      const axis = name => top(page).locator(advanced
        ? (name === 'horizontal' ? '.curve-plot__curve' : '.curve-plot__secondary')
        : `[data-response-axis="${name}"]`)
      const marker = top(page).locator(advanced ? '.curve-plot__live circle' : 'circle[data-live-speed]')
      const priorX = await marker.getAttribute('cx')
      await page.evaluate(v => { window.__testOmega = v }, advanced ? 21 : 17)
      await page.waitForFunction(({ priorX, advanced }) => {
        const surface = [...document.querySelectorAll('[data-subpage]')].at(-1)
        return surface.querySelector(advanced ? '.curve-plot__live circle' : 'circle[data-live-speed]')?.getAttribute('cx') !== priorX
      }, { priorX, advanced })
      for (const [control, value, target] of [
        [floorX, advanced ? 2.3 : 2.1, 'horizontal'], [floorY, advanced ? 1.7 : 1.6, 'vertical'],
        [cutoff, advanced ? 1.2 : 1, 'horizontal'], [recovery, advanced ? 6.5 : 6, 'horizontal'],
      ]) {
        const before = await axis(target).getAttribute('d')
        await typeValue(control, value)
        assert.notEqual(await axis(target).getAttribute('d'), before, `${target} curve redraws when editing ${await control.getAttribute('aria-label')}`)
      }
      for (const [width, height] of [[1440, 1000], [900, 600]]) {
        await page.setViewportSize({ width, height })
        await floorY.scrollIntoViewIfNeeded()
        await floorY.focus()
        // Scroll the focus row to the middle, as if reached from the preceding settings.
        await floorY.evaluate(node => node.scrollIntoView({ block: 'center' }))
        const graph = await axis('horizontal').evaluate(path => path.ownerSVGElement.getBoundingClientRect().toJSON())
        const frame = await top(page).locator('main').boundingBox()
        assert.ok(graph.y >= frame.y - 1 && graph.y + graph.height <= frame.y + frame.height + 1, `entire curve visible while editing at ${width} in ${advanced ? 'advanced' : 'overview'}: ${JSON.stringify({graph,frame})}`)
        assert.ok(await top(page).locator('main').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'no horizontal overflow')
        for (const theme of ['light', 'dark']) {
          await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
          await top(page).screenshot({ animations: 'disabled', path: `tmp/gyro-steadying-${advanced ? 'advanced' : 'overview'}-${width}-${theme}.png` })
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
    }
    await save(page, /GYRO_STEADYING_FLOOR = 2.3 1.7/)
    await typeValue(recovery, 0)
    assert.equal(await floorX.getAttribute('aria-disabled'), null)
    await recovery.getByText('Set recovery above the cutoff to apply the steadying floor.').waitFor()
    await typeValue(floorX, 2.4)
    await typeValue(recovery, 6.5)
    await save(page, /GYRO_STEADYING_FLOOR = 2.4 1.7/)
    await page.keyboard.press('Escape')
    await top(page).locator('button[data-group="steadiness"]').click()
    assert.equal(await floorX.count(), 0)
    await openRow(page, 'Advanced')
    assert.equal(await top(page).getByText('Deadzone & steadying', { exact: true }).count(), 0)
    await openPart(page, 'Angle snapping & braking')
    for (const label of ['Angle snapping threshold', 'Deceleration brake strength', 'Click damping']) await row(label).waitFor()
    for (let n = 0; n < 2; n++) await page.keyboard.press('Escape')
    await page.locator('[data-gyro-front] section').first().locator('button').last().click()
    await page.locator('[data-while-holding="gyro"]').click()
    await top(page).locator('[data-held="L"]').click()
    await top(page).locator('button[data-group="speed"]').click()
    await typeValue(floorX, 1)
    await typeValue(cutoff, 0.5)
    await save(page, /L,GYRO_CUTOFF_SPEED = 0.5/)
    const saved = await page.evaluate(() => window.__paritySaved)
    assert.equal(eff(saved, 'L,GYRO_STEADYING_FLOOR'), '1 1.7')
    assert.equal(eff(saved, 'GYRO_STEADYING_FLOOR'), '2.4 1.7')
    assert.equal(eff(saved, 'GYRO_CUTOFF_SPEED'), '1.2')
    assert.equal(eff(saved, 'GYRO_CUTOFF_RECOVERY'), '6.5')
    assert.match(saved, /UNKNOWN_PARITY_SETTING = preserve_me/)
    assert.deepEqual(errors, [])
    console.log('PASS: both Sensitivity graphs update for horizontal/vertical floor, cutoff, recovery and motion. Scoped saves, inactive-band editing, Filters relocation and responsive layouts pass.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
