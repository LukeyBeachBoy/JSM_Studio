import { useEffect, useMemo, useRef, useState } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import {
  extractIncludePaths,
  resolveIncludes,
  type ConfigFiles,
  type IncludeResolution,
} from '../utils/configIncludes'

// Imported files are read on demand and cached by path. The cache is cleared
// whenever the set of imports changes, so editing an import line re-reads
// rather than serving a stale baseline. It is small -- a profile imports one or
// two files -- and the alternative, holding every file the app has ever read,
// would go stale against edits made outside the app.
type Cache = Map<string, string | null>

/**
 * Resolve a profile's imports into the text the mapper would actually execute.
 *
 * The editor still edits and saves the profile's own text; this is the read
 * model laid over it, so a setting a profile inherits is visible instead of
 * silently absent. `effectiveText` falls back to the profile's own text while
 * imports are still loading, so the UI never blanks out mid-read.
 */
export function useConfigIncludes(configText: string, rootPath: string) {
  const [files, setFiles] = useState<ConfigFiles>({})
  const [isResolving, setIsResolving] = useState(false)
  const cache = useRef<Cache>(new Map())
  const request = useRef(0)

  // Only the import lines matter here. Keying the effect on the joined list
  // stops every keystroke elsewhere in the profile from re-reading from disk.
  const directIncludes = useMemo(() => extractIncludePaths(configText), [configText])
  const includeKey = directIncludes.join('\n')

  useEffect(() => {
    const token = ++request.current
    if (!directIncludes.length) {
      cache.current.clear()
      setFiles({})
      setIsResolving(false)
      return
    }
    let cancelled = false
    setIsResolving(true)
    void (async () => {
      const collected: ConfigFiles = {}
      const seen = new Set<string>()
      // Breadth-first over the import graph: an imported file may import more.
      // `seen` also stops a cycle from looping the fetch, independently of the
      // resolver's own cycle guard.
      let frontier = directIncludes
      while (frontier.length) {
        const next: string[] = []
        await Promise.all(
          frontier.map(async path => {
            if (seen.has(path)) return
            seen.add(path)
            if (!cache.current.has(path)) {
              cache.current.set(path, await desktopBridge.readConfigFile(path))
            }
            const text = cache.current.get(path)
            if (text == null) return
            collected[path] = text
            next.push(...extractIncludePaths(text))
          })
        )
        frontier = next.filter(path => !seen.has(path))
      }
      if (cancelled || token !== request.current) return
      setFiles(collected)
      setIsResolving(false)
    })()
    return () => {
      cancelled = true
    }
    // directIncludes is derived from includeKey; depending on the string keeps
    // the effect from re-firing on an identical list with a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeKey])

  // Clear the cache when the import list changes so a re-read is forced.
  useEffect(() => {
    cache.current.clear()
  }, [includeKey])

  const resolution = useMemo<IncludeResolution | null>(() => {
    if (!directIncludes.length) return null
    return resolveIncludes(rootPath, { ...files, [rootPath]: configText })
  }, [configText, files, rootPath, directIncludes.length])

  return {
    resolution,
    // The text every read should go through. Identical to the profile's own
    // text when it imports nothing, so the no-imports case is untouched.
    effectiveText: resolution?.effectiveText ?? configText,
    isResolving,
    imports: resolution?.order.slice(1) ?? [],
    missingImports: resolution?.missing ?? [],
    cyclicImports: resolution?.cyclic ?? [],
  }
}
