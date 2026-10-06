// Older renderer regressions start at the editor and predate the firmware
// onboarding dialog. Dismiss only that mock dialog on actionability checks.
// Tests of onboarding itself opt out; never used by the production app.
if (process.env.JSM_DISMISS_FIRST_CONNECTION === '1') {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
  const launch = chromium.launch.bind(chromium)
  chromium.launch = async (...args) => {
    const browser = await launch(...args)
    const newPage = browser.newPage.bind(browser)
    browser.newPage = async (...options) => {
      const page = await newPage(...options)
      await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
        await page.getByRole('button', { name: 'Keep them', exact: true }).click()
      })
      // Scripted controller presses use evaluate(), which does not run locator
      // actionability handlers. Settle onboarding before those presses too.
      const goto = page.goto.bind(page)
      page.goto = async (...args) => {
        const response = await goto(...args)
        const dialog = page.getByRole('dialog', { name: 'Controller power-on sound', exact: true })
        if (await dialog.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false)) {
          // A locator operation here would run the same locator handler, dismiss
          // the dialog, then wait forever for its now-removed button. This
          // isolated fixture uses the React button's click route once.
          await page.evaluate(() => {
            const keep = [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === 'Keep them')
            if (!keep) throw new Error('Firmware onboarding has no Keep them button')
            keep.click()
          })
          await dialog.waitFor({ state: 'hidden' })
        }
        return response
      }
      return page
    }
    return browser
  }
}
