import type { Tone } from '../platform/desktopBridge'
import { articulateRepeats, octaveShiftForTones, placeInControllerRange, TONE_FILE_MAX_NOTES, TONE_FILE_MAX_TOTAL_MS } from './toneArrangement'

/**
 * Turns a clip into the single-voice melody the controller's haptics can play
 * (docs/plans/controller-sounds-library.md, "The honest limit"). Pure: the
 * editor decodes the MP3 and hands the mono samples here; the result is what
 * Rust writes to tones.txt.
 *
 * The MP3 is filtered to the controller's useful melody band before pitch
 * detection. A continuous pitch path is chosen across 20 ms frames, short
 * dropouts are repaired, and changes in loudness remain audible. The melody is
 * then arranged for the actuators the same way a MIDI voice is: moved by whole
 * octaves into their clear range, with repeated notes re-articulated
 * (toneArrangement.ts). The controller cannot reproduce the original
 * recording's timbre.
 */

export const TONE_HOP_MS = 20
export const TONE_WINDOW_MS = 96
export const TONE_MIN_HZ = 90
export const TONE_MAX_HZ = 1500
/** Frames quieter than this, relative to the loudest frame, are rests. */
export const TONE_GAIN_FLOOR_DB = -30
export const TONE_MIN_NOTE_MS = 40
export const TONE_MAX_NOTE_MS = 2000
export const TONE_MAX_TOTAL_MS = TONE_FILE_MAX_TOTAL_MS
export const TONE_MAX_NOTES = TONE_FILE_MAX_NOTES
/** How periodic the window must be (peak of the normalised autocorrelation). */
export const TONE_CLARITY_THRESHOLD = 0.6
const SPECTRUM_SIZE = 2048
const MELODY_MIDI_MIN = 42
const MELODY_MIDI_MAX = 90
const MELODY_STATES = MELODY_MIDI_MAX - MELODY_MIDI_MIN + 1
const PITCH_MERGE_RATIO = 0.03

/** Remove rumble and high-frequency texture before making a one-voice score.
 * The two low-pass stages also prevent aliasing when the analysis is reduced
 * to about 8 kHz. This leaves the original samples untouched for PC playback.
 */
function melodyBand(samples: Float32Array, sampleRate: number): { samples: Float32Array; rate: number } {
  const stride = Math.max(1, Math.floor(sampleRate / 8000))
  const result = new Float32Array(Math.ceil(samples.length / stride))
  const highAlpha = Math.exp(-2 * Math.PI * 130 / sampleRate)
  const lowAlpha = 1 - Math.exp(-2 * Math.PI * 1700 / sampleRate)
  let previous = 0, previousHigh = 0, high1 = 0, high2 = 0, low1 = 0, low2 = 0
  for (let i = 0; i < samples.length; i++) {
    const input = samples[i]
    high1 = highAlpha * (high1 + input - previous)
    previous = input
    high2 = highAlpha * (high2 + high1 - previousHigh)
    previousHigh = high1
    low1 += lowAlpha * (high2 - low1)
    low2 += lowAlpha * (low1 - low2)
    if (i % stride === 0) result[Math.floor(i / stride)] = low2
  }
  return { samples: result, rate: sampleRate / stride }
}

export type PitchEstimate = { frequencyHz: number; clarity: number }

/**
 * Find a rough period by normalised autocorrelation, then choose the strongest
 * nearby musical frequency in a Hann-windowed spectrum. The latter reduces
 * pitch drift from residual bass and high-frequency interference.
 */
