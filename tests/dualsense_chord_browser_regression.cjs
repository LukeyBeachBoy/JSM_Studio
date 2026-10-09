const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require('C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + `
        let testChords = [{id: 'builtin-default', buttons: [], triggerGroups: [['HOME']], profilePath: 'profiles-library/Default Global Chords.txt'}];
        desktopBridge.listGlobalChords = async () => testChords;
        desktopBridge.listLibraryProfiles = async () => ['Default Global Chords'];
        desktopBridge.saveGlobalChord = async chord => { testChords = [chord]; return testChords; };
        const subscribe = desktopBridge.onTelemetrySample;
        window.__physicalButtons = 0;
        desktopBridge.onTelemetrySample = callback => subscribe(sample => callback({ ...sample,
          activeProfile: 'profiles-library/Steam-layout.txt',
          devices: sample.devices?.map(device => ({ ...device, status: { ...device.status,
            buttons: window.__physicalButtons, leftStick: {x:0,y:0}, rightStick: {x:0,y:0},
            triggers: {left:0,right:0}, leftPad: {x:0,y:0,touched:false}, rightPad: {x:0,y:0,touched:false}
          }}))
        }));
      ` })
    })
    await page.route('**/src/dev/mockDesktop.ts*', async route => {
      const response = await route.fetch()
      const original = await response.text()
      const body = original.replace(/type:\s*24,\s*supportedButtons:\s*8589934591/, 'type: 5, supportedButtons: 524287')
      assert.notEqual(body, original, 'mock telemetry must use DualSense')
      await route.fulfill({ response, body })
    })
    await page.goto('http://127.0.0.1:1420/?mock')
    const onboarding = page.getByRole('dialog', { name: 'Controller power-on sound' })
    if (await onboarding.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false)) {
      await onboarding.getByRole('button', { name: 'Keep them', exact: true }).click()
    }
    // Console v2: Settings ▸ Hold to swap; Y on the card opens the entry, and
    // "Choose from a list" names every button this controller has.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'globalChords' })))
    const card = page.locator('[data-chord-card]').first()
    await card.waitFor()
    await card.focus()
    await page.keyboard.press('y')
    await page.getByRole('button', { name: 'Choose from a list' }).first().click()
    const create = page.getByRole('group', { name: 'Buttons to hold together' }).getByRole('button', { name: 'Create / Share', exact: true })
    await create.click()
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes("Create / Share") && button.getAttribute('aria-pressed') === 'true' && !button.matches(':disabled')))
    assert.equal(await page.getByRole('button', { name: 'Touchpad click', exact: true }).count(), 1)
    for (const command of ['L3', 'R3']) {
      assert.equal(await page.locator(`svg[data-glyph="${command}"] text`).first().textContent(), command)
    }
    await page.screenshot({ path: path.join(__dirname, '../tmp/dualsense-global-chords.png') })
    // OS-generated keyboard output must not change hints while the physical
    // controller owns a held mapped button, even outside the navigation profile.
    for (const bit of [5, 4]) {
      await page.evaluate(bit => { window.__physicalButtons = 2 ** bit }, bit)
      await page.waitForFunction(() => document.body.dataset.inputSource === 'controller')
      await page.keyboard.press('Shift')
      assert.equal(await page.evaluate(() => document.body.dataset.inputSource), 'controller')
      await page.evaluate(() => { window.__physicalButtons = 0 })
      await page.waitForTimeout(200)
      await page.keyboard.press('Shift')
      await page.waitForFunction(() => document.body.dataset.inputSource === 'keyboard')
    }
    assert.deepEqual(errors, [])
    console.log('PASS: DualSense Create / Share is selectable; L3/R3 labels render; Create/Options holds preserve controller hints outside navigation; keyboard takes over after release; no browser errors.')
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
