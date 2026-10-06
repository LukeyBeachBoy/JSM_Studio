const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/luker/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
const chunk = (tag, data) => { const size = Buffer.alloc(4); size.writeUInt32BE(data.length); return Buffer.concat([Buffer.from(tag), size, Buffer.from(data)]) }
const fixture = Buffer.concat([chunk('MThd', [0, 0, 0, 1, 1, 224]), chunk('MTrk', [0, 144, 69, 100, 0x83, 0x60, 128, 69, 0, 0, 144, 72, 100, 0x83, 0x60, 128, 72, 0, 0, 255, 47, 0])])
;(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1050, height: 850 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.JSM_TEST_URL || 'http://127.0.0.1:1420/?mock')
    await page.getByRole('button', { name: 'Keep them', exact: true }).click()
    await page.getByRole('button', { name: /^Preferences/ }).first().click()
    await page.getByRole('button', { name: 'Manage sounds…' }).click()
    const library = page.getByRole('dialog', { name: 'Your controller sounds', exact: true })
    assert.match(await library.locator('input[type=file]').getAttribute('accept'), /\.mid/)
    const name = process.argv[2] ? path.basename(process.argv[2], path.extname(process.argv[2])) : 'MIDI test'
    const data = process.argv[2] ? fs.readFileSync(process.argv[2]) : fixture
    await library.locator('input[type=file]').setInputFiles({ name: `${name}.mid`, mimeType: 'audio/midi', buffer: data })
    const editor = page.getByRole('dialog', { name: `Trim ${name}`, exact: true })
    await editor.getByRole('combobox', { name: 'Melody track' }).waitFor()
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/platform/desktopBridge.ts')).name
      const { desktopBridge } = await import(url)
      window.__midiPreviews = []
      window.__midiBuiltIns = []
      desktopBridge.previewControllerTones = async (tones, gain) => { window.__midiPreviews.push({ tones, gain }); return { success: true } }
      desktopBridge.playControllerSound = async (sound, gain, soundId) => { window.__midiBuiltIns.push({ sound, gain, soundId }); return { success: true } }
    })
    if (process.argv[2]) {
      await editor.getByRole('spinbutton', { name: 'Start (seconds)' }).fill('30')
      await editor.getByRole('spinbutton', { name: 'End (seconds)' }).fill('35')
    }
    const start = await editor.getByRole('spinbutton', { name: 'Start (seconds)' }).inputValue()
    const end = await editor.getByRole('spinbutton', { name: 'End (seconds)' }).inputValue()
    await editor.getByRole('button', { name: 'Play tones on PC' }).click()
    await editor.getByRole('button', { name: 'Stop preview' }).click()
    await editor.getByRole('button', { name: 'Preview on controller' }).click()
    await page.waitForFunction(() => window.__midiPreviews.length > 0)
    const preview = await page.evaluate(() => window.__midiPreviews[0])
    assert.ok(preview.tones.some(tone => tone.frequencyHz > 0))
    assert.ok(preview.tones.reduce((sum, tone) => sum + tone.durationMs, 0) <= 8000)
    assert.ok(preview.tones.filter(tone => tone.frequencyHz).every(tone => tone.durationMs >= 40))
    // Scrubbing to the very end must not collapse the selection: the length
    // is kept, and the window grows back on the way out.
    const positionSlider = editor.getByRole('slider', { name: 'Selection position' })
    await positionSlider.focus(); await page.keyboard.press('End'); await page.keyboard.press('Home')
    assert.equal(await editor.getByRole('spinbutton', { name: 'End (seconds)' }).inputValue(), end, 'the selection length survives a scrub to the end')
    // The track list opens above the dialog, every track in it.
    const trackCombo = editor.getByRole('combobox', { name: 'Melody track' })
    await trackCombo.click()
    const firstOption = page.getByRole('option').first()
    await firstOption.waitFor({ state: 'visible' })
    assert.ok(await firstOption.evaluate(node => { const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + 8, r.top + r.height / 2); return !!hit && (node === hit || node.contains(hit)) }), 'the option is the element under the pointer, not the dialog')
    await page.keyboard.press('Escape')
    await page.screenshot({ path: 'tmp/midi-controller-editor.png' })
    await editor.getByRole('button', { name: 'Save sound', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    const entry = library.locator('.sound-library-entry').filter({ hasText: name })
    await entry.getByRole('button', { name: 'Trim again' }).click()
    await editor.getByRole('combobox', { name: 'Melody track' }).waitFor()
    assert.equal(await editor.getByRole('spinbutton', { name: 'Start (seconds)' }).inputValue(), start)
    assert.equal(await editor.getByRole('spinbutton', { name: 'End (seconds)' }).inputValue(), end)
    const stored = await page.evaluate(async name => { const url = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/platform/desktopBridge.ts')).name; const { desktopBridge } = await import(url); return (await desktopBridge.soundLibraryList()).find(entry => entry.name === name) }, name)
    assert.equal(stored.sourceFormat, 'midi'); assert.ok(stored.midiTrack)
    assert.deepEqual(errors, [])
    console.log(`PASS: MIDI upload, recommended track, actuator tuning, scrub-safe selection, visible track list, save and reopen (${name})`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exit(1) })
