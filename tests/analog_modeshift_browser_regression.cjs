const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const out = path.resolve('tmp/ui-ux-audit')
fs.mkdirSync(out, { recursive: true })
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', e => { errors.push(e.message); console.log('PAGE ERROR', e.message) })
    await page.addInitScript(() => {
      let content = sessionStorage.getItem('review-profile') || 'RESET_MAPPINGS\nVIRTUAL_CONTROLLER = XBOX\nLEFT_STICK_MODE = LEFT_STICK\nRIGHT_STICK_MODE = RIGHT_STICK\nFLICK_TIME = 0.1\nLEFT_TOUCHPAD_MODE = GRID_AND_STICK\nLEFT_TOUCH_STICK_MODE = FLICK\nR,LEFT_TOUCHPAD_MODE = GRID_AND_STICK\nR,LEFT_TOUCH_STICK_MODE = AIM\n'
      let api
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        get: () => api,
        set: mock => { api = {
          ...mock,
          getActiveProfile: async () => ({ name: 'Review', path: 'profiles-library/Review.txt', content }),
          listLibraryProfiles: async () => ['Review'],
          loadLibraryProfile: async () => ({ name: 'Review', content }),
          getLayerStack: async () => ({ profile: 'profiles-library/Review.txt', layers: [] }),
          saveLibraryProfile: async (name, text) => { content = text; sessionStorage.setItem('review-profile', text); window.__saved = text; return { name } },
        } },
      })
    })
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1421'}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()

    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    const group = page.getByRole('region', { name: 'Gyro modeshifts', exact: true })
    await group.getByRole('button', { name: 'Add modeshift', exact: true }).click()
    await group.getByRole('combobox').click()
    await page.getByRole('option').filter({hasText: 'top-left bumper'}).first().click()
    const shift = group.locator('[data-modeshift="L"]')

    const originalCard = await shift.elementHandle()
    const releasedButton = shift.getByRole('radio', { name: 'Released', exact: true }).first()
    await releasedButton.click()
    const releasedCard = group.locator('[data-modeshift="!L"]')
    assert.equal(await releasedCard.evaluate((element, original) => element === original && element.open, originalCard), true, 'condition change preserves the open accordion element')
    assert.equal(await releasedCard.getByRole('radio', { name: 'Released', exact: true }).first().evaluate(element => element === document.activeElement), true, 'condition change retains focus')
    const controls = releasedCard.locator('[class*="controls"]').first()
    const heldBox = await controls.getByRole('combobox', { name: 'Held input', exact: true }).boundingBox()
    const switchBox = await controls.getByRole('radiogroup').boundingBox()
    assert.ok(Math.abs(heldBox.y + heldBox.height / 2 - switchBox.y - switchBox.height / 2) < 2, 'condition switch aligns with the input control')
    assert.ok(switchBox.width < 180, 'condition switch stays compact')
    await releasedCard.getByRole('radio', { name: 'Held', exact: true }).first().click()
    assert.equal(await shift.evaluate(element => element.open), true)
    await originalCard.dispose()
    const x = shift.getByRole('textbox', { name: 'Static sensitivity (X)', exact: true })
    await x.fill('3'); await x.press('Tab')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /L,GYRO_SENS = 3/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^GYRO_SENS =/m)
    await group.getByRole('button', { name: 'Add modeshift', exact: true }).click()
    const adding = group.locator('[class*="addRow"]')
    const field = await adding.locator('label').boundingBox()
    const toggle = await adding.getByRole('radiogroup').boundingBox()
    assert.ok(Math.abs(field.y + field.height / 2 - toggle.y - toggle.height / 2) < 2, 'held toggle is vertically centered')
    await adding.screenshot({path:'tmp/modeshift-add-alignment.png'})
    await adding.getByRole('radio', { name: 'Released', exact: true }).click()
    await adding.getByRole('combobox').click()
    await page.getByRole('option').filter({hasText:'top-right bumper'}).first().click()
    const second = group.locator('[data-modeshift="!R"]')
    await second.getByRole('textbox', { name: 'Static sensitivity (X)', exact: true }).fill('5')
    await second.getByRole('textbox', { name: 'Static sensitivity (X)', exact: true }).press('Tab')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /!R,GYRO_SENS = 5/.test(window.__saved))
    assert.match(await page.evaluate(() => window.__saved), /^L,GYRO_SENS = 3/m)
    await second.screenshot({path:'tmp/gyro-modeshift.png'})
    await page.reload()
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 2000 }).catch(() => {})
    await page.locator('[data-home-continue]').click()
    await page.getByRole('button', { name: 'Gyro', exact: true }).click()
    await second.locator('summary').first().click()
    assert.equal(await second.getByRole('textbox', { name: 'Static sensitivity (X)', exact: true }).inputValue(), '5')
    await second.getByRole('button', {name:'Remove modeshift',exact:true}).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => !/!R,GYRO_/.test(window.__saved))
    assert.match(await page.evaluate(() => window.__saved), /^L,GYRO_SENS = 3/m)
    await page.getByRole('button', { name: 'Triggers', exact: true }).click()
    const triggerGroup = page.getByRole('region', { name: 'Left trigger modeshifts', exact: true })
    await triggerGroup.getByRole('button', {name:'Add modeshift',exact:true}).click()
    await triggerGroup.getByRole('combobox').click()
    await page.getByRole('option').filter({hasText:'top-right bumper'}).first().click()
    const triggerShift = triggerGroup.locator('[data-modeshift="R"]')
    await triggerShift.getByRole('combobox', {name:'Mode while held',exact:true}).click()
    await page.getByRole('option', {name:'Must skip',exact:true}).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /R,ZL_MODE = MUST_SKIP/.test(window.__saved))
    assert.doesNotMatch(await page.evaluate(() => window.__saved), /^ZL_MODE = MUST_SKIP/m)
    await triggerGroup.screenshot({path:'tmp/trigger-modeshift.png'})
    await triggerShift.getByRole('combobox', {name:'Mode while held',exact:true}).click()
    await page.getByRole('option', {name:'Analog passthrough · Left',exact:true}).click()
    for (const width of [1440, 1024, 800]) {
      await page.setViewportSize({ width, height: 900 })
      await triggerShift.scrollIntoViewIfNeeded()
      assert.equal((await triggerShift.innerText()).includes('\uFFFD'), false, 'no corrupt label glyphs')
      const clipped = await triggerShift.evaluate(card => {
        const bounds = card.getBoundingClientRect()
        return [...card.querySelectorAll('button')].filter(button => {
          const box = button.getBoundingClientRect()
          return box.width > 0 && (box.left < bounds.left || box.right > bounds.right)
        }).map(button => button.textContent)
      })
      assert.deepEqual(clipped, [], `controls fit at ${width}px`)
      const mode = triggerShift.getByRole('combobox', {name:'Mode while held',exact:true})
      assert.equal(await mode.evaluate(button => {
        const value = button.querySelector('[class*="value"]')
        return value.scrollWidth <= value.clientWidth + 1
      }), true, `full mode label fits at ${width}px`)
      await triggerGroup.screenshot({path:`tmp/trigger-modeshift-${width}.png`})
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', {name:'Gyro',exact:true}).click()
    await shift.locator('summary').first().click()
    await shift.getByRole('combobox', {name:'Output',exact:true}).click()
    await page.getByRole('option', {name:'PlayStation motion passthrough',exact:true}).click()
    const controller = shift.getByRole('combobox', {name: 'Virtual controller', exact: true})
    await controller.click(); await page.getByRole('option', {name:'PlayStation 4',exact:true}).click()
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => /^VIRTUAL_CONTROLLER = DS4$/m.test(window.__saved))
    const saved = await page.evaluate(() => window.__saved)
    assert.match(saved, /^L,GYRO_OUTPUT = PS_MOTION$/m)
    assert.doesNotMatch(saved, /^L,VIRTUAL_CONTROLLER/m, 'virtual device creation remains global')

    assert.deepEqual(errors, [])
    console.log('PASS: centered condition controls; multiple gyro shifts, released conditions, save/reload, scoped removal; trigger mode writes')
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exit(1) })
