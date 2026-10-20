const assert = require('node:assert/strict')
const fs = require('node:fs')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1420'
;(async () => {
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const go = async () => {
      await page.locator('[data-home-continue]').waitFor()
      const keep = page.getByRole('button', { name: 'Keep them', exact: true })
      if (await keep.isVisible()) await keep.click()
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'startup' })))
    }
    await page.goto(`${base}/?mock&update&onboarding`)
    const intro = page.getByRole('dialog', { name: "You're in control of permissions" })
    await intro.waitFor()
    assert.match(await intro.innerText(), /stays off unless you enable it separately/)
    await intro.getByRole('button', { name: 'Get started', exact: true }).click()
    await go()
    const signIn = page.getByRole('switch', { name: /^Controller input on the Windows lock screen/ })
    const admin = page.getByRole('switch', { name: /^Request admin on launch/ })
    const checked = async (node, value) => {
      await page.waitForFunction(([name, state]) => [...document.querySelectorAll('[role="switch"]')].some(el => el.textContent.startsWith(name) && el.getAttribute('aria-checked') === state), [await node.locator('[data-caption-label]').innerText(), String(value)])
    }
    await checked(signIn, false); await checked(admin, false)
    await signIn.click()
    const confirm = page.getByRole('dialog', { name: 'Allow controller input on the lock screen?' })
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await checked(signIn, false)
    await signIn.click()
    await confirm.getByRole('button', { name: 'Enable Windows sign-in input', exact: true }).click()
    await checked(signIn, true)
    await admin.click(); await checked(admin, true)
    await page.reload(); await go()
    await checked(signIn, true) // admin save must preserve independent consent
    await signIn.click(); await checked(signIn, false)
    await admin.click(); await checked(admin, false)
    await page.reload(); await go()
    await checked(signIn, false)
    await page.evaluate(() => { window.__externalUrl = null; window.electronAPI.openExternal = async url => { window.__externalUrl = url } })
    await page.getByRole('button', { name: /^Browse all releases/ }).click()
    await page.waitForFunction(() => window.__externalUrl === 'https://github.com/LukeyBeachBoy/JSM_Studio/releases')
    await page.getByText(/Update checks contact GitHub for stable releases/).waitFor()
    await page.evaluate(() => { window.electronAPI.installAppUpdate = async () => { throw new Error('Browser unavailable') } })
    const banner = page.locator('[role="status"][data-phase]')
    await banner.getByRole('button', { name: 'View release', exact: true }).click()
    await banner.getByText('Could not open the release page', { exact: true }).waitFor()
    await page.evaluate(() => { window.__releaseOpened = 0; window.electronAPI.installAppUpdate = async () => { window.__releaseOpened++ } })
    await banner.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.waitForFunction(() => window.__releaseOpened === 1)
    await banner.getByText('Release page opened in your browser. JSM Evolved stays running.', { exact: true }).waitFor()
    assert.equal(await page.getByText('Installing update', { exact: true }).count(), 0)
    await banner.getByRole('button', { name: 'Later', exact: true }).click()
    await signIn.scrollIntoViewIfNeeded()
    fs.mkdirSync('tmp/reddit-rc', { recursive: true })
    await page.screenshot({ path: 'tmp/reddit-rc/windows-sign-in.png' })
    await page.setViewportSize({ width: 900, height: 600 })
    await signIn.scrollIntoViewIfNeeded()
    await signIn.click()
    await confirm.waitFor()
    assert.ok(await confirm.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }), 'confirmation fits minimum window')
    await page.screenshot({ path: 'tmp/reddit-rc/sign-in-confirmation-900.png', animations: 'disabled' })
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await signIn.click()
    await confirm.getByRole('button', { name: 'Enable Windows sign-in input', exact: true }).click()
    await checked(signIn, true)
    await admin.click(); await checked(admin, true)
    await page.getByRole('button', { name: /Reset everything to defaults…/ }).click()
    const reset = page.getByRole('alertdialog', { name: 'Reset everything to defaults?' })
    await Promise.all([
      page.waitForEvent('load'),
      reset.getByRole('button', { name: /^Reset everything/ }).click(),
    ])
    await go()
    await checked(signIn, false); await checked(admin, false)
    const fresh = await browser.newPage()
    await fresh.addInitScript(() => {
      let api
      Object.defineProperty(window, 'electronAPI', {
        configurable: true,
        get: () => api,
        set: value => {
          api = value
          const list = api.listLibraryProfiles
          api.listLibraryProfiles = async () => ['Windows Sign-in', ...await list()]
          const load = api.loadLibraryProfile
          api.loadLibraryProfile = async name => name === 'Windows Sign-in'
            ? { name, content: 'RESET_MAPPINGS\nS = SPACE\n' }
            : load(name)
        },
      })
    })
    await fresh.goto(`${base}/?mock`)
    await fresh.locator('[data-home-continue]').waitFor()
    const shelf = fresh.getByRole('region', { name: 'Your games' })
    await shelf.getByText('3 configurations', { exact: true }).waitFor()
    assert.equal(await shelf.getByText('Windows Sign-in', { exact: true }).count(), 0, 'lock-screen reference is not a suggested game')
    await fresh.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'startup' })))
    await fresh.getByRole('button', { name: /^No newer stable release/ }).waitFor()
    await fresh.close()
    assert.deepEqual(errors, [])
    console.log('PASS: first-run defaults, explicit consent/cancel, persistence, independent admin setting, updater failure/retry, stable release wording, preview link, game suggestions, minimum window')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
