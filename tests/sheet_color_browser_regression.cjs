const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
  try {
    const page = await browser.newPage({ viewport: { width: 712, height: 948 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    await page.locator('[data-home-continue]').click()
    const press = async key => { await page.evaluate(key => window.__pad.press([key]), key); await page.waitForTimeout(300) }
    const goPage = async name => {
      for (let n = 0; n < 12; n++) {
        if (await page.locator('.page-header__title').innerText() === name) return
        await page.evaluate(() => window.__pad.trigger('right', 0.6))
        await page.waitForTimeout(90)
        await page.evaluate(() => window.__pad.trigger('right', 0))
        await page.waitForTimeout(200)
      }
      throw new Error(`Could not reach ${name}`)
    }
    await goPage('Overview')
    const lightRow = page.locator('.summary-row').filter({ hasText: 'Controller light' })
    await lightRow.click()
    const light = page.getByRole('dialog', { name: 'Controller light', exact: true })
    await light.waitFor()
    await light.getByRole('radio', { name: 'Green', exact: true }).click()
    // TODO-47: the wall, sliders and hex field sit in a popover behind the
    // "Custom" swatch; the sheet itself shows only the swatch row.
    assert.equal(await light.locator('[data-color-wall]').count(), 0)
    await light.getByRole('radio', { name: 'Custom', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Custom color', exact: true })
    await editor.waitFor()
    const wall = editor.locator('[data-color-wall]')
    await wall.hover() // Playwright waits for the color wall's own opening motion.
    const bounds = await wall.boundingBox()
    await page.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width * 0.8, bounds.y + bounds.height * 0.3, { steps: 8 })
    await page.mouse.up()
    assert.equal(await editor.getByRole('slider', { name: 'Saturation', exact: true }).inputValue(), '80')
    assert.equal(await editor.getByRole('slider', { name: 'Color value', exact: true }).inputValue(), '70')
    const hex = editor.getByRole('textbox', { name: /hex/i })
    const picked = await hex.inputValue()
    assert.notEqual(picked, '34c759')
    await editor.getByRole('slider', { name: 'Hue', exact: true }).focus()
    const hue = Number(await editor.getByRole('slider', { name: 'Hue', exact: true }).inputValue())
    await press('RIGHT')
    assert.equal(Number(await editor.getByRole('slider', { name: 'Hue', exact: true }).inputValue()), hue + 1)
    await hex.fill('123abc')
    await hex.press('Tab')
    assert.equal(await editor.getByRole('img', { name: 'Selected color #123abc' }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(18, 58, 188)')
    await page.screenshot({ path: 'tmp/controller-light-picker.png' })
    await editor.getByRole('button', { name: 'Done', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    assert.equal(await light.getByRole('radio', { name: 'Custom', exact: true }).getAttribute('data-color'), '#123abc')
    await light.getByRole('button', { name: 'Close', exact: true }).click()
    assert.equal(await lightRow.getByRole('img', { name: 'LED color #123abc' }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(18, 58, 188)')

    await goPage('Gyro')
    await page.locator('.summary-row').filter({ hasText: 'Noise & Steadying' }).click()
    const dampening = page.getByRole('dialog', { name: 'Noise & Steadying', exact: true })
    await dampening.waitFor()
    await page.waitForTimeout(400)
    const body = dampening.locator('.sheet__body')
    const background = await page.locator('.shell-scroll').evaluate(el => el.scrollTop)
    const stick = async (y, ms) => {
      await page.evaluate(y => window.__pad.stick('right', 0, y), y)
      await page.waitForTimeout(ms)
      await page.evaluate(() => window.__pad.stick('right', 0, 0))
      await page.waitForTimeout(100)
    }
    await stick(-1, 450)
    assert.ok(await body.evaluate(el => el.scrollTop) > 150, 'right stick scrolls the sheet')
    assert.equal(await page.locator('.shell-scroll').evaluate(el => el.scrollTop), background, 'background stays still')
    await page.waitForFunction(() => {
      const glide = document.querySelector('.focus-glide')
      return glide?.style.clipPath !== 'none' && glide?.style.clipPath !== ''
    })
    const clipped = await page.locator('.focus-glide').evaluate(el => ({ clip: el.style.clipPath, hidden: el.dataset.clipped, active: document.activeElement?.outerHTML.slice(0, 350), target: document.querySelector('[data-glide-target]')?.getBoundingClientRect().toJSON(), area: document.querySelector('.sheet__body')?.getBoundingClientRect().toJSON() }))
    assert.notEqual(clipped.clip, 'none', `ring is clipped to the sheet body: ${JSON.stringify(clipped)}`)
    await stick(1, 1200)
    assert.equal(await body.evaluate(el => el.scrollTop), 0)
    const checkRow = async () => {
      const box = await page.evaluate(async () => {
        const { ringTarget } = await import('/src/nav/navBox.ts')
        const active = document.activeElement
        const host = active.closest('.sheet__body')
        if (!host) return null
        const row = ringTarget(active).getBoundingClientRect(), area = host.getBoundingClientRect()
        return { top: row.top, bottom: row.bottom, height: row.height, viewTop: area.top, viewBottom: area.bottom, viewHeight: area.height }
      })
      assert.ok(box, 'controller focus remains inside the sheet')
      if (box.height <= box.viewHeight - 16) {
        assert.ok(box.top >= box.viewTop + 4 && box.bottom <= box.viewBottom - 4, `whole focused row is visible: ${JSON.stringify(box)}`)
      }
    }
    for (let i = 0; i < 14; i++) { await press('DOWN'); await checkRow() }
    assert.ok(await body.evaluate(el => el.scrollTop) > 0)
    for (let i = 0; i < 14; i++) { await press('UP'); await checkRow() }
    await checkRow() // A padded wrapper may leave a few pixels above the first row.
    await page.screenshot({ path: 'tmp/dampening-panel-focus.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: color dragging, controller adjustment, live swatches, sheet scrolling, full row visibility and focus clipping')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
