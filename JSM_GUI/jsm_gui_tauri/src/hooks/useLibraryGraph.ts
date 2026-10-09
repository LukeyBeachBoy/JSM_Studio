import { useCallback, useEffect, useMemo, useState } from 'react'
import { desktopBridge, type AutoloadFallback, type AutoloadRule, type GlobalChord, type LibraryProfileMeta } from '../platform/desktopBridge'
import { buildLibraryGraph, copyName, setBaseInclude, type LibraryGraph } from '../utils/libraryGraph'
import { SHIPPED_BASES, type BuiltinBase } from '../utils/presetBases'

// Everything the Library pages read about the configurations on disk (console
// v2, P7): every file's text (so loops and bases are worked out across the
// whole library, not only for the one being edited), the shipped bases, the
// Launch with game rules and fallback, the global Hold to swap chords, and
// each file's saved time. Re-read when the list changes, when a file's saved
// time changes, and when the associations change.

export type LibraryData = {
  texts: Record<string, string>
  graph: LibraryGraph
  builtinBases: BuiltinBase[]
  rules: AutoloadRule[]
  fallback: AutoloadFallback | null
  chords: GlobalChord[]
  meta: Record<string, LibraryProfileMeta>
  loading: boolean
  reload: () => Promise<void>
}

export function useLibraryGraph(libraryProfiles: string[], refreshKey: unknown = 0): LibraryData {
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [builtinBases, setBuiltinBases] = useState<BuiltinBase[]>(SHIPPED_BASES)
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const [fallback, setFallback] = useState<AutoloadFallback | null>(null)
  const [chords, setChords] = useState<GlobalChord[]>([])
  const [meta, setMeta] = useState<Record<string, LibraryProfileMeta>>({})
  const [loading, setLoading] = useState(true)
  const listKey = libraryProfiles.join('\n')

  const readTexts = useCallback(async (names: string[]) => {
    const entries = await Promise.all(names.map(async name => {
      const profile = await desktopBridge.loadLibraryProfile(name).catch(() => null)
      return [name, profile?.content ?? null] as const
    }))
    setTexts(Object.fromEntries(entries.filter(([, text]) => text !== null)) as Record<string, string>)
  }, [])

  const readRules = useCallback(async () => {
    const [list, fallbackRule, chordList] = await Promise.all([
      desktopBridge.listAutoloadRules().catch(() => [] as AutoloadRule[]),
      desktopBridge.getAutoloadFallback().catch(() => null),
      desktopBridge.listGlobalChords().catch(() => [] as GlobalChord[]),
    ])
    setRules(list.filter(rule => !rule.builtIn))
    setFallback(fallbackRule)
    setChords(chordList)
  }, [])

  const reload = useCallback(async () => {
    const names = libraryProfiles
    const [metaList] = await Promise.all([
      desktopBridge.listLibraryProfileMeta().catch(() => [] as LibraryProfileMeta[]),
      readTexts(names),
      readRules(),
    ])
    setMeta(Object.fromEntries(metaList.map(entry => [entry.name, entry])))
    setLoading(false)
  // The list is the dependency; listKey stands for it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, readTexts, readRules])

  useEffect(() => { void reload() }, [reload, refreshKey])
  useEffect(() => { void desktopBridge.listBuiltinBases().then(list => { if (list.length) setBuiltinBases(list) }).catch(() => {}) }, [])
  useEffect(() => {
    const read = () => void readRules()
    window.addEventListener('jsm:associations-changed', read)
    window.addEventListener('jsm:library-changed', reload)
    return () => { window.removeEventListener('jsm:associations-changed', read); window.removeEventListener('jsm:library-changed', reload) }
  }, [readRules, reload])

  const graph = useMemo(() => buildLibraryGraph(texts, builtinBases), [texts, builtinBases])
  return { texts, graph, builtinBases, rules, fallback, chords, meta, loading, reload }
}

/** Duplicate any configuration, not only the one being edited: a copy beside
 *  it, named "<name> copy". Returns the new name. */
export async function duplicateConfiguration(name: string): Promise<string | null> {
  const profile = await desktopBridge.loadLibraryProfile(name)
  if (!profile) return null
  const taken = await desktopBridge.listLibraryProfiles()
  const target = copyName(name, taken)
  const saved = await desktopBridge.saveLibraryProfile(target, profile.content)
  return saved?.name ?? null
}

/** Point a configuration at another base (or none), saving it at once. */
export async function changeBase(name: string, basePath: string | null): Promise<boolean> {
  const profile = await desktopBridge.loadLibraryProfile(name)
  if (!profile) return false
  return Boolean(await desktopBridge.saveLibraryProfile(name, setBaseInclude(profile.content, basePath)))
}

/** Tell every Library view to read the files again (after a save elsewhere). */
export const libraryChanged = () => window.dispatchEvent(new Event('jsm:library-changed'))
