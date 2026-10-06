import type { Tone } from '../platform/desktopBridge'
import { articulateRepeats, CONTROLLER_MIN_NOTE_MS, octaveShiftForPitches, shiftedFrequency, TONE_FILE_MAX_NOTES, TONE_FILE_MAX_TOTAL_MS } from './toneArrangement'

export type MidiNote = { note: number; velocity: number; startMs: number; endMs: number }
export type MidiTrack = { id: string; name: string; notes: MidiNote[] }
export type MidiSong = { tracks: MidiTrack[]; durationMs: number }

// The actuators sound clearest well above rumble/bass frequencies. Keep the
// melody intact, but move the whole selected voice by octaves into that band
// (toneArrangement.ts has the band and the rule).
export { CONTROLLER_MIN_NOTE_MS, CONTROLLER_PITCH_MAX_HZ, CONTROLLER_PITCH_MIN_HZ, CONTROLLER_PITCH_TARGET_HZ } from './toneArrangement'

// General MIDI programs, so a track without a name is still "Flute · channel 3"
// rather than "Track 5 · channel 3" when the melody has to be picked by eye.
export const GM_INSTRUMENTS = [
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano', 'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Nylon Guitar', 'Steel Guitar', 'Jazz Guitar', 'Clean Electric Guitar', 'Muted Electric Guitar', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Fingered Bass', 'Picked Bass', 'Fretless Bass', 'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Square Lead', 'Sawtooth Lead', 'Calliope Lead', 'Chiff Lead', 'Charang Lead', 'Voice Lead', 'Fifths Lead', 'Bass and Lead',
  'New Age Pad', 'Warm Pad', 'Polysynth Pad', 'Choir Pad', 'Bowed Pad', 'Metallic Pad', 'Halo Pad', 'Sweep Pad',
  'Rain', 'Soundtrack', 'Crystal', 'Atmosphere', 'Brightness', 'Goblins', 'Echoes', 'Sci-Fi',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bagpipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot',
]

export const isMidi = (bytes: Uint8Array) => bytes[0] === 77 && bytes[1] === 84 && bytes[2] === 104 && bytes[3] === 100

/** Standard MIDI files, formats 0/1. Channels are separate selectable voices,
 * including in format 0; percussion channel 10 is deliberately excluded.
 * Tempo changes are applied globally, after every track has been read. */
