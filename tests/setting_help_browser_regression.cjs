const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const out = path.resolve('tmp/setting-help')
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
    await page.getByRole('button', { name: 'Joysticks', exact: true }).click()
    const left = page.locator('#mapping-section-leftStick')
    await left.getByRole('button', { name: 'Output settings', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: /Left stick.*Output settings/ })
    const labels = ['Deadzone test signal', 'Inner anti-deadzone', 'Outer range correction', 'Game response exponent', 'Physical stick contribution', 'Horizontal source direction', 'Vertical source direction']
    for (const label of labels) {
      const info = sheet.getByRole('button', { name: `About ${label}`, exact: true })
      await info.focus()
      await page.keyboard.press('Enter')
      const help = page.getByRole('dialog', { name: label, exact: true })
      await help.waitFor()
      if (label === 'Deadzone test signal') {
        for (const theme of ['dark', 'light']) for (const accent of ['cyan', 'teal', 'amber', 'violet']) {
          await page.evaluate(({theme, accent}) => {
            document.documentElement.dataset.theme = theme
            document.documentElement.dataset.accent = accent
          }, {theme, accent})
          assert.equal(await help.locator('.dialog__footer').evaluate(el => getComputedStyle(el).backgroundColor),
            await help.evaluate(el => getComputedStyle(el).backgroundColor), `${theme}/${accent} footer matches dialog surface`)
        }
        await help.screenshot({path: path.join(out, 'themed-help.png')})
      }
      assert.ok((await help.locator('.dialog__body').innerText()).length > 50, `${label} explains its behavior`)
      assert.equal(await help.evaluate(el => el.contains(document.activeElement)), true, 'help traps focus')
      await page.keyboard.press('Escape')
      await help.waitFor({ state: 'hidden' })
      assert.equal(await info.evaluate(el => el === document.activeElement), true, 'close restores the info button')
      assert.equal(await sheet.isVisible(), true, 'closing help keeps output settings open')
    }
    // The existing controller X shortcut opens the same dialog on both row types.
    const numeric = sheet.locator('button.summary-row').filter({ has: page.locator('.summary-row__label').getByText('Inner anti-deadzone', { exact: true }) })
    const probe = sheet.getByRole('combobox', { name: 'Deadzone test signal', exact: true })
    for (const control of [numeric, probe]) {
      await control.focus()
      await control.evaluate(el => el.dispatchEvent(new CustomEvent('jsm:pad', { detail: { button: 'X' }, bubbles: true, cancelable: true })))
      await page.locator('.dialog-layer').last().getByRole('dialog').waitFor()
      await page.keyboard.press('Escape')
      assert.equal(await control.evaluate(el => el === document.activeElement), true)
    }
    assert.equal(await sheet.locator('.summary-row__hint').count(), 0, 'help copy does not crowd or truncate the output rows')
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 720 }]) {
      await page.setViewportSize(viewport)
      await sheet.screenshot({ path: path.join(out, `output-${viewport.width}.png`) })
      assert.deepEqual(await sheet.evaluate(el => [...el.querySelectorAll('button[aria-haspopup="dialog"], [role="combobox"], .summary-row__value')].filter(node => {
        const a = node.getBoundingClientRect(); const b = el.getBoundingClientRect()
        return a.left < b.left || a.right > b.right
      }).map(node => node.textContent)), [], 'help buttons and values fit the sheet')
    }
    await sheet.getByRole('button', { name: 'About Deadzone test signal', exact: true }).click()
    await page.getByRole('dialog', { name: 'Deadzone test signal', exact: true }).screenshot({ path: path.join(out, 'deadzone-help.png') })
    await page.keyboard.press('Escape')
    await numeric.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await sheet.getByRole('button', { name: 'About Inner anti-deadzone', exact: true }).evaluate(el => el === document.activeElement), true, 'directional navigation reaches the info button')
    assert.deepEqual(errors, [])
    console.log('PASS: seven help dialogs, X shortcuts, focus trap/restoration, navigation and compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
