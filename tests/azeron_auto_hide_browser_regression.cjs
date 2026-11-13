// Renderer-only check: explain automatic hiding and its persistent manual opt-out.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${process.env.JSM_TEST_URL || 'http://127.0.0.1:1431'}/?mock`)
    await page.locator('[data-home-continue]').waitFor()
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 2000 }).catch(() => {})
    await page.evaluate(async () => {
      const { desktopBridge } = await import('/src/platform/desktopBridge.ts')
      const device = { instanceId: 'HID\\VID_16D0&PID_12F7&MI_03\\keypad', displayName: 'Azeron Cyborg', vendor: 'Azeron', product: 'Cyborg', present: true, hidden: true, partiallyHidden: false, likelyCurrentController: true, stale: false, managedByApp: true, vendorId: 0x16d0, productId: 0x12f7 }
      const status = { supported: true, installed: true, active: true, inverse: false, steamAllowed: false, devices: [device], managedInstanceIds: [device.instanceId], whitelistSynced: true, requiresElevation: false, autoHideAzeron: true, appList: [] }
      desktopBridge.getHidHideStatus = async () => structuredClone(status)
      desktopBridge.setHidHideDeviceHidden = async (id, hidden) => {
        if (id !== device.instanceId) throw new Error('wrong device')
        device.hidden = hidden; status.autoHideAzeron = hidden
        return structuredClone(status)
      }
      window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'deviceVisibility' }))
    })
    const device = page.locator('[data-hidhide-device]')
    await page.getByText(/Automatic Azeron hiding is on/).waitFor()
    assert.match(await device.innerText(), /Show to games/)
    await device.click()
    await page.getByText(/Automatic Azeron hiding is off/).waitFor()
    assert.match(await device.innerText(), /Visible to games/)
    await device.click()
    await page.getByText(/Automatic Azeron hiding is on/).waitFor()
    assert.match(await device.innerText(), /Hidden from games/)
    await page.waitForTimeout(600)
    await page.screenshot({ path: 'tests/tmp/azeron-auto-hide-settings.png' })
    assert.deepEqual(errors, [])
    console.log('PASS: automatic Azeron hiding copy, Show to games opt-out, Hide from games opt-in')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
