import { useEffect, useState } from 'react'

// A game's own art from the local Steam library cache (console v2, D23: the
// Rust service is LIBRARY's services/steam_library.rs): the executable an
// association was made from names a Steam app, and the app has a hero, a
// capsule and a header in Steam's librarycache. Home's hero and its covers use
// it; null means draw the flat fallback (no Steam, not a Steam game, outside
// the desktop app).

export type GameArtKind = 'hero' | 'capsule' | 'header' | 'logo'

const cache = new Map<string, Promise<string | null>>()
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const load = (exePath: string, kind: GameArtKind): Promise<string | null> => {
  const key = `${kind}:${exePath.toLowerCase()}`
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      if (!isTauri()) return null
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const app = await invoke<{ appId: string } | null>('steam_app_for_exe', { exePath })
        if (!app?.appId) return null
        return await invoke<string | null>('steam_game_art', { appId: app.appId, kind })
      } catch {
        return null
      }
    })()
    cache.set(key, pending)
  }
  return pending
}

export function useGameArt(exePath: string | null | undefined, kind: GameArtKind): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(null)
    if (!exePath) return
    let live = true
    void load(exePath, kind).then(found => { if (live) setUrl(found) })
    return () => { live = false }
  }, [exePath, kind])
  return url
}

/** A flat cover for a game with no art: two tones from its name (STYLE-FLAT). */
export const fallbackCover = (name: string) => {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const hue = hash % 360
  return `linear-gradient(135deg, oklch(42% .09 ${hue}) 0%, oklch(28% .06 ${(hue + 40) % 360}) 100%)`
}
