// Renderer audit: real controls and mock desktop services; no hardware writes.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const base = process.env.JSM_TEST_URL || 'http://127.0.0.1:1421'
const out = path.resolve('tmp/ui-ux-audit')
fs.mkdirSync(out, { recursive: true })

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${base}/?mock`)
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 5000 }).catch(() => {})
    await page.locator('[data-home-continue]').waitFor()
    await page.screenshot({ path: path.join(out, 'home.png') })
    await page.locator('[data-home-continue]').click()
    const controls = ['Overview', 'Buttons', 'D-Pad', 'Triggers', 'Joysticks', 'Trackpads', 'Virtual menus', 'Gyro', 'Layers']
    const studio = ['Configurations', 'Associations', 'Global chords', 'Press timing & polling', 'AI assistant', 'Device visibility', 'Appearance', 'Preferences', 'Documentation', 'Credits', 'Debug console']
    const report = []
    for (const width of [1440, 1024, 760]) {
      await page.setViewportSize({ width, height: 900 })
      for (const name of [...controls, ...studio]) {
        await page.getByRole('button', { name: 'Home', exact: true }).first().click()
        if (controls.includes(name)) {
          await page.locator('[data-home-continue]').click()
          // Compact widths abbreviate tabs to icons with accessible names.
          if (width >= 900) await page.getByRole('button', { name, exact: true }).first().click()
          else {
            await page.locator('.page-tabs__drawer-button').click()
            await page.locator('.shell-drawer').getByRole('button', { name, exact: true }).first().click()
          }
        } else {
          await page.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click()
        }
        await page.getByText('Loading...', { exact: true }).waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
        await page.waitForTimeout(300)
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        await page.screenshot({ path: path.join(out, `${width}-${slug}.png`) })
        if (width === 1440) {
          await page.locator('.shell-scroll').evaluate(el => { el.scrollTop = el.scrollHeight })
          await page.waitForTimeout(150)
          await page.screenshot({ path: path.join(out, `${width}-${slug}-bottom.png`) })
        }
        const findings = await page.evaluate(() => ({
          width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth,
          innerOverflow: document.querySelector('.shell-scroll').scrollWidth - document.querySelector('.shell-scroll').clientWidth,
          shellRight: document.querySelector('.shell-scroll').getBoundingClientRect().right,
          wide: [...document.querySelectorAll('.shell-page *')].filter(el => el.checkVisibility() && el.getBoundingClientRect().right > innerWidth + 2).slice(0, 8).map(el => ({ class: el.className, width: el.getBoundingClientRect().width })),
          text: document.querySelector('.shell-page')?.textContent?.trim(),
          unnamed: [...document.querySelectorAll('button')].filter(el => el.checkVisibility() && !el.textContent.trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).map(el => el.className),
        }))
        report.push({ page: name, width, ...findings })
        console.log(width, name, 'overflow', findings.overflow, 'inner', findings.innerOverflow, 'unnamed', findings.unnamed.length)
        if (findings.innerOverflow > 0) console.log(JSON.stringify(findings.wide))
      }
    }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
    assert.ok(report.every(item => item.overflow === 0), 'no page overflows horizontally')
    assert.ok(report.every(item => item.innerOverflow <= 1), 'no content is clipped inside its scroll container')
    assert.ok(report.every(item => item.shellRight <= item.width + 1), 'the grid track stays inside the window')
    assert.ok(report.every(item => item.unnamed.length === 0), 'every visible button has a name')
    assert.deepEqual(errors, [])
    console.log('PASS: all 21 pages render; 20 editing/Studio pages at 1440, 1024 and 760px, without horizontal overflow, unnamed buttons or page errors')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
