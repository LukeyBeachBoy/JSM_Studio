/** Nested portals need not be in DOM stacking order. Match visual stacking so
 * keyboard focus and controller scrolling stay on the visible editor. */
export function activeOverlay(): HTMLElement | null {
  const selector = '.modal-overlay, [data-focus-trap="true"]'
  const overlays = document.querySelectorAll<HTMLElement>(selector)
  let active: HTMLElement | null = null
  let rank: number[] = []
  for (const overlay of overlays) {
    // An inline confirmation inherits its containing overlay's stack. Its
    // own z-index can be auto (0) and it must still take focus from its parent.
    // Compare the outer stacks first so nested content cannot outrank a later
    // portal above its parent just by assigning itself a large local z-index.
    const next: number[] = []
    let ancestor: HTMLElement | null = overlay
    while (ancestor) {
      next.unshift((Number.parseInt(getComputedStyle(ancestor).zIndex) || 0) * 100 + Number(ancestor.dataset.overlayDepth ?? 0))
      ancestor = ancestor.parentElement?.closest<HTMLElement>(selector) ?? null
    }
    let above = true
    for (let index = 0; index < Math.max(next.length, rank.length); index++) {
      if (index >= next.length) { above = false; break }
      if (index >= rank.length) break
      if (next[index] !== rank[index]) { above = next[index] > rank[index]; break }
    }
    if (above) { active = overlay; rank = next }
  }
  return active
}
