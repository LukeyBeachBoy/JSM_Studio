import { useSyncExternalStore } from 'react'

// Show config names (console v2, V12): `html[data-config-names="on"]`, painted
// by hooks/useDisplayPrefs. Read from the attribute so every label follows the
// switch at once, in any window, without a provider.
const read = () => typeof document !== 'undefined' && document.documentElement.dataset.configNames === 'on'
const subscribe = (notify: () => void) => {
  const observer = new MutationObserver(notify)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-config-names'] })
  return () => observer.disconnect()
}

/** Whether Show config names is on. */
export const useShowConfigNames = () => useSyncExternalStore(subscribe, read, () => false)

/**
 * The JoyShockMapper key behind a friendly label (console v2, V12), so a
 * configuration written by hand still reads one to one. Nothing at all while
 * Show config names is off: the label's text stays exactly the label.
 */
export function ConfigName({ name }: { name: string }) {
  const shown = useShowConfigNames()
  if (!shown) return null
  return <span className="config-name" translate="no" data-config-name={name}>{name}</span>
}
