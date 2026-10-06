import type { Tone } from '../platform/desktopBridge'

/**
 * Arranging a melody for the Steam Controller's actuators, shared by the MIDI
 * converter (midiTones.ts) and the MP3 pitch extractor (toneExtraction.ts).
 *
 * The controller's own tunes are short, high and clearly separated: the boot
 * jingle is 588 / 699 / 882 Hz in 80 ms notes. Material that arrives an octave
 * or three below that turns to rumble, and two equal notes played back to back
 * fuse into one long one. Both converters therefore hand their notes through
 * here before the sequence is written.
 */

// The band where the actuators sing rather than buzz, and the pitch a melody
// is centred on. Whole octaves only, so every interval survives.
export const CONTROLLER_PITCH_TARGET_HZ = 650
export const CONTROLLER_PITCH_MIN_HZ = 400
export const CONTROLLER_PITCH_MAX_HZ = 1200
/** Shorter events are folded into their neighbours: they click rather than sound. */
export const CONTROLLER_MIN_NOTE_MS = 40
/** The rest carved out of a note before another note at the same pitch. */
export const ARTICULATION_GAP_MS = 30
/** The file's frequency range (ToneSequence.h). */
export const TONE_FILE_MIN_HZ = 40
export const TONE_FILE_MAX_HZ = 2000
/** The file's size limits (ToneSequence.h, sound_library.rs): generous, so a
 * whole song can be a sound if someone wants one; a new selection starts at
 * DEFAULT_SELECTION_MS. */
export const TONE_FILE_MAX_TOTAL_MS = 600000
export const TONE_FILE_MAX_NOTES = 20000
export const DEFAULT_SELECTION_MS = 8000

export type WeightedPitch = { frequencyHz: number; weight: number }

/**
 * One octave shift for a whole voice: the one that brings the centre of the
 * voice nearest the target while keeping as much of it as possible inside the
 * band. The centre is the geometric middle of the duration-weighted 15th and
 * 85th percentile pitches, so a melody is placed by the range it lives in,
 * and a stray grace note or a single held bass note does not drag it. Ties go
 * to the smaller move. 0 when nothing is pitched.
 */
export function octaveShiftForPitches(pitches: WeightedPitch[]): number {
  const voiced = pitches.filter(pitch => pitch.frequencyHz > 0 && pitch.weight > 0).sort((a, b) => a.frequencyHz - b.frequencyHz)
  if (!voiced.length) return 0
  const total = voiced.reduce((sum, pitch) => sum + pitch.weight, 0)
  const percentile = (fraction: number) => {
    let sum = 0
    for (const pitch of voiced) { sum += pitch.weight; if (sum >= total * fraction) return pitch.frequencyHz }
    return voiced[voiced.length - 1].frequencyHz
  }
  const centre = Math.sqrt(percentile(0.15) * percentile(0.85))
  let bestShift = 0, bestScore = Infinity
  for (let shift = -4; shift <= 5; shift++) {
    const factor = 2 ** shift
    let score = Math.abs(Math.log2(centre * factor / CONTROLLER_PITCH_TARGET_HZ))
    for (const pitch of voiced) {
      const frequency = pitch.frequencyHz * factor
      const outside = frequency < CONTROLLER_PITCH_MIN_HZ ? Math.log2(CONTROLLER_PITCH_MIN_HZ / frequency)
        : frequency > CONTROLLER_PITCH_MAX_HZ ? Math.log2(frequency / CONTROLLER_PITCH_MAX_HZ) : 0
      score += outside * outside * 3 * pitch.weight / total
    }
    if (score < bestScore - 1e-6 || (Math.abs(score - bestScore) <= 1e-6 && Math.abs(shift) < Math.abs(bestShift))) {
      bestScore = score; bestShift = shift
    }
  }
  return bestShift
}

/** The shift a finished sequence wants, weighting each note by its length. */
export const octaveShiftForTones = (tones: Tone[]) =>
  octaveShiftForPitches(tones.map(tone => ({ frequencyHz: tone.frequencyHz, weight: tone.durationMs })))

/** A frequency moved by whole octaves, then kept inside the file's range. */
export function shiftedFrequency(frequencyHz: number, octaveShift: number): number {
  if (frequencyHz <= 0) return 0
  let frequency = frequencyHz * 2 ** octaveShift
  while (frequency < TONE_FILE_MIN_HZ) frequency *= 2
  while (frequency > TONE_FILE_MAX_HZ) frequency /= 2
  return Math.round(frequency)
}

/** The whole sequence moved into the controller's band; rests are untouched. */
export function placeInControllerRange(tones: Tone[], octaveShift = octaveShiftForTones(tones)): Tone[] {
  if (!octaveShift) return tones.map(tone => ({ ...tone }))
  return tones.map(tone => ({ ...tone, frequencyHz: shiftedFrequency(tone.frequencyHz, octaveShift) }))
}

/**
 * Two consecutive notes at the same pitch are one long note to the actuator:
 * it simply keeps ringing. A short rest carved from the end of the first lets
 * the second be heard as a new note, the way a player lifts a finger. The
 * total length does not change. Notes too short to give anything up are left
 * alone, and a rest already between the two needs nothing.
 */
export function articulateRepeats(tones: Tone[]): Tone[] {
  const result: Tone[] = []
  for (const tone of tones) {
    const previous = result[result.length - 1]
    if (previous && previous.frequencyHz > 0 && tone.frequencyHz > 0 && previous.frequencyHz === tone.frequencyHz) {
      const gap = Math.min(ARTICULATION_GAP_MS, Math.floor(previous.durationMs / 3 / 10) * 10)
      if (gap >= 10 && previous.durationMs - gap >= CONTROLLER_MIN_NOTE_MS) {
        previous.durationMs -= gap
        result.push({ frequencyHz: 0, durationMs: gap, gainDb: -60 })
      }
    }
    result.push({ ...tone })
  }
  return result
}
