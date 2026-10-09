// Where a page lands the pad when it opens, for pages whose landing is not
// simply their first control (Home's primary action, the Library's first-run
// welcome). Nothing is taken from a control the person already reached, and
// nothing is focused behind something open over the page: a prompt that
// opened on launch keeps focus, and the landing happens once it has gone
// (UX review 2026-10-09, B5).

const OVERLAY = '.modal-overlay, [data-focus-trap="true"], [data-radix-popper-content-wrapper]'

/**
 * Focus `target` inside `root` as soon as the way is clear. Returns a cleanup
 * that cancels a landing still waiting.
 */
export function landOn(root: HTMLElement | null, target: () => HTMLElement | null | undefined): () => void {
  let observer: MutationObserver | null = null
  let frame = 0
  const settled = () => {
    const active = document.activeElement
    // Something on this page already has focus: that is where the pad is.
    return Boolean(active && active !== document.body && root?.contains(active))
  }
  const land = () => {
    if (settled()) return
    if (document.querySelector(OVERLAY)) {
      // Wait for whatever is open over the page to close, then look again.
      observer ??= new MutationObserver(() => {
        if (document.querySelector(OVERLAY)) return
        observer?.disconnect(); observer = null
        frame = requestAnimationFrame(land)
      })
      observer.observe(document.body, { childList: true, subtree: true })
      return
    }
    target()?.focus({ preventScroll: true })
  }
  frame = requestAnimationFrame(land)
  return () => { cancelAnimationFrame(frame); observer?.disconnect(); observer = null }
}
