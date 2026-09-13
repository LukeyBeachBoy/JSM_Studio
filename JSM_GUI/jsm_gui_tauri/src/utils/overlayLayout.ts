// What the overlay draws, described by the config itself rather than hardcoded
// in the UI. JoyShockMapper ignores comment lines, so a profile carrying these
// still loads anywhere -- the same trick `# @label` already uses.
//
//   # @overlay RIGHT at 0.82 0.74 size 300
//   # @overlay LEFT  at 0.18 0.74 size 260 keys off font 18
//   # @overlay RIGHT:MISC2 at 0.5 0.5 size 360 labels off
//
// Position is a fraction of the monitor work area (0,0 top-left to 1,1
// bottom-right) and refers to the CENTRE of the menu, so a layout keeps its
// place across resolutions rather than drifting with pixel counts.
//
// Options, all optional and order-independent, so directives written before any
// of them existed still parse:
//
//   size <px>      menu WIDTH; height follows the pad's real aspect ratio
//   labels on|off  show each region's action name
//   keys on|off    show the key/button each region is bound to
//   font <px>      label size; keys are drawn slightly smaller
//   show touch|ring  when the menu appears: on contact/any tilt, or only once
//                    the input reaches the ring where a segment is selected
//
// Labels reuse `# @label RT1 = Reload` -- one label vocabulary for the binding
// editor and the overlay, so naming an action in Studio names it on the pad.

import { parseBindingLabels, type BindingLabels } from './bindingLabels'
import { parseBindingIcons, type BindingIcons } from './bindingIcons'
import { getKeymapValue } from './keymap'

/**
 * What a menu is drawn on. LEFT/RIGHT are the trackpads; LSTICK/RSTICK are the
 * thumbsticks in RADIAL_MENU mode, whose segments are LM1../RM1.. instead of
 * LT1../RT1... Everything downstream -- placement, labels, icons, hit testing,
 * drag positioning -- is the same for both, so a stick wheel is not a second
 * implementation of the pad one.
 */
export type OverlaySurface = 'LEFT' | 'RIGHT' | 'LSTICK' | 'RSTICK'
/** @deprecated kept so existing pad-only call sites read unchanged. */
export type OverlayPad = OverlaySurface

export const isStickSurface = (surface: OverlaySurface) =>
  surface === 'LSTICK' || surface === 'RSTICK'

export type OverlayPlacement = {
  /** Centre of the menu as a fraction of the monitor work area. */
  x: number
  y: number
  /**
   * Menu WIDTH in logical pixels. Height follows the pad's real aspect ratio
   * (see utils/padGeometry), so one stored number keeps a menu the right shape
   * on any controller and any screen.
   */
  size: number
  /** Show each region's action name. */
  showLabels: boolean
  /** Show the key/button each region is bound to. */
  showKeys: boolean
  /** Label font size in logical pixels; keys are drawn slightly smaller. */
  fontSize: number
  /**
   * When the menu appears.
   *
   * 'ring'  -- only once the input has moved out into the ring, where a segment
   *            is actually selected. The menu confirms what you have chosen.
   * 'touch' -- as soon as the pad is touched, or the stick leaves its centre
   *            dead zone. This is the one that matters when regions fire on
   *            touch rather than on release: you get to see the wheel and aim at
   *            the action you want before committing to it.
   *
   * Defaults per surface to whatever that surface already did: pads have always
   * shown their menu on contact, stick wheels only past the dead zone.
   */
  reveal: 'ring' | 'touch'
}

export type OverlayRegion = {
  /** RT1.. / LT1.. -- the command the backend fires for this region. */
  command: string
  /** Human name for the action, from `# @label`, else the binding, else ''. */
  label: string
  /** What the config actually assigned, e.g. `R` or `MMOUSE`. */
  binding: string
  /** Iconify name from `# @icon`, or '' when none was chosen. */
  icon: string
}

export type OverlayMenu = {
  pad: OverlayPad
  /** '' for the base layer, else the chord prefix, e.g. 'MISC2'. */
  layer: string
  shape: 'RECTANGLE' | 'FOUR_WAY' | 'RADIAL'
  columns: number
  rows: number
  /** Fraction of the pad, centre to edge, that selects nothing. */
  deadzone: number
  /**
   * A stick's ordinary inner dead zone -- how far it must leave centre before
   * the backend calls it moved at all. Nothing to do with the menu's own
   * dead zone: this is the floor for `reveal: 'touch'`, without which a stick
   * resting a hair off centre would flicker the wheel on and off. 0 for a pad,
   * which has a real contact signal instead.
   */
  centreDeadzone: number
  /** Whether a region fires on touch or only once the pad is clicked. */
  requiresClick: boolean
  regions: OverlayRegion[]
  placement: OverlayPlacement
}

