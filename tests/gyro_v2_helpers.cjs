// Shared steps for the console v2 Gyro browser tests (design/console-v2,
// Gyro*.dc.html; notes/GYRO.md): the front's three questions, Fine-tune and its
// sub-pages are found by what they say and by their data-* markers.
const assert = require('node:assert/strict')

/** Answer the start-up prompts every fresh profile can show. */
async function prepare(page) {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Controller power-on sound', exact: true }), async () => {
    await page.getByRole('button', { name: 'Keep them', exact: true }).click()
  })
  await page.addInitScript(() => { document.hasFocus = () => true })
}

async function openGyro(page) {
  await page.locator('[data-home-continue]').click()
  await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
  await page.locator('[data-gyro-front]').waitFor()
}

/** The sub-page on top (Fine-tune, Advanced, Tilt…). */
const top = page => page.locator('[data-subpage]').last()

async function openFineTune(page, group = 'speed') {
  await page.locator('[data-gyro-fine-tune]').click()
  await top(page).locator('[data-gyro-fine-tune-page]').waitFor()
  await top(page).locator(`button[data-group="${group}"]`).click()
  await top(page).locator(`[data-gyro-fine-tune-page][data-group="${group}"]`).waitFor()
}

/** A row on the top sub-page that opens something, by the start of its label. */
async function openRow(page, label) {
  const row = top(page).locator('button').filter({ hasText: label }).first()
  await row.click()
  await page.waitForTimeout(250)
}

/** The rail part (Steadiness ▸ Advanced, Tilt, Stick settings) by its label. */
async function openPart(page, label) {
  await top(page).locator('nav[aria-label="Groups"] button').filter({ hasText: label }).first().click()
  await page.waitForTimeout(200)
}

// Rows are found by how their text starts: the label first, then (with Show
// config names on) its JSM key, its hint and its value.
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const starts = label => new RegExp('^\\s*' + escape(label))
const valueRow = (scope, label) => scope.locator('[role="slider"]').filter({ hasText: starts(label) }).first()
const switchRow = (scope, label) => scope.locator('[role="switch"]').filter({ hasText: starts(label) }).first()
const segmentRow = (scope, label) => scope.locator('[role="radiogroup"]').filter({ hasText: starts(label) }).first()

/** Step a value row with the arrows (◂ ▸), `times` steps. */
async function step(row, direction, times = 1) {
  await row.focus()
  for (let i = 0; i < times; i++) await row.press(direction > 0 ? 'ArrowRight' : 'ArrowLeft')
}

/** A on a value row: type an exact number on the on-screen keyboard. */
async function typeValue(row, text) {
  const page = row.page()
  await row.focus()
  await row.press('Enter')
  await page.locator('[role="dialog"][aria-label^="Type:"]').waitFor()
  for (let i = 0; i < 16; i++) await page.keyboard.press('Backspace')
  await page.keyboard.type(String(text))
  await page.keyboard.press('Enter')
  await page.locator('[role="dialog"][aria-label^="Type:"]').waitFor({ state: 'detached' })
}

/** Choose a named segment of a SegmentedRow. */
async function segment(row, label) {
  await row.locator('button').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click()
}

async function save(page, pattern) {
  await page.keyboard.press('Control+s')
  if (pattern) await page.waitForFunction(source => new RegExp(source, 'm').test(window.__paritySaved ?? window.__saved ?? ''), pattern.source)
}

/**
 * What `key` is set to, the way the mapper reads it: edits land in the
 * connected controller's own layout ("# @controller type-24 KEY = …", console
 * v2 V4) when one is connected, else the shared line.
 */
function eff(text, key) {
  const lines = text.split(/\r?\n/)
  const pick = prefix => lines.filter(line => line.startsWith(prefix)).pop()?.slice(prefix.length)
  return pick(`# @controller type-24 ${key} = `) ?? pick(`${key} = `)
}

const valueText = async row => (await row.getAttribute('aria-valuetext')) ?? ''


// ---- Template inheritance (template_override_roundtrip, gyro_template_inheritance).
// A configuration that imports FPS Template: Speed ▸ Advanced ▸ Speeds (slow and
// fast speed, switch points) and When is gyro on? show inherited values with
// their origin ("From FPS Template"), an edit says "Changed", and setting a value
// back by hand follows the template again.

/** Back to the Gyro front: close every sub-page, then make sure the Gyro tab is showing. */
async function gyroFront(page) {
  for (let n = 0; n < 6 && (await page.locator('[data-subpage]').count()) > 0; n++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200) }
  await page.locator('button.page-tab').filter({ hasText: /^Gyro$/ }).click()
  await page.locator('[data-gyro-front]').waitFor()
}

/** Open Speed ▸ Advanced on one part ("Speeds", "Shape", "Game & lean") and run `fn` there. */
async function inSpeedParts(page, part, fn) {
  await gyroFront(page)
  await page.locator('[data-gyro-fine-tune]').click()
  await top(page).locator('button[data-group="speed"]').click()
  await openRow(page, 'Advanced')
  await top(page).locator('[role="tab"]').filter({ hasText: new RegExp('^' + part) }).click()
  const scope = top(page).locator('[data-speed-advanced]')
  const result = await fn(scope)
  await gyroFront(page)
  return result
}

