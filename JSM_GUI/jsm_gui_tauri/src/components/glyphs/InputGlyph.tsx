import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import { FAMILY_GLYPHS, STEAM_GLYPHS, STEAM_SMALL_GLYPHS } from './glyphData'

// Controller glyphs from the design set (design/handoff/designs/glyphs, see
// scripts/build-design-icons.mjs). Solid badge = front input, outline =
// back or passive input (paddles, touch, regions). Knocked-out labels use
// --glyph-ink. At 20px and below the small cut is used: larger single
// characters, no inner detail, heavier outlines.
type GlyphProps = {
  command: string
  family?: ControllerVisualFamily
  size?: number
  className?: string
  title?: string
}

const SMALL_CUT_MAX = 20

const TEXT_ATTRS = `text-anchor="middle" dominant-baseline="central" font-family="Geist, 'Segoe UI', system-ui" font-weight="700"`
const label = (x: number, y: number, size: number, text: string, fill = 'currentColor') =>
  `<text x="${x}" y="${y}" ${TEXT_ATTRS} font-size="${size}" fill="${fill}">${text}</text>`

/** Swap the printed label of a drawing, for the siblings the set draws once. */
const relabel = (svg: string, from: string, to: string) => svg.replace(`>${from}</text>`, `>${to}</text>`)

// JSM command -> design key, where they differ.
const COMMAND_KEYS: Record<string, string> = {
  '+': 'PLUS', PLUS: 'PLUS', '-': 'MINUS', MINUS: 'MINUS',
  LTOUCH: 'LST', LEFT_STICK: 'LS', LSTICK: 'LS', RIGHT_STICK: 'RS', RSTICK: 'RS',
  LEFT_PAD: 'LTOUCH', LEFT_PAD_TOUCH: 'LTOUCH',
}

// Right-hand and second-of-a-pair inputs the set draws only once.
const REGULAR_SIBLINGS: Record<string, () => string | undefined> = {
  RTOUCH: () => relabel(STEAM_GLYPHS.LST?.svg ?? '', 'L', 'R'),
  RUP: () => STEAM_GLYPHS.LUP?.svg,
  RRIGHT: () => STEAM_GLYPHS.LRIGHT?.svg,
  RDOWN: () => STEAM_GLYPHS.LDOWN?.svg,
  RLEFT: () => STEAM_GLYPHS.LLEFT?.svg,
  RRING: () => STEAM_GLYPHS.LRING?.svg,
  RIGHT_PAD: () => STEAM_GLYPHS.LTOUCH?.svg.replace('cx="14" cy="10" r="3"', 'cx="10" cy="10" r="3"').replace('cx="14" cy="10" r="5.5"', 'cx="10" cy="10" r="5.5"'),
}

// Small cuts derived from a sibling's small cut by swapping the label.
const SMALL_SIBLINGS: Record<string, () => string | undefined> = {
  N: () => relabel(STEAM_SMALL_GLYPHS.S, 'A', 'Y'),
  W: () => relabel(STEAM_SMALL_GLYPHS.S, 'A', 'X'),
  R: () => relabel(STEAM_SMALL_GLYPHS.L, 'L', 'R'),
  ZL: () => relabel(STEAM_SMALL_GLYPHS.ZR, 'R', 'L'),
  ZLF: () => relabel(STEAM_SMALL_GLYPHS.ZR, 'R', 'L'),
  ZRF: () => STEAM_SMALL_GLYPHS.ZR,
  L3: () => STEAM_SMALL_GLYPHS.R3,
  MISC3: () => relabel(STEAM_SMALL_GLYPHS.MISC2, 'R', 'L'),
  LSR: () => relabel(STEAM_SMALL_GLYPHS.LSL, '4', '5'),
  RSR: () => STEAM_SMALL_GLYPHS.LSL,
  RSL: () => relabel(STEAM_SMALL_GLYPHS.LSL, '4', '5'),
}

// Which family glyph stands for which JSM position.
const FAMILY_ITEMS: Partial<Record<ControllerVisualFamily, { set: string; items: Record<string, string> }>> = {
  playstation: { set: 'ps', items: { S: 'Cross', E: 'Circle', W: 'Square', N: 'Triangle', L: 'L1', R: 'R1', ZL: 'L2', ZR: 'R2', ZLF: 'L2', ZRF: 'R2' } },
  nintendo: { set: 'nin', items: { S: 'B (south)', E: 'A (east)', W: 'Y (west)', N: 'X (north)', L: 'L', R: 'R', ZL: 'ZL', ZR: 'ZR', ZLF: 'ZL', ZRF: 'ZR' } },
}
const NINTENDO_SMALL_LETTERS: Record<string, string> = { S: 'B', E: 'A', W: 'Y', N: 'X' }