export function parseMidi(bytes: Uint8Array): MidiSong {
  let pos = 0, limit = bytes.length, eventCount = 0
  const fail = () => { throw new Error('The MIDI file is truncated or contains an invalid event.') }
  const byte = (): number => pos < limit ? bytes[pos++] : fail()
  const u16 = () => byte() * 256 + byte()
  const u32 = () => byte() * 16777216 + byte() * 65536 + byte() * 256 + byte()
  const tag = () => String.fromCharCode(byte(), byte(), byte(), byte())
  const vlq = () => {
    let result = 0
    for (let n = 0; n < 4; n++) { const b = byte(); result = result * 128 + (b & 127); if (!(b & 128)) return result }
    return fail()
  }
  if (!isMidi(bytes) || tag() !== 'MThd') throw new Error('Choose a Standard MIDI file (.mid or .midi).')
  const headerLength = u32()
  if (headerLength < 6 || headerLength > bytes.length - pos) return fail()
  const headerEnd = pos + headerLength
  const format = u16(), count = u16(), division = u16()
  if (format > 1) throw new Error('MIDI format 2 is not supported. Export the song as MIDI format 0 or 1.')
  if (!division || !count || count > 1024 || (format === 0 && count !== 1)) return fail()
  pos = headerEnd
  type TickNote = { note: number; velocity: number; start: number; end: number }
  const raw: { id: string; name: string; notes: TickNote[] }[] = []
  const tempos = [{ tick: 0, us: 500000 }]
  let endTick = 0
  for (let trackIndex = 0; trackIndex < count; trackIndex++) {
    limit = bytes.length
    if (tag() !== 'MTrk') return fail()
    const size = u32()
    if (size > bytes.length - pos) return fail()
    limit = pos + size
    let tick = 0, running = 0, trackName = ''
    const programs = new Map<number, number>()
    const notes = new Map<number, TickNote[]>()
    const held = new Map<number, TickNote[]>()
    const released = new Map<number, TickNote[]>()
    const sustain = new Set<number>()
    const close = (note: TickNote) => { note.end = tick }
    while (pos < limit) {
      if (++eventCount > 250000) throw new Error('This MIDI file has too many events. Export a shorter section.')
      tick += vlq(); endTick = Math.max(endTick, tick)
      let status = byte()
      if (status < 128) { if (!running) return fail(); pos--; status = running }
      if (status === 255) {
        running = 0
        const type = byte(), length = vlq()
        if (length > limit - pos) return fail()
        const data = bytes.subarray(pos, pos + length); pos += length
        if (type === 3) trackName = Array.from(new TextDecoder().decode(data)).filter(char => char.charCodeAt(0) >= 32).join('').slice(0, 100)
        if (type === 81 && length === 3) {
          const us = data[0] * 65536 + data[1] * 256 + data[2]
          if (!us) return fail()
          tempos.push({ tick, us })
        }
        if (type === 47) { pos = limit; break }
        continue
      }
      if (status === 240 || status === 247) { running = 0; const length = vlq(); if (length > limit - pos) return fail(); pos += length; continue }
      if (status >= 240) return fail()
      running = status
      const kind = status >> 4, channel = status & 15
      const a = byte(), b = kind === 12 || kind === 13 ? 0 : byte()
      if (a > 127 || b > 127) return fail()
      const key = channel * 128 + a
      if (kind === 12 && !programs.has(channel)) programs.set(channel, a)
      if (kind === 9 && b > 0) {
        const note = { note: a, velocity: b, start: tick, end: tick }
        const list = notes.get(channel) ?? []; list.push(note); notes.set(channel, list)
        const down = held.get(key) ?? []; down.push(note); held.set(key, down)
      } else if (kind === 8 || (kind === 9 && b === 0)) {
        const note = held.get(key)?.shift()
        if (note) {
          if (sustain.has(channel)) { const pending = released.get(channel) ?? []; pending.push(note); released.set(channel, pending) }
          else close(note)
        }
      } else if (kind === 11 && a === 64) {
        if (b >= 64) sustain.add(channel)
        else { sustain.delete(channel); released.get(channel)?.forEach(close); released.delete(channel) }
      } else if (kind === 11 && (a === 120 || a === 123)) {
        for (const [key, down] of held) if (Math.floor(key / 128) === channel) { down.forEach(close); held.delete(key) }
        released.get(channel)?.forEach(close); released.delete(channel)
      }
    }
    for (const down of held.values()) down.forEach(close)
    for (const pending of released.values()) pending.forEach(close)
    for (const [channel, trackNotes] of notes) {
      if (channel === 9) continue
      const instrument = GM_INSTRUMENTS[programs.get(channel) ?? -1]
      const label = [trackName || `Track ${trackIndex + 1}`, instrument && instrument !== trackName ? instrument : '', `channel ${channel + 1}`].filter(Boolean).join(' · ')
      raw.push({ id: `${trackIndex}:${channel}`, name: label, notes: trackNotes })
    }
  }
  tempos.sort((a, b) => a.tick - b.tick)
  const segments: { tick: number; ms: number; us: number }[] = []
  let previousTick = 0, ms = 0, us = 500000
  for (const tempo of tempos) {
    ms += (tempo.tick - previousTick) * us / division / 1000
    segments.push({ tick: tempo.tick, ms, us: tempo.us }); previousTick = tempo.tick; us = tempo.us
  }
  const time = (tick: number) => {
    if (division & 0x8000) {
      const code = 256 - (division >> 8), ticksPerFrame = division & 255
      if (![24, 25, 29, 30].includes(code) || !ticksPerFrame) return fail()
      return tick * 1000 / (code === 29 ? 30000 / 1001 : code) / ticksPerFrame
    }
    let lo = 0, hi = segments.length - 1
    while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (segments[mid].tick <= tick) lo = mid; else hi = mid - 1 }
    const segment = segments[lo]
    return segment.ms + (tick - segment.tick) * segment.us / division / 1000
  }
  const tracks = raw.map(track => ({ ...track, notes: track.notes.filter(note => note.end > note.start).map(note => ({ note: note.note, velocity: note.velocity, startMs: time(note.start), endMs: time(note.end) })).sort((a, b) => a.startMs - b.startMs || b.note - a.note) })).filter(track => track.notes.length)
  if (!tracks.length) throw new Error('This MIDI file has no pitched notes. Drum-only tracks cannot be used as a melody.')
  const durationMs = Math.ceil(time(endTick))
  if (!Number.isFinite(durationMs) || durationMs > 3600000) throw new Error('Export a MIDI song shorter than one hour.')
  return { tracks, durationMs }
}

