// Console v2 (P5): gyro and tilt each have their own "While holding…" list
// (When is gyro on? ▸ While holding a button, gyro is…; Tilt ▸ While holding…),
// each opening its own screens scoped to the held button.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { assert, prepare, openGyro, top, openFineTune, openRow, openPart, segmentRow, segment, save, eff } = require('./gyro_v2_helpers.cjs')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nGYRO_OUTPUT = MOUSE\nGYRO_SENS = 2 3\nGYRO_ON = MISC6\nMOTION_STICK_MODE = NO_MOUSE\nTILT_OFF = NONE\nL,GYRO_OUTPUT = MOUSE\nL,GYRO_SENS = 4 5 # gyro shift\nUNKNOWN_SETTING = preserve\n'
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Motion', path: 'profiles-library/Motion.txt', content }),
        listLibraryProfiles: async () => ['Motion'], loadLibraryProfile: async () => ({ name: 'Motion', content }),
        readConfigFile: async () => '', getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true }),
        saveLibraryProfile: async (name, next) => { content = next; window.__motionSaved = next; return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
    })
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1421')
    await openGyro(page)
    const saved = () => page.evaluate(() => window.__motionSaved)
    const saveMatching = async pattern => { await page.keyboard.press('Control+s'); await page.waitForFunction(source => new RegExp(source, 'm').test(window.__motionSaved || ''), pattern.source) }
    // Gyro's held list has LB; tilt's has none.
    await page.locator('[data-gyro-front] section').first().locator('button').last().click()
    await page.locator('[data-while-holding="gyro"]').click()
    assert.equal(await top(page).locator('[data-held]').count(), 1)
    await top(page).locator('[data-held="L"]').waitFor()
    // A held gyro variant does not edit tilt: tilt has its own list.
    await top(page).locator('[data-held="L"]').click()
    await top(page).locator('button[data-group="direction"]').click()
    await openRow(page, 'Advanced')
    assert.match(await top(page).locator('[data-tilt-open]').getAttribute('data-reason'), /Tilt has its own mode shift/)
    for (let n = 0; n < 4; n++) await page.keyboard.press('Escape')
    assert.equal(await page.locator('vite-error-overlay').count(), 0)

    await openFineTune(page, 'direction')
    await openRow(page, 'Advanced')
    await openRow(page, 'Tilt')
    await top(page).getByText(/Tilt uses your angle from neutral; gyro uses how fast you turn. Both can run together./).waitFor()
    await openPart(page, 'Mode shift')
    await top(page).locator('[data-while-holding="tilt"]').click()
    assert.equal(await top(page).locator('[data-held]').count(), 0)
    await top(page).locator('[data-add-held]').click()
    await page.getByRole('dialog').last().locator('[data-hold-input="L"]').focus()
    await page.keyboard.press('Enter')
    // The held tilt editor: behaviour and its own activation, no gyro output.
    const held = top(page)
    await held.locator('#gyro-motion').waitFor()
    assert.equal(await held.locator('button[role="radio"][data-value="PS_MOTION"]').count(), 0)
    await held.locator('button[role="radio"][data-value="LEFT_STEER_X"]').click()
    await openPart(page, 'When tilt is on')
    await segment(segmentRow(held, 'Tilt is on'), 'Off')
    await saveMatching(/L,MOTION_STICK_MODE = LEFT_STEER_X/)
    let text = await saved()
    assert.equal(eff(text, 'L,TILT_ON'), 'NONE')
    assert.equal(eff(text, 'GYRO_SENS'), '2 3')
    assert.equal(eff(text, 'GYRO_ON'), 'MISC6')
    assert.match(text, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.equal(eff(text, 'MOTION_STICK_MODE'), 'NO_MOUSE')
    await page.keyboard.press('Escape')
    // Y on the held row changes its button; tilt's chords move, gyro's stay.
    await top(page).locator('[data-held="L"]').focus()
    await page.keyboard.press('y')
    await page.getByRole('dialog').last().locator('[data-hold-input="R"]').focus()
    await page.keyboard.press('Enter')
    await saveMatching(/R,MOTION_STICK_MODE = LEFT_STEER_X/)
    text = await saved()
    assert.match(text, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.doesNotMatch(text, /^L,TILT_/m)
    assert.doesNotMatch(text, /^L,MOTION_STICK_MODE/m)
    // X removes it.
    await top(page).locator('[data-held="R"]').focus()
    await page.keyboard.press('x')
    await top(page).locator('[data-held="R"]').waitFor({ state: 'detached' })
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !/R,MOTION_STICK_MODE/.test(window.__motionSaved || ''))
    text = await saved()
    assert.match(text, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.match(text, /^UNKNOWN_SETTING = preserve$/m)
    await page.keyboard.press('Escape')
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 720 }, { width: 480, height: 800 }]) {
      await page.setViewportSize(viewport)
      const title = top(page).locator('header b').filter({ hasText: /^Tilt$/ }).first()
      const bounds = await title.boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width)
      await page.screenshot({ path: `tmp/parity-verification/gyro-tilt-hierarchy-${viewport.width}.png` })
    }
    assert.deepEqual(errors, [])
    console.log('PASS: separate gyro and tilt held lists and editors, tilt add/edit/save/rebind/remove preserve gyro, compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
