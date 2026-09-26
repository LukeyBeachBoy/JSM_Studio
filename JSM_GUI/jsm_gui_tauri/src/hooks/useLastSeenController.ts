import { useEffect, useState, useSyncExternalStore } from 'react'
import { desktopBridge } from '../platform/desktopBridge'
import type { TelemetrySample } from './useTelemetry'
import { controllerDisplayName, controllerVisualFamily, type ControllerVisualFamily } from '../utils/controllerStatus'

// The last controller telemetry reported, kept for the whole session: the
// "last seen 4 min ago" line (System States 17a) and, on pages that have no
// device of their own, which glyph family to draw. One subscription, shared.
type LastSeen = { at: number | null; type?: number }
let lastSeen: LastSeen = { at: null }
const listeners = new Set<() => void>()
let subscribed = false
const ensureSubscribed = () => {
  if (subscribed) return
  subscribed = true
  desktopBridge.onTelemetrySample(payload => {
    const device = (payload as TelemetrySample | null)?.devices?.[0]
    if (!device) return
    lastSeen = { at: Date.now(), type: device.type }
    listeners.forEach(listener => listener())
  })
}
const subscribe = (listener: () => void) => {
  ensureSubscribed()
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** The controller most recently seen this session, if any. */
export function useLastSeenController(): { at: number | null; family: ControllerVisualFamily; name: string | null } {
  const seen = useSyncExternalStore(subscribe, () => lastSeen)
  return {
    at: seen.at,
    family: seen.type === undefined ? 'generic' : controllerVisualFamily(seen.type),
    name: seen.type === undefined ? null : controllerDisplayName(seen.type),
  }
}

/** "4 min ago" for a timestamp; re-rendering is the caller's business. */
export const relativeTime = (ms: number, now = Date.now()) => {
  const seconds = Math.max(0, Math.round((now - ms) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const then = new Date(ms); then.setHours(0, 0, 0, 0)
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000)
  if (days <= 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(ms).toLocaleDateString()
}

/** A clock that ticks so relative times stay honest while a page is open. */
export function useClock(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
