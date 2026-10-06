import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { desktopBridge, type SoundEntry } from '../platform/desktopBridge'
import { rememberSoundNames } from '../utils/controllerSounds'

let entries: SoundEntry[] = []
const listeners = new Set<() => void>()
let inflight: Promise<void> | null = null
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => entries

export function refreshSoundLibrary(): Promise<void> {
  inflight ??= desktopBridge.soundLibraryList().then(next => {
    entries = next
    rememberSoundNames(next)
    listeners.forEach(listener => listener())
  }).finally(() => { inflight = null })
  return inflight
}

export function useSoundLibrary() {
  useEffect(() => { void refreshSoundLibrary().catch(() => {}) }, [])
  return { sounds: useSyncExternalStore(subscribe, snapshot), refresh: useCallback(refreshSoundLibrary, []) }
}