export function scoreMidiTrackForController(track: MidiTrack): number {
  const notes = [...track.notes].sort((a, b) => a.startMs - b.startMs || b.note - a.note)
  if (!notes.length) return -Infinity
  const spanMs = Math.max(1, notes.reduce((end, note) => Math.max(end, note.endMs), 0) - notes[0].startMs)
  const totalNoteMs = notes.reduce((sum, note) => sum + Math.max(0, note.endMs - note.startMs), 0)
  let overlapMs = 0, activeEnd = -Infinity
  for (const note of notes) {
    if (note.startMs < activeEnd) overlapMs += Math.max(0, Math.min(activeEnd, note.endMs) - note.startMs)
    activeEnd = Math.max(activeEnd, note.endMs)
  }
  const monophony = 1 - Math.min(1, overlapMs / Math.max(1, totalNoteMs))
  const density = notes.length / (spanMs / 1000)
  const uniqueNotes = new Set(notes.map(note => note.note)).size
  let movement = 0
  for (let i = 1; i < notes.length; i++) if (notes[i].note !== notes[i - 1].note) movement++
  const movementRatio = notes.length > 1 ? movement / (notes.length - 1) : 0
  const durations = notes.map(note => note.endMs - note.startMs).sort((a, b) => a - b)
  const medianDuration = durations[Math.floor(durations.length / 2)] ?? 0
  let score = monophony * 7 + movementRatio * 2 + Math.min(2, uniqueNotes / 6)
  if (density >= 0.5 && density <= 12) score += 2
  else if (density > 20) score -= Math.min(4, (density - 20) / 10)
  if (medianDuration >= 50 && medianDuration <= 1000) score += 1
  // Judged over the opening eight seconds, where a sound usually comes from.
  const firstMs = Math.floor(notes[0].startMs)
  score -= Math.abs(controllerOctaveShift(track, firstMs, firstMs + 8000)) * 0.75
  if (/melody|lead|vocal|voice|theme|solo/i.test(track.name)) score += 5
  if (/bass|chord|pad|accomp|rhythm|drum|percussion|kick|snare/i.test(track.name)) score -= 7
  return score
}

export const preferredMidiTrack = (song: MidiSong) => song.tracks.reduce((best, track) =>
  scoreMidiTrackForController(track) > scoreMidiTrackForController(best) ? track : best, song.tracks[0])

const midiFrequency = (note: number) => 440 * 2 ** ((note - 69) / 12)

/** Pick one octave shift for the whole selection. This preserves the tune while
 * moving bass-heavy MIDI material into the actuator's clearer audible range. */
export function controllerOctaveShift(track: MidiTrack, startMs: number, endMs: number): number {
  const cappedEnd = Math.min(endMs, startMs + TONE_FILE_MAX_TOTAL_MS)
  return octaveShiftForPitches(track.notes
    .filter(note => note.endMs > startMs && note.startMs < cappedEnd)
    .map(note => ({ frequencyHz: midiFrequency(note.note), weight: Math.max(1, Math.min(note.endMs, cappedEnd) - Math.max(note.startMs, startMs)) })))
}

/** Quantise boundaries to the tone transport's 10 ms minimum. In a chord the
 * highest active note wins, so a selected melody stays one clean voice. Two
 * notes in a row at the same pitch stay two notes: a short rest is carved from
 * the first so the second is heard starting (toneArrangement.ts). */
