/** Nested portals need not be in DOM stacking order. Match visual stacking so
 * keyboard focus and controller scrolling stay on the visible editor. */
export function activeOverlay(): HTMLElement | null {
  const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay, [data-focus-trap="true"]')
  let active: HTMLElement | null = null
  let rank = -Infinity
  for (const overlay of overlays) {
    const z = Number.parseInt(getComputedStyle(overlay).zIndex) || 0
    const next = z * 100 + Number(overlay.dataset.overlayDepth ?? 0)
    if (next >= rank) { active = overlay; rank = next }
  }
  return active
}
