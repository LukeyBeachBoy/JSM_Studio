// Credits: Home discovery, shell/controller navigation, attribution links,
// desktop bridge success/failure, translations and responsive layout.
// Renderer-only mock validation; does not launch the mapper or physical hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const BASE = (process.env.JSM_TEST_URL || 'http://127.0.0.1:1420').replace(/\/$/, '') + '/?mock'

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const [width, height, language, theme] of [[1440,900,'en','dark'], [1280,800,'en','light'], [1024,720,'en','dark'], [800,720,'zh-CN','light']]) {
      const page = await browser.newPage({ viewport: { width, height } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      await page.addInitScript(({ language, theme }) => {
        localStorage.setItem('jsm-language', language)
        localStorage.setItem('jsm-theme', theme)
      }, { language, theme })
      await page.goto(BASE)
      await page.locator('[data-home-continue]').waitFor({ timeout: 30000 })
      const keep = page.getByRole('button', { name: 'Keep them', exact: true })
      if (await keep.isVisible()) await keep.click()
      const title = language === 'en' ? 'About & credits' : '关于与致谢'
      // Console v2 (V6): Home's Settings door, then the rail's last category.
      await page.locator('section[aria-labelledby="home-studio-title"]').getByRole('button', { name: /^(Settings|设置)/ }).click()
      if (width >= 1024) await page.locator('.section-list .section-item').filter({ hasText: title }).click()
      else await page.evaluate(() => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'credits' })))
      await page.locator('.page-header__title').filter({ hasText: title }).waitFor()
      const first = page.locator('a[href="https://github.com/JibbSmart/JoyShockMapper"]')
      await first.waitFor()
      // Console v2 (SettingsAbout): people and featured projects on the page, the rest behind And N more.
      assert.equal(await page.locator('main section[aria-labelledby^="credits-"]').count(), 2)
      assert.equal(await page.locator('main a[href]').count(), 13)
      assert.match(await page.locator('main').innerText(), /Version \d+\.\d+\.\d+ · /)
      await page.locator('[data-credits-more]').click()
      await page.locator('[data-subpage]').waitFor()
      assert.ok(await page.locator('[data-subpage] a[href]').count() >= 10, 'the long tail is behind And N more')
      await page.keyboard.press('Escape')
      await page.locator('[data-subpage]').waitFor({ state: 'detached' })
      assert.match(await page.locator('main').innerText(), /Evan McLean/)
      assert.match(await page.locator('main').innerText(), /hotuns/)
      assert.match(await page.locator('main').innerText(), language === 'en' ? /not an exhaustive list/ : /不是完整名单/)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal window overflow')
      assert.equal(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'no content overflow')
      const gridColumns = await page.locator('main section[aria-labelledby="credits-people"] > div').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      assert.equal(gridColumns, width < 960 ? 1 : 2)
      if (language === 'en') {
        const tab = page.locator('.section-list .section-item').filter({ hasText: /^About & credits$/ })
        if (width >= 1280) {
          assert.equal(await tab.evaluate(el => { const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(); return r.left>=p.left-1 && r.right<=p.right+1 }), true, 'Credits tab is not clipped')
        }
        // LT/RT step the categories; LB/RB (PgUp/PgDn) do nothing in Settings.
        await page.keyboard.press('[')
        await page.locator('.page-header__title').filter({ hasText: 'Troubleshooting log' }).waitFor()
        await page.keyboard.press(']')
        await page.locator('.page-header__title').filter({ hasText: 'About & credits' }).waitFor()
        await page.evaluate(() => {
          window.__creditLinks = []
          window.electronAPI.openExternal = async url => { window.__creditLinks.push(url) }
        })
        await first.click()
        assert.deepEqual(await page.evaluate(() => window.__creditLinks), ['https://github.com/JibbSmart/JoyShockMapper'])
        await page.evaluate(() => { window.electronAPI.openExternal = async () => { throw Error('simulated link failure') } })
        await first.click()
        await page.getByRole('alert').filter({ hasText: 'The link could not be opened' }).waitFor()
        await page.evaluate(() => { window.electronAPI.openExternal = async () => {} })
        await first.click()
        assert.equal(await page.getByRole('alert').filter({ hasText: 'The link could not be opened' }).count(), 0)
        await first.focus()
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => document.activeElement.href), 'https://github.com/Electronicks/JoyShockMapper')
        await first.focus()
        await page.evaluate(() => window.__pad.press(['DOWN']))
        // Two columns: Down from Jibb lands on Evan, the row below.
        assert.equal(await page.evaluate(() => document.activeElement.href), 'https://github.com/evan1mclean/JSM_custom_curve')
        await page.evaluate(() => window.__pad.press(['E']))
        await page.locator('[data-home-continue]').waitFor()
      }
      assert.deepEqual(errors, [])
      console.log('PASS Credits ' + width + 'x' + height + ' ' + language + ' ' + theme)
      await page.close()
    }
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