export function detectPitch(window: Float32Array, sampleRate: number): PitchEstimate {
  const n = window.length
  const minLag = Math.max(2, Math.floor(sampleRate / TONE_MAX_HZ))
  const maxLag = Math.min(n - 2, Math.ceil(sampleRate / TONE_MIN_HZ))
  if (maxLag <= minLag) return { frequencyHz: 0, clarity: 0 }
  // Prefix sums of the energy, so each lag's two normalising terms are O(1).
  const energy = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) energy[i + 1] = energy[i] + window[i] * window[i]
  if (energy[n] === 0) return { frequencyHz: 0, clarity: 0 }
  const nacf = new Float64Array(maxLag + 1)
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    const end = n - lag
    for (let i = 0; i < end; i++) sum += window[i] * window[i + lag]
    const norm = Math.sqrt(energy[end] * (energy[n] - energy[lag]))
    nacf[lag] = norm > 0 ? sum / norm : 0
  }
  // Local maxima above the threshold, with their parabolic refinement.
  const peaks: { lag: number; value: number }[] = []
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const value = nacf[lag]
    if (value < TONE_CLARITY_THRESHOLD || value < nacf[lag - 1] || value <= nacf[lag + 1]) continue
    const left = nacf[lag - 1], right = nacf[lag + 1]
    const denominator = left - 2 * value + right
    const shift = denominator === 0 ? 0 : 0.5 * (left - right) / denominator
    peaks.push({ lag: lag + Math.max(-1, Math.min(1, shift)), value })
  }
  if (peaks.length === 0) return { frequencyHz: 0, clarity: 0 }
  const strongest = Math.max(...peaks.map(peak => peak.value))
  const chosen = peaks.find(peak => peak.value >= strongest * 0.85) ?? peaks[0]
  // Autocorrelation locates the rough fundamental but bass interference can
  // pull its peak between notes. Compare the nearby musical frequencies on a
  // Hann-windowed spectrum to recover the actual melodic pitch.
  const rough = sampleRate / chosen.lag
  const middle = Math.round(12 * Math.log2(rough / 440))
  let bestFrequency = rough, bestPower = -1
  for (let semitone = middle - 3; semitone <= middle + 3; semitone++) {
    const frequency = 440 * Math.pow(2, semitone / 12)
    if (frequency < TONE_MIN_HZ || frequency > TONE_MAX_HZ) continue
    let real = 0, imaginary = 0
    for (let i = 0; i < n; i++) {
      const phase = 2 * Math.PI * frequency * i / sampleRate
      const taper = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))
      real += window[i] * taper * Math.cos(phase)
      imaginary += window[i] * taper * Math.sin(phase)
    }
    const power = real * real + imaginary * imaginary
    if (power > bestPower) { bestPower = power; bestFrequency = frequency }
  }
  return { frequencyHz: bestFrequency, clarity: chosen.value }
}

/** A harmonic spectrum is more useful than autocorrelation for a game sound:
 * the loudest source may be a bass note or a drum, while the melody is a
 * quieter set of related partials. Local spectral whitening rejects broad
 * noise before those partials are scored. Frequencies are quantised here,
 * rather than after tracking, so neighboring frames can agree on one note.
 */
type MelodySpectrum = { scores: Float64Array; totalStrength: number; bestFrequency: number; clarity: number }

