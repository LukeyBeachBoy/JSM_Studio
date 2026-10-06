#!/usr/bin/env node
// Measures how a thumb's swipes come out of the Steam Controller 2026 pads:
// the tilt of each stroke (what an orientation preference corrects), how far it
// bows away from a straight line, and whether that bow is one-sided (C) or
// changes side (S). It also lists every force-threshold crossing with how fast
// the thumb was still moving, which is what decides whether a light-press
// keyboard types the key the thumb was heading for or the one it was passing.
//
// Inputs:
//   - a JSM telemetry capture (JSONL from tools/record-keyboard-telemetry.py).
//     Uses leftPadRaw/rightPadRaw (SDL's coordinates before JSM's rotation)
//     when the packet has them.
//   - a USBPcap capture (.pcap) of the controller or its puck. This reads the
//     HID input reports (0x42) directly, so it needs neither JSM nor SDL and is
//     the independent reference for what the firmware itself reports.
//
// Usage:
//   node tools/analyse-pad-swipes.mjs <capture.jsonl|capture.pcap>
//        [--from <s>] [--to <s>] [--axis y|x] [--min-length 0.6]
//        [--press 0.02] [--release-ratio 0.65] [--json]
//
// Coordinates are the mapper's: -1..1, y down. A stroke's tilt is positive when
// its top leans clockwise (to the right) as you look at the controller; the
// Preferences rotation that straightens it is the negative of that.
import fs from 'node:fs'
import readline from 'node:readline'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--') && !/^-?\d/.test(a))
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback
}
if (!file) {
  console.error('usage: node tools/analyse-pad-swipes.mjs <capture.jsonl|capture.pcap> [--from s] [--to s] [--axis y|x] [--min-length 0.6] [--press 0.02] [--release-ratio 0.65] [--json]')
  process.exit(2)
}
const from = Number(option('from', -Infinity))
const to = Number(option('to', Infinity))
const axis = option('axis', 'y') === 'x' ? 'x' : 'y'
const minLength = Number(option('min-length', 0.6))
const pressAt = Number(option('press', 0.02))
const releaseRatio = Number(option('release-ratio', 0.65))
const asJson = args.includes('--json')
const SIDES = ['left', 'right']

// samples[side] = [{t, touched, x, y, p, click}]
async function loadJsonl(path) {
  const samples = { left: [], right: [] }
  let first = null
  const lines = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    let row
    try { row = JSON.parse(line) } catch { continue }
    const device = row.packet?.devices?.[0]
    const status = device?.status
    if (!status) continue
    const ms = typeof row.elapsedMs === 'number' ? row.elapsedMs : row.packet.ts
    if (first === null) first = ms
    const t = (ms - first) / 1000
    if (t < from || t > to) continue
    const buttons = BigInt(status.buttons ?? 0)
    for (const side of SIDES) {
      const pad = status[`${side}Pad`] ?? {}
      const raw = status[`${side}PadRaw`]
      const point = raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : pad
      samples[side].push({ t, touched: !!pad.touched, x: point.x, y: point.y, p: pad.pressure ?? 0,
        click: ((buttons >> (side === 'left' ? 29n : 28n)) & 1n) === 1n })
    }
  }
  return { samples, source: 'JSM telemetry (SDL coordinates before JSM rotation where present)' }
}

