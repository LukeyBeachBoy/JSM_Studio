import { useContext, useEffect, useRef } from 'react'
import { LayerUsageContext } from '../../LayerBar'
import { getKeymapValue } from '../../../utils/keymap'
import { timingMilliseconds } from '../../../utils/timing'
import { usePreferences } from '../../../platform/preferenceStore'
import { PAD_EVENT, type PadEventDetail } from '../../../nav/useControllerNavigation'

/** TURBO_PERIOD as this configuration has it: Turbo's "Repeat speed · Default". */
export function useTurboDefault() {
  const { text } = useContext(LayerUsageContext)
  const { runtime } = usePreferences()
  return timingMilliseconds(getKeymapValue(text, 'TURBO_PERIOD') ?? '') ?? runtime?.turboPeriodMs ?? 80
}

/** X and Y (pad, or the keyboard's x / y) for everything inside `ref`, unless
 *  something deeper claimed them. Return true to claim. */
export function usePadButtons(ref: React.RefObject<HTMLElement | null>, handle: (button: 'X' | 'Y', target: HTMLElement) => boolean, active = true) {
  const latest = useRef(handle)
  latest.current = handle
  useEffect(() => {
    const node = ref.current
    if (!node || !active) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button !== 'X' && button !== 'Y') return
      const target = (event.target instanceof HTMLElement ? event.target : node)
      if (latest.current(button, target)) event.preventDefault()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [ref, active])
}

/** Focus the first match inside `root` after the next paint. */
export const focusSoon = (root: () => ParentNode | null | undefined, selector: string) =>
  requestAnimationFrame(() => requestAnimationFrame(() => root()?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: false })))

/** Start Test mode (App.tsx listens for jsm:start-test): Fine-tune's X Try it, D13. */
export const requestTest = (input?: string) => window.dispatchEvent(new CustomEvent('jsm:start-test', { detail: { input } }))