// Signs are accepted so a hand-edited out-of-range value is clamped to
// somewhere visible rather than failing to match and silently leaving the menu
// at its default with nothing to explain why. Everything after `at x y` is
// optional, so directives written before these options existed still parse.
const OVERLAY_LINE =
  /^\s*#\s*@overlay\s+(LEFT|RIGHT|LSTICK|RSTICK)(?::([A-Z0-9_,+]+))?\s+at\s+(-?[0-9.]+)\s+(-?[0-9.]+)(.*)$/i
const OPTION = (name: string) => new RegExp(`\\b${name}\\s+([A-Za-z0-9.]+)\\b`, 'i')

/** Sensible corners: each pad's menu sits under the thumb that drives it. */
const DEFAULTS = { size: 280, showLabels: true, showKeys: true, fontSize: 14 }
const DEFAULT_PLACEMENT: Record<OverlaySurface, OverlayPlacement> = {
  // A pad menu has always appeared the moment a thumb lands, and a stick wheel
  // only once the stick is pushed far enough to pick something. Those stay the
  // defaults, so adding this option changes nobody's existing profile.
  LEFT: { x: 0.2, y: 0.75, ...DEFAULTS, reveal: 'touch' },
  RIGHT: { x: 0.8, y: 0.75, ...DEFAULTS, reveal: 'touch' },
  // Centre-ish, because a stick wheel is a thing you look AT while choosing,
  // unlike a pad menu you glance at in the corner.
  LSTICK: { x: 0.35, y: 0.5, ...DEFAULTS, reveal: 'ring' },
  RSTICK: { x: 0.65, y: 0.5, ...DEFAULTS, reveal: 'ring' },
}

/** What this surface does when the profile says nothing. */
export const defaultReveal = (surface: OverlaySurface) => DEFAULT_PLACEMENT[surface].reveal

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
// Anything unrecognised falls back to the surface's default rather than being
// treated as one of the two, so a typo does not silently change when the menu
// appears.
const reveal = (raw: string | undefined, surface: OverlaySurface): 'ring' | 'touch' =>
  /^touch$/i.test(raw ?? '') ? 'touch'
    : /^ring$/i.test(raw ?? '') ? 'ring'
      : DEFAULT_PLACEMENT[surface].reveal
const bool = (raw: string | undefined, fallback: boolean) =>
  raw === undefined ? fallback : !/^(0|off|false|no|hide|hidden)$/i.test(raw)

export function parseOverlayPlacements(text: string): Record<string, OverlayPlacement> {
  const out: Record<string, OverlayPlacement> = {}
  text.split(/\r?\n/).forEach(line => {
    const match = OVERLAY_LINE.exec(line)
    if (!match) return
    const pad = match[1].toUpperCase()
    const layer = (match[2] ?? '').toUpperCase()
    const rest = match[5] ?? ''
    const num = (name: string, lo: number, hi: number, fallback: number) => {
      const raw = OPTION(name).exec(rest)?.[1]
      const value = Number.parseFloat(raw ?? '')
      return Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : fallback
    }
    out[layer ? `${pad}:${layer}` : pad] = {
      x: clamp01(Number.parseFloat(match[3])),
      y: clamp01(Number.parseFloat(match[4])),
      size: num('size', 120, 900, DEFAULTS.size),
      showLabels: bool(OPTION('labels').exec(rest)?.[1], DEFAULTS.showLabels),
      showKeys: bool(OPTION('keys').exec(rest)?.[1], DEFAULTS.showKeys),
      fontSize: num('font', 8, 48, DEFAULTS.fontSize),
      reveal: reveal(OPTION('show').exec(rest)?.[1], pad as OverlaySurface),
    }
  })
  return out
}

