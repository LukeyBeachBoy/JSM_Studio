// The library as a graph (console v2, P7): which configurations are games and
// which are bases, what each is built on and who builds on it, the Hold to swap
// links between them, and the loops and missing bases that need fixing. Pure:
// hooks/useLibraryGraph reads the files and hands them in.

import { extractIncludePaths, includeDisplayName, includeTarget, normalizeIncludePath, resolveIncludes } from './configIncludes'
import { loadConfigBindingName, PROFILE_LIBRARY_PREFIX } from './loadConfigBinding'
import { readLayers } from './layers'
import { getVirtualControllerType, type VirtualControllerType } from './virtualController'
import type { BuiltinBase } from './presetBases'

export const BUILTIN_CHORD_NAME = 'Default Global Chords'

export const SENDS_LABEL: Record<VirtualControllerType, string> = {
  NONE: 'Keyboard & mouse',
  XBOX: 'Xbox controller',
  DS4: 'DualShock 4 controller',
}

/** The game a configuration is for, when it was made from one with no
 *  executable to associate (a recent Steam game): `# @game {...}`. */
export type GameMeta = { steamAppId?: string; name?: string }

/** A binding that swaps to another configuration: which keys, which target. */
export type SwapLink = { keys: string; target: string }

export type ConfigFacts = {
  name: string
  /** The library path a game imports or a binding loads. */
  path: string
  output: VirtualControllerType
  sends: string
  /** Runtime-relative include paths, in order. */
  imports: string[]
  /** The first import: what this configuration is built on. */
  base: string | null
  modes: { name: string }[]
  /** Bindings that load another configuration ("Hold to swap · goes to"). */
  swaps: SwapLink[]
  /** A file without RESET_MAPPINGS is meant to be imported (utils/config.ts). */
  meantToImport: boolean
  game: GameMeta | null
}

export const libraryPath = (name: string) => `${PROFILE_LIBRARY_PREFIX}${name}.txt`

/** "FPS base" for "profiles-library/FPS base.txt", a shipped base's title for "bases/…". */
export const baseLabel = (path: string, builtin: BuiltinBase[] = []) =>
  builtin.find(base => base.relativePath.toLowerCase() === path.toLowerCase())?.title ?? includeDisplayName(path)

const GAME_LINE = /^\s*#\s*@game\s+(\{.*\})\s*$/

export const readGameMeta = (text: string): GameMeta | null => {
  for (const line of text.split(/\r?\n/)) {
    const match = GAME_LINE.exec(line)
    if (!match) continue
    try { return JSON.parse(match[1]) as GameMeta } catch { return null }
  }
  return null
}

/** Sets (or with null removes) the `# @game` line, after the header. */
export function setGameMeta(text: string, meta: GameMeta | null) {
  const lines = text.split(/\r?\n/).filter(line => !GAME_LINE.test(line))
  if (!meta || (!meta.steamAppId && !meta.name)) return lines.join('\n')
  const at = headerEnd(lines)
  lines.splice(at, 0, `# @game ${JSON.stringify(meta)}`)
  return lines.join('\n')
}

const HEADER = /^\s*(RESET_MAPPINGS|AUTOCONNECT|TELEMETRY_ENABLED|TELEMETRY_PORT)\b/i

/** The index just after the header lines at the top of a file (0 when none). */
const headerEnd = (lines: string[]) => {
  let end = 0
  for (let index = 0; index < Math.min(lines.length, 12); index++) if (HEADER.test(lines[index])) end = index + 1
  return end
}

export const meantToImport = (text: string) => !text.split(/\r?\n/).some(line => /^\s*RESET_MAPPINGS\b/i.test(line))

/**
 * Change what a configuration is built on. The first import line is replaced
 * (or removed, for null); a configuration with none gets one right under its
 * header, so the configuration's own lines stay below it and win (memory
 * "config-inheritance-preference": later assignments win).
 */
export function setBaseInclude(text: string, path: string | null) {
  const lines = text.split(/\r?\n/)
  const index = lines.findIndex(line => includeTarget(line) !== null)
  const target = path ? normalizeIncludePath(path) : null
  if (index >= 0) {
    if (target) lines[index] = target
    else lines.splice(index, 1)
    return lines.join('\n')
  }
  if (!target) return text
  lines.splice(headerEnd(lines), 0, target)
  return lines.join('\n')
}

