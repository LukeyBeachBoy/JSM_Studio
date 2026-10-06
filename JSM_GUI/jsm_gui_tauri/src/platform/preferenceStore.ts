import { useEffect, useSyncExternalStore } from 'react'
import { desktopBridge, type RuntimeMappingState } from './desktopBridge'

/**
 * The app-wide preferences the Preferences page shows (Start with Windows,
 * Controller navigation, Trackpad overlay, Calibration HUD, calibration and
 * polling defaults), read once at startup and kept here.
 *
 * Each switch used to start from a guessed default and ask the backend when
 * it mounted, so every visit to the page showed the switches flipping to
 * their real state mid-transition. Reading them up front means the page
 * mounts with the real values; a switch whose value is still unknown (the
 * very first frames after launch) says so instead of guessing.
 */
export type PreferenceSnapshot = {
  /** Null until the backend has answered. */
  runtime: RuntimeMappingState | null
  autostart: boolean | null
}

let snapshot: PreferenceSnapshot = { runtime: null, autostart: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const set = (patch: Partial<PreferenceSnapshot>) => { snapshot = { ...snapshot, ...patch }; emit() }

export const getPreferenceSnapshot = () => snapshot

/** Merge a change (optimistic or confirmed) into the cached runtime state. */
export function patchRuntimePreferences(patch: Partial<RuntimeMappingState>) {
  if (!snapshot.runtime) return
  set({ runtime: { ...snapshot.runtime, ...patch } })
}
export function setCachedAutostart(value: boolean) { set({ autostart: value }) }

/** Ask the backend again. Safe to call any time; values that arrive later
 *  replace the cache and every reader re-renders. */
let inflight: Promise<void> | null = null
export function refreshPreferences() {
  // Every switch on the page asks when it mounts; one read answers them all.
  inflight ??= Promise.all([
    desktopBridge.getRuntimeMappingState().then(runtime => { if (runtime) set({ runtime: { ...snapshot.runtime, ...runtime } }) }).catch(() => {}),
    desktopBridge.getAutostartEnabled().then(value => set({ autostart: !!value })).catch(() => {}),
  ]).then(() => { inflight = null })
  return inflight
}

let primed: Promise<void> | null = null
/** Read everything once, as early as possible, and follow the backend's
 *  runtime-state broadcasts (a command binding or the tray can change them). */
export function primePreferences() {
  if (primed) return primed
  desktopBridge.onRuntimeMappingState(state => { if (state) set({ runtime: { ...snapshot.runtime, ...state } }) })
  primed = refreshPreferences()
  return primed
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** The cached preferences; refreshed once when the reader mounts so a change
 *  made outside the app (Task Scheduler, another window) still shows. */
export function usePreferences(): PreferenceSnapshot {
  useEffect(() => { if (primed) void refreshPreferences(); else void primePreferences() }, [])
  return useSyncExternalStore(subscribe, getPreferenceSnapshot)
}
