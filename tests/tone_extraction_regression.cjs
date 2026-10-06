const assert = require('node:assert/strict')
// Arrays from the converters' vm realm are compared by value, not identity.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript')

// The extractor and the arrangement it shares with the MIDI converter,
// transpiled one file at a time; `require` inside them resolves to the module
// just built.
const SRC = path.join(__dirname, '../JSM_GUI/jsm_gui_tauri/src/utils')
const loadTs = (name, modules) => {
  const source = fs.readFileSync(path.join(SRC, `${name}.ts`), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const api = {}
  vm.runInNewContext(compiled, { exports: api, require: id => { const found = modules[id.replace(/^\.\//, '')]; if (!found) throw new Error(`no module ${id}`); return found } }, { filename: `${name}.js` })
  return api
}
const arrangement = loadTs('toneArrangement', {})
const extracted = loadTs('toneExtraction', { toneArrangement: arrangement })

// The extracted melody is moved by whole octaves into the actuators' range, so
// a detected pitch is judged by its note, not its octave, and the result has
// to sit inside the band.
const sameNote = (actual, expected) => { const cents = ((1200 * Math.log2(actual / expected)) % 1200 + 1200) % 1200; return Math.min(cents, 1200 - cents) < 60 }
const inBand = tones => tones.every(tone => tone.frequencyHz >= arrangement.CONTROLLER_PITCH_MIN_HZ && tone.frequencyHz <= arrangement.CONTROLLER_PITCH_MAX_HZ)

const rate = 16000
const sound = new Float32Array(Math.round(rate * 0.82))
for (let i = 0; i < sound.length; i++) {
  const time = i / rate
  const frequency = time < 0.35 ? 440 : time < 0.47 ? 0 : 660
  sound[i] = frequency ? Math.sin(2 * Math.PI * frequency * time) * 0.5 : 0
}
const tones = extracted.extractToneSequence(sound, rate, 0, 820)
const pitched = tones.filter(tone => tone.frequencyHz > 0)
assert.ok(pitched.length >= 2, JSON.stringify(tones))
assert.ok(sameNote(pitched[0].frequencyHz, 440), JSON.stringify(tones))
assert.ok(sameNote(pitched.at(-1).frequencyHz, 660), JSON.stringify(tones))
assert.ok(inBand(pitched), JSON.stringify(tones))
assert.ok(tones.some(tone => tone.frequencyHz === 0), JSON.stringify(tones))
assert.ok(tones.reduce((total, tone) => total + tone.durationMs, 0) <= 8000)
// Broadband noise, 55 Hz rumble and 4 kHz hiss should not replace the melody.
const noisy = new Float32Array(rate)
for (let i = 0; i < noisy.length; i++) {
  const time = i / rate
  const melody = time < 0.5 ? 392 : 523.25
  noisy[i] = 0.18 * Math.sin(2 * Math.PI * melody * time)
    + 0.3 * Math.sin(2 * Math.PI * 55 * time)
    + 0.12 * Math.sin(2 * Math.PI * 4000 * time)
}
const filtered = extracted.extractToneSequence(noisy, rate, 0, 1000).filter(tone => tone.frequencyHz > 0)
assert.ok(filtered.length >= 2, JSON.stringify(filtered))
assert.ok(sameNote(filtered[0].frequencyHz, 392), JSON.stringify(filtered))
assert.ok(sameNote(filtered.at(-1).frequencyHz, 523), JSON.stringify(filtered))
assert.ok(inBand(filtered), JSON.stringify(filtered))
assert.equal(Math.max(...filtered.map(tone => tone.gainDb)), 0)

// A quieter lead must remain the selected melody over a continuous bass.
const layered = new Float32Array(rate)
for (let i = 0; i < layered.length; i++) {
  const time = i / rate
  const lead = time < 0.5 ? 440 : 587.33
  layered[i] = 0.35 * Math.sin(2 * Math.PI * 130.81 * time)
    + 0.22 * Math.sin(2 * Math.PI * lead * time)
    + 0.12 * Math.sin(2 * Math.PI * lead * 2 * time)
}
const layeredTones = extracted.extractToneSequence(layered, rate, 0, 1000).filter(tone => tone.frequencyHz > 0)
assert.ok(layeredTones.some(tone => sameNote(tone.frequencyHz, 440) && tone.durationMs >= 100), JSON.stringify(layeredTones))
assert.ok(layeredTones.some(tone => sameNote(tone.frequencyHz, 587) && tone.durationMs >= 100), JSON.stringify(layeredTones))
assert.ok(inBand(layeredTones), JSON.stringify(layeredTones))

// A low melody (A3 -> E4) is lifted into the band, intervals intact: the two
// notes end up an octave (or two) up but a fifth apart, and never below 400 Hz.
const low = new Float32Array(Math.round(rate * 0.8))
for (let i = 0; i < low.length; i++) {
  const time = i / rate
  low[i] = 0.5 * Math.sin(2 * Math.PI * (time < 0.4 ? 220 : 329.63) * time)
}
const lifted = extracted.extractToneSequence(low, rate, 0, 800).filter(tone => tone.frequencyHz > 0)
assert.ok(lifted.length >= 2, JSON.stringify(lifted))
assert.ok(sameNote(lifted[0].frequencyHz, 220) && lifted[0].frequencyHz >= 400, JSON.stringify(lifted))
assert.ok(sameNote(lifted.at(-1).frequencyHz, 329.63), JSON.stringify(lifted))
assert.ok(Math.abs(Math.log2(lifted.at(-1).frequencyHz / lifted[0].frequencyHz) * 12 - 7) < 0.6, 'a fifth stays a fifth: ' + JSON.stringify(lifted))

// A discarded transient must extend the preceding note without pulling its
// pitch away from the semitone grid.
const merged = extracted.framesToNotes([
  { frequencyHz: 440, durationMs: 100, gainDb: 0 },
  { frequencyHz: 660, durationMs: 20, gainDb: -5 },
  { frequencyHz: 440, durationMs: 100, gainDb: 0 },
])
assert.equal(merged.length, 1, JSON.stringify(merged))
assert.equal(merged[0].frequencyHz, 440, JSON.stringify(merged))
assert.equal(merged[0].durationMs, 220)

// A change in loudness across one held pitch remains in the tone sequence.
const dynamics = extracted.framesToNotes([
  ...Array.from({ length: 5 }, () => ({ frequencyHz: 440, durationMs: 20, gainDb: 0 })),
  ...Array.from({ length: 5 }, () => ({ frequencyHz: 440, durationMs: 20, gainDb: -10 })),
])
assert.equal(JSON.stringify(dynamics.map(tone => tone.gainDb)), '[0,-10]')

// Samples beyond the selected trim must not change its last detected pitch.
const boundary = new Float32Array(rate)
for (let i = 0; i < boundary.length; i++) {
  const time = i / rate
  boundary[i] = Math.sin(2 * Math.PI * (time < 0.3 ? 440 : 880) * time) * 0.5
}
const trimmed = extracted.extractToneSequence(boundary, rate, 0, 300).filter(tone => tone.frequencyHz > 0)
assert.ok(trimmed.every(tone => sameNote(tone.frequencyHz, 440)), JSON.stringify(trimmed))

// --- the shared arrangement ---------------------------------------------------
// Octave placement: the median lands nearest 650 Hz, everything moves together.
assert.equal(arrangement.octaveShiftForTones([{ frequencyHz: 65, durationMs: 180, gainDb: 0 }, { frequencyHz: 131, durationMs: 180, gainDb: 0 }]), 3)
assert.equal(arrangement.octaveShiftForTones([{ frequencyHz: 659, durationMs: 250, gainDb: 0 }, { frequencyHz: 784, durationMs: 250, gainDb: 0 }, { frequencyHz: 440, durationMs: 250, gainDb: 0 }]), 0)
assert.equal(arrangement.octaveShiftForTones([{ frequencyHz: 0, durationMs: 500, gainDb: -60 }]), 0)
same(arrangement.placeInControllerRange([{ frequencyHz: 65, durationMs: 180, gainDb: 0 }, { frequencyHz: 0, durationMs: 200, gainDb: -60 }, { frequencyHz: 131, durationMs: 180, gainDb: 0 }]).map(tone => tone.frequencyHz), [520, 0, 1048])
// Re-articulation: a repeated pitch gets a rest carved from the first note, the
// total length is unchanged, different pitches run together, and a note too
// short to give up 10 ms is left alone.
same(arrangement.articulateRepeats([{ frequencyHz: 523, durationMs: 250, gainDb: 0 }, { frequencyHz: 523, durationMs: 250, gainDb: -3 }, { frequencyHz: 587, durationMs: 250, gainDb: 0 }]).map(tone => [tone.frequencyHz, tone.durationMs]), [[523, 220], [0, 30], [523, 250], [587, 250]])
same(arrangement.articulateRepeats([{ frequencyHz: 523, durationMs: 60, gainDb: 0 }, { frequencyHz: 523, durationMs: 60, gainDb: 0 }]).map(tone => [tone.frequencyHz, tone.durationMs]), [[523, 40], [0, 20], [523, 60]])
same(arrangement.articulateRepeats([{ frequencyHz: 523, durationMs: 40, gainDb: 0 }, { frequencyHz: 523, durationMs: 40, gainDb: 0 }]).map(tone => [tone.frequencyHz, tone.durationMs]), [[523, 40], [523, 40]])
same(arrangement.articulateRepeats([{ frequencyHz: 523, durationMs: 250, gainDb: 0 }, { frequencyHz: 0, durationMs: 50, gainDb: -60 }, { frequencyHz: 523, durationMs: 250, gainDb: 0 }]).map(tone => tone.durationMs), [250, 50, 250])
console.log('tone extraction: melody, rests, layered bass, octave placement, articulation, stable pitch and dynamics passed')
