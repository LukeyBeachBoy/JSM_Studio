const assert = require('node:assert/strict')
// Arrays from the converters' vm realm are compared by value, not identity.
const same = (actual, expected, message) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), message)
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../JSM_GUI/jsm_gui_tauri/node_modules/typescript')

// The converter and the arrangement it shares with the MP3 path, transpiled
// one file at a time; `require` inside them resolves to the module just built.
const SRC = path.join(__dirname, '../JSM_GUI/jsm_gui_tauri/src/utils')
const loadTs = (name, modules) => {
  const source = fs.readFileSync(path.join(SRC, `${name}.ts`), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const api = {}
  vm.runInNewContext(compiled, { exports: api, TextDecoder, require: id => { const found = modules[id.replace(/^\.\//, '')]; if (!found) throw new Error(`no module ${id}`); return found } }, { filename: `${name}.js` })
  return api
}
const arrangement = loadTs('toneArrangement', {})
const api = loadTs('midiTones', { toneArrangement: arrangement })
const vlq = value => { const bytes = [value & 127]; while ((value >>= 7)) bytes.unshift((value & 127) | 128); return bytes }
const chunk = (name, bytes) => { const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([Buffer.from(name), size, Buffer.from(bytes)]) }
const midi = tracks => Buffer.concat([chunk('MThd', [0, tracks.length === 1 ? 0 : 1, 0, tracks.length, 1, 224]), ...tracks.map(events => chunk('MTrk', [...events, 0, 255, 47, 0]))])
const fixture = midi([
  [0, 255, 81, 3, 7, 161, 32, ...vlq(480), 255, 81, 3, 15, 66, 64], // 120 -> 60 BPM
  [0, 255, 3, 4, ...Buffer.from('Lead'), 0, 144, 69, 100, ...vlq(480), 69, 0, 0, 144, 72, 80, ...vlq(480), 128, 72, 0],
  [0, 153, 38, 120, ...vlq(960), 137, 38, 0], // drums excluded
])
const song = api.parseMidi(fixture)
assert.equal(song.tracks.length, 1)
assert.equal(song.durationMs, 1500)
assert.equal(song.tracks[0].notes[0].endMs, 500)
assert.equal(song.tracks[0].notes[1].endMs, 1500)
const tones = api.midiToTones(song.tracks[0], 0, 1500)
assert.equal(JSON.stringify(tones), JSON.stringify([{ frequencyHz: 440, durationMs: 500, gainDb: 0 }, { frequencyHz: 523, durationMs: 1000, gainDb: -2 }]))
const cut = api.midiToTones(song.tracks[0], 250, 750)
assert.equal(cut[0].durationMs, 250); assert.equal(cut[1].durationMs, 250)
const sustained = api.parseMidi(midi([[0, 144, 69, 100, 0, 176, 64, 127, ...vlq(480), 128, 69, 0, ...vlq(480), 176, 64, 0]]))
assert.equal(sustained.tracks[0].notes[0].endMs, 1000)
const chord = { id: '0:0', name: 'Chord', notes: [{ note: 60, velocity: 80, startMs: 100, endMs: 11000 }, { note: 72, velocity: 100, startMs: 500, endMs: 1000 }] }
const chordTones = api.midiToTones(chord, 0, 11000)
assert.equal(chordTones[0].frequencyHz, 0)
assert.equal(chordTones[2].frequencyHz, 1047)
assert.equal(chordTones.reduce((sum, tone) => sum + tone.durationMs, 0), 11000, 'no eight-second cap any more')
assert.ok(chordTones.every(tone => tone.durationMs >= 10 && tone.durationMs <= 2000))
assert.ok(api.synthesizeTones(tones).some(value => Math.abs(value) > 0.1))
// A track without a name is labelled by its General MIDI program.
const flute = api.parseMidi(midi([[0, 192, 73, 0, 144, 76, 100, ...vlq(480), 128, 76, 0]]))
assert.equal(flute.tracks[0].name, 'Track 1 · Flute · channel 1')
assert.equal(song.tracks[0].name, 'Lead · channel 1', 'no program change, no instrument')
const bass = { id: 'bass', name: 'Bass', notes: [{ note: 36, velocity: 100, startMs: 0, endMs: 180 }, { note: 48, velocity: 100, startMs: 380, endMs: 560 }] }
assert.equal(api.controllerOctaveShift(bass, 0, 1000), 3)
const bassTones = api.midiToTones(bass, 0, 1000)
assert.ok(bassTones.filter(tone => tone.frequencyHz).every(tone => tone.frequencyHz >= 400 && tone.frequencyHz <= 1200))
// A 20 ms blip between two A4s is folded away; the two A4s stay two notes,
// with a short rest carved from the first so the second is heard starting.
// (A lone A4 line sits under the band, so the voice is lifted an octave.)
const blips = { id: 'blips', name: 'Lead', notes: [{ note: 69, velocity: 100, startMs: 0, endMs: 200 }, { note: 70, velocity: 100, startMs: 200, endMs: 220 }, { note: 69, velocity: 100, startMs: 220, endMs: 420 }] }
const blipTones = api.midiToTones(blips, 0, 420)
assert.ok(blipTones.filter(tone => tone.frequencyHz).every(tone => tone.durationMs >= api.CONTROLLER_MIN_NOTE_MS))
same(blipTones.map(tone => [tone.frequencyHz, tone.durationMs]), [[880, 190], [0, 30], [880, 200]])
assert.equal(blipTones.reduce((sum, tone) => sum + tone.durationMs, 0), 420, 'articulation keeps the total length')
// Repeated quarter notes: two notes in the file are two notes on the controller.
const repeats = { id: 'rep', name: 'Lead', notes: [{ note: 72, velocity: 100, startMs: 0, endMs: 250 }, { note: 72, velocity: 100, startMs: 250, endMs: 500 }, { note: 74, velocity: 100, startMs: 500, endMs: 750 }] }
same(api.midiToTones(repeats, 0, 750).map(tone => [tone.frequencyHz, tone.durationMs]), [[523, 220], [0, 30], [523, 250], [587, 250]])
// A note held across a chord tone that briefly rises above it is still one note.
const held = { id: 'held', name: 'Lead', notes: [{ note: 72, velocity: 100, startMs: 0, endMs: 600 }, { note: 76, velocity: 60, startMs: 300, endMs: 320 }] }
same(api.midiToTones(held, 0, 600).map(tone => [tone.frequencyHz, tone.durationMs]), [[523, 600]])
// Legato between different pitches has no gap: the firmware's own phrase runs its notes together.
same(api.midiToTones({ id: 'l', name: 'Lead', notes: [{ note: 74, velocity: 100, startMs: 0, endMs: 80 }, { note: 77, velocity: 100, startMs: 80, endMs: 160 }] }, 0, 160).map(tone => [tone.frequencyHz, tone.durationMs]), [[587, 80], [698, 80]])
const melody = { id: 'melody', name: 'Lead melody', notes: [{ note: 60, velocity: 100, startMs: 0, endMs: 250 }, { note: 62, velocity: 100, startMs: 300, endMs: 550 }, { note: 64, velocity: 100, startMs: 600, endMs: 850 }] }
const accompaniment = { id: 'accomp', name: 'Bass accompaniment', notes: [{ note: 36, velocity: 100, startMs: 0, endMs: 2000 }, { note: 40, velocity: 100, startMs: 0, endMs: 2000 }] }
assert.equal(api.preferredMidiTrack({ tracks: [accompaniment, melody], durationMs: 2000 }).id, 'melody')
for (const invalid of [Buffer.from('no'), fixture.subarray(0, fixture.length - 3), midi([[0, 1, 2]])]) assert.throws(() => api.parseMidi(invalid))
if (process.argv[2]) {
  const actual = api.parseMidi(fs.readFileSync(process.argv[2]))
  console.log(JSON.stringify({ durationMs: actual.durationMs, tracks: actual.tracks.map(track => { const first = Math.floor(track.notes[0].startMs), shift = api.controllerOctaveShift(track, first, first + 8000); return { id: track.id, name: track.name, notes: track.notes.length, firstMs: track.notes[0].startMs, controllerScore: Number(api.scoreMidiTrackForController(track).toFixed(2)), shift, firstTones: api.midiToTones(track, first, first + 8000, shift).filter(tone => tone.frequencyHz).slice(0, 6).map(tone => tone.frequencyHz) } }), selected: api.preferredMidiTrack(actual).name }, null, 2))
  const track = api.preferredMidiTrack(actual), start = Math.floor(track.notes[0].startMs)
  const octaveShift = api.controllerOctaveShift(track, start, start + 8000)
  const result = api.midiToTones(track, start, start + 8000, octaveShift)
  assert.ok(result.some(tone => tone.frequencyHz > 0)); console.log('Real MIDI:', result.length, 'tones · octave shift', octaveShift, '· first tones', JSON.stringify(result.slice(0, 12)))
}
console.log('PASS: MIDI parsing, track ranking, actuator-range octave tuning, short-event cleanup, repeated-note articulation, trimming and bounds')
