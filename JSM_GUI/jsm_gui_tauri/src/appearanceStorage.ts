import { invoke } from '@tauri-apps/api/core'

const keys = ['jsm-theme', 'jsm-accent', 'jsm-language', 'jsm-density', 'jsm-config-names'] as const
type AppearanceKey = typeof keys[number]
const restored = new Map<string, string>()
const isDesktop = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (!keys.includes(event.key as AppearanceKey)) return
    if (event.newValue === null) restored.delete(event.key!)
    else restored.set(event.key!, event.newValue)
  })
}

export function readAppearance(key: AppearanceKey): string | null {
  if (restored.has(key)) return restored.get(key)!
  try { return localStorage.getItem(key) }
  catch { return restored.get(key) ?? null }
}

function cache(key: AppearanceKey, value: string) {
  restored.set(key, value)
  try { localStorage.setItem(key, value) } catch { /* Native settings remain available. */ }
}

// Serialize writes so rapid choices cannot finish in reverse order.
let saving = Promise.resolve()
export function persistAppearance(key: AppearanceKey, value: string): Promise<void> {
  cache(key, value)
  if (!isDesktop()) return Promise.resolve()
  saving = saving.then(() => invoke<void>('save_appearance_preference', { key, value }))
    .catch(error => { console.error('Could not save appearance preference', error) })
  return saving
}

/** Hydrate before painting or mounting hooks. Only actual legacy choices migrate. */
export async function restoreAppearance(): Promise<void> {
  if (!isDesktop()) return
  const legacy = Object.fromEntries(keys.flatMap(key => {
    const value = readAppearance(key)
    return value === null ? [] : [[key, value]]
  }))
  try {
    const preferences = await invoke<Record<string, string>>('load_appearance_preferences', { legacy })
    for (const key of keys) {
      if (preferences[key] !== undefined) cache(key, preferences[key])
    }
  } catch (error) {
    console.error('Could not restore appearance preferences', error)
  }
}
