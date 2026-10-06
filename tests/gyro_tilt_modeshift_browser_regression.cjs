const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
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
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    const gyro = page.getByRole('region', { name: 'Gyro modeshifts', exact: true })
    const tilt = page.getByRole('region', { name: 'Tilt modeshifts', exact: true })
    await gyro.locator('[data-modeshift="L"]').waitFor()
    assert.equal(await gyro.locator('[data-modeshift]').count(), 1)
    assert.equal(await tilt.locator('[data-modeshift]').count(), 0)
    assert.equal(await page.locator('vite-error-overlay').count(), 0)
    await page.getByRole('button', { name: 'Help: Tilt and gyro' }).click()
    await page.getByRole('dialog').getByText(/Each input has its own activation and modeshifts/).waitFor()
    await page.getByRole('button', { name: 'Got it', exact: true }).click()
    await tilt.getByRole('button', { name: 'Add modeshift', exact: true }).click()
    await tilt.getByRole('combobox').click()
    await page.getByRole('option').filter({ hasText: /top-left bumper/ }).click()
    const shiftedTilt = tilt.locator('[data-modeshift="L"]')
    assert.equal(await shiftedTilt.getByRole('combobox', { name: 'Output', exact: true }).count(), 0)
    await shiftedTilt.getByRole('combobox', { name: 'Tilt behaviour', exact: true }).click()
    await page.getByRole('option', { name: 'Steering → left stick', exact: true }).click()
    await shiftedTilt.getByRole('group', { name: 'Tilt activation', exact: true }).getByRole('button', { name: 'Always off', exact: true }).click()
    const save = async () => { await page.keyboard.press('Control+s') }
    await save()
    await page.waitForFunction(() => /L,MOTION_STICK_MODE = LEFT_STEER_X/.test(window.__motionSaved || ''))
    let saved = await page.evaluate(() => window.__motionSaved)
    assert.match(saved, /^L,TILT_ON = NONE$/m)
    assert.match(saved, /^GYRO_SENS = 2 3$/m)
    assert.match(saved, /^GYRO_ON = MISC6$/m)
    assert.match(saved, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.match(saved, /^MOTION_STICK_MODE = NO_MOUSE$/m)
    const shiftedGyro = gyro.locator('[data-modeshift="L"]')
    await shiftedGyro.locator('summary').click()
    assert.equal(await shiftedGyro.getByRole('combobox', { name: 'Tilt behaviour', exact: true }).count(), 0)
    await shiftedGyro.locator('summary').click()
    await shiftedTilt.getByRole('combobox', { name: 'Held input', exact: true }).click()
    await page.getByRole('option').filter({ hasText: /top-right bumper/ }).click()
    await save()
    await page.waitForFunction(() => /R,MOTION_STICK_MODE = LEFT_STEER_X/.test(window.__motionSaved || ''))
    saved = await page.evaluate(() => window.__motionSaved)
    assert.match(saved, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.doesNotMatch(saved, /^L,TILT_/m)
    await tilt.locator('[data-modeshift="R"]').getByRole('button', { name: 'Remove modeshift', exact: true }).click()
    await save()
    await page.waitForFunction(() => !/R,MOTION_STICK_MODE/.test(window.__motionSaved || ''))
    saved = await page.evaluate(() => window.__motionSaved)
    assert.match(saved, /^L,GYRO_SENS = 4 5 # gyro shift$/m)
    assert.match(saved, /^UNKNOWN_SETTING = preserve$/m)
    await page.waitForFunction(() => !document.body.innerText.includes('Saved Motion.'))
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 720 }, { width: 480, height: 800 }]) {
      await page.setViewportSize(viewport)
      const heading = page.getByRole('heading', { name: 'Tilt', exact: true })
      await heading.scrollIntoViewIfNeeded()
      const bounds = await heading.boundingBox()
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= viewport.width)
      await page.screenshot({ path: `tmp/parity-verification/gyro-tilt-hierarchy-${viewport.width}.png` })
    }
    assert.deepEqual(errors, [])
    console.log('PASS: separate motion sections and editors, tilt add/edit/save/rename/remove preserve gyro, shared trigger and compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
