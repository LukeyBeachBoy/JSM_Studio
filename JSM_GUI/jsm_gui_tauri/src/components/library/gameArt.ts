import { useEffect, useState } from 'react'
import { desktopBridge, type SteamApp, type SteamArtKind } from '../../platform/desktopBridge'

// Steam's art for a game (console v2, D23), found by app id or by the
// executable's library folder, fetched once per app and kind and kept for the
// session: the Library and the wizard redraw covers often.

const apps = new Map<string, Promise<SteamApp | null>>()
const art = new Map<string, Promise<string | null>>()

export const steamAppFor = (exePath: string) => {
  const key = exePath.trim().toLowerCase()
  if (!key) return Promise.resolve(null)
  let pending = apps.get(key)
  if (!pending) { pending = desktopBridge.steamAppForExe(exePath).catch(() => null); apps.set(key, pending) }
  return pending
}

export const steamArt = (appId: string, kind: SteamArtKind) => {
  const key = `${appId}:${kind}`
  let pending = art.get(key)
  if (!pending) { pending = desktopBridge.steamGameArt(appId, kind).catch(() => null); art.set(key, pending) }
  return pending
}

export type GameArtSource = { steamAppId?: string | null; exePath?: string | null }

/** The art for a game in the shape asked for, falling back from one kind to
 *  the next ("capsule" → "header"); the Steam app it found, for its name. */
export function useGameArt(source: GameArtSource, kinds: SteamArtKind[] = ['capsule', 'header']) {
  const [state, setState] = useState<{ url: string | null; app: SteamApp | null; appId: string | null }>({ url: null, app: null, appId: null })
  const kindKey = kinds.join(',')
  useEffect(() => {
    let disposed = false
    setState({ url: null, app: null, appId: null })
    void (async () => {
      let appId = source.steamAppId ?? null
      let app: SteamApp | null = null
      if (!appId && source.exePath) {
        app = await steamAppFor(source.exePath)
        appId = app?.appId ?? null
      }
      if (!appId) return
      for (const kind of kindKey.split(',') as SteamArtKind[]) {
        const url = await steamArt(appId, kind)
        if (url) { if (!disposed) setState({ url, app, appId }); return }
      }
      if (!disposed) setState({ url: null, app, appId })
    })()
    return () => { disposed = true }
  }, [source.steamAppId, source.exePath, kindKey])
  return state
}

/** A hue from a name, so a generated cover is the same every time. */
export const nameHue = (name: string) => {
  let hash = 0
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % 360
}

/** "DRG" for "Deep Rock Galactic", "W" for "Wardogs". */
export const monogram = (name: string) => {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length <= 1) return (words[0] ?? '?').slice(0, 2).toUpperCase()
  return words.slice(0, 3).map(word => word[0]).join('').toUpperCase()
}

/** "yesterday", "3 days ago", "last week", "last month": for Played … */
export const playedAgo = (unixSeconds: number, now = Date.now()) => {
  if (!unixSeconds) return 'Not played yet'
  const days = Math.floor((now / 1000 - unixSeconds) / 86_400)
  if (days <= 0) return 'Played today'
  if (days === 1) return 'Played yesterday'
  if (days < 7) return `Played ${days} days ago`
  if (days < 14) return 'Played last week'
  if (days < 31) return `Played ${Math.round(days / 7)} weeks ago`
  if (days < 62) return 'Played last month'
  if (days < 365) return `Played ${Math.round(days / 30)} months ago`
  return 'Played over a year ago'
}