/** Writes or replaces one menu's placement line, so the UI can drag-to-position. */
export function setOverlayPlacement(
  text: string,
  pad: OverlayPad,
  layer: string,
  placement: OverlayPlacement
): string {
  const key = layer ? `${pad}:${layer}` : pad
  const round = (v: number) => Number(v.toFixed(4))
  // Only non-default options are written, so a plain menu keeps a short,
  // readable line instead of accumulating every setting at its default value.
  const options = [
    `size ${Math.round(placement.size)}`,
    placement.showLabels === DEFAULTS.showLabels ? '' : `labels ${placement.showLabels ? 'on' : 'off'}`,
    placement.showKeys === DEFAULTS.showKeys ? '' : `keys ${placement.showKeys ? 'on' : 'off'}`,
    placement.fontSize === DEFAULTS.fontSize ? '' : `font ${Math.round(placement.fontSize)}`,
    // Normalised, not read straight off the object: a caller holding a
    // placement built before this field existed has no reveal at all, and
    // writing it raw put the literal "show undefined" into the profile.
    reveal(placement.reveal, pad) === DEFAULT_PLACEMENT[pad].reveal
      ? ''
      : `show ${reveal(placement.reveal, pad)}`,
  ].filter(Boolean).join(' ')
  const next = `# @overlay ${key} at ${round(placement.x)} ${round(placement.y)} ${options}`
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex(line => {
    const match = OVERLAY_LINE.exec(line)
    if (!match) return false
    const linePad = match[1].toUpperCase()
    const lineLayer = (match[2] ?? '').toUpperCase()
    return (lineLayer ? `${linePad}:${lineLayer}` : linePad) === key
  })
  if (index >= 0) lines[index] = next
  else lines.push(next)
  return lines.join('\n')
}

/** Telemetry pad coordinates are -1..1 with +y downward; grid maths is 0..1. */
export const toUnit = (v: number) => Math.min(0.9999, Math.max(0, (v + 1) / 2))

/**
 * Which region a touch selects, in telemetry coordinates.
 *
 * This MUST agree with `touchGridCell` / `touchFourWayCell` in
 * JoyShockMapper/include/TouchGridRouting.h. If it drifts, the overlay
 * highlights one action while the pad fires another, which is worse than having
 * no overlay at all -- hence the parity test in tests/overlay_layout_regression.cjs.
 */
export function hitTestRegion(menu: OverlayMenu, x: number, y: number): number {
  // The backend does this arithmetic in `float`; JavaScript numbers are
  // `double`. On an exact diagonal (|dx| == |dy|) or an exact cell boundary the
  // comparison is a knife edge, and the two precisions disagree about which side
  // of it a coordinate falls on -- which showed up as 20 mismatched coordinates
  // the first time the parity test ran. Rounding each step to float reproduces
  // the backend's rounding rather than approximating it.
  const f = Math.fround
  const ux = f(toUnit(x))
  const uy = f(toUnit(y))
  if (menu.shape === 'RADIAL') {
    const segments = menu.regions.length
    if (segments < 2) return -1
    const dx = f(ux - 0.5)
    const dy = f(uy - 0.5)
    const limit = f(f(Math.min(1, Math.max(0, menu.deadzone))) * 0.5)
    if (limit > 0 && f(Math.hypot(dx, dy)) <= limit) return -1
    // atan2(dx, -dy) is 0 pointing up and grows clockwise; half a segment of
    // bias centres segment 0 on up rather than starting its edge there.
    const TAU = f(6.2831853071795864769)
    const step = f(TAU / segments)
    let angle = f(f(Math.atan2(dx, -dy)) + f(step * 0.5))
    while (angle < 0) angle = f(angle + TAU)
    while (angle >= TAU) angle = f(angle - TAU)
    return Math.min(segments - 1, Math.max(0, Math.trunc(f(angle / step))))
  }
  if (menu.shape === 'FOUR_WAY') {
    const dx = f(ux - 0.5)
    const dy = f(uy - 0.5)
    const limit = f(f(Math.min(1, Math.max(0, menu.deadzone))) * 0.5)
    if (limit > 0 && f(Math.hypot(dx, dy)) <= limit) return -1
    if (Math.abs(dy) >= Math.abs(dx)) return dy <= 0 ? 0 : 2
    return dx > 0 ? 1 : 3
  }
  const col = Math.min(menu.columns - 1, Math.max(0, Math.floor(f(ux * menu.columns))))
  const row = Math.min(menu.rows - 1, Math.max(0, Math.floor(f(uy * menu.rows))))
  const index = row * menu.columns + col
  return index < menu.regions.length ? index : -1
}

