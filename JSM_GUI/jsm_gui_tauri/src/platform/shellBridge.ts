import { useEffect, useSyncExternalStore } from 'react'
import type { GlobalChord } from './desktopBridge'
import tauriConf from '../../src-tauri/tauri.conf.json'

// The desktop calls the console v2 shell added (design/console-v2, SHELL):
// update checks (D19), Settings ▸ Startup (D20), Hold to swap's order, the
// Troubleshooting log's recent commands and restart, and the app in front for
// Launch with game. Kept apart from desktopBridge so its interface stays as it
// was; outside the desktop app (?mock, browser tests) each call falls back to
// the same-named function on window.electronAPI, or to a quiet default.

export type UpdateStatus = {
  currentVersion: string
  latestVersion?: string | null
  available: boolean
  checking: boolean
  checkedAtMs?: number | null
  releaseUrl?: string | null
  error?: string | null
  installerUrl?: string | null
}

export type StartupPreferences = {
  startInTray: boolean
  /** "last" (Last one live), "fallback" (Desktop gamepad) or "named:<name>". */
  startupProfile: string
}

export type ForegroundApp = { processName: string; pid: number }

type Unsubscribe = () => void
type MockApi = Partial<{
  getUpdateStatus: () => Promise<UpdateStatus>
  checkForUpdatesNow: () => Promise<UpdateStatus>
  installAppUpdate: () => Promise<void>
  getStartupPreferences: () => Promise<StartupPreferences>
  setStartupPreferences: (preferences: StartupPreferences) => Promise<StartupPreferences>
  reorderGlobalChords: (ids: string[]) => Promise<GlobalChord[]>
  listRecentConsoleCommands: () => Promise<string[]>
  recordConsoleCommand: (command: string) => Promise<string[]>
  clearRecentConsoleCommands: () => Promise<string[]>
  getForegroundApp: () => Promise<ForegroundApp | null>
  restartMapper: () => Promise<void>
}>

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const mock = () => (typeof window === 'undefined' ? undefined : (window as unknown as { electronAPI?: MockApi }).electronAPI)
const invoke = async <T>(command: string, args?: Record<string, unknown>) => {
  const { invoke: call } = await import('@tauri-apps/api/core')
  return call<T>(command, args)
}
const listen = <T>(event: string, callback: (payload: T) => void): Unsubscribe => {
  if (!isTauri()) return () => {}
  let disposed = false
  let stop: Unsubscribe = () => {}
  void import('@tauri-apps/api/event').then(({ listen: on }) => on<T>(event, message => { if (!disposed) callback(message.payload) })).then(unlisten => {
    if (disposed) unlisten(); else stop = unlisten
  })
  return () => { disposed = true; stop() }
}

/** The version people see: the one the installer was built from. */
export const appVersion: string = tauriConf.version

