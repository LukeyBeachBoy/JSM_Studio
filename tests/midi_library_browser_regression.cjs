// The sound library page (console v2, SoundLibrary.dc.html) with a MIDI file:
// upload, the recommended track and its stepper, play on the PC, preview on the
// controller within the tone limits, the whole-selection scrub that keeps its
// length, save, and reopening at the saved trim.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const chunk = (tag, data) => { const size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([Buffer.from(tag), size, Buffer.from(data)]) }
const fixture = Buffer.concat([chunk('MThd', [0, 0, 0, 1, 1, 224]), chunk('MTrk', [0, 144, 69, 100, 0x83, 0x60, 128, 69, 0, 0, 144, 72, 100, 0x83, 0x60, 128, 72, 0, 0, 255, 47, 0])])
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click({ timeout: 8000 }).catch(() => {})
    await page.locator('.app-shell').waitFor()
    await page.evaluate(() => window.dispatchEvent(new Event('jsm:open-light-sounds')))
    await page.getByRole('dialog', { name: /Controller light & sounds$/ }).getByRole('button', { name: /Your sounds/ }).click()
    const library = page.getByRole('dialog', { name: /Sound library$/ })
    await library.waitFor()
    assert.match(await library.locator('input[type=file]').getAttribute('accept'), /\.mid/)
    const name = process.argv[2] ? path.basename(process.argv[2], path.extname(process.argv[2])) : 'MIDI test'
    const data = process.argv[2] ? fs.readFileSync(process.argv[2]) : fixture
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/platform/desktopBridge.ts')).name
      const { desktopBridge } = await import(url)
      window.__midiPreviews = []
      desktopBridge.previewControllerTones = async (tones, gain) => { window.__midiPreviews.push({ tones, gain }); return { success: true } }
    })
    await library.locator('input[type=file]').setInputFiles({ name: `${name}.mid`, mimeType: 'audio/midi', buffer: data })
    const editor = library.getByRole('region', { name })
    const track = editor.getByRole('slider', { name: 'Melody track' })
    await track.waitFor()
    assert.match(await track.getAttribute('data-caption'), /Recommended/, 'the recommended track is marked')
    assert.match(await editor.innerText(), /melody track 1 of 1/)
    const trim = editor.getByRole('group', { name: 'Trim' })
    const values = async () => (await trim.innerText()).match(/Start\s*([\d.]+) s[\s\S]*End\s*([\d.]+) s/).slice(1)
    const [start, end] = await values()
    await editor.getByRole('button', { name: 'Play tones on PC' }).click()
    await editor.getByRole('button', { name: 'Stop preview' }).click()
    await editor.getByRole('button', { name: /Preview on controller/ }).click()
    await page.waitForFunction(() => window.__midiPreviews.length > 0)
    const preview = await page.evaluate(() => window.__midiPreviews[0])
    assert.ok(preview.tones.some(tone => tone.frequencyHz > 0))
    assert.ok(preview.tones.reduce((sum, tone) => sum + tone.durationMs, 0) <= 8000)
    assert.ok(preview.tones.filter(tone => tone.frequencyHz).every(tone => tone.durationMs >= 40))
    // Moving the whole selection to the end and back keeps its length.
    const move = editor.locator('[data-selection-position]')
    await move.focus()
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowRight')
    for (let i = 0; i < 40; i++) await page.keyboard.press('ArrowLeft')
    const [, endAfter] = await values()
    assert.equal(Number(endAfter) - Number((await values())[0]), Number(end) - Number(start), 'the selection length survives a scrub to the end')
    await page.screenshot({ path: 'tmp/midi-controller-editor.png' })
    await editor.getByRole('button', { name: /Save sound/ }).click()
    await library.locator('[data-sound-id]').filter({ hasText: name }).filter({ hasText: /MIDI · .* ready/ }).waitFor()
    // Reopen: the saved trim comes back.
    await library.locator('[data-sound-id]').first().click()
    await library.locator('[data-sound-id]').filter({ hasText: name }).click()
    await library.getByRole('region', { name }).getByRole('group', { name: 'Trim' }).waitFor()
    const [startAgain, endAgain] = (await library.getByRole('region', { name }).getByRole('group', { name: 'Trim' }).innerText()).match(/Start\s*([\d.]+) s[\s\S]*End\s*([\d.]+) s/).slice(1)
    assert.equal(Number(endAgain) - Number(startAgain), Number(end) - Number(start))
    const stored = await page.evaluate(async name => { const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/platform/desktopBridge.ts')).name; const { desktopBridge } = await import(url); return (await desktopBridge.soundLibraryList()).find(entry => entry.name === name) }, name)
    assert.equal(stored.sourceFormat, 'midi'); assert.ok(stored.midiTrack)
    assert.deepEqual(errors, [])
    console.log(`PASS: MIDI upload, recommended track, PC and controller preview, scrub-safe selection, save and reopen (${name})`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
