// November UX audit integration: renderer/mock evidence, never hardware writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1428'
const out = path.resolve('tmp/ux-audit-final')
fs.mkdirSync(out, { recursive: true })
const routes = ['home', 'overview', 'buttons', 'joysticks', 'triggers', 'touchpad', 'gyro', 'virtualMenus', 'layers', 'configurations', 'bases', 'associations', 'settings', 'globalChords', 'slots', 'timing', 'deviceVisibility', 'appearance', 'startup', 'ai', 'help', 'debugConsole', 'credits']
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error' && /Cannot update a component|Warning:|Uncaught/.test(message.text())) errors.push(message.text()) })
    await page.addInitScript(() => { document.hasFocus = () => true })
    await page.goto(`${base}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 4000 }).catch(() => {})
    await page.locator('[data-home-continue]').waitFor()
    const goto = async route => {
      await page.evaluate(route => window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: route })), route)
      await page.waitForTimeout(280)
    }
    const report = []
    for (const theme of ['dark', 'light']) for (const [width, height] of [[1440, 900], [900, 600]]) {
      await page.setViewportSize({ width, height })
      await goto('appearance')
      await page.getByRole('radio', { name: theme === 'light' ? /^Light/ : /^Dark/ }).click()
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      for (const route of routes) {
        await goto(route)
        const geometry = await page.evaluate(() => {
          const scroll = document.querySelector('.shell-scroll')
          const bar = document.querySelector('.titlebar')
          const tabs = [...document.querySelectorAll('.page-tab__label')].filter(label => label.checkVisibility())
          return { overflow: document.documentElement.scrollWidth - innerWidth, innerOverflow: scroll.scrollWidth - scroll.clientWidth,
            barOverflow: bar.scrollWidth - bar.clientWidth, top: scroll.scrollTop, labels: tabs.length,
            toolbarHeight: document.querySelector('.editor-toolbar')?.getBoundingClientRect().height ?? 0, theme: document.documentElement.dataset.theme,
          }
        })
        assert.equal(geometry.theme, theme, 'the chosen theme survives page changes')
        assert.ok(geometry.overflow <= 1 && geometry.innerOverflow <= 1 && geometry.barOverflow <= 1, `${theme} ${width} ${route}: ${JSON.stringify(geometry)}`)
        if (['overview', 'buttons', 'joysticks', 'triggers', 'touchpad', 'gyro', 'virtualMenus', 'layers'].includes(route)) assert.equal(geometry.labels, 8, 'all eight editor tab names remain visible')
        if (route === 'overview') {
          assert.equal(geometry.top, 0, 'Layout enters at its heading')
          assert.ok(geometry.toolbarHeight <= 48, 'layer and sources share one compact toolbar')
          const row = await page.locator('[data-overview-input]').first().boundingBox()
          assert.ok(row.y + row.height < height - 64, 'a full binding row is on the first screen')
        }
        if (route === 'settings' && width === 900) {
          const selector = await page.getByRole('combobox', { name: 'Settings category' }).boundingBox()
          assert.ok(selector.y < 110, 'compact Settings selector has no inherited sidebar padding band')
        }
        if (['home', 'overview', 'settings', 'triggers', 'appearance'].includes(route)) await page.screenshot({ path: path.join(out, `${theme}-${width}-${route}.png`) })
        const unnamed = await page.getByRole('button', { name: '', exact: true }).count()
        assert.equal(unnamed, 0, `${route} has an unnamed accessible button`)
        report.push({ route, theme, width, ...geometry })
      }
    }
    await goto('overview')
    await page.locator('[data-overview-input="L4"], [data-overview-input="LSL"]').first().click()
    await page.locator('.layout-inline-binding .sheet').waitFor()
    assert.equal(await page.locator('.page-tab[aria-current="page"]').innerText(), 'Layout', 'binding edits stay on Layout')
    await page.keyboard.press('Escape')
    await page.locator('.layout-inline-binding').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.page-tab[aria-current="page"]').innerText(), 'Layout')
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-overview-input') === 'LSL')
    await goto('buttons')
    await page.getByText('Configuration timing', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Timing for', exact: true }).waitFor()
    assert.equal(await page.getByRole('button', { name: '', exact: true }).count(), 0, 'all expanded timing controls have accessible names')
    await goto('joysticks')
    await page.locator('[role="radio"][data-value="LOOK"]').click()
    await page.locator('.state-button[data-state="unsaved"]').waitFor()
    for (const width of [1416, 1280, 900]) {
      await page.setViewportSize({ width, height: 808 })
      assert.equal(await page.locator('.page-tab__label:visible').count(), 8, 'unsaved status never hides navigation labels')
    }
    await page.keyboard.press('Control+s')
    await page.locator('.state-button[data-state="unsaved"]').waitFor({ state: 'detached' })
    await page.keyboard.press('Control+k')
    await page.getByRole('dialog', { name: 'Go to…' }).waitFor()
    await page.getByRole('searchbox', { name: 'Search pages, settings and configurations' }).fill('Press timing')
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: 'Press timing', exact: true }).waitFor()
    await page.keyboard.press('Control+Shift+f')
    await page.locator('[data-press-to-find-banner]').waitFor()
    await page.keyboard.press('Escape')
    await page.locator('[data-press-to-find-banner]').waitFor({ state: 'detached' })
    await goto('home')
    await page.getByRole('button', { name: 'Test it', exact: true }).click()
    await page.getByRole('region', { name: 'Test feedback' }).waitFor()
    await page.screenshot({ path: path.join(out, 'home-test-feedback.png') })
    await page.keyboard.press('Escape')
    await page.getByRole('region', { name: 'Test feedback' }).waitFor({ state: 'detached' })
    await page.setViewportSize({ width: 900, height: 600 })
    for (const state of ['mapperdown', 'configerror']) {
      await page.goto(`${base}/?mock&${state}`)
      await page.locator('[data-home-continue]').waitFor()
      if (state === 'mapperdown') await page.getByRole('button', { name: 'Restart mapper', exact: true }).waitFor()
      else {
        await page.locator('section[aria-label="Configuration errors"]').waitFor()
        const banner = await page.locator('section[aria-label="Configuration errors"]').boundingBox()
        assert.ok(banner.y >= 64 && banner.y + banner.height < 250, 'Home error and fix remain above the fold')
      }
      await page.screenshot({ path: path.join(out, `${state}-home.png`) })
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
    assert.deepEqual(errors, [])
    console.log(`PASS: ${report.length} route/theme/size combinations; Layout edit, palette, global find, test feedback, mapper/error recovery; no React render warning`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
