// Resolving an Iconify name to drawable SVG, entirely offline.
//
// The overlay has to appear the instant a thumb lands on the pad, and the app
// must work with no network at all, so nothing here fetches from Iconify's CDN.
// The icon data is bundled and read from disk.
//
// Sets are loaded LAZILY and INDEPENDENTLY. game-icons is around 6.5 MB of JSON
// and lucide around 0.6 MB; a config that only uses lucide never touches the
// big one. Vite emits each dynamic import as its own chunk, so the overlay's
// own bundle stays a few kB and a set is read once, in the background, while
// menus are being resolved -- not on the first touch.
//
// Adding a set is one entry in SOURCES. Letting people supply their OWN icons
// later means adding a source that reads from disk instead of from a package;
// nothing above this layer knows where an icon came from.

export type IconData = {
  /** Raw SVG markup for the icon's contents, no <svg> wrapper. */
  body: string
  /** The viewBox the body is drawn against. */
  width: number
  height: number
}

type Collection = {
  prefix: string
  icons: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, { parent: string }>
  width?: number
  height?: number
}

/** Only these sets are bundled; anything else resolves to nothing. */
const SOURCES: Record<string, () => Promise<{ default?: Collection } | Collection>> = {
  lucide: () => import('@iconify-json/lucide/icons.json'),
  'game-icons': () => import('@iconify-json/game-icons/icons.json'),
}

export const AVAILABLE_ICON_SETS = Object.keys(SOURCES)

const loaded = new Map<string, Collection | null>()
const loading = new Map<string, Promise<Collection | null>>()

async function load(prefix: string): Promise<Collection | null> {
  if (loaded.has(prefix)) return loaded.get(prefix) ?? null
  const existing = loading.get(prefix)
  if (existing) return existing
  const source = SOURCES[prefix]
  if (!source) {
    loaded.set(prefix, null)
    return null
  }
  const promise = source()
    .then(module => {
      const data = ((module as { default?: Collection }).default ?? module) as Collection
      loaded.set(prefix, data)
      return data
    })
    .catch(() => {
      // A set that cannot be read is a missing icon, not a broken overlay.
      loaded.set(prefix, null)
      return null
    })
    .finally(() => loading.delete(prefix))
  loading.set(prefix, promise)
  return promise
}

/** Pull the named sets into memory ahead of time. */
export async function preloadIconSets(prefixes: string[]): Promise<void> {
  await Promise.all(prefixes.map(load))
}

/**
 * Resolve `set:icon`. Returns null for an unknown set or name rather than
 * throwing, so one bad entry in a config costs one icon and nothing else.
 */
export async function resolveIcon(name: string): Promise<IconData | null> {
  const [prefix, key] = (name ?? '').toLowerCase().split(':')
  if (!prefix || !key) return null
  const collection = await load(prefix)
  if (!collection) return null
  // Aliases are how Iconify records renamed icons; following them once keeps
  // older names in existing configs working.
  const entry = collection.icons[key] ?? collection.icons[collection.aliases?.[key]?.parent ?? '']
  if (!entry) return null
  return {
    body: entry.body,
    width: entry.width ?? collection.width ?? 24,
    height: entry.height ?? collection.height ?? 24,
  }
}

/** Resolve several at once, skipping the ones that do not exist. */
export async function resolveIcons(names: string[]): Promise<Record<string, IconData>> {
  const unique = [...new Set(names.filter(Boolean))]
  await preloadIconSets([...new Set(unique.map(n => n.split(':')[0]))])
  const out: Record<string, IconData> = {}
  await Promise.all(
    unique.map(async name => {
      const icon = await resolveIcon(name)
      if (icon) out[name] = icon
    })
  )
  return out
}

/** Names in a set, for a picker. Loads the set, so call it behind a search UI. */
export async function listIcons(prefix: string, query = '', limit = 200): Promise<string[]> {
  const collection = await load(prefix)
  if (!collection) return []
  const needle = query.trim().toLowerCase()
  const out: string[] = []
  for (const key of Object.keys(collection.icons)) {
    if (needle && !key.includes(needle)) continue
    out.push(`${prefix}:${key}`)
    if (out.length >= limit) break
  }
  return out
}
