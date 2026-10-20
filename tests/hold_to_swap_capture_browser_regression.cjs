// Exercise the actual Hold to swap capture sheet with telemetry. Resting hands
// must never prevent Quick Access capture or silently become part of its trigger.
const assert = require('node:assert/strict')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addLocatorHandler(page.getByRole('button', { name: 'Keep them', exact: true }), async () => {
      await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    })
    await page.route('**/src/platform/desktopBridge.ts*', async route => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text()) + '\nwindow.__captureBridge = desktopBridge;\n' })
    })
    await page.goto((process.env.JSM_TEST_URL || 'http://127.0.0.1:1420') + '/?mock')
    await page.waitForFunction(() => window.__pad && window.__captureBridge && document.querySelector('.titlebar'))
    await page.evaluate(() => {
      const bridge = window.__captureBridge
      window.captureSaves = []
      window.captureChords = [{ id: 'default', buttons: [], triggerGroups: [['HOME']], controllerModel: null, profilePath: 'profiles-library/Quick Access Chord.txt' }]
      bridge.listGlobalChords = async () => window.captureChords
      bridge.listLibraryProfiles = async () => ['Quick Access Chord']
      bridge.saveGlobalChord = async chord => {
        window.captureChords = [chord]
        window.captureSaves.push(structuredClone(chord))
        return window.captureChords
      }
      const onSample = bridge.onTelemetrySample
      window.captureContacts = 0
      window.captureType = 24
      window.captureConnected = true
      bridge.onTelemetrySample = callback => onSample(payload => callback({ ...payload, devices: window.captureConnected ? payload.devices.map(device => ({ ...device, type: window.captureType, status: {
        ...device.status, buttons: device.status.buttons + window.captureContacts,
        leftPad: { x: 0, y: 0, touched: true }, rightPad: { x: 0, y: 0, touched: true },
      } })) : [] }))
      window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'globalChords' }))
    })
    const card = page.locator('[data-chord-card="default"]')
    await card.waitFor()
    const tick = async () => page.waitForTimeout(180)
    const open = async () => {
      await card.click()
      await page.waitForFunction(() => document.body.dataset.padListening === 'true')
      await tick()
    }
    let saveCount = 0
    const saved = async expected => {
      saveCount += 1
      await page.waitForFunction(count => window.captureSaves.length === count, saveCount)
      assert.deepEqual(await page.evaluate(() => window.captureChords[0].triggerGroups), [expected])
      await page.waitForFunction(() => !document.body.dataset.padListening)
    }
    const contacts = 2 ** 23 + 2 ** 24 + 2 ** 30 + 2 ** 31 + 2 ** 32

    // Both grips, sticks and pads are already touched when the sheet opens.
    await page.evaluate(mask => { window.captureContacts = mask }, contacts)
    await open()
    await page.evaluate(() => window.__pad.hold(['MISC1']))
    await tick()
    assert.match(await page.locator('[data-subpage]').innerText(), /Touch and grip sensors are ignored/)
    await page.screenshot({ path: path.join(__dirname, '../tmp/hold-to-swap-capture.png') })
    await page.evaluate(() => window.__pad.release(['MISC1']))
    await saved(['MISC1'])

    // Picking the controller up after starting must also leave contact out.
    await page.evaluate(() => { window.captureContacts = 0 })
    await open()
    await page.evaluate(() => window.__pad.hold(['MISC1']))
    await tick()
    await page.evaluate(mask => { window.captureContacts = mask }, contacts)
    await tick()
    await page.evaluate(() => window.__pad.release(['MISC1']))
    await saved(['MISC1'])

    // A used to open the sheet must be released before the new trigger starts.
    await page.evaluate(() => window.__pad.hold(['S']))
    await open()
    await page.evaluate(() => window.__pad.release(['S']))
    await tick()
    await page.evaluate(() => window.__pad.press(['MISC1'], 100))
    await saved(['MISC1'])

    // Sequential additions never accumulate after the first captured release.
    await open()
    await page.evaluate(() => window.__pad.hold(['L']))
    await tick()
    await page.evaluate(() => window.__pad.hold(['R']))
    await tick()
    await page.evaluate(() => { window.__pad.release(['L']); window.__pad.hold(['N']) })
    await tick()
    assert.equal(await page.evaluate(() => window.captureSaves.length), saveCount)
    await page.evaluate(() => window.__pad.release(['R']))
    await saved(['L', 'R'])
    await page.evaluate(() => window.__pad.release())
    await tick()

    // Triggers are analog in telemetry and use the runtime's half-pull threshold.
    await open()
    await page.evaluate(() => window.__pad.trigger('left', 0.6))
    await tick()
    await page.evaluate(() => window.__pad.trigger('left', 0))
    await saved(['ZL'])

    // Losing telemetry while held cannot turn a missing device into a release.
    await open()
    await page.evaluate(() => window.__pad.hold(['MISC1']))
    await tick()
    await page.evaluate(() => { window.captureConnected = false; window.__pad.release() })
    await tick()
    assert.equal(await page.evaluate(() => window.captureSaves.length), saveCount)
    await page.evaluate(() => { window.captureConnected = true })
    await saved(['MISC1'])

    // MISC5 is a real button on other controller families, not a Steam grip.
    await page.evaluate(() => { window.captureContacts = 0; window.captureType = 6 })
    await open()
    await page.evaluate(() => window.__pad.press(['MISC5'], 100))
    await saved(['MISC5'])
    await page.evaluate(() => { window.captureType = 24 })

    await open()
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.body.dataset.padListening)
    assert.equal(await page.evaluate(() => window.captureSaves.length), saveCount, 'Cancel preserves the trigger')
    assert.deepEqual(errors, [])
    console.log('PASS: Quick Access alone with resting or newly touched sensors; opener release; simultaneous combinations; triggers; telemetry loss; other families; cancel')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
