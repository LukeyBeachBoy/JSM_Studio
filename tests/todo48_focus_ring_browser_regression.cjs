// TODO-48: exactly one focus ring per focused text field, whichever input
// drives. With the pad, the shared focus glide rings the input; the field
// around it (Documentation search, Overview search, a NumberField's value
// pill) must not add its own focus-within ring on top. With the keyboard,
// the field's inset ring is the one ring and the input draws none.
//
//   JSM_TEST_URL='http://127.0.0.1:1421/?mock' node tests/todo48_focus_ring_browser_regression.cjs
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

// Every ring focus adds to the control or its four nearest ancestors: an
// outline or a box-shadow that differs from the same element's resting look
// (a field's hairline, a row's lift), plus the pad's focus glide when shown.
// The resting look is read with the control blurred, then focus is restored.
const countRings = () => {
  const control = document.activeElement
  const chain = []
  for (let element = control, depth = 0; depth < 5 && element && element !== document.body; depth++, element = element.parentElement) chain.push(element)
  const look = () => chain.map(element => { const style = getComputedStyle(element); return { outline: parseFloat(style.outlineWidth) > 0 && style.outlineStyle !== 'none' ? style.outline : 'none', boxShadow: style.boxShadow } })
  const focused = look()
  control.blur()
  const resting = look()
  control.focus({ preventScroll: true })
  const rings = []
  chain.forEach((element, i) => {
    const name = `${element.tagName}.${String(element.className).slice(0, 30)}`
    if (focused[i].outline !== resting[i].outline && focused[i].outline !== 'none') rings.push(`${name} outline ${focused[i].outline}`)
    if (focused[i].boxShadow !== resting[i].boxShadow && focused[i].boxShadow !== 'none') rings.push(`${name} box-shadow ${focused[i].boxShadow}`)
  })
  const glide = document.querySelector('.focus-glide')
  if (glide && glide.dataset.visible === 'true' && getComputedStyle(glide).display !== 'none') rings.push('focus-glide')
  return rings
}

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    const firstConnect = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await firstConnect.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await firstConnect.getByRole('button', { name: 'Keep them' }).click()
      await firstConnect.waitFor({ state: 'hidden' })
    }
    const source = async which => { await page.evaluate(s => { document.body.dataset.inputSource = s }, which); await page.waitForTimeout(500) }
    const expectOne = async (name, field) => {
      // Reached by keyboard: leave and come back so :focus-visible holds.
      await source('mouse')
      await field.click()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      await page.waitForTimeout(200)
      assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'keyboard')
      let rings = await page.evaluate(countRings)
      assert.equal(rings.length, 1, `${name}, keyboard: one ring, got ${JSON.stringify(rings)}`)
      // Reached by the pad: the glide takes over and the field steps back.
      await source('controller')
      // Edge may throttle animation frames for an inactive headless tab.
      // Observe the settled reveal rather than guessing a frame count.
      await page.bringToFront()
      await page.waitForFunction(() => document.querySelector('.focus-glide')?.getAttribute('data-visible') === 'true', null, { timeout: 10000 })
      const beforeControllerCount = await page.evaluate(() => ({ source: document.body.dataset.inputSource, focus: document.activeElement?.outerHTML.slice(0, 200), glide: document.querySelector('.focus-glide')?.outerHTML }))
      rings = await page.evaluate(countRings)
      assert.equal(rings.length, 1, `${name}, controller: one ring, got ${JSON.stringify(rings)}; state ${JSON.stringify(beforeControllerCount)}`)
      assert.equal(rings[0], 'focus-glide', `${name}, controller: the one ring is the glide`)
    }

    await page.getByRole('button', { name: /^Documentation/ }).first().click()
    await expectOne('Documentation search', page.locator('input[type="search"]').first())

    await page.getByRole('button', { name: /^Preferences/ }).first().click()
    await page.getByText('Gyro calibration', { exact: true }).first().waitFor()
    // The first NumberField on the page is Gyro calibration's Start Delay.
    await expectOne('Start Delay value', page.locator('.prefs-section [class*="valueInput"]').first())

    // The editing shell's Overview has the bindings search.
    await source('mouse')
    await page.locator('[data-home-continue]').click({ timeout: 15000 }).catch(() => {})
    const overviewSearch = page.getByRole('searchbox', { name: 'Search bindings' })
    if (await overviewSearch.count()) await expectOne('Overview search', overviewSearch.first())

    assert.deepEqual(errors, [])
    console.log('PASS: one focus ring per text field with the keyboard and with the pad')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
