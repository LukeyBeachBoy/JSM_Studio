// Configuration organization: actual edits preserve their keys/scope, mode-independent
// pad orientation stays reachable, and promoted calibration links return to their caller.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const { prepare, top, valueRow, eff } = require('./gyro_v2_helpers.cjs')
const out = path.resolve(__dirname, '../tmp/configuration-discoverability')
fs.mkdirSync(out, { recursive: true })
const profile = 'RESET_MAPPINGS\nGYRO_SPACE = YAW_PLUS_ROLL\nROLL_CONTRIBUTION = -25\nLEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_TOUCHPAD_MODE = MOUSE\nLEFT_TOUCHPAD_ROTATION = 15\nRIGHT_TOUCHPAD_ROTATION = -10\nL,LEFT_TOUCHPAD_MODE = MOUSE\nRIGHT_STICK_MODE = AIM\nS = SPACE\n# @layer {"id":"vehicles","name":"Vehicles","overrides":{"LEFT_TOUCHPAD_ROTATION":"60"}}\n'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await prepare(page)
    await page.addInitScript(content => {
      let text = content, api
      Object.defineProperty(window, 'electronAPI', { configurable: true, get: () => api, set: mock => {
        api = { ...mock,
          getActiveProfile: async () => ({ name: 'Discoverability', path: 'profiles-library/Discoverability.txt', content: text }),
          listLibraryProfiles: async () => ['Discoverability'],
          loadLibraryProfile: async () => ({ name: 'Discoverability', content: text }),
          getLayerStack: async () => ({ profile: 'profiles-library/Discoverability.txt', layers: [] }),
          saveLibraryProfile: async (name, next) => { text = next; window.__saved = next; return { name } },
        }
      } })
    }, profile)
    await page.goto(`${(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '')}/?mock`)
    await page.locator('[data-home-continue]').click()
    const nav = async tab => {
      await page.evaluate(tab => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: tab })), tab)
      await page.waitForTimeout(350)
    }
    const closeAll = async () => {
      for (let n = 0; n < 8 && await page.locator('[data-subpage]').count(); n++) {
        await page.keyboard.press('Escape'); await page.waitForTimeout(250)
      }
      assert.equal(await page.locator('[data-subpage]').count(), 0)
    }
    const group = async id => { await top(page).locator(`button[data-group="${id}"]`).click(); await page.waitForTimeout(300) }
    const saved = async () => { await page.keyboard.press('Control+s'); await page.waitForTimeout(400); return page.evaluate(() => window.__saved) }
    const capture = async name => {
      for (const theme of ['dark', 'light']) for (const [width, height] of [[1440, 900], [900, 600]]) {
        await page.setViewportSize({ width, height })
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme }, theme)
        if (name === 'gyro-direction') {
          await valueRow(top(page), 'Roll contribution').focus()
          await valueRow(top(page), 'Roll contribution').scrollIntoViewIfNeeded()
        }
        if (name === 'stick-speed') {
          const match = top(page).locator('button').filter({ hasText: /^Real-world calibration \(RWC\)/ })
          await match.focus(); await match.scrollIntoViewIfNeeded()
        }
        await page.waitForTimeout(450)
        const geometry = await top(page).evaluate(node => {
          const main = node.querySelector(':scope > main'), footer = node.querySelector(':scope > footer')
          const box = node.getBoundingClientRect(), frame = main?.getBoundingClientRect(), foot = footer?.getBoundingClientRect()
          return { overflow: document.documentElement.scrollWidth > innerWidth, inside: box.left >= 0 && box.right <= innerWidth + 1,
            mainBeforeFooter: !frame || !foot || frame.bottom <= foot.top + 1 }
        })
        assert.equal(geometry.overflow, false, `${name} ${theme} ${width}: no document overflow`)
        assert.equal(geometry.inside, true, `${name} ${theme} ${width}: subpage stays in window`)
        assert.equal(geometry.mainBeforeFooter, true, `${name} ${theme} ${width}: settings do not overlap footer`)
        if (name === 'gyro-direction' || name === 'stick-speed') {
          assert.ok(await top(page).evaluate(node => {
            const focused = document.activeElement?.getBoundingClientRect(), main = node.querySelector(':scope > main')?.getBoundingClientRect()
            return focused && main && focused.top >= main.top && focused.bottom <= main.bottom
          }), `${name} ${width}: focused control fully inside scroll region`)
        }
        await page.screenshot({ path: path.join(out, `${name}-${theme}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
    }

    await nav('gyro')
    await page.evaluate(async () => {
      const routes = await import('/src/utils/gyroRoutes.ts')
      window.dispatchEvent(new CustomEvent('jsm:gyro-route', { detail: routes.gyroRouteForKey('ROLL_CONTRIBUTION') }))
    })
    await top(page).locator('[data-gyro-fine-tune-page][data-group="direction"]').waitFor()
    const roll = valueRow(top(page), 'Roll contribution')
    assert.equal(await roll.getAttribute('aria-valuenow'), '-25', 'imported negative roll value remains intact')
    await roll.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(eff(await saved(), 'ROLL_CONTRIBUTION'), '-20', 'relocated row edits the original setting')
    await capture('gyro-direction')
    await top(page).locator('[role="radio"][data-value="LOCAL"]').click()
    assert.equal(await roll.getAttribute('aria-disabled'), 'true', 'roll remains disabled outside Yaw + roll')
    await closeAll()

    await nav('touchpad')
    const left = '#trackpad-left'
    for (const mode of ['MOUSE', 'MOUSE_AREA', 'ZONES', 'TOUCH_STICK']) {
      await page.locator(`${left} [role="radio"][data-value="${mode}"]`).click()
      await page.locator(`${left} [data-trackpad-fine-tune]`).click()
      await group('orientation')
      assert.equal(await valueRow(top(page), 'Pad rotation').getAttribute('aria-valuenow'), '15', `orientation reachable with imported value in ${mode}`)
      assert.match(await top(page).locator('button[data-group="more"]').innerText(), /Bindings & shifts/, 'bindings group has a descriptive name, retaining its route id')
      if (mode === 'MOUSE_AREA') {
        await group('click')
        assert.equal(await top(page).locator('[role="radiogroup"][aria-label="Pad fit"]').count(), 0, 'Click no longer contains unrelated pad fit')
        await group('area')
        assert.equal(await top(page).locator('[role="radiogroup"][aria-label="Pad fit"]').count(), 1, 'pad fit remains under Mouse area')
        await capture('pad-mouse-area')
        await group('orientation')
      }
      if (mode === 'MOUSE') await capture('pad-orientation')
      await closeAll()
    }
    await page.locator(`${left} [data-trackpad-fine-tune]`).click()
    await group('orientation')
    await valueRow(top(page), 'Pad rotation').focus(); await page.keyboard.press('ArrowRight')
    const text = await saved()
    assert.equal(eff(text, 'LEFT_TOUCHPAD_ROTATION'), '20', 'rotation still writes the same per-pad key')
    assert.equal(eff(text, 'RIGHT_TOUCHPAD_ROTATION'), '-10', 'other pad rotation remains unchanged')
    assert.match(text, /^S = SPACE$/m, 'unrelated binding remains unchanged')
    await group('more'); await capture('pad-bindings')
    await group('orientation')
    await valueRow(top(page), 'Pad rotation').focus(); await page.keyboard.press('ArrowRight')
    await closeAll()
    await nav('layers')
    await page.locator('[data-mode-id="vehicles"]').click()
    await top(page).getByRole('button', { name: /^See it on Layout/ }).click()
    // Review must route both shared and controller-scoped rotation keys back to
    // the editor, preserving the controller target instead of opening global defaults.
    await page.getByRole('button', { name: 'Options: review changes, undo, save', exact: true }).click()
    await page.getByRole('button', { name: /^Review changes/ }).click()
    const rotationChange = page.locator('[data-change-id*="LEFT_TOUCHPAD_ROTATION"]').first()
    await rotationChange.click()
    await page.waitForTimeout(600)
    await top(page).locator('[data-trackpad-fine-tune-page="left"] button[data-group="orientation"][aria-current="true"]').waitFor()
    assert.equal(await valueRow(top(page), 'Pad rotation').getAttribute('aria-valuenow'), '25', 'Review changes opens controller base rotation, leaving the previously selected Vehicles layer')
    await closeAll()
    await page.locator(`${left} [data-trackpad-fine-tune]`).click()
    await group('more')
    await top(page).locator('button').filter({ hasText: /^Mode shift/ }).click()
    await top(page).locator('[data-modeshift="L"]').click()
    await top(page).locator('[data-trackpad-fine-tune]').click()
    await group('orientation')
    const shiftedRotation = valueRow(top(page), 'Pad rotation')
    assert.equal(await shiftedRotation.getAttribute('aria-disabled'), 'true', 'pad rotation remains non-shiftable')
    assert.match(await shiftedRotation.getAttribute('data-reason') || await shiftedRotation.innerText(), /normal pad|shared by every mode shift/i)
    await shiftedRotation.focus(); await page.keyboard.press('ArrowRight')
    assert.doesNotMatch(await saved(), /^L,LEFT_TOUCHPAD_ROTATION\s*=/m, 'disabled shifted editor cannot create an unsupported rotation chord')
    await closeAll()

    await nav('joysticks')
    await page.locator('.section-item').filter({ hasText: 'Right stick' }).first().click()
    await page.locator('#mapping-section-rightStick [data-stick-fine-tune-row]').click()
    await group('speed')
    const match = top(page).locator('button').filter({ hasText: /^Real-world calibration \(RWC\)/ })
    await match.click()
    assert.match(await top(page).locator(':scope > header').innerText(), /Real-world calibration/)
    await page.keyboard.press('Escape'); await page.waitForTimeout(350)
    assert.equal(await top(page).locator('button[data-group="speed"]').getAttribute('aria-current'), 'true', 'closing calibration returns to Speed')
    await match.focus()
    assert.equal(await match.evaluate(node => document.activeElement === node), true, 'promoted link remains keyboard focusable')
    await capture('stick-speed')
    assert.deepEqual(errors, [])
    console.log('PASS: relocated settings keep values, scope, guards and caller state; category access and dark/light geometry at 1440×900 and 900×600')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