/**
 * Inputs that are a family rather than a name: numbered pad regions and wheel
 * segments come in the hundreds, so they are drawn from one pattern each
 * instead of falling through to a lettered disc that read "LT" for a region.
 */
const patternGlyph = (key: string, small: boolean): string | null => {
  const region = key.match(/^([LR]?)T(\d+)$/)
  if (region) {
    const n = region[2]
    const size = small ? (n.length > 1 ? 10 : 13) : n.length > 1 ? 8 : 9.5
    return `<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="${small ? 2.5 : 2}"/>` + label(12, 12.5, size, n)
  }
  const segment = key.match(/^([LR])M(\d+)$/)
  if (segment) {
    const n = segment[2]
    return `<circle cx="12" cy="12" r="${small ? 10 : 9.5}" fill="none" stroke="currentColor" stroke-width="${small ? 2.5 : 2}"/>` + label(12, 12.5, n.length > 1 ? 8 : small ? 12 : 9.5, n)
  }
  const padDirection = key.match(/^T(UP|DOWN|LEFT|RIGHT)$/)
  if (padDirection) {
    const rotate = { UP: 0, RIGHT: 90, DOWN: 180, LEFT: 270 }[padDirection[1]]
    return `<rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 5 15.5 9.5h-7z" fill="currentColor" transform="rotate(${rotate} 12 12)"/>`
  }
  if (key === 'TRING') return STEAM_GLYPHS.LRING?.svg ?? null
  if (key === 'TOUCH' || key === 'CAPTURE') {
    return `<rect x="2.5" y="4.5" width="19" height="15" rx="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/>`
  }
  if (key === 'MIC') {
    return `<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
  }
  const mini = key.match(/^([LR])MINI$/)
  if (mini) return `<rect x="2.5" y="6.5" width="19" height="11" rx="5.5" fill="currentColor"/>` + label(12, 12.25, 7.5, `${mini[1]}m`, 'var(--glyph-ink)')
  return null
}

/** The inner markup for one input, before the <svg> around it. */
export const glyphMarkup = (command: string, family: ControllerVisualFamily = 'generic', size = 24): string => {
  const upper = command.toUpperCase()
  const key = COMMAND_KEYS[upper] ?? upper
  const small = size <= SMALL_CUT_MAX

  // A Switch pad prints − and + where the others draw View and Menu.
  if (family === 'nintendo' && (key === 'MINUS' || key === 'PLUS')) {
    return `<circle cx="12" cy="12" r="${small ? 11 : 10}" fill="currentColor"/><path d="M7.5 12h9${key === 'PLUS' ? 'M12 7.5v9' : ''}" stroke="var(--glyph-ink)" stroke-width="${small ? 2.6 : 2.2}" stroke-linecap="round"/>`
  }

  const familyItem = FAMILY_ITEMS[family]
  if (familyItem?.items[key]) {
    if (small && family === 'nintendo' && NINTENDO_SMALL_LETTERS[key]) return relabel(STEAM_SMALL_GLYPHS.S, 'A', NINTENDO_SMALL_LETTERS[key])
    const svg = FAMILY_GLYPHS[familyItem.set]?.items[familyItem.items[key]]
    if (svg) return svg
  }

  if (small) {
    const cut = STEAM_SMALL_GLYPHS[key] ?? SMALL_SIBLINGS[key]?.()
    if (cut) return cut
  }
  const regular = STEAM_GLYPHS[key]?.svg ?? REGULAR_SIBLINGS[key]?.()
  if (regular) return regular

  const patterned = patternGlyph(key, small)
  if (patterned) return patterned

  // Unknown input: a lettered disc, so an unmapped token still reads as a
  // button rather than as raw config text.
  const text = key.slice(0, 2)
  return `<circle cx="12" cy="12" r="${small ? 11 : 10}" fill="currentColor"/>` + label(12, 12.5, text.length > 1 ? (small ? 10 : 8.5) : small ? 14 : 11, text, 'var(--glyph-ink)')
}

export function InputGlyph({ command, family = 'generic', size = 16, className, title }: GlyphProps) {
  const markup = (title ? `<title>${title.replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'))}</title>` : '') + glyphMarkup(command, family, size)
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      data-glyph={command.toUpperCase()}
      // Drawn from the generated design glyph set and fixed patterns; the only
      // runtime text is the title, which is escaped above.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  )
}