export function describeConfig(name: string, text: string): ConfigFacts {
  const swaps: SwapLink[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([^=]+?)\s*=\s*(.+)$/.exec(line)
    if (!match) continue
    const value = match[2].replace(/#.*$/, '').trim().replace(/^"(.*)"$/, '$1')
    const target = loadConfigBindingName(value)
    if (target) swaps.push({ keys: match[1].trim(), target })
  }
  const imports = extractIncludePaths(text)
  const output = getVirtualControllerType(text)
  return {
    name,
    path: libraryPath(name),
    output,
    sends: SENDS_LABEL[output],
    imports,
    base: imports[0] ?? null,
    modes: readLayers(text).map(layer => ({ name: layer.name })),
    swaps,
    meantToImport: meantToImport(text),
    game: readGameMeta(text),
  }
}

export type LibraryGraph = {
  configs: Record<string, ConfigFacts>
  /** Configuration name → configurations that import it. */
  usedBy: Record<string, string[]>
  /** A shipped base's path → configurations built on it. */
  builtinUsedBy: Record<string, string[]>
  /** Configuration name → bindings elsewhere that swap to it. */
  swappedFrom: Record<string, { by: string; keys: string }[]>
  /** Configuration name → its import loop and missing imports, as paths. */
  problems: Record<string, { cyclic: string[]; missing: string[] }>
  /** Shown on the Bases tab rather than Games. */
  isBase: (name: string) => boolean
  games: string[]
  bases: string[]
}

export function buildLibraryGraph(texts: Record<string, string>, builtin: BuiltinBase[] = []): LibraryGraph {
  const configs: Record<string, ConfigFacts> = {}
  for (const [name, text] of Object.entries(texts)) configs[name] = describeConfig(name, text)
  const byPath = new Map(Object.keys(configs).map(name => [libraryPath(name).toLowerCase(), name]))
  const usedBy: Record<string, string[]> = {}
  const builtinUsedBy: Record<string, string[]> = {}
  const swappedFrom: Record<string, { by: string; keys: string }[]> = {}
  for (const facts of Object.values(configs)) {
    for (const path of facts.imports) {
      const target = byPath.get(path.toLowerCase())
      if (target) (usedBy[target] ??= []).push(facts.name)
      else if (builtin.some(base => base.relativePath.toLowerCase() === path.toLowerCase())) (builtinUsedBy[path] ??= []).push(facts.name)
    }
    for (const swap of facts.swaps) (swappedFrom[swap.target] ??= []).push({ by: facts.name, keys: swap.keys })
  }
  // Every file the runtime could read, by path, for the loop check.
  const files: Record<string, string> = {}
  for (const [name, text] of Object.entries(texts)) files[libraryPath(name)] = text
  for (const base of builtin) files[base.relativePath] = base.text
  const problems: Record<string, { cyclic: string[]; missing: string[] }> = {}
  for (const name of Object.keys(texts)) {
    if (!configs[name].imports.length) continue
    // Paths are matched exactly by resolveIncludes; give it the casing the file uses.
    const resolution = resolveIncludes(libraryPath(name), new Proxy(files, {
      get: (target, key: string) => target[key] ?? Object.entries(target).find(([path]) => path.toLowerCase() === key.toLowerCase())?.[1],
    }))
    if (resolution.cyclic.length || resolution.missing.length) problems[name] = { cyclic: resolution.cyclic, missing: resolution.missing }
  }
  // A file another imports is a base -- unless it is a game caught in an
  // import loop, which stays a game so its warning shows where it is played.
  const isBase = (name: string) => name === BUILTIN_CHORD_NAME || Boolean(configs[name]?.meantToImport)
    || (Boolean(usedBy[name]?.length) && !problems[name]?.cyclic.length)
  const names = Object.keys(texts).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return {
    configs, usedBy, builtinUsedBy, swappedFrom, problems, isBase,
    games: names.filter(name => !isBase(name)),
    bases: names.filter(isBase),
  }
}

/** "Wardogs copy", "Wardogs copy 2"…: a free name beside `name`. */
export function copyName(name: string, taken: Iterable<string>) {
  const lower = new Set([...taken].map(entry => entry.toLowerCase()))
  let candidate = `${name} copy`
  for (let n = 2; lower.has(candidate.toLowerCase()); n++) candidate = `${name} copy ${n}`
  return candidate
}

/** The text a new game file gets: header, the base it's built on, its game. */
export function newGameText(basePath: string | null, game: GameMeta | null, extra = '') {
  const lines = ['RESET_MAPPINGS', 'AUTOCONNECT = ON', 'TELEMETRY_ENABLED = ON', 'TELEMETRY_PORT = 8974']
  if (game && (game.steamAppId || game.name)) lines.push(`# @game ${JSON.stringify(game)}`)
  if (basePath) lines.push(basePath)
  if (extra.trim()) lines.push(extra.trim())
  return lines.join('\n') + '\n'
}

/** A base made from a game: its own settings without the header, so it can be imported. */
export function baseFromGame(text: string) {
  return text.split(/\r?\n/).filter(line => !HEADER.test(line) && !GAME_LINE.test(line)).join('\n').replace(/^\s+/, '')
}