function melodySpectrum(window: Float32Array, sampleRate: number): MelodySpectrum {
  const scores = new Float64Array(MELODY_STATES)
  if (!window.length || sampleRate <= 0) return { scores, totalStrength: 0, bestFrequency: 0, clarity: 0 }
  const real = new Float64Array(SPECTRUM_SIZE)
  const imaginary = new Float64Array(SPECTRUM_SIZE)
  const length = Math.min(window.length, SPECTRUM_SIZE)
  for (let i = 0; i < length; i++) {
    const taper = length > 1 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)) : 1
    real[i] = window[i] * taper
  }
  // Iterative radix-two FFT. Zero padding gives a finer grid for scoring
  // neighboring semitones without extending the analysis window in time.
  for (let i = 1, j = 0; i < SPECTRUM_SIZE; i++) {
    let bit = SPECTRUM_SIZE >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]] }
  }
  for (let size = 2; size <= SPECTRUM_SIZE; size <<= 1) {
    const angle = -2 * Math.PI / size
    const cosine = Math.cos(angle), sine = Math.sin(angle)
    for (let block = 0; block < SPECTRUM_SIZE; block += size) {
      let wr = 1, wi = 0
      for (let j = 0; j < size / 2; j++) {
        const a = block + j, b = a + size / 2
        const tr = wr * real[b] - wi * imaginary[b]
        const ti = wr * imaginary[b] + wi * real[b]
        real[b] = real[a] - tr; imaginary[b] = imaginary[a] - ti
        real[a] += tr; imaginary[a] += ti
        const nextWr = wr * cosine - wi * sine
        wi = wr * sine + wi * cosine; wr = nextWr
      }
    }
  }
  const magnitudes = new Float64Array(SPECTRUM_SIZE / 2 + 1)
  for (let bin = 1; bin < magnitudes.length; bin++) magnitudes[bin] = Math.hypot(real[bin], imaginary[bin])
  const whitened = new Float64Array(magnitudes.length)
  let totalStrength = 0
  const firstBin = Math.max(1, Math.floor(TONE_MIN_HZ * SPECTRUM_SIZE / sampleRate))
  const lastBin = Math.min(magnitudes.length - 2, Math.ceil(1700 * SPECTRUM_SIZE / sampleRate))
  for (let bin = firstBin; bin <= lastBin; bin++) {
    let neighborhood = 0, count = 0
    for (let near = Math.max(1, bin - 7); near <= Math.min(magnitudes.length - 1, bin + 7); near++) {
      neighborhood += magnitudes[near]; count++
    }
    whitened[bin] = Math.max(0, magnitudes[bin] - 1.35 * neighborhood / count)
    totalStrength += whitened[bin]
  }
  if (totalStrength <= 0) return { scores, totalStrength: 0, bestFrequency: 0, clarity: 0 }
  const peakAt = (frequency: number) => {
    const bin = Math.round(frequency * SPECTRUM_SIZE / sampleRate)
    return Math.max(whitened[bin - 1] ?? 0, whitened[bin] ?? 0, whitened[bin + 1] ?? 0)
  }
  let bestFrequency = 0, bestScore = 0, bestUnbiased = 0
  for (let midi = MELODY_MIDI_MIN; midi <= MELODY_MIDI_MAX; midi++) {
    const frequency = 440 * Math.pow(2, (midi - 69) / 12)
    if (frequency < TONE_MIN_HZ || frequency > TONE_MAX_HZ) continue
    const first = peakAt(frequency)
    const second = frequency * 2 <= 1700 ? peakAt(frequency * 2) : 0
    const third = frequency * 3 <= 1700 ? peakAt(frequency * 3) : 0
    const fourth = frequency * 4 <= 1700 ? peakAt(frequency * 4) : 0
    const harmonic = first + 0.65 * second + 0.4 * third + 0.2 * fourth + 0.4 * Math.sqrt(second * third)
    // A constant bass line should not automatically beat a slightly quieter
    // lead. Keep the preference small enough to retain genuine low melodies.
    const preference = Math.max(0.85, Math.min(1.25, 1 + 0.1 * Math.log2(frequency / 220)))
    const score = harmonic * preference
    scores[midi - MELODY_MIDI_MIN] = score
    if (score > bestScore) { bestScore = score; bestUnbiased = harmonic; bestFrequency = frequency }
  }
  const clarity = Math.min(1, bestUnbiased / (totalStrength * 0.12))
  return { scores, totalStrength, bestFrequency, clarity }
}

export function detectMelodyPitch(window: Float32Array, sampleRate: number): PitchEstimate {
  const spectrum = melodySpectrum(window, sampleRate)
  return { frequencyHz: spectrum.clarity >= TONE_CLARITY_THRESHOLD ? Math.round(spectrum.bestFrequency) : 0, clarity: spectrum.clarity }
}

/** RMS of a window; 0 for silence. */
export const rms = (window: Float32Array) => {
  let sum = 0
  for (let i = 0; i < window.length; i++) sum += window[i] * window[i]
  return window.length ? Math.sqrt(sum / window.length) : 0
}

export type ToneFrame = { frequencyHz: number; gainDb: number; durationMs: number }

/**
 * One frame per hop across [startMs, endMs): its pitch (0 for a rest) and its
 * gain relative to the loudest frame, floored at TONE_GAIN_FLOOR_DB.
 */
