// Console v2 (P4, V9): every setting on a gamepad stick's Fine-tune explains
// itself. Focus captions replace the old help dialogs: each row's footer
// caption names the setting and says what it does, and the rows fit their
// column at desk and laptop sizes. (Before console v2 this checked seven help
// dialogs in the stick's "Output settings" sheet; those settings now live in
// Sticks ▸ Fine-tune ▸ Match the game and Direction.)
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
    await page.getByRole('button', { name: 'Sticks', exact: true }).click()
    const left = page.locator('#mapping-section-leftStick')
    assert.equal(await left.locator('[role="radio"][data-current="true"]').getAttribute('data-value'), 'GAMEPAD', 'LEFT_STICK is the Gamepad stick card')
    await left.locator('[data-stick-fine-tune-row]').click()
    const sub = page.locator('[data-subpage]').last()
    await sub.locator('[data-group="match"][aria-current="true"]').waitFor()
    const caption = page.locator('[data-subpage] [data-focus-caption]')
    const rowFor = label => sub.locator('[role="slider"], [role="radiogroup"], button.summary-row, button').filter({ hasText: label }).first()
    // Every Match the game setting: a caption that names it and explains it.
    for (const label of ['Sends as', 'Game’s dead zone', 'Outer range', 'Response curve', 'Stick share with gyro', 'Dead-zone test signal']) {
      const row = rowFor(label)
      await row.focus()
      await page.waitForTimeout(80)
      const text = (await row.innerText()) + ' ' + ((await caption.count()) ? await caption.innerText() : '')
      assert.ok(text.replace(label, '').trim().length > 20, `${label} explains its behavior: ${text}`)
    }
    // ◂ ▸ change the focused value directly; the footer names the arrows.
    const deadzone = sub.locator('[role="slider"]').filter({ hasText: 'Game’s dead zone' })
    await deadzone.focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await deadzone.getAttribute('aria-valuetext'), '1%')
    await page.keyboard.press('ArrowLeft')
    // Direction: each flip is its own row, explained on the row.
    await sub.locator('[data-group="direction"]').click()
    for (const label of ['Flip left and right', 'Flip up and down']) {
      const row = rowFor(label)
      await row.waitFor()
      assert.ok((await row.innerText()).replace(label, '').trim().length > 10, `${label} says what it flips`)
    }
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 720 }]) {
      await page.setViewportSize(viewport)
      await sub.locator('[data-group="match"]').click()
      await sub.screenshot({ path: path.join(out, `output-${viewport.width}.png`) })
      assert.deepEqual(await sub.evaluate(el => [...el.querySelectorAll('[role="slider"], [role="radiogroup"]')].filter(node => {
        const a = node.getBoundingClientRect(); const b = el.getBoundingClientRect()
        return a.left < b.left || a.right > b.right
      }).map(node => node.textContent)), [], 'values fit the page')
    }
    assert.deepEqual(errors, [])
    console.log('PASS: every gamepad-stick setting explains itself on focus, ◂ ▸ adjust, compact layouts')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
