// JoyShockMapper treats a bare path on its own line as "load this file here".
// It is how a profile shares a baseline with other profiles, and the runtime
// obeys it, so the editor has to as well: a profile that imports a template is
// not the same thing as the text sitting in the file.
//
// Everything here is pure. The caller supplies the file contents it has already
// read, and gets back the flattened text the runtime would actually execute,
// plus a record of which file each effective setting ended up coming from.

export type ConfigFiles = Record<string, string>

// Stands in for "the profile currently open in the editor" as a key in the file
// map. A sentinel rather than the profile's real path, because the editor holds
// unsaved text that does not match the file on disk, and because the path is
// not known where the resolution is set up. It cannot collide with a real
// import: those are runtime-relative paths, which never contain angle brackets.
export const INCLUDE_ROOT = '<editor>'

export type IncludeResolution = {
  // The lines the runtime executes, in order, with each include spliced in at
  // the point it appeared. Read-only: never save this over a profile.
  effectiveText: string
  // Normalized command key -> path of the file whose assignment survives.
  origins: Record<string, string>
  // Every file that took part, root first, in load order.
  order: string[]
  // Includes that pointed at something we could not read.
  missing: string[]
  // Includes that would have re-entered a file already being loaded.
  cyclic: string[]
}

// JSM cuts a line at its first '#', so a trailing note never reaches the parser.
export const stripComment = (line: string) => {
  const hash = line.indexOf('#')
  return hash >= 0 ? line.slice(0, hash) : line
}

// Runtime-relative, forward slashes, no "." or ".." segments. JSM resolves an
// include against the working directory and then against its config folder,
// both of which are the runtime directory, so one normalized form covers both.
export const normalizeIncludePath = (raw: string) => {
  const parts = raw.replace(/\\/g, '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') return null
    out.push(part)
  }
  return out.length ? out.join('/') : null
}

// An include is a line that names a file and assigns nothing. Anything with an
// '=' is a setting, and a bare word without a .txt suffix is a macro like
// RESET_MAPPINGS, so neither is a candidate.
export const includeTarget = (line: string) => {
  const trimmed = stripComment(line).trim()
  if (!trimmed || trimmed.includes('=')) return null
  if (!/\.txt$/i.test(trimmed)) return null
  return normalizeIncludePath(trimmed)
}

export const extractIncludePaths = (text: string) => {
  const found: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const target = includeTarget(line)
    if (target && !found.includes(target)) found.push(target)
  }
  return found
}

// The identity a later line overrides. "MISC2 , RIGHT_TOUCHPAD_MODE = X" and
// "misc2,RIGHT_TOUCHPAD_MODE=Y" are the same setting; the second wins.
export const commandKey = (line: string) => {
  const trimmed = stripComment(line).trim()
  if (!trimmed) return null
  const equals = trimmed.indexOf('=')
  const left = equals >= 0 ? trimmed.slice(0, equals) : trimmed
  const key = left.replace(/\s+/g, '').toUpperCase()
  return key || null
}

type SourcedLine = { line: string; source: string }

/**
 * Flatten a profile and everything it imports into the sequence of lines the
 * runtime would execute, and record which file wins each setting.
 *
 * Order matters and is not cosmetic: JSM applies assignments top to bottom and
 * the last one wins, so an import placed above a profile's own lines is a
 * baseline the profile overrides. Splicing each include in at its own position
 * is what preserves that.
 */
export function resolveIncludes(rootPath: string, files: ConfigFiles): IncludeResolution {
  const missing: string[] = []
  const cyclic: string[] = []
  const order: string[] = []

  const walk = (path: string, stack: string[]): SourcedLine[] => {
    // A file that imports itself, directly or through a chain, would recurse
    // forever. The runtime has no guard for this, so refusing here is strictly
    // safer than reproducing it.
    if (stack.includes(path)) {
      if (!cyclic.includes(path)) cyclic.push(path)
      return []
    }
    const text = files[path]
    if (text == null) {
      if (!missing.includes(path)) missing.push(path)
      return []
    }
    if (!order.includes(path)) order.push(path)

    const nextStack = [...stack, path]
    const out: SourcedLine[] = []
    for (const line of text.split(/\r?\n/)) {
      const target = includeTarget(line)
      if (target) {
        out.push(...walk(target, nextStack))
        continue
      }
      out.push({ line, source: path })
    }
    return out
  }

  const lines = walk(rootPath, [])
  const origins: Record<string, string> = {}
  for (const { line, source } of lines) {
    const key = commandKey(line)
    if (key) origins[key] = source
  }

  return {
    effectiveText: lines.map(entry => entry.line).join('\n'),
    origins,
    order,
    missing,
    cyclic,
  }
}

/**
 * The file an effective setting came from, or null when the profile sets it
 * itself (or nothing sets it). Callers use this to mark a control as inherited,
 * so "not set anywhere" and "set here" both correctly read as not inherited.
 */
export function inheritedFrom(resolution: IncludeResolution | null, rootPath: string, key: string) {
  if (!resolution) return null
  const source = resolution.origins[key.replace(/\s+/g, '').toUpperCase()]
  return source && source !== rootPath ? source : null
}

// "profiles-library/FPS Template.txt" -> "FPS Template"; what a badge shows.
export const includeDisplayName = (path: string) =>
  path.replace(/^.*\//, '').replace(/\.txt$/i, '')
