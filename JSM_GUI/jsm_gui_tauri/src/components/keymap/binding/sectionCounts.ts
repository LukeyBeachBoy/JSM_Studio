import { useSyncExternalStore } from 'react'

// The Buttons rail's counts (console v2, ButtonList: "Face buttons 4", "Menu
// buttons 1 of 4"): the list (KeymapControls) knows which inputs a section
// shows and which are set; the shell's rail (App.tsx → ShellSection.count)
// reads them from here.

export type SectionCount = { bound: number; total: number }
let counts: Record<string, SectionCount> = {}
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

export function publishSectionCounts(next: Record<string, SectionCount>) {
  const same = Object.keys(next).length === Object.keys(counts).length && Object.entries(next).every(([key, value]) => counts[key]?.bound === value.bound && counts[key]?.total === value.total)
  if (same) return
  counts = next
  listeners.forEach(listener => listener())
}

export const useSectionCounts = () => useSyncExternalStore(subscribe, () => counts, () => counts)

/** "1 of 4", "4 of 4": one format on every rail entry (UX review 2026-10-09). */
export const formatSectionCount = (count?: SectionCount) => count ? `${count.bound} of ${count.total}` : undefined
