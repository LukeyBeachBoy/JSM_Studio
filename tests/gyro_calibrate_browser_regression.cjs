// Console v2 (P5): Recalibrate (GyroCalibrate). "Aim drifts when still ▸ Run" opens it and starts
// CALIBRATE_GYRO; the screen follows the mapper's own progress (telemetry gyroCal: waiting, then
// measuring, then done) with a ring, the live movement and the steps; "Wait before measuring" and
// "Measure for" write GYRO_CALIBRATION_DELAY / _TIME for this configuration (never as a held chord);
// the stop-and-keep-the-old-one control says why it can't cancel. Mock desktop, no hardware.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')

;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click().catch(() => {})
    await page.locator('[data-home-continue]').click()
    await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
    await page.locator('[data-gyro-front]').waitFor()
    // The front's "Aim drifts when still" row: Run opens Recalibrate and starts a run.
    await page.locator('[data-gyro-front] button').filter({ hasText: /^Aim drifts when still/ }).click()
    const screen = page.locator('[data-subpage] [data-recalibrate]')
    await screen.waitFor()
    // The mock mapper waits 1 s, then measures for 5 s (src/dev/mockDesktop.ts), as the real one reports it.
    await page.waitForFunction(() => document.querySelector('[data-recalibrate]')?.getAttribute('data-phase') === '1', null, { timeout: 4000 }).catch(() => {})
    await page.waitForFunction(() => document.querySelector('[data-recalibrate]')?.getAttribute('data-phase') === '2')
    await screen.getByText('Keep it still', { exact: false }).first().waitFor()
    assert.match(await screen.innerText(), /seconds left · keep it still/)
    assert.match(await screen.innerText(), /Movement now/)
    assert.match(await screen.innerText(), /Drift found so far\s*\n?\s*Not reported/)
    // No stop command exists in the mapper: the control says so instead of doing nothing.
    const stop = screen.locator('[data-cal-stop]')
    assert.equal(await stop.getAttribute('aria-disabled'), 'true')
    assert.match(await stop.getAttribute('data-reason'), /no stop command/)
    await page.waitForFunction(() => document.querySelector('[data-recalibrate]')?.getAttribute('data-phase') === '0', null, { timeout: 12000 })
    assert.match(await screen.innerText(), /calibrated/)
    // Start over runs it again.
    await page.waitForTimeout(600) // the status (calibrating: false) reaches the app a beat after the phase ends
    await screen.locator('[data-cal-restart]').click()
    await page.waitForFunction(() => ['1', '2'].includes(document.querySelector('[data-recalibrate]')?.getAttribute('data-phase')))
    // The schedule for the next run (editable while one runs): written for this configuration, from the Studio defaults until set.
    const row = label => screen.locator('[role="slider"]').filter({ hasText: new RegExp('^' + label) }).first()
    const time = row('Measure for')
    assert.match(await time.getAttribute('aria-valuetext'), /^Default · /)
    await time.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await time.getAttribute('aria-valuetext'), '5.5 s')
    const delay = row('Wait before measuring')
    await delay.focus(); await page.keyboard.press('ArrowRight')
    assert.equal(await delay.getAttribute('aria-valuetext'), '0.5 s')
    // The auto-calibration switch is global, and the firmware's own re-centring has a way to Settings.
    assert.equal(await screen.locator('[role="switch"]').first().getAttribute('data-setting'), 'AUTO_CALIBRATE_GYRO')
    assert.equal(await screen.locator('[data-controller-settings]').count(), 1)
    await screen.screenshot({ path: 'tmp/gyro-recalibrate.png' })
    await page.keyboard.press('Escape')
    await page.locator('[data-subpage]').waitFor({ state: 'detached' })
    assert.deepEqual(errors, [])
    console.log('PASS: Recalibrate follows the mapper\'s waiting and measuring phases, says why it cannot stop a run, and writes the schedule for the next one')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