/** The Steadiness ▸ Advanced part rows ("Ignore jitter", "Smoothing"…). */
async function inSteadinessPart(page, part, fn) {
  await gyroFront(page)
  await page.locator('[data-gyro-fine-tune]').click()
  await top(page).locator('button[data-group="steadiness"]').click()
  await openRow(page, 'Advanced')
  await openPart(page, part)
  const result = await fn(top(page))
  await gyroFront(page)
  return result
}

async function inWhenOn(page, fn) {
  await gyroFront(page)
  await page.locator('[data-gyro-front] section').first().locator('button').last().click()
  await top(page).locator('[data-when-on]').waitFor()
  const result = await fn(top(page))
  await gyroFront(page)
  return result
}

const tagOf = async row => (await row.innerText()).match(/(From [^\n]+|Changed[^\n]*|Default)/)?.[1] ?? 'none'

/**
 * `origin: false` skips the origin tags: with a controller connected the page reads its own text
 * through the controller projection (useKeymapConfig), which already contains the resolved
 * template, so every inherited value reads "Changed from …" (pre-existing since V4).
 */
async function gyroInheritedChecks(page, { origin = true } = {}) {
  await inSpeedParts(page, 'Speeds', async scope => {
    for (const [label, value] of [['Slow speed', '2×'], ['Slow speed, up/down', '1.5×'], ['Fast speed', '4×'], ['Fast speed, up/down', '3×'], ['Slow until', '5 °/s'], ['Fast from', '75 °/s']]) {
      assert.equal(await valueText(valueRow(scope, label)), value, `${label} shows the template's value`)
    }
    if (origin) for (const label of ['Slow speed', 'Fast speed', 'Slow until', 'Fast from']) assert.equal(await tagOf(valueRow(scope, label)), 'From FPS Template', `${label} is marked as inherited`)
  })
  await inWhenOn(page, async scope => {
    const activation = segmentRow(scope, 'Gyro is on')
    assert.equal(await activation.locator('button[data-current="true"]').innerText(), 'Unless I hold')
    if (origin) assert.equal(await tagOf(activation), 'From FPS Template')
    await scope.locator('[data-condition="0"]').waitFor()
  })
  await inSteadinessPart(page, 'Ignore jitter', async scope => {
    assert.equal(await valueText(valueRow(scope, 'Ignore turns slower than')), '1 °/s')
    if (origin) assert.equal(await tagOf(valueRow(scope, 'Ignore turns slower than')), 'From FPS Template')
  })
  await inSteadinessPart(page, 'Smoothing', async scope => {
    assert.equal(await valueText(valueRow(scope, 'Smooth below this speed')), '3 °/s')
    assert.equal(await valueText(valueRow(scope, 'Smoothing time')), '0.125 s')
    if (origin) {
      assert.equal(await tagOf(valueRow(scope, 'Smooth below this speed')), 'From FPS Template')
      assert.equal(await tagOf(valueRow(scope, 'Smoothing time')), 'From FPS Template')
    }
  })
}

async function gyroOverrideEdits(page, { origin = true } = {}) {
  await inSpeedParts(page, 'Speeds', async scope => {
    await typeValue(valueRow(scope, 'Slow speed'), 3)
    assert.equal(await valueText(valueRow(scope, 'Slow speed, up/down')), '1.5×', 'editing X must keep the inherited Y, not zero it')
    await typeValue(valueRow(scope, 'Fast from'), 60)
    if (origin) for (const label of ['Slow speed', 'Fast from']) assert.match(await tagOf(valueRow(scope, label)), /^Changed/, `${label} is an override`)
  })
  await inWhenOn(page, async scope => {
    await segment(segmentRow(scope, 'Gyro is on'), 'While I hold')
    if (origin) assert.match(await tagOf(segmentRow(scope, 'Gyro is on')), /^Changed/)
  })
}

async function gyroRestoreEdits(page, { origin = true } = {}) {
  await inSpeedParts(page, 'Speeds', async scope => {
    await typeValue(valueRow(scope, 'Slow speed'), 2)
    await typeValue(valueRow(scope, 'Fast from'), 75) // the template says 75.0
    if (origin) for (const label of ['Slow speed', 'Fast from']) assert.equal(await tagOf(valueRow(scope, label)), 'From FPS Template', `${label} follows the template again`)
  })
  await inWhenOn(page, async scope => {
    await segment(segmentRow(scope, 'Gyro is on'), 'Unless I hold')
    if (origin) assert.equal(await tagOf(segmentRow(scope, 'Gyro is on')), 'From FPS Template')
  })
}

/** Type the up/down slow speed (a draft typed and set back must not read as a change). */
async function gyroSetSlowY(page, value) {
  await inSpeedParts(page, 'Speeds', async scope => typeValue(valueRow(scope, 'Slow speed, up/down'), value))
}
async function gyroSlowYOrigin(page) {
  return inSpeedParts(page, 'Speeds', async scope => tagOf(valueRow(scope, 'Slow speed')))
}

module.exports = {
  assert, prepare, openGyro, top, openFineTune, openRow, openPart, valueRow, switchRow, segmentRow, step, segment, save, valueText, eff, typeValue,
  gyroFront, inSpeedParts, inSteadinessPart, inWhenOn, tagOf, gyroInheritedChecks, gyroOverrideEdits, gyroRestoreEdits, gyroSetSlowY, gyroSlowYOrigin,
}