/**
 * The wheel's hole, as a fraction of its RADIUS.
 *
 * `deadzone` is the fraction of the pad from centre to edge that selects
 * nothing, and that is exactly what the backend compares against:
 * `touchRadialCell` tests `hypot(dx, dy) <= deadzone * 0.5` in 0..1 pad
 * coordinates, where the pad's half width is 0.5 -- so the hole's radius is
 * `deadzone` of the wheel's radius, not half of it.
 *
 * The drawing used to halve it, so the wheel showed a hole half the size of the
 * dead zone it stood for: a stick pushed part way looked like it had left the
 * hole and picked a segment, and fired nothing. Same class of bug as a region
 * drawn outside the box the hit test gives it.
 */
export const radialInnerRadius = (deadzone: number) => Math.min(0.95, Math.max(0, deadzone))

/**
 * One boundary line between two segments, as inline style for a thin element
 * pinned at the wheel's centre and pointing up.
 *
 * Drawn as its own layer rather than as a border on the segments, for two
 * reasons that both come down to "what you see must be what fires":
 *
 *  - the segments are clipped shapes sharing ONE box, so an inset shadow on a
 *    segment traces the pad's rectangle rather than the segment's own edges;
 *  - narrowing the drawn wedge to leave a gap between segments would make the
 *    visible edge stop matching the boundary the hit test uses.
 *
 * The angle is the same `(index + 0.5) * step` the hit test splits on, so a
 * divider is literally drawn where the action changes.
 */
export function radialDividerStyle(index: number, segments: number, deadzone = 0) {
  const step = 360 / Math.max(2, segments)
  const inner = radialInnerRadius(deadzone) * 100
  return {
    transform: `rotate(${(index + 0.5) * step}deg)`,
    // Transparent across the hole so the line starts at the rim of the donut.
    background: `linear-gradient(to top, transparent ${inner}%, var(--menu-divider) ${inner}%)`,
  }
}

/** The ring around the hole, sized from the same radius the segments are cut to. */
export function radialHubStyle(deadzone = 0) {
  const size = radialInnerRadius(deadzone) * 100
  return { width: `${size}%`, height: `${size}%` }
}

/**
 * A CSS `polygon()` covering one segment of a wheel, for clipping a region
 * element into an annular sector. Used by the overlay and the editor preview so
 * the two cannot draw different shapes for the same menu.
 *
 * Percentages of the element's own box, matching the wedge clips. The outer
 * radius deliberately overshoots so the corners of a square pad are filled; the
 * container clips the overhang. `deadzone` becomes the hole in the middle.
 */
export function radialSegmentClip(index: number, segments: number, deadzone = 0): string {
  if (segments < 2) return 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
  const TAU = Math.PI * 2
  const step = TAU / segments
  // Centred on up, clockwise, matching touchRadialCell.
  const from = index * step - step / 2
  const to = from + step
  const inner = radialInnerRadius(deadzone)
  const outer = 1.5
  // Enough points that the arc does not read as a straight chord on a wide
  // segment, without generating a polygon nobody can read in devtools.
  const steps = Math.max(3, Math.ceil(step / (Math.PI / 18)))
  const at = (angle: number, radius: number) => {
    const x = 50 + 50 * radius * Math.sin(angle)
    const y = 50 - 50 * radius * Math.cos(angle)
    return `${x.toFixed(2)}% ${y.toFixed(2)}%`
  }
  const points: string[] = []
  for (let i = 0; i <= steps; i++) points.push(at(from + (step * i) / steps, outer))
  if (inner > 0) {
    for (let i = steps; i >= 0; i--) points.push(at(from + (step * i) / steps, inner))
  } else {
    points.push(at(to, 0))
  }
  return `polygon(${points.join(', ')})`
}

/**
 * Where a segment's label sits, as a percentage of the menu box.
 *
 * Halfway across the annulus, because that is the only place it fits: a segment
 * is clipped to its annular sector, so anything that reaches into the hole is
 * cut off by the segment's own clip-path -- which is what chopped the "t" off
 * "Medkit" when the labels sat at a fixed distance from the centre.
 *
 * The width is explicit for a subtler reason. An absolutely positioned box with
 * a `left` and no `right` shrinks to fit whatever room is left between `left`
 * and the container's edge, and the `translate(-50%)` that centres it happens
 * after layout -- so a label on the right-hand side of the wheel was being
 * given the last 16% of the box to lay out in, and "Grenade" wrapped to
 * "Grenad / e". Setting the width and pulling it back by half with a margin
 * centres it at layout time, and sizing it from the annulus keeps it inside the
 * ring it belongs to.
 */
