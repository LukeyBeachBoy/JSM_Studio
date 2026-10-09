// Console v2 SHELL: Screen distance (V10), Show config names (V12), focus
// captions (V9), Settings ▸ Startup (D19/D20), the shared update status, Copy
// the log, Press timing presets (D7) and Hide the real controller's app list.
// Renderer-only, against the ?mock preview (dev/mockDesktop.ts).
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const BASE = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${BASE}/?mock&update`)
    await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
    const keep = page.getByRole('button', { name: 'Keep them', exact: true })
    if (await keep.isVisible().catch(() => false)) await keep.click()
    const go = async id => { await page.evaluate(d => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: d })), id); await page.waitForTimeout(700) }
    const title = () => page.locator('.page-header__title').innerText()
    const px = (selector, prop) => page.evaluate(([s, p]) => parseFloat(getComputedStyle(document.querySelector(s))[p]), [selector, prop])

    // ---- V10: type scale. Desk never goes below 14; Couch is 40 / 26 / 20 / 16.
    await go('settings')
    assert.equal(await title(), 'Controller')
    assert.equal(await page.locator('[aria-label="Screen distance"]').count(), 0, 'readability has one home in Look & language')
    await go('appearance')
    const token = name => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.density), 'desk')
    for (const name of ['--fs-hint', '--fs-eyebrow', '--fs-micro', '--fs-body'])
      assert.ok(parseFloat(await token(name)) >= 14, `${name} is at least 14px on Desk (${await token(name)})`)
    const density = page.locator('[role="radiogroup"][aria-label="Screen distance"]')
    await density.waitFor()   // Screen distance is on Look & language
    await density.focus()
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => document.documentElement.dataset.density === 'couch')
    assert.equal(parseFloat(await token('--fs-page')), 40, 'Couch title is 40px')
    assert.equal(parseFloat(await token('--fs-section')), 26, 'Couch section is 26px')
    assert.equal(parseFloat(await token('--fs-body')), 20, 'Couch body is 20px')
    assert.equal(parseFloat(await token('--fs-hint')), 16, 'Couch caption is 16px')
    assert.equal(await page.evaluate(() => localStorage.getItem('jsm-density')), 'couch')
    // Look & language shows the same setting.
    await go('appearance')
    assert.equal(await page.locator('[role="radiogroup"][aria-label="Screen distance"] [data-current="true"]').innerText(), 'Couch')
    assert.ok(await px('.hint-capsule', 'height') >= 76, 'the footer grows with the couch scale')

    // ---- V12: Show config names puts the JSM key beside the friendly label.
    assert.equal(await page.locator('.config-name:visible').count(), 0, 'no keys while the switch is off')
    await go('timing')
    assert.equal(await page.locator('[data-config-name]').count(), 0, 'nothing rendered while off')
    await go('appearance')
    await page.getByRole('switch', { name: /Show config names/ }).click()
    assert.equal(await page.evaluate(() => document.documentElement.dataset.configNames), 'on')
    await go('timing')
    const keys = await page.locator('[data-config-name]').evaluateAll(nodes => nodes.map(n => n.textContent))
    assert.deepEqual(keys, ['HOLD_PRESS_TIME', 'DBL_PRESS_WINDOW', 'SIM_PRESS_WINDOW', 'TURBO_PERIOD', 'TICK_TIME'])
    assert.ok(await page.locator('[data-config-name="HOLD_PRESS_TIME"]').isVisible(), 'the key is visible beside Hold time')
    await go('settings')
    assert.ok(await page.locator('[data-config-name="DISABLE_HARDWARE_GYRO_CALIBRATION"]').count() >= 1, 'switch rows show their key too')
    // Reset: back to Desk, names off (Startup ▸ Reset everything also does this).
    await page.evaluate(() => { localStorage.setItem('jsm-density', 'desk'); localStorage.setItem('jsm-config-names', 'off') })
    await go('appearance')
    await page.locator('[role="radiogroup"][aria-label="Screen distance"]').focus()
    await page.keyboard.press('y')   // Y puts it back
    await page.waitForFunction(() => document.documentElement.dataset.density === 'desk')
    await page.getByRole('switch', { name: /Show config names/ }).click()
    await page.waitForFunction(() => document.documentElement.dataset.configNames === 'off')

    // ---- V9: focus captions replace tooltips; the footer shows label + help.
    await go('timing')
    await page.evaluate(() => { document.body.dataset.inputSource = 'controller' })
    await page.waitForFunction(() => { const row = document.querySelector('[data-timing-row="hold"]'); if (document.activeElement !== row) row.focus(); return document.querySelector('.app-shell > .hint-capsule .hint-capsule__caption-label')?.textContent === 'Hold time' })
    assert.equal(await page.locator('.hint-capsule__caption-label').innerText(), 'Hold time')
    assert.match(await page.locator('.hint-capsule__caption-help').innerText(), /Longer than this/)
    assert.equal(await page.locator('.hint-capsule__caption-help').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'the help line fits one line')
    assert.equal(await page.locator('.app-shell [title]:visible').count(), 0, 'no hover-only title tooltips on the Press timing page')
    // The ring is the flat 3px + halo, never a lifted drop shadow.
    const ring = await page.locator('[data-timing-row="hold"]').evaluate(el => getComputedStyle(el).boxShadow)
    assert.doesNotMatch(ring, /rgba\(0, 0, 0/, 'no drop shadow on the focused row')

    // ---- D7: presets, with Custom when the numbers match none.
    const preset = name => page.getByRole('radio', { name: new RegExp(`^${name}`) })
    assert.equal(await preset('Default').getAttribute('aria-checked'), 'true')
    await preset('Quick').click()
    await page.waitForFunction(() => document.querySelector('[data-timing-row="hold"]').getAttribute('aria-valuenow') === '0.12')
    assert.equal(await page.locator('[data-timing-row="double"]').getAttribute('aria-valuenow'), '0.12')
    assert.equal(await page.locator('[data-timing-row="together"]').getAttribute('aria-valuenow'), '0.04')
    await preset('Relaxed').click()
    await page.waitForFunction(() => document.querySelector('[data-timing-row="hold"]').getAttribute('aria-valuenow') === '0.25')
    assert.equal(await page.locator('[data-timing-row="together"]').getAttribute('aria-valuenow'), '0.06')
    await page.locator('[data-timing-row="hold"]').focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => /Custom/.test(document.querySelector('.main-pane').innerText))
    // The hold has to stay longer than the press-together window.
    await preset('Default').click()
    await page.waitForFunction(() => document.querySelector('[data-timing-row="hold"]').getAttribute('aria-valuenow') === '0.15')

    // ---- Startup: Start in the tray, What loads first, Updates (D19, D20).
    await go('startup')
    assert.equal(await title(), 'Startup')
    const tray = page.getByRole('switch', { name: /^Start in the tray/ })
    assert.equal(await tray.getAttribute('aria-checked'), 'true')
    await tray.click()
    await page.waitForFunction(() => document.querySelector('[role="switch"][aria-checked="false"]'))
    assert.equal(await tray.getAttribute('aria-checked'), 'false')
    const firstLoads = page.locator('[role="radiogroup"] [data-value="last"]')
    assert.equal(await firstLoads.getAttribute('aria-checked'), 'true', 'Last one live is the default')
    await page.locator('[data-value="fallback"]').click()
    await page.waitForFunction(() => document.querySelector('[data-value="fallback"]').getAttribute('aria-checked') === 'true')
    await page.locator('[data-value="last"]').click()
    await page.waitForFunction(() => document.querySelector('[data-value="last"]').getAttribute('aria-checked') === 'true')
    // Updates: ?mock&update has 0.8.0 waiting once asked.
    const updates = page.locator('[data-update-status]').first()
    await page.waitForFunction(() => document.querySelector('[data-update-status="available"], [data-update-status="current"]'))
    assert.equal(await updates.getAttribute('data-update-status'), 'available')
    assert.match(await page.locator('.main-pane').innerText(), /Version 0\.8\.0 is ready/)
    // The banner under the header and About read the same status.
    assert.match(await page.locator('[role="status"][data-phase="available"]').innerText(), /Update available[\s\S]*0\.8\.0/)
    await go('credits')
    assert.match(await page.locator('[data-update-status]').innerText(), /Version 0\.\d+\.\d+ · Version 0\.8\.0 is ready · checked/)
    // X checks for updates (shared with Startup's Check now).
    await page.locator('[data-credit="jibb"]').focus()
    await page.evaluate(() => { window.__checks = 0; const orig = window.electronAPI.checkForUpdatesNow; window.electronAPI.checkForUpdatesNow = async () => { window.__checks++; return orig() } })
    await page.evaluate(() => window.__pad.press(['W']))
    await page.waitForFunction(() => window.__checks === 1)
    await page.waitForTimeout(1000)
    assert.match(await page.locator('[data-update-status]').innerText(), /checked/)
    // Y reads the licence.
    await page.locator('[data-credit="jibb"]').focus()
    await page.evaluate(() => window.__pad.press(['N']))
    await page.locator('[data-subpage]').waitFor()
    assert.match(await page.locator('[data-subpage]').innerText(), /MIT License/)
    await page.keyboard.press('Escape')
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    assert.match(await page.locator('main').innerText(), /And \d+ more/)

    // ---- Troubleshooting: Mapper running · <config>, Copy the log, recent commands.
    await go('debugConsole')
    assert.match(await page.locator('.main-pane [role="status"]').first().innerText(), /Mapper running · Wardogs/)
    await page.locator('[data-fix="copy"]').click()
    await page.waitForFunction(() => /Copied \d+ lines?/.test(document.body.innerText))
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    assert.match(copied, /^JSM Evolved 0\.\d+\.\d+ · troubleshooting log/)
    assert.match(copied, /Loaded Wardogs\.txt/)
    const recent = await page.getByRole('group', { name: 'Recent commands' }).locator('button').allInnerTexts()
    assert.deepEqual(recent.slice(0, 2), ['LIST_CONTROLLERS', 'GYRO_SENS = 2.3'])
    assert.equal(await page.locator('[data-fix]').count(), 3)

    // ---- Hide the real controller: the app list HidHide holds.
    await go('deviceVisibility')
    const apps = await page.locator('[data-hidhide-app]').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-hidhide-app')))
    assert.deepEqual(apps, ['JoyShockMapper.exe', 'JSM Evolved.exe', 'steam.exe'])
    assert.match(await page.locator('.main-pane').innerText(), /Steam[\s\S]*react twice/)

    // ---- Guides: LB/RB step topics; LT/RT retain Settings category navigation.
    await go('help')
    await page.waitForFunction(() => { const topic = document.querySelector('[data-topic="start"]'); if (document.activeElement !== topic) topic.focus(); return true })
    await page.locator('.hint-capsule__item').filter({ hasText: 'Topic' }).waitFor()
    assert.equal(await page.locator('.hint-capsule__item').filter({ hasText: 'Topic' }).count(), 1, 'LB/RB are named Topic')
    assert.equal(await page.locator('.hint-capsule__item').filter({ hasText: 'Categories' }).count(), 1, 'B is named Categories')
    await page.keyboard.press('PageDown')
    await page.waitForFunction(() => document.querySelector('[data-topic="buttons"]')?.getAttribute('aria-selected') === 'true')
    assert.equal(await title(), 'Guides & reference', 'a topic step does not change the category')
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => document.activeElement?.closest('.section-list'))
    assert.equal(await title(), 'Guides & reference', 'B moves to the rail, not Home')
    // ---- Settings: LB/RB do not step categories; the footer says Category for LT/RT.
    await go('settings')
    await page.waitForFunction(() => { const row = document.querySelector('[role="switch"]'); if (document.activeElement !== row) row.focus(); return /Category/.test(document.querySelector('.app-shell > .hint-capsule').textContent) })
    assert.equal(await page.locator('.app-shell > .hint-capsule .hint-capsule__item').filter({ hasText: 'Tabs' }).count(), 0, 'no LB/RB Tabs on Settings')

    assert.deepEqual(errors, [])
    console.log('PASS: type scale, Screen distance, Show config names, focus captions, timing presets, Startup, shared update status, About, Copy the log, HidHide app list')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
