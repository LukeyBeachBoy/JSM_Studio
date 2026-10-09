// Isolated renderer: no mapper, physical controller or shared preference mutation.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 720 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nprofiles-library/Timing template.txt\nHOLD_PRESS_TIME = 160 # hold note\nDBL_PRESS_WINDOW = 2 # native milliseconds\nTURBO_PERIOD = 80\nSIM_PRESS_WINDOW = 50\nTICK_TIME = 3\nUP,HOLD_PRESS_TIME = 220 # held hold\nUP,DBL_PRESS_WINDOW = 9 # held double\nUP,TURBO_PERIOD = 40 # held turbo\nUNKNOWN_TIMING = keep exactly\n# @layer {"id":"vehicle","name":"Vehicle","overrides":{"HOLD_PRESS_TIME":"300"}}\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Timing parity', path: 'profiles-library/Timing parity.txt', content }),
        listLibraryProfiles: async () => ['Timing parity'], loadLibraryProfile: async () => ({ name: 'Timing parity', content }),
        readConfigFile: async () => 'TURBO_PERIOD = 140 # template timing\n', getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__timingSaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
      content += 'GYRO_CALIBRATION_DELAY = 1 # countdown\nGYRO_CALIBRATION_TIME = 2.5 # duration\nL,GYRO_CALIBRATION_DELAY = 23 # latent imported chord\n'
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Buttons', exact: true }).click()
    const details = page.locator('details').filter({ has: page.locator('summary').getByText('Configuration timing', { exact: true }) })
    await details.locator(':scope > summary').click()
    const row = label => details.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText(label, { exact: true }) })
    const adjust = async (label, direction = 'ArrowRight', end = 'Enter') => { await row(label).click(); await page.keyboard.press(direction); await page.keyboard.press(end) }
    assert.match(await row('Double-tap window').innerText(), /2 ms/)
    await adjust('Double-tap window')
    assert.match(await row('Double-tap window').innerText(), /3 ms/)
    // "Timing for" is a choice: this configuration, or while a button is held
    // (the native modifier list begins with D-pad Up).
    const timingFor = async option => {
      await details.locator('.summary-row-wrap').filter({ has: page.locator('.summary-row__label').getByText('Timing for', { exact: true }) }).locator('button[role="combobox"]').click()
      await page.getByRole("option", { name: option }).first().click()
    }
    await timingFor(/^While UP/i)
    assert.match(await row('Hold time').innerText(), /220 ms/)
    assert.equal(await row('Press-together window').count(), 0)
    assert.equal(await row('Controller polling').count(), 0)
    await adjust('Hold time')
    await adjust('Double-tap window')
    await adjust('Turbo interval', 'ArrowRight', 'Escape')
    assert.match(await row('Turbo interval').innerText(), /40 ms/, 'B cancels adjustment without altering the imported value')
    await adjust('Turbo interval')
    // Every value capsule remains inside its row at compact desktop size.
    const clipped = await details.locator('button.summary-row').evaluateAll(rows => rows.filter(row => {
      const pill = row.querySelector('.summary-row__value'); if (!pill) return false
      const r = row.getBoundingClientRect(), p = pill.getBoundingClientRect()
      return p.right > r.right + 1 || p.left < r.left - 1
    }).map(row => row.textContent))
    assert.deepEqual(clipped, [])
    await timingFor(/^This configuration/)
    assert.match(await row('Hold time').innerText(), /160 ms/)
    assert.match(await row('Double-tap window').innerText(), /3 ms/)
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !!window.__timingSaved)
    const saved = await page.evaluate(() => window.__timingSaved)
    assert.match(saved, /HOLD_PRESS_TIME = 160 # hold note/)
    assert.match(saved, /DBL_PRESS_WINDOW = 3 # native milliseconds/)
    assert.match(saved, /UP,HOLD_PRESS_TIME = 221 # held hold/)
    assert.match(saved, /UP,DBL_PRESS_WINDOW = 10 # held double/)
    assert.match(saved, /UP,TURBO_PERIOD = 41 # held turbo/)
    assert.match(saved, /SIM_PRESS_WINDOW = 50/)
    assert.match(saved, /UNKNOWN_TIMING = keep exactly/)
    // A layer reset restores Default; an imported override reset restores the template.
    const chooseLayer = async name => {
      // Console v2: modes are chosen on Layout's mode strip (the title bar's
      // Editing layer dropdown is gone), then back to Buttons.
      await page.locator('.page-tabs').getByRole('button', { name: 'Layout', exact: true }).click()
      await page.getByRole('group', { name: 'Showing layer' }).getByRole('button', { name: new RegExp(`^${name}`) }).first().click()
      await page.locator('.page-tabs').getByRole('button', { name: 'Buttons', exact: true }).click()
    }
    await chooseLayer('Vehicle')
    if (!await row('Hold time').isVisible()) await details.locator(':scope > summary').click()
    assert.match(await row('Hold time').innerText(), /300 ms/)
    await row('Hold time').focus(); await page.keyboard.press('y')
    assert.match(await row('Hold time').innerText(), /160 ms/, 'layer reset restores Default instead of the shared fallback')
    await adjust('Double-tap window')
    assert.match(await row('Double-tap window').innerText(), /4 ms/)
    await chooseLayer('Default')
    if (!await row('Hold time').isVisible()) await details.locator(':scope > summary').click()
    assert.match(await row('Double-tap window').innerText(), /3 ms/, 'layer adjustment leaves Default untouched')
    await row('Turbo interval').focus(); await page.keyboard.press('y')
    assert.match(await row('Turbo interval').innerText(), /140 ms/, 'import reset restores template timing')
    await page.evaluate(() => { window.__timingSaved = null })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !!window.__timingSaved)
    const final = await page.evaluate(() => window.__timingSaved)
    const layer = JSON.parse(final.split('\n').find(line => line.startsWith('# @layer ')).slice(9))
    assert.equal(layer.overrides.DBL_PRESS_WINDOW, '4 # native milliseconds', 'layer edit also preserves the inherited tuning note')
    assert.equal(layer.overrides.HOLD_PRESS_TIME, undefined)
    assert.doesNotMatch(final, /^TURBO_PERIOD =/m, 'template fallback stays an import rather than being copied into the profile')
    assert.match(final, /UP,TURBO_PERIOD = 41 # held turbo/)
    // (The per-configuration calibration schedule moved with Gyro's console v2
    // redesign; GYRO's own tests cover where it lives now.)
    assert.match(final, /L,GYRO_CALIBRATION_DELAY = 23 # latent imported chord/, 'unsupported held calibration stays intact without pretending it works')
    assert.deepEqual(errors, [])
    console.log('PASS: native timing units, contextual held timing, inactive controls hidden, B cancellation, compact value bounds, comment-preserving save and layer/template inheritance resets')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