function loadPcap(path) {
  const buf = fs.readFileSync(path)
  if (buf.readUInt32LE(0) !== 0xa1b2c3d4) throw new Error('not a little-endian pcap file')
  const samples = { left: [], right: [] }
  let offset = 24, first = null
  while (offset + 16 <= buf.length) {
    const sec = buf.readUInt32LE(offset), usec = buf.readUInt32LE(offset + 4), length = buf.readUInt32LE(offset + 8)
    offset += 16
    const packet = buf.subarray(offset, offset + length)
    offset += length
    if (packet.length < 27) continue
    // USBPcap header: u16 length ... u8 endpoint at 21. Triton input report
    // 0x42 (SDL's TritonMTUFull_t): seq, u32 buttons, 2 triggers, 4 stick
    // axes, then left x/y/pressure and right x/y/pressure as int16/uint16.
    const data = packet.subarray(packet.readUInt16LE(0))
    if (!(packet[21] & 0x80) || data.length < 30 || data[0] !== 0x42) continue
    const time = sec + usec / 1e6
    if (first === null) first = time
    const t = time - first
    if (t < from || t > to) continue
    const buttons = data.readUInt32LE(2)
    const pads = { left: [18, 0x02000000, 0x04000000], right: [24, 0x00200000, 0x00400000] }
    for (const side of SIDES) {
      const [at, touch, click] = pads[side]
      samples[side].push({ t, touched: (buttons & touch) !== 0, x: data.readInt16LE(at) / 32768,
        y: -data.readInt16LE(at + 2) / 32768, p: data.readUInt16LE(at + 4) / 32768, click: (buttons & click) !== 0 })
    }
  }
  return { samples, source: 'USB HID input reports (independent of JSM and SDL)' }
}

function sessions(list) {
  const out = []
  let current = null
  for (const s of list) {
    if (!s.touched || !Number.isFinite(s.x) || !Number.isFinite(s.y)) { current = null; continue }
    if (!current) { current = []; out.push(current) }
    const last = current[current.length - 1]
    if (!last || last.x !== s.x || last.y !== s.y) current.push(s)
  }
  return out
}

// Split a contact into strokes at reversals of the chosen axis (0.08 hysteresis).
function strokes(session) {
  const out = []
  let start = 0, extreme = 0, direction = 0
  for (let i = 1; i < session.length; i++) {
    const value = session[i][axis]
    if (direction === 0) {
      if (Math.abs(value - session[start][axis]) > 0.08) { direction = Math.sign(value - session[start][axis]); extreme = i }
      continue
    }
    if ((value - session[extreme][axis]) * direction >= 0) extreme = i
    else if ((session[extreme][axis] - value) * direction > 0.08) {
      out.push(session.slice(start, extreme + 1))
      start = extreme; extreme = i; direction = -direction
    }
  }
  out.push(session.slice(start))
  return out
}

function describe(points) {
  const a = points[0], b = points[points.length - 1]
  const dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length < minLength) return null
  // Orient every stroke the same way along the chosen axis so tilts agree for
  // up and down strokes: "up" for y, "right" for x.
  const sign = axis === 'y' ? (dy <= 0 ? 1 : -1) : (dx >= 0 ? 1 : -1)
  const ux = dx * sign / length, uy = dy * sign / length
  // Tilt from the reference direction, positive clockwise (y is down).
  const tilt = axis === 'y' ? Math.atan2(ux, -uy) : Math.atan2(uy, ux)
  // Signed perpendicular deviation from the chord; positive to the stroke's right.
  const deviation = points.map(p => (p.x - a.x) * -uy + (p.y - a.y) * ux)
  const largest = Math.max(...deviation.map(Math.abs))
  const positive = Math.max(0, ...deviation), negative = Math.max(0, ...deviation.map(d => -d))
  const shape = largest < 0.02 ? 'straight' : Math.min(positive, negative) >= Math.max(0.02, 0.3 * largest) ? 'S' : 'C'
  const ms = (b.t - a.t) * 1000
  return { start: a.t, ms: Math.round(ms), from: [a.x, a.y], to: [b.x, b.y], length, tiltDegrees: tilt * 180 / Math.PI,
    maxDeviation: largest, deviationRightOfChord: positive, deviationLeftOfChord: negative, shape }
}