export function midiToTones(track: MidiTrack, startMs: number, endMs: number, octaveShift = controllerOctaveShift(track, startMs, endMs)): Tone[] {
  const length = Math.floor(Math.min(TONE_FILE_MAX_TOTAL_MS, endMs - startMs) / 10) * 10
  if (length < 10) return []
  const notes = track.notes.filter(note => note.endMs > startMs && note.startMs < startMs + length)
  const peak = notes.reduce((peak, note) => Math.max(peak, note.velocity), 1)
  const boundaries = new Set([0, length])
  const selected = notes.map(note => ({ ...note, start: Math.max(0, Math.round((note.startMs - startMs) / 10) * 10), end: Math.min(length, Math.round((note.endMs - startMs) / 10) * 10) }))
  selected.forEach(note => { boundaries.add(note.start); boundaries.add(note.end) })
  const times = [...boundaries].filter(t => t >= 0 && t <= length).sort((a, b) => a - b)
  // One segment per stretch of a single sounding note (or rest), remembering
  // which MIDI note it came from so a repeated pitch is not mistaken for one
  // held note.
  type Segment = Tone & { source: typeof selected[number] | undefined }
  const segments: Segment[] = []
  for (let i = 0; i < times.length - 1; i++) {
    const from = times[i], to = times[i + 1]
    const note = selected.filter(note => note.start <= from && note.end > from).sort((a, b) => b.note - a.note || b.start - a.start)[0]
    const frequencyHz = note ? shiftedFrequency(midiFrequency(note.note), octaveShift) : 0
    const gainDb = note ? Math.max(-24, Math.round(20 * Math.log10(note.velocity / peak))) : -60
    const last = segments[segments.length - 1]
    if (last && (note ? last.source === note : last.source === undefined)) last.durationMs += to - from
    else segments.push({ frequencyHz, durationMs: to - from, gainDb, source: note })
  }
  // A blip shorter than the actuator can voice lengthens its neighbour: the one
  // before it, or the one after at the very start. When the notes either side
  // are the same note (a chord tone that briefly rose above the melody) they
  // rejoin.
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]
    if (segment.durationMs >= CONTROLLER_MIN_NOTE_MS || segments.length === 1) continue
    const before = segments[index - 1], after = segments[index + 1]
    if (before && after && before.source === after.source && before.frequencyHz === after.frequencyHz && before.gainDb === after.gainDb) {
      before.durationMs += segment.durationMs + after.durationMs; segments.splice(index, 2); index--
    } else if (before) {
      before.durationMs += segment.durationMs; segments.splice(index, 1); index--
    } else if (after) {
      after.durationMs += segment.durationMs; segments.splice(index, 1); index--
    }
  }
  const articulated = articulateRepeats(segments.map(({ frequencyHz, durationMs, gainDb }) => ({ frequencyHz, durationMs, gainDb })))
  const cleaned: Tone[] = []
  for (const tone of articulated) {
    let remaining = tone.durationMs
    while (remaining > 0 && cleaned.length < TONE_FILE_MAX_NOTES) {
      const durationMs = Math.min(2000, remaining)
      cleaned.push({ ...tone, durationMs }); remaining -= durationMs
    }
  }
  return cleaned
}

/** An audible preview of the exact simplified score, without a soundfont. */
export function synthesizeTones(tones: Tone[], sampleRate = 22050): Float32Array {
  const samples = new Float32Array(Math.ceil(tones.reduce((sum, tone) => sum + tone.durationMs, 0) / 1000 * sampleRate))
  let offsetMs = 0
  for (const tone of tones) {
    const start = Math.round(offsetMs / 1000 * sampleRate)
    offsetMs += tone.durationMs
    const end = Math.min(samples.length, Math.round(offsetMs / 1000 * sampleRate))
    for (let i = start; i < end; i++) {
      const edge = Math.min(1, (i - start) / (sampleRate * 0.003), (end - i - 1) / (sampleRate * 0.003))
      samples[i] = Math.sin(2 * Math.PI * tone.frequencyHz * (i - start) / sampleRate) * 0.35 * 10 ** (tone.gainDb / 20) * edge
    }
  }
  return samples
}
