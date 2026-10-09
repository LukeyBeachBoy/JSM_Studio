import { useEffect, useRef } from 'react'

// A page that steps something of its own with the shell's buttons (console v2:
// Guides steps its topics on LT/RT, and the matches of a search on LB/RB) claims
// the step before the shell takes it. The shell asks first with a cancelable
// window event; a page that handles it calls preventDefault.

export type StepEvent = 'jsm:page-step' | 'jsm:section-step'

/** Ask whether a page takes this step; true when one did. */
export const claimStep = (type: StepEvent, delta: 1 | -1) => {
  const event = new CustomEvent<1 | -1>(type, { detail: delta, cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Take a step while `enabled`: the handler returns false to leave it to the shell. */
export function useStepClaim(type: StepEvent, handler: (delta: 1 | -1) => boolean | void, enabled = true) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    if (!enabled) return
    const onStep = (event: Event) => {
      if (event.defaultPrevented) return
      if (latest.current((event as CustomEvent<1 | -1>).detail) !== false) event.preventDefault()
    }
    window.addEventListener(type, onStep)
    return () => window.removeEventListener(type, onStep)
  }, [type, enabled])
}
