import { useEffect, useState } from 'react'
import { desktopBridge, type AutoloadRule } from '../platform/desktopBridge'

// The icon of the game a configuration is associated with (TODO-46). The
// backend hands over raw RGBA; it is painted into a canvas once per path and
// the data URL kept, so a list of rows never decodes the same icon twice.

const iconUrls = new Map<string, Promise<string | null>>()

const decodeRgba = (base64: string) => {
  const binary = atob(base64)
  const bytes = new Uint8ClampedArray(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** The data URL for an executable's icon, fetched and painted once; null when it has none. */
export const appIconUrl = (exePath: string): Promise<string | null> => {
  const key = exePath.trim().replace(/\//g, '\\').toLowerCase()
  if (!key) return Promise.resolve(null)
  let pending = iconUrls.get(key)
  if (!pending) {
    pending = desktopBridge.appIcon(exePath.trim()).then(icon => {
      if (!icon || !icon.width || !icon.height) return null
      const canvas = document.createElement('canvas')
      canvas.width = icon.width
      canvas.height = icon.height
      const context = canvas.getContext('2d')
      if (!context) return null
      const pixels = decodeRgba(icon.rgbaBase64)
      if (pixels.length < icon.width * icon.height * 4) return null
      context.putImageData(new ImageData(pixels.subarray(0, icon.width * icon.height * 4), icon.width, icon.height), 0, 0)
      return canvas.toDataURL('image/png')
    }).catch(() => null)
    iconUrls.set(key, pending)
  }
  return pending
}

/** The icon for `exePath` as a data URL; null while loading, when there is no path, or when the file has no icon. */
export function useAppIcon(exePath: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let disposed = false
    setUrl(null)
    if (!exePath) return
    void appIconUrl(exePath).then(next => { if (!disposed) setUrl(next) })
    return () => { disposed = true }
  }, [exePath])
  return url
}

/** The rule that ties a configuration to a game, whether or not it auto-applies:
 *  the one with an executable first, so the icon wins over a hand-written rule. */
export const associationFor = (rules: AutoloadRule[], profileName: string | null | undefined): AutoloadRule | null => {
  if (!profileName) return null
  const mine = rules.filter(rule => rule.kind === 'profile' && !rule.builtIn && rule.profileName === profileName)
  return mine.find(rule => rule.exePath) ?? mine[0] ?? null
}

/** The association a configuration has, kept current as rules change elsewhere. */
export function useProfileAssociation(profileName: string | null | undefined): AutoloadRule | null {
  const [rules, setRules] = useState<AutoloadRule[]>([])
  useEffect(() => {
    let disposed = false
    const read = () => void desktopBridge.listAutoloadRules().then(list => { if (!disposed) setRules(list) }).catch(() => {})
    read()
    window.addEventListener('jsm:associations-changed', read)
    return () => { disposed = true; window.removeEventListener('jsm:associations-changed', read) }
  }, [])
  return associationFor(rules, profileName)
}

/** "DOOMEternalx64vk.exe" from a full path or a process name. */
export const exeFileName = (pathOrName: string) => {
  const name = pathOrName.replace(/^.*[\\/]/, '')
  return /\.exe$/i.test(name) ? name : `${name}.exe`
}

/** The AutoLoad process stem for an executable path or name: "DOOMEternalx64vk". */
export const processStemOf = (pathOrName: string) => exeFileName(pathOrName).replace(/\.exe$/i, '')