export function analyseFrames(samples: Float32Array, sampleRate: number, startMs: number, endMs: number): ToneFrame[] {
  if (sampleRate <= 0) return []
  const totalMs = samples.length / sampleRate * 1000
  const start = Math.max(0, Math.min(startMs, totalMs))
  const end = Math.max(start, Math.min(endMs, totalMs))
  if (end - start <= 0) return []
  const filtered = melodyBand(samples, sampleRate)
  const analysisRate = filtered.rate
  const windowSamples = Math.max(8, Math.round(analysisRate * TONE_WINDOW_MS / 1000))
  const frames: { level: number; durationMs: number; window: Float32Array }[] = []
  let loudest = 0
  const clipStartSample = Math.floor(start * analysisRate / 1000)
  const clipEndSample = Math.ceil(end * analysisRate / 1000)
  for (let positionMs = start; positionMs < end; positionMs += TONE_HOP_MS) {
    // Centre the analysis window on the output hop. A forward-looking window
    // starts each syllable or note up to half a window too early.
    const from = Math.floor((positionMs + TONE_HOP_MS / 2 - TONE_WINDOW_MS / 2) * analysisRate / 1000)
    const window = new Float32Array(windowSamples)
    const copyFrom = Math.max(from, clipStartSample, 0)
    const copyTo = Math.min(from + windowSamples, clipEndSample, filtered.samples.length)
    if (copyTo > copyFrom) window.set(filtered.samples.subarray(copyFrom, copyTo), copyFrom - from)
    const level = rms(window)
    loudest = Math.max(loudest, level)
    const durationMs = Math.min(TONE_HOP_MS, end - positionMs)
    frames.push({ level, durationMs, window })
  }
  if (loudest === 0) return frames.map(frame => ({ frequencyHz: 0, gainDb: TONE_GAIN_FLOOR_DB, durationMs: frame.durationMs }))
  const spectra = frames.map(frame => {
    const gainDb = frame.level > 0 ? 20 * Math.log10(frame.level / loudest) : -Infinity
    if (!(gainDb >= TONE_GAIN_FLOOR_DB)) return { spectrum: null, gainDb: TONE_GAIN_FLOOR_DB, durationMs: frame.durationMs }
    return { spectrum: melodySpectrum(frame.window, analysisRate), gainDb, durationMs: frame.durationMs }
  })
  // Track one melody through the whole clip. Choosing the loudest pitch in
  // every frame jumps between a vocal/lead and the bass on each beat; the
  // resulting actuator sequence sounds like unrelated chirps. A transition
  // has a cost proportional to its interval, while rests remain available
  // when the spectrum is not tonal. Genuine adjacent notes still move freely.
  const stateCount = MELODY_STATES + 1 // state zero is a rest
  const back = spectra.map(() => new Uint8Array(stateCount))
  let previous = new Float64Array(stateCount)
  const emission = (index: number, state: number) => {
    const spectrum = spectra[index].spectrum
    if (!spectrum || spectrum.clarity < TONE_CLARITY_THRESHOLD) return state === 0 ? 0 : -5
    if (state === 0) return -1.7
    const score = spectrum.scores[state - 1]
    const maximum = Math.max(...spectrum.scores)
    if (score <= 0 || score / spectrum.totalStrength < 0.045) return -5
    return Math.log(0.025 + score / maximum)
  }
  for (let state = 0; state < stateCount; state++) previous[state] = emission(0, state)
  for (let index = 1; index < spectra.length; index++) {
    const current = new Float64Array(stateCount)
    const attack = frames[index].level > frames[index - 1].level * 1.65
    for (let state = 0; state < stateCount; state++) {
      let best = -Infinity, bestFrom = 0
      for (let from = 0; from < stateCount; from++) {
        const interval = state === 0 || from === 0 ? 0 : Math.abs(state - from)
        const transition = from === state ? 0 : state === 0 || from === 0 ? 0.6 : 0.18 + Math.min(2.5, interval * 0.13)
        const value = previous[from] - transition * (attack ? 0.6 : 1)
        if (value > best) { best = value; bestFrom = from }
      }
      current[state] = best + emission(index, state)
      back[index][state] = bestFrom
    }
    previous = current
  }
  let state = 0
  for (let at = 1; at < stateCount; at++) if (previous[at] > previous[state]) state = at
  const pitched: ToneFrame[] = new Array(spectra.length)
  for (let index = spectra.length - 1; index >= 0; index--) {
    const { durationMs, gainDb } = spectra[index]
    const frequencyHz = state === 0 ? 0 : Math.round(440 * Math.pow(2, (MELODY_MIDI_MIN + state - 1 - 69) / 12))
    pitched[index] = { frequencyHz, gainDb: frequencyHz ? gainDb : TONE_GAIN_FLOOR_DB, durationMs }
    state = back[index][state]
  }
  // Brief noisy windows inside a held note should not split it, while an
  // isolated pitch from a transient should not become a click-like note.
  for (let index = 1; index < pitched.length - 1; index++) {
    const before = pitched[index - 1].frequencyHz, after = pitched[index + 1].frequencyHz
    if (before > 0 && before === after && pitched[index].frequencyHz !== before) {
      pitched[index].frequencyHz = before
      pitched[index].gainDb = Math.max(pitched[index - 1].gainDb, pitched[index + 1].gainDb)
    }
  }
  const voicedPeak = Math.max(...pitched.filter(frame => frame.frequencyHz > 0).map(frame => frame.gainDb), -60)
  return pitched.map(frame => frame.frequencyHz > 0
    ? { ...frame, gainDb: Math.max(-20, Math.min(0, (frame.gainDb - voicedPeak) * 0.8)) }
    : frame)
}