export const shellBridge = {
  async getUpdateStatus(): Promise<UpdateStatus> {
    if (isTauri()) return invoke<UpdateStatus>('get_update_status')
    return (await mock()?.getUpdateStatus?.()) ?? { currentVersion: appVersion, available: false, checking: false }
  },
  async checkForUpdates(): Promise<UpdateStatus> {
    if (isTauri()) return invoke<UpdateStatus>('check_for_updates')
    return (await mock()?.checkForUpdatesNow?.()) ?? { currentVersion: appVersion, available: false, checking: false, checkedAtMs: Date.now(), error: 'Updates are checked in the desktop app.' }
  },
  async installUpdate(): Promise<void> {
    if (isTauri()) return invoke<void>('install_update')
    await mock()?.installAppUpdate?.()
  },
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => listen<UpdateStatus>('update-status', callback),
  onUpdateProgress: (callback: (percent: number) => void) => listen<number>('update-progress', callback),

  async getStartupPreferences(): Promise<StartupPreferences> {
    if (isTauri()) return invoke<StartupPreferences>('get_startup_preferences')
    return (await mock()?.getStartupPreferences?.()) ?? { startInTray: true, startupProfile: 'last' }
  },
  async setStartupPreferences(preferences: StartupPreferences): Promise<StartupPreferences> {
    if (isTauri()) return invoke<StartupPreferences>('set_startup_preferences', { preferences })
    return (await mock()?.setStartupPreferences?.(preferences)) ?? preferences
  },

  async reorderGlobalChords(ids: string[]): Promise<GlobalChord[] | null> {
    if (isTauri()) return invoke<GlobalChord[]>('reorder_global_chords', { ids })
    return (await mock()?.reorderGlobalChords?.(ids)) ?? null
  },

  async listRecentConsoleCommands(): Promise<string[]> {
    if (isTauri()) return invoke<string[]>('list_recent_console_commands').catch(() => [])
    return (await mock()?.listRecentConsoleCommands?.()) ?? readLocalRecent()
  },
  async recordConsoleCommand(command: string): Promise<string[]> {
    if (isTauri()) return invoke<string[]>('record_console_command', { command }).catch(() => [])
    return (await mock()?.recordConsoleCommand?.(command)) ?? writeLocalRecent([command, ...readLocalRecent().filter(item => item.toLowerCase() !== command.toLowerCase())].slice(0, 8))
  },
  async clearRecentConsoleCommands(): Promise<string[]> {
    if (isTauri()) return invoke<string[]>('clear_recent_console_commands').catch(() => [])
    return (await mock()?.clearRecentConsoleCommands?.()) ?? writeLocalRecent([])
  },

  async getForegroundApp(): Promise<ForegroundApp | null> {
    if (isTauri()) return invoke<ForegroundApp | null>('get_foreground_app').catch(() => null)
    return (await mock()?.getForegroundApp?.()) ?? null
  },
  onForegroundApp: (callback: (app: ForegroundApp) => void) => listen<ForegroundApp>('foreground-app', callback),

  async restartMapper(): Promise<void> {
    if (isTauri()) return invoke<void>('restart_mapper')
    await mock()?.restartMapper?.()
  },
}

// Outside the desktop app the recent commands live in this browser.
const RECENT_KEY = 'jsm-recent-commands'
const readLocalRecent = (): string[] => {
  try { const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [] } catch { return [] }
}
const writeLocalRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch { /* private window */ } return list }

// ---- The one update status every reader shares (banner, About, Startup).
let updateStatus: UpdateStatus | null = null
const updateListeners = new Set<() => void>()
const setUpdate = (next: UpdateStatus) => { updateStatus = next; updateListeners.forEach(listener => listener()) }
let updatePrimed = false
const primeUpdates = () => {
  if (updatePrimed) return
  updatePrimed = true
  shellBridge.onUpdateStatus(setUpdate)
  void shellBridge.getUpdateStatus().then(status => {
    // The desktop app asks GitHub itself a few seconds after launch; elsewhere,
    // or when that has not happened, ask once now.
    if (status.checkedAtMs || status.checking) setUpdate(status)
    else void checkForUpdatesNow()
  }).catch(() => {})
}

/** "Check now": every reader updates when the answer comes. */
export const checkForUpdatesNow = async () => {
  setUpdate({ ...(updateStatus ?? { currentVersion: appVersion, available: false }), checking: true })
  try {
    const next = await shellBridge.checkForUpdates()
    setUpdate(next)
    return next
  } catch (error) {
    const failed = { ...(updateStatus ?? { currentVersion: appVersion, available: false }), checking: false, checkedAtMs: Date.now(), error: error instanceof Error ? error.message : String(error) }
    setUpdate(failed)
    return failed
  }
}

const subscribeUpdates = (listener: () => void) => { updateListeners.add(listener); return () => { updateListeners.delete(listener) } }

/** The shared update status; null until the first answer. */
export function useUpdateStatus(): UpdateStatus | null {
  useEffect(primeUpdates, [])
  return useSyncExternalStore(subscribeUpdates, () => updateStatus)
}

/** "Up to date", "Version 0.8.0 is ready", "Checking…", "Couldn't check". */
export const describeUpdate = (status: UpdateStatus | null) => {
  if (!status || status.checking) return 'Checking for updates…'
  if (status.error) return 'Couldn’t check'
  if (status.available) return `Version ${status.latestVersion} is ready`
  return 'Up to date'
}

/** "checked when JSM Evolved started", "checked at 21:40". */
export const describeChecked = (status: UpdateStatus | null, startedAt: number) => {
  if (!status?.checkedAtMs) return 'not checked yet'
  if (status.checkedAtMs - startedAt < 60_000) return 'checked when JSM Evolved started'
  return `checked at ${new Date(status.checkedAtMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`
}

/** When this window started, for "checked when JSM Evolved started". */
export const APP_STARTED_AT = Date.now()