// Force crossings with the keyboard's own rule: press at `press`, release at
// press * releaseRatio, physical click also counts.
function presses(list) {
  const out = []
  let down = false
  for (let i = 0; i < list.length; i++) {
    const s = list[i]
    const force = s.touched && s.p >= pressAt * (down ? releaseRatio : 1)
    const now = force || s.click
    if (now && !down && s.touched) {
      let j = i
      while (j > 0 && list[j - 1].t > s.t - 0.06 && list[j - 1].touched) j--
      let peak = s.p
      for (let k = i; k < list.length && list[k].t < s.t + 0.25 && list[k].touched; k++) peak = Math.max(peak, list[k].p)
      // Movement in Standard-layout keys (12 columns, 5 rows over the pad).
      const moved = Math.hypot((s.x - list[j].x) * 6, (s.y - list[j].y) * 2.5)
      out.push({ t: s.t, via: s.click && !(s.p >= pressAt) ? 'click' : 'force', pressure: s.p, peak, keysMovedInPrevious60ms: moved })
    }
    down = now
  }
  return out
}

const median = values => {
  if (!values.length) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
const quantile = (values, q) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * q))]

const { samples, source } = file.toLowerCase().endsWith('.pcap') ? loadPcap(file) : await loadJsonl(file)
const report = { file, source, axis, minLength, pressThreshold: pressAt, releaseRatio, pads: {} }
for (const side of SIDES) {
  const list = samples[side]
  const all = sessions(list).flatMap(strokes).map(describe).filter(Boolean)
  const tilts = all.map(s => s.tiltDegrees)
  const press = presses(list)
  report.pads[side] = {
    touchedSamples: list.filter(s => s.touched).length,
    strokes: all.length,
    medianTiltDegrees: median(tilts),
    tiltInterquartileDegrees: all.length >= 4 ? [quantile(tilts, 0.25), quantile(tilts, 0.75)] : null,
    suggestedRotationDegrees: all.length >= 5 ? -median(tilts) : null,
    medianMaxDeviation: median(all.map(s => s.maxDeviation)),
    medianMaxDeviationStandardKeys: axis === 'y' ? median(all.map(s => s.maxDeviation)) * 6 : median(all.map(s => s.maxDeviation)) * 2.5,
    shapes: { straight: all.filter(s => s.shape === 'straight').length, C: all.filter(s => s.shape === 'C').length, S: all.filter(s => s.shape === 'S').length },
    presses: press.length,
    pressesWhileMoving: press.filter(p => p.keysMovedInPrevious60ms > 0.25).length,
    strokeList: all,
    pressList: press,
  }
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const f = (n, d = 2) => Number.isFinite(n) ? n.toFixed(d) : '-'
  console.log(`${file}\n${source}\nstrokes along ${axis}, at least ${minLength} pad units; force press ${pressAt}, release ${f(pressAt * releaseRatio, 3)}\n`)
  for (const side of SIDES) {
    const r = report.pads[side]
    console.log(`${side} pad: ${r.strokes} strokes, median tilt ${f(r.medianTiltDegrees, 1)}° (IQR ${r.tiltInterquartileDegrees ? r.tiltInterquartileDegrees.map(v => f(v, 1)).join('..') : '-'}), ` +
      `rotation that straightens the median ${r.suggestedRotationDegrees === null ? '- (need 5+ strokes)' : f(r.suggestedRotationDegrees, 1) + '°'}`)
    console.log(`  bow: median ${f(r.medianMaxDeviation, 3)} pad units = ${f(r.medianMaxDeviationStandardKeys)} Standard-layout ${axis === 'y' ? 'key widths' : 'rows'}; shapes straight ${r.shapes.straight}, C ${r.shapes.C}, S ${r.shapes.S}`)
    console.log(`  presses ${r.presses}, ${r.pressesWhileMoving} while the thumb moved more than a quarter key in the previous 60 ms`)
    for (const s of r.strokeList) {
      console.log(`    t=${f(s.start)}s ${String(s.ms).padStart(5)} ms  (${f(s.from[0])},${f(s.from[1])}) -> (${f(s.to[0])},${f(s.to[1])})  len ${f(s.length)}  tilt ${f(s.tiltDegrees, 1).padStart(6)}°  bow ${f(s.maxDeviation, 3)} (R ${f(s.deviationRightOfChord, 3)} / L ${f(s.deviationLeftOfChord, 3)})  ${s.shape}`)
    }
  }
}
