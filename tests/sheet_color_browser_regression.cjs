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
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' })))
    await page.locator('[data-overview-slot]').first().waitFor()

    // Layout's light lives behind Y ▸ Controller light & sounds (console v2 QuickMenu).
    await page.locator('[data-overview-slot]').first().focus()
    await page.keyboard.press('y')
    await page.getByRole('button', { name: /^Controller light & sounds/ }).click()
    // Controller light & sounds is its own page (console v2, ControllerLight).
    const light = page.getByRole('dialog', { name: /Controller light & sounds$/ })
    await light.waitFor()
    const swatches = light.getByRole('listbox', { name: 'Light bar color' })
    await light.getByRole('option', { name: 'Green', exact: true }).click()
    assert.match(await light.innerText(), /Saved: Green/)
    // TODO-47: the wall, sliders and hex field sit in a popover behind the
    // "Custom" swatch; the page itself shows only the swatch row.
    assert.equal(await light.locator('[data-color-wall]').count(), 0)
    await light.getByRole('option', { name: 'Custom', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Custom colour', exact: true })
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
    assert.equal(await light.getByRole('option', { name: 'Custom', exact: true }).evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(18, 58, 188)')
    assert.match(await light.innerText(), /Saved: #123ABC/i)
    // ◂ ▸ previews each colour; A keeps it; Y goes back to Default.
    await swatches.focus()
    await page.keyboard.press('ArrowRight')
    assert.match(await light.innerText(), /Previewing on your controller/)
    // Y is a pad button here (the strip has no keyboard Y): N is Y on the mock pad.
    await press('N')
    assert.doesNotMatch(await light.innerText(), /Saved: #123ABC/i, 'this configuration no longer sets its own light')
    await press('E')
    await light.waitFor({ state: 'detached' })

    // The Gyro "Noise & Steadying" sheet became Gyro ▸ Fine-tune ▸ Steadiness in console v2: a full-screen
    // sub-page whose body (<main>) is the scroll host. Short window, so that body has to scroll.
    await page.setViewportSize({ width: 1000, height: 560 })
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'gyro' })))
    await page.locator('[data-gyro-front]').waitFor()
    await page.locator('[data-gyro-fine-tune]').click()
    const fine = page.locator('[data-subpage]').last()
    await fine.locator('[data-gyro-fine-tune-page]').waitFor()
    await fine.locator('button[data-group="steadiness"]').click()
    await fine.locator('[data-gyro-fine-tune-page][data-group="steadiness"]').waitFor()
    await page.waitForTimeout(400)
    const body = fine.locator('main')
    const background = await page.locator('.shell-scroll').evaluate(el => el.scrollTop)
    const startTop = await body.evaluate(el => el.scrollTop)
    assert.ok(await body.evaluate(el => el.scrollHeight > el.clientHeight + 100), 'the Fine-tune body is taller than the window')
    const stick = async (y, ms) => {
      await page.evaluate(y => window.__pad.stick('right', 0, y), y)
      await page.waitForTimeout(ms)
      await page.evaluate(() => window.__pad.stick('right', 0, 0))
      await page.waitForTimeout(100)
    }
    await stick(1, 1200)
    await stick(-1, 450)
    assert.ok(await body.evaluate(el => el.scrollTop) > startTop + 100, 'right stick scrolls the page')
    assert.equal(await page.locator('.shell-scroll').evaluate(el => el.scrollTop), background, 'background stays still')
    await page.waitForFunction(() => {
      const glide = document.querySelector('.focus-glide')
      return glide?.style.clipPath !== 'none' && glide?.style.clipPath !== ''
    })
    const clipped = await page.locator('.focus-glide').evaluate(el => ({ clip: el.style.clipPath, hidden: el.dataset.clipped, active: document.activeElement?.outerHTML.slice(0, 350), target: document.querySelector('[data-glide-target]')?.getBoundingClientRect().toJSON(), area: document.querySelector('[data-subpage] main')?.getBoundingClientRect().toJSON() }))
    assert.notEqual(clipped.clip, 'none', `ring is clipped to the page body: ${JSON.stringify(clipped)}`)
    await stick(1, 1200)
    assert.equal(await body.evaluate(el => el.scrollTop), 0)
    const checkRow = async () => {
      const box = await page.evaluate(async () => {
        const { ringTarget } = await import('/src/nav/navBox.ts')
        const active = document.activeElement
        const host = active.closest('[data-subpage] main')
        if (!host) return null
        const row = ringTarget(active).getBoundingClientRect(), area = host.getBoundingClientRect()
        return { top: row.top, bottom: row.bottom, height: row.height, viewTop: area.top, viewBottom: area.bottom, viewHeight: area.height }
      })
      assert.ok(box, 'controller focus remains inside the page')
      if (box.height <= box.viewHeight - 16) {
        assert.ok(box.top >= box.viewTop + 4 && box.bottom <= box.viewBottom - 4, `whole focused row is visible: ${JSON.stringify(box)}`)
      }
    }
    for (let i = 0; i < 14; i++) { await press('DOWN'); await checkRow() }
    assert.ok(await body.evaluate(el => el.scrollTop) > 0)
    // Walking back up ends at the header's status chip (outside the body): that is the top of the page.
    let reachedHeader = false
    for (let i = 0; i < 14 && !reachedHeader; i++) {
      await press('UP')
      if (await page.evaluate(() => !document.activeElement?.closest('[data-subpage] main'))) reachedHeader = true
      else await checkRow()
    }
    assert.ok(reachedHeader, 'UP from the first row reaches the header')
    await page.screenshot({ path: 'tmp/dampening-panel-focus.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: light page colour presets, custom colour dragging and hex, live preview, back to Default, Back closes the page; Gyro Steadiness page scrolling, full row visibility and focus clipping')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
