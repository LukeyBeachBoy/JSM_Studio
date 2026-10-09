import { readVirtualSetting } from './virtualStickSettings'

// A TypeScript model of the mapper's gyro steadying pipeline, in the order
// JoyShockMapper runs it (main.cpp, processGyro; JoyShock.cpp):
//
//   1. smoothing -- tiered moving average (getSmoothedGyro: fully smoothed
//      below GYRO_SMOOTH_THRESHOLD / 2, blending to untouched at the
//      threshold, over GYRO_SMOOTH_TIME / TICK_TIME samples), or with
//      GYRO_SMOOTHING_DECAY the continuous decay (applyGyroDecaySmoothing);
//   2. the adaptive (One Euro) filter, when ONE_EURO_FILTER is on;
//   3. the jitter cutoff -- nothing below GYRO_CUTOFF_SPEED, fading back in up
//      to GYRO_CUTOFF_RECOVERY.
//
// It replays canned traces (a hand holding still, a slow aim, a fast turn) to
// give the Steadiness visual its numbers: how much wobble is left, how late
// slow aim arrives, and whether fast turns are touched. It is an illustration
// of the settings being edited, not a measurement of the controller.

export type SteadyingSettings = {
  cutoff: number
  recovery: number
  smoothThreshold: number
  smoothTime: number
  decay: boolean
  oneEuro: boolean
  minCutoff: number
  speedCoeff: number
  tickMs: number
}

const num = (text: string, key: string, fallback: number, prefix = '') => {
  const raw = readVirtualSetting(text, key, prefix)
  const value = raw === undefined ? NaN : Number(raw.trim().split(/\s+/)[0])
  return Number.isFinite(value) ? value : fallback
}
const on = (text: string, key: string, prefix = '') => {
  const lines = text.split(/\r?\n/)
  // ONE_EURO_FILTER is a bare flag in many files; "= OFF" turns it off.
  const pattern = new RegExp(`^\\s*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${key}\\b\\s*(=\\s*(\\S+))?`, 'i')
  let state = false
  for (const line of lines) {
    const match = line.match(pattern)
    if (match) state = !match[2] || /^(ON|TRUE|1)$/i.test(match[2])
  }
  return state
}

export const isOneEuroOn = (text: string) => on(text, 'ONE_EURO_FILTER')

export function readSteadyingSettings(text: string, overrides: Partial<SteadyingSettings> = {}): SteadyingSettings {
  return {
    cutoff: num(text, 'GYRO_CUTOFF_SPEED', 0),
    recovery: num(text, 'GYRO_CUTOFF_RECOVERY', 0),
    smoothThreshold: num(text, 'GYRO_SMOOTH_THRESHOLD', 0),
    smoothTime: num(text, 'GYRO_SMOOTH_TIME', 0.125),
    decay: (readVirtualSetting(text, 'GYRO_SMOOTHING_DECAY') ?? 'OFF').trim().toUpperCase() === 'ON',
    oneEuro: isOneEuroOn(text),
    minCutoff: num(text, 'ONE_EURO_MIN_CUTOFF', 6),
    speedCoeff: num(text, 'ONE_EURO_SPEED_COEFF', 0.3),
    tickMs: Math.max(0.5, num(text, 'TICK_TIME', 3)),
    ...overrides,
  }
}

const MAX_SAMPLES = 256
const TWO_PI = 2 * Math.PI

class LowPass { y = 0; init = false; run(x: number, a: number) { this.y = this.init ? a * x + (1 - a) * this.y : x; this.init = true; return this.y } }
class OneEuro {
  x = new LowPass(); dx = new LowPass(); prev = 0; init = false
  static alpha(cutoff: number, dt: number) { const tau = 1 / (TWO_PI * cutoff); return 1 / (1 + tau / dt) }
  run(value: number, dt: number, minCutoff: number, beta: number) {
    const d = this.init ? (value - this.prev) / dt : 0
    this.prev = value; this.init = true
    const ed = this.dx.run(d, OneEuro.alpha(1, dt))
    return this.x.run(value, OneEuro.alpha(Math.max(1e-3, minCutoff + beta * Math.abs(ed)), dt))
  }
}