export function radialLabelPosition(index: number, segments: number, deadzone = 0) {
  const step = (Math.PI * 2) / Math.max(2, segments)
  const angle = index * step
  const inner = radialInnerRadius(deadzone)
  const radius = inner + (1 - inner) * 0.5
  // Percentage margins resolve against the container's WIDTH, so this centres
  // the box on the point whatever the wheel's pixel size is.
  const width = Math.max(16, (1 - inner) * 42)
  return {
    left: `${50 + 50 * radius * Math.sin(angle)}%`,
    top: `${50 - 50 * radius * Math.cos(angle)}%`,
    width: `${width}%`,
    marginLeft: `${-width / 2}%`,
    transform: 'translateY(-50%)',
  }
}

/**
 * The config keys describing one surface's menu. A stick wheel is configured by
 * a different family of settings (LEFT_STICK_MODE / _STICK_MENU_SIZE / ...) but
 * describes the same thing, so both collapse to one shape here.
 */
const surfaceKeys = (surface: OverlaySurface) => {
  if (surface === 'LSTICK' || surface === 'RSTICK') {
    const side = surface === 'LSTICK' ? 'LEFT' : 'RIGHT'
    return {
      mode: `${side}_STICK_MODE`,
      // A stick wheel has a segment COUNT, not rows and columns.
      size: `${side}_STICK_MENU_SIZE`,
      shape: '',
      deadzone: `${side}_STICK_MENU_DEADZONE`,
      requiresClick: '',
      prefix: surface === 'LSTICK' ? 'LM' : 'RM',
      activeMode: 'RADIAL_MENU',
    }
  }
  return {
    mode: `${surface}_TOUCHPAD_MODE`,
    size: `${surface}_GRID_SIZE`,
    shape: `${surface}_GRID_SHAPE`,
    deadzone: `${surface}_GRID_DEADZONE`,
    requiresClick: `${surface}_GRID_REQUIRES_CLICK`,
    prefix: surface === 'LEFT' ? 'LT' : 'RT',
    activeMode: 'GRID_AND_STICK',
  }
}

/**
 * Resolve one pad's menu for one layer. `layer` is a chord prefix ('' for the
 * base layer); chorded keys win over unchorded ones, matching how the backend
 * walks its chord stack.
 */
export function resolveOverlayMenu(
  text: string,
  labels: BindingLabels,
  icons: BindingIcons,
  placements: Record<string, OverlayPlacement>,
  pad: OverlayPad,
  layer: string
): OverlayMenu | null {
  const keys = surfaceKeys(pad)
  const read = (key: string) =>
    !key ? undefined
      : (layer ? getKeymapValue(text, `${layer},${key}`) : undefined) ?? getKeymapValue(text, key)

  const mode = (read(keys.mode) ?? '').trim().toUpperCase()
  if (mode !== keys.activeMode) return null

  const stick = isStickSurface(pad)
  const rawShape = (read(keys.shape) ?? '').trim().toUpperCase()
  // A stick menu is only ever a wheel; there is no rectangle on a stick.
  const shape = stick
    ? 'RADIAL'
    : rawShape === 'FOUR_WAY' ? 'FOUR_WAY' : rawShape === 'RADIAL' ? 'RADIAL' : 'RECTANGLE'

  let columns: number
  let rows: number
  let count: number
  if (stick) {
    // One number, the segment count, mirroring LEFT_STICK_MENU_SIZE.
    const segments = Math.floor(Number.parseFloat(read(keys.size) ?? ''))
    count = Number.isFinite(segments) && segments >= 2 ? Math.min(25, segments) : 0
    columns = count
    rows = 1
  } else {
    const [rawCols, rawRows] = (read(keys.size) ?? '2 2').trim().split(/\s+/).map(Number)
    columns = Math.max(1, Math.min(5, Number.isFinite(rawCols) ? rawCols : 2))
    rows = Math.max(1, Math.min(5, Number.isFinite(rawRows) ? rawRows : 2))
    count = shape === 'FOUR_WAY' ? 4 : columns * rows
  }
  if (count < 1) return null

  const deadzoneRaw = Number.parseFloat(read(keys.deadzone) ?? '')
  // The stick default matches the backend's 0.35: a wheel you dismiss by
  // letting the stick go needs a much larger hole than a pad's anti-jitter one.
  const deadzone = Number.isFinite(deadzoneRaw) ? deadzoneRaw : stick ? 0.35 : 0.1

  // The side's own value wins over the shared one, the way every other paired
  // stick setting resolves. JoyShockMapper's own default is 0.15.
  const centreRaw = stick
    ? Number.parseFloat(
        read(`${pad === 'LSTICK' ? 'LEFT' : 'RIGHT'}_STICK_DEADZONE_INNER`)
          ?? read('STICK_DEADZONE_INNER')
          ?? ''
      )
    : NaN
  const centreDeadzone = Number.isFinite(centreRaw) ? Math.min(0.9, Math.max(0, centreRaw)) : stick ? 0.15 : 0

  const regions: OverlayRegion[] = Array.from({ length: count }, (_, index) => {
    const command = `${keys.prefix}${index + 1}`
    const binding = (read(command) ?? '').trim()
    const usable = binding && binding.toUpperCase() !== 'NONE' ? binding : ''
    return { command, label: labels[command] ?? '', binding: usable, icon: icons[command] ?? '' }
  })

  return {
    pad,
    layer,
    shape,
    columns,
    rows,
    deadzone,
    centreDeadzone,
    requiresClick: (read(keys.requiresClick) ?? '').trim().toUpperCase() === 'ON',
    regions,
    placement: placements[layer ? `${pad}:${layer}` : pad] ?? placements[pad] ?? DEFAULT_PLACEMENT[pad],
  }
}