type Run = { frequencySum: number; durationMs: number; gainDb: number; rest: boolean }

const runFrequency = (run: Run) => run.rest ? 0 : run.frequencySum / run.durationMs

const samePitch = (run: Run, frequencyHz: number, gainDb = run.gainDb) => {
  if (run.rest) return frequencyHz === 0
  if (frequencyHz === 0) return false
  const current = runFrequency(run)
  return Math.abs(current - frequencyHz) / Math.max(current, frequencyHz) <= PITCH_MERGE_RATIO
    && Math.abs(run.gainDb - gainDb) < 5
}

const absorb = (run: Run, frequencyHz: number, durationMs: number, gainDb: number) => {
  run.frequencySum += frequencyHz * durationMs
  run.durationMs += durationMs
  run.gainDb = Math.max(run.gainDb, gainDb)
}

/**
 * Frames to notes: consecutive frames of one pitch merge, a run shorter than
 * TONE_MIN_NOTE_MS lengthens the note before it (or the one after, at the
 * start), and leading / trailing rests go.
 */
export function framesToNotes(frames: ToneFrame[]): Tone[] {
  const runs: Run[] = []
  for (const frame of frames) {
    const last = runs[runs.length - 1]
    if (last && samePitch(last, frame.frequencyHz, frame.gainDb)) absorb(last, frame.frequencyHz, frame.durationMs, frame.gainDb)
    else runs.push({ frequencySum: frame.frequencyHz * frame.durationMs, durationMs: frame.durationMs, gainDb: frame.gainDb, rest: frame.frequencyHz === 0 })
  }
  const merged: Run[] = []
  let carry = 0
  for (const run of runs) {
    const last = merged[merged.length - 1]
    if (run.durationMs < TONE_MIN_NOTE_MS) {
      if (last) {
        last.frequencySum += runFrequency(last) * run.durationMs
        last.durationMs += run.durationMs
      }
      else carry += run.durationMs
      continue
    }
    if (carry) { run.frequencySum += runFrequency(run) * carry; run.durationMs += carry; carry = 0 }
    const frequency = runFrequency(run)
    if (last && samePitch(last, frequency, run.gainDb)) absorb(last, frequency, run.durationMs, run.gainDb)
    else merged.push(run)
  }
  while (merged.length && merged[0].rest) merged.shift()
  while (merged.length && merged[merged.length - 1].rest) merged.pop()
  return merged.map(run => ({ frequencyHz: run.rest ? 0 : Math.round(runFrequency(run)), durationMs: Math.round(run.durationMs), gainDb: Math.round(run.gainDb) }))
}

/** The file's own limits: a long note is split, the whole stops at the note and length caps. */
export function clampToneSequence(notes: Tone[]): Tone[] {
  const result: Tone[] = []
  let totalMs = 0
  for (const note of notes) {
    let remaining = note.durationMs
    while (remaining > 0) {
      if (result.length >= TONE_MAX_NOTES) return result
      const room = TONE_MAX_TOTAL_MS - totalMs
      const durationMs = Math.min(remaining, TONE_MAX_NOTE_MS, room)
      if (durationMs < 10) return result
      result.push({
        frequencyHz: note.frequencyHz === 0 ? 0 : Math.min(2000, Math.max(40, Math.round(note.frequencyHz))),
        durationMs,
        gainDb: Math.min(0, Math.max(-60, Math.round(note.gainDb))),
      })
      totalMs += durationMs
      remaining -= durationMs
    }
  }
  return result
}

/** `octaveNudge` is added to the automatic octave placement (0 = as placed). */
export function extractToneSequence(samples: Float32Array, sampleRate: number, startMs: number, endMs: number, octaveNudge = 0): Tone[] {
  // Nothing past the file's limit is analysed: it would only be discarded.
  const notes = framesToNotes(analyseFrames(samples, sampleRate, startMs, Math.min(endMs, startMs + TONE_MAX_TOTAL_MS)))
  return clampToneSequence(articulateRepeats(placeInControllerRange(notes, octaveShiftForTones(notes) + octaveNudge)))
}

/** Playback length of a sequence, in ms. */
export const toneSequenceLength = (tones: Tone[]) => tones.reduce((total, tone) => total + tone.durationMs, 0)
