// The preset bases JSM Evolved ships (console v2, D24): one per play style,
// with variants by controller family. The files themselves live beside the
// Rust service that seeds them into jsm-runtime/bases/
// (src-tauri/src/services/bases/); this module reads the same files, so the
// wizard's cards, the Bases tab and the browser preview never drift from what
// the desktop app writes.

import type { ControllerVisualFamily } from './controllerStatus'

export type BuiltinBase = {
  /** What a game imports: "bases/Shooter stick aim.txt". */
  relativePath: string
  fileName: string
  /** The play style it belongs to: "shooter-gyro". */
  preset: string
  title: string
  /** Under a cover: "Shooter · gyro". */
  short: string
  blurb: string
  /** Controller families it is written for. */
  families: string[]
  /** What the controller must have: "gyro", "trackpads". */
  needs: string[]
  order: number
  text: string
}

export const BASES_DIR = 'bases'

type Header = Partial<Pick<BuiltinBase, 'preset' | 'title' | 'short' | 'blurb' | 'families' | 'needs' | 'order'>>

/** The `# @base {...}` line at the top of a base, or {}. */
export const parseBaseHeader = (text: string): Header => {
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*#\s*@base\s+(\{.*\})\s*$/.exec(line)
    if (!match) continue
    try { return JSON.parse(match[1]) as Header } catch { return {} }
  }
  return {}
}

export const describeBase = (fileName: string, text: string): BuiltinBase => {
  const header = parseBaseHeader(text)
  const stem = fileName.replace(/\.txt$/i, '')
  return {
    relativePath: `${BASES_DIR}/${fileName}`,
    fileName,
    preset: header.preset || stem,
    title: header.title || stem,
    short: header.short ?? '',
    blurb: header.blurb ?? '',
    families: header.families ?? [],
    needs: header.needs ?? [],
    order: header.order ?? 99,
    text,
  }
}

// Bundled for the browser preview and as a fallback when the desktop command
// is unavailable; the desktop app's own list comes from list_builtin_bases.
const files = import.meta.glob('../../src-tauri/src/services/bases/*.txt', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const SHIPPED_BASES: BuiltinBase[] = Object.entries(files)
  .map(([path, text]) => describeBase(path.split('/').pop() ?? path, text))
  .sort((a, b) => a.order - b.order || a.fileName.localeCompare(b.fileName))

export const isBuiltinBasePath = (path: string) => {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  return normalized.startsWith(`${BASES_DIR}/`) && SHIPPED_BASES.some(base => base.relativePath.toLowerCase() === normalized)
}

/** What a connected controller has, for "Best with your controller". */
export type ControllerCaps = { family: ControllerVisualFamily; gyro: boolean; trackpads: boolean; grips: boolean }

/** One card per play style: the variant written for this controller family
 *  (or the first that fits), and whether the controller can use it at all. */
export type PresetChoice = { preset: string; title: string; blurb: string; base: BuiltinBase; unavailable?: string }

const NEED_REASON: Record<string, string> = {
  gyro: 'Needs a controller with gyro',
  trackpads: 'Needs a controller with trackpads',
  grips: 'Needs a controller with grips',
}

const satisfies = (base: BuiltinBase, caps: ControllerCaps) => base.needs.every(need => need === 'gyro' ? caps.gyro : need === 'trackpads' ? caps.trackpads : need === 'grips' ? caps.grips : true)

export function presetChoices(bases: BuiltinBase[], caps: ControllerCaps): PresetChoice[] {
  const order: string[] = []
  for (const base of [...bases].sort((a, b) => a.order - b.order)) if (!order.includes(base.preset)) order.push(base.preset)
  return order.map(preset => {
    const variants = bases.filter(base => base.preset === preset)
    // Prefer a variant written for this family that the controller can use,
    // and among those the one that does the most (needs the most).
    const usable = variants.filter(base => satisfies(base, caps))
    const forFamily = usable.filter(base => base.families.includes(caps.family))
    const pick = [...(forFamily.length ? forFamily : usable)].sort((a, b) => b.needs.length - a.needs.length)[0]
    if (pick) return { preset, title: pick.title, blurb: pick.blurb, base: pick }
    const fallback = variants[0]
    const missing = fallback.needs.find(need => !satisfies({ ...fallback, needs: [need] }, caps))
    return { preset, title: fallback.title, blurb: fallback.blurb, base: fallback, unavailable: NEED_REASON[missing ?? ''] ?? 'Not for this controller' }
  })
}

/** "Best with your controller": the first preset the controller fully suits. */
export const recommendedPreset = (choices: PresetChoice[]) => choices.find(choice => !choice.unavailable)?.preset