/** One controller's steadying state, fed a sample per tick. */
export class SteadyingModel {
  private ring: [number, number][] = Array.from({ length: MAX_SAMPLES }, () => [0, 0])
  private front = 0
  private decay: [number, number] | null = null
  private euro = [new OneEuro(), new OneEuro()]
  constructor(private s: SteadyingSettings) {}

  step(x: number, y: number): [number, number] {
    const s = this.s
    const dt = s.tickMs / 1000
    const length = Math.hypot(x, y)
    if (s.decay) {
      if (s.smoothTime > 0 && s.smoothThreshold > 0) {
        const t = Math.min(1, Math.max(0, length / s.smoothThreshold))
        const g = (1 - t) * (1 - t)
        const target: [number, number] = [x * g, y * g]
        const time = s.smoothTime * g
        const a = time <= 1e-6 ? 1 : 1 - Math.exp(-dt / time)
        if (!this.decay) this.decay = target
        this.decay = [this.decay[0] + a * (target[0] - this.decay[0]), this.decay[1] + a * (target[1] - this.decay[1])]
        x = this.decay[0] + x * (1 - g); y = this.decay[1] + y * (1 - g)
      }
    } else {
      const samples = Math.round(Math.min(MAX_SAMPLES, Math.max(1, (s.smoothTime * 1000) / s.tickMs)))
      const bottom = s.smoothThreshold / 2, top = s.smoothThreshold
      let immediate = top <= bottom ? (length < bottom ? 0 : 1) : (length - bottom) / (top - bottom)
      immediate = Math.min(1, Math.max(0, immediate))
      const smooth = 1 - immediate
      this.front = (this.front - 1 + MAX_SAMPLES) % MAX_SAMPLES
      this.ring[this.front] = [x * smooth, y * smooth]
      let rx = 0, ry = 0
      for (let i = 0; i < samples; i++) { const sample = this.ring[(this.front + i) % MAX_SAMPLES]; rx += sample[0] / samples; ry += sample[1] / samples }
      x = rx + x * immediate; y = ry + y * immediate
    }
    if (s.oneEuro) { x = this.euro[0].run(x, dt, s.minCutoff, s.speedCoeff); y = this.euro[1].run(y, dt, s.minCutoff, s.speedCoeff) }
    const speed = Math.hypot(x, y)
    if (s.recovery > s.cutoff) {
      const factor = (speed - s.cutoff) / (s.recovery - s.cutoff)
      if (factor <= 0) return [0, 0]
      if (factor < 1) return [x * factor, y * factor]
    } else if (s.cutoff > 0 && speed < s.cutoff) return [0, 0]
    return [x, y]
  }
}

// Deterministic "hand" noise, so the stats do not flicker between renders.
function prng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
/** A hand holding the controller still: a few-hertz tremor of about `amplitude` °/s plus sensor noise. */
function tremor(seconds: number, tickMs: number, amplitude = 2.5): [number, number][] {
  const random = prng(7)
  const n = Math.round((seconds * 1000) / tickMs)
  return Array.from({ length: n }, (_, i) => {
    const t = (i * tickMs) / 1000
    return [amplitude * (Math.sin(TWO_PI * 6.3 * t) * 0.7 + Math.sin(TWO_PI * 9.1 * t + 1) * 0.3) + (random() - 0.5) * amplitude * 0.6,
      amplitude * 0.8 * Math.sin(TWO_PI * 7.4 * t + 2) + (random() - 0.5) * amplitude * 0.5]
  })
}
const rms = (values: [number, number][]) => Math.sqrt(values.reduce((sum, [x, y]) => sum + x * x + y * y, 0) / Math.max(1, values.length))

/** Time (ms) for the output to reach half its settled value after a step to `speed`. */
function halfRiseMs(s: SteadyingSettings, speed: number) {
  const model = new SteadyingModel(s)
  const ticks = Math.round(1500 / s.tickMs)
  const out: number[] = []
  for (let i = 0; i < ticks; i++) out.push(model.step(speed, 0)[0])
  const settled = out[out.length - 1]
  if (settled <= 1e-6) return { ms: Infinity, ratio: 0 }
  const index = out.findIndex(value => value >= settled / 2)
  return { ms: index * s.tickMs, ratio: settled / speed }
}

