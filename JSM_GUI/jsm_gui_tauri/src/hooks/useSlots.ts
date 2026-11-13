import { useSyncExternalStore } from 'react'
import { desktopBridge, type ConfigSlots } from '../platform/desktopBridge'
import { showToast } from '../utils/toast'

let current: ConfigSlots | null = null
let started = false
const listeners = new Set<() => void>()
export const updateSlots = (next: ConfigSlots) => { current = next; for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (!started) {
    started = true
    let revision = 0
    desktopBridge.onSlotsChanged(next => { revision++; updateSlots(next) })
    desktopBridge.onSlotError(error => showToast(error, 'error'))
    const initialRevision = revision
    void desktopBridge.getSlots().then(next => { if (revision === initialRevision) updateSlots(next) }).catch(error => showToast(String(error), 'error'))
  }
  return () => { listeners.delete(listener) }
}
export const useSlots = () => useSyncExternalStore(subscribe, () => current)