/**
 * Every menu the config defines, keyed `PAD` or `PAD:LAYER`. Layers are
 * discovered from the chorded lines themselves, so a config that invents a new
 * chord gets an overlay for it without the UI knowing anything about it.
 */
export function resolveOverlayMenus(text: string): Record<string, OverlayMenu> {
  const labels = parseBindingLabels(text)
  const icons = parseBindingIcons(text)
  const placements = parseOverlayPlacements(text)
  const layers = new Set<string>([''])
  // A layer can be announced by a chorded pad SETTING or by a chorded region
  // BINDING. The second is the common case -- a chord that just rebinds the
  // regions, leaving the grid itself alone -- and matching only the first made
  // those layers invisible to the overlay.
  const layerLine =
    /^\s*([A-Z0-9_,+]+)\s*,\s*(?:(?:LEFT|RIGHT)_(?:TOUCHPAD_MODE|GRID_SIZE|GRID_SHAPE|GRID_DEADZONE|GRID_REQUIRES_CLICK|STICK_MODE|STICK_MENU_SIZE|STICK_MENU_DEADZONE)|[LR][TM]\d+)\s*=/i
  text.split(/\r?\n/).forEach(line => {
    const match = layerLine.exec(line)
    if (match) layers.add(match[1].toUpperCase())
  })

  const out: Record<string, OverlayMenu> = {}
  ;(['LEFT', 'RIGHT', 'LSTICK', 'RSTICK'] as OverlaySurface[]).forEach(pad => {
    layers.forEach(layer => {
      // A chord that overrides something on the OTHER pad must not conjure a
      // menu for this one. Reads fall through to the unchorded value, so
      // `MISC2,RIGHT_GRID_SHAPE = ...` would otherwise produce a LEFT:MISC2
      // menu identical to LEFT's base menu, stacked invisibly on top of it.
      if (layer && !overridesPad(text, pad, layer)) return
      const menu = resolveOverlayMenu(text, labels, icons, placements, pad, layer)
      // A menu with nothing bound is noise on screen, not information.
      if (menu && menu.regions.some(region => region.label || region.binding)) {
        out[layer ? `${pad}:${layer}` : pad] = menu
      }
    })
  })
  return out
}

/** Whether `layer` assigns anything belonging to `surface` -- one of its
 *  settings or one of its region bindings. */
function overridesPad(text: string, surface: OverlaySurface, layer: string): boolean {
  const stick = isStickSurface(surface)
  const prefix = stick ? (surface === 'LSTICK' ? 'LM' : 'RM') : surface === 'LEFT' ? 'LT' : 'RT'
  // A stick's settings are LEFT_STICK_* / RIGHT_STICK_*, so the key prefix is
  // the side rather than the surface name.
  const settingPrefix = stick ? (surface === 'LSTICK' ? 'LEFT_STICK' : 'RIGHT_STICK') : surface
  const escaped = layer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `^\\s*${escaped}\\s*,\\s*(?:${settingPrefix}_[A-Z_]+|${prefix}\\d+)\\s*=`,
    'im'
  )
  return pattern.test(text)
}
