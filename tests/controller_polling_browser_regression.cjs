// Shared polling and profile override remain separate; no hardware writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1428'
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const out = path.resolve('tmp/controller-polling')
  fs.mkdirSync(out, { recursive: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
      let content = 'RESET_MAPPINGS\nTICK_TIME = 7 # profile override\nS = SPACE\n# keep this comment\n'
      window.__profileWrites = []
      window.electronAPI = {
        getActiveProfile: async () => ({ name: 'Polling config', path: 'profiles-library/Polling config.txt', content }),
        listLibraryProfiles: async () => ['Polling config'],
        loadLibraryProfile: async () => ({ name: 'Polling config', content }),
        readConfigFile: async () => content,
        getRuntimeMappingState: async () => ({ mappingEnabled: true, firmwareSoundPromptDone: true, defaultPollingMs: 3 }),
        saveLibraryProfile: async (name, next) => { content = next; window.__profileWrites.push(next); return { name } },
        applyProfile: async path => ({ path, mappingEnabled: true }),
      }
    })
    await page.goto(base)
    await page.locator('[data-home-continue]').waitFor()
    const go = async route => { await page.evaluate(route => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: route })), route); await page.waitForTimeout(350) }
    await go('settings')
    const polling = page.locator('[data-controller-polling]')
    await polling.waitFor()
    assert.match(await polling.innerText(), /Every 3 ms/)
    await polling.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => document.querySelector('[data-controller-polling]')?.textContent.includes('Every 4 ms'))
    assert.deepEqual(await page.evaluate(() => window.__profileWrites), [], 'changing the shared default does not rewrite a configuration')
    for (const theme of ['dark', 'light']) for (const [width, height] of [[1440, 900], [900, 600]]) {
      await page.setViewportSize({ width, height })
      await go('appearance')
      await page.getByRole('radio', { name: theme === 'light' ? /^Light/ : /^Dark/ }).click()
      await go('settings')
      const box = await polling.boundingBox()
      assert.ok(box.y >= 64 && box.y + box.height < height - 64, 'polling is visible immediately in Controller settings')
      assert.match(await polling.innerText(), /Every 4 ms/)
      assert.equal(await page.locator('.shell-scroll').evaluate(el => el.scrollWidth > el.clientWidth), false)
      await page.screenshot({ path: path.join(out, `settings-${theme}-${width}.png`) })
    }
    await page.getByRole('button', { name: /This configuration’s polling override/ }).click()
    const details = page.locator('details').filter({ has: page.locator('summary').getByText('Configuration timing', { exact: true }) })
    await details.waitFor()
    assert.equal(await details.getAttribute('open'), '')
    const override = details.getByRole('button', { name: /^Controller polling:/ })
    await override.waitFor()
    assert.match(await override.innerText(), /7 ms/)
    await override.click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+s')
    await page.waitForFunction(() => window.__profileWrites.some(text => /^TICK_TIME = 8\b/m.test(text)))
    const saved = await page.evaluate(() => window.__profileWrites.at(-1))
    assert.match(saved, /^S = SPACE$/m)
    assert.match(saved, /^# keep this comment$/m)
    await go('settings')
    assert.match(await polling.innerText(), /Every 4 ms/, 'editing the profile override does not change the shared default')
    await go('gyro')
    await page.locator('[data-gyro-front]').waitFor()
    await page.evaluate(async () => {
      const { requestGyroRoute } = await import('/src/utils/gyroRoutes.ts')
      requestGyroRoute({ view: 'fine-tune', group: 'direction', sub: { view: 'direction-advanced' } })
    })
    await page.locator('[data-direction-advanced]').waitFor()
    assert.equal(await page.locator('[data-direction-advanced] [data-setting="TICK_TIME"]').count(), 0)
    assert.equal(await page.locator('[data-direction-advanced]').getByText('Update rate', { exact: true }).count(), 0)
    assert.deepEqual(errors, [])
    console.log('PASS: controller polling visible at normal/minimum sizes, shared persistence, profile isolation, direct override link and no gyro polling control')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