export type SteadinessStats = {
  /** How much of a still hand's wobble is removed, 0-1. */
  wobbleCut: number
  /** Half-rise delay of a slow (4 °/s) aim, in ms. */
  slowDelayMs: number
  /** How much of a slow aim's speed survives, 0-1 (cutoff can hold some back). */
  slowKept: number
  /** Half-rise delay of a fast (120 °/s) turn, ms; one tick or less is "untouched". */
  fastDelayMs: number
  fastKept: number
}

export function steadinessStats(s: SteadyingSettings): SteadinessStats {
  const still = tremor(2, s.tickMs)
  const model = new SteadyingModel(s)
  const filtered = still.map(([x, y]) => model.step(x, y))
  const skip = Math.round(300 / s.tickMs)
  const before = rms(still.slice(skip)), after = rms(filtered.slice(skip))
  const slow = halfRiseMs(s, 4), fast = halfRiseMs(s, 120)
  return { wobbleCut: before > 0 ? Math.max(0, 1 - after / before) : 0, slowDelayMs: slow.ms, slowKept: slow.ratio, fastDelayMs: fast.ms, fastKept: fast.ratio }
}

/** A slow sweep onto a target over the last 2 s: the aim's path, raw and filtered, as x/y positions (degrees). */
export function sweepPaths(s: SteadyingSettings, seconds = 2) {
  const shake = tremor(seconds, s.tickMs, 1.6)
  const model = new SteadyingModel(s)
  const n = shake.length
  let rawX = 0, rawY = 0, outX = 0, outY = 0
  const raw: [number, number][] = [], out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    // Toward the target and slowing to a stop: 6 °/s easing to 0.
    const ease = 1 - i / n
    const vx = 6 * ease + shake[i][0], vy = 3.2 * ease + shake[i][1]
    const [fx, fy] = model.step(vx, vy)
    const dt = s.tickMs / 1000
    rawX += vx * dt; rawY += vy * dt; outX += fx * dt; outY += fy * dt
    if (i % 4 === 0) { raw.push([rawX, rawY]); out.push([outX, outY]) }
  }
  return { raw, out }
}

/** Fraction of movement that is smoothed at `speed` (Smoothing part's graph). */
export function smoothedAt(speed: number, s: Pick<SteadyingSettings, 'smoothThreshold' | 'decay'>) {
  if (s.smoothThreshold <= 0) return 0
  if (s.decay) { const t = Math.min(1, speed / s.smoothThreshold); return (1 - t) * (1 - t) }
  const bottom = s.smoothThreshold / 2
  return 1 - Math.min(1, Math.max(0, (speed - bottom) / (s.smoothThreshold - bottom)))
}

/** Fraction that gets through the jitter cutoff at `speed` (Ignore jitter part's graph). */
export function passedAt(speed: number, cutoff: number, recovery: number) {
  if (recovery > cutoff) return Math.min(1, Math.max(0, (speed - cutoff) / (recovery - cutoff)))
  return cutoff > 0 && speed < cutoff ? 0 : 1
}

/**
 * How much the adaptive filter smooths a movement at `speed` (illustrative:
 * the One Euro cutoff rises with how fast the speed is changing; a turn
 * starting from rest changes about as fast as it is).
 */
export function euroSmoothedAt(speed: number, minCutoff: number, speedCoeff: number, tickMs = 16) {
  const cutoff = Math.max(1e-3, minCutoff + speedCoeff * Math.abs(speed))
  return 1 - OneEuro.alpha(cutoff, tickMs / 1000)
}

/** About how late slow aim arrives with this smoothing window, ms (the Smoothing part's caption). */
export function smoothingLagMs(s: SteadyingSettings) {
  if (s.smoothThreshold <= 0) return 0
  return halfRiseMs({ ...s, cutoff: 0, recovery: 0, oneEuro: false }, s.smoothThreshold / 4).ms
}
