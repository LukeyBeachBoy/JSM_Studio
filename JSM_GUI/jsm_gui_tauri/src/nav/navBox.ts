// What a control looks like to the pad: the box the ring is drawn round, and
// the box the D-pad measures from. Kept in one place so the two never
// disagree -- the walk used to measure a setting row's select, sitting at the
// row's right edge, while the ring was drawn round the whole row, so a Down
// that looked straight down on screen was scored as a jump sideways (and the
// other way round).

const PILL = '.button, .icon-button, .back-chip, .segmented > *'
const PAD_STOP = 'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary, a[href]'

/** Whether `container` holds no pad stop but the one in question. */
const onlyStop = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(PAD_STOP))
    .filter(stop => !stop.matches('.help-button, [data-nav-skip]') && stop.getClientRects().length > 0).length <= 1

/**
 * The element that wears the ring.
 *
 * - A setting row whose only pad stop is this control rings as a whole (a
 *   slider row is one stop); a row holding several choices -- a segmented
 *   control, say -- rings the choice, so the pad shows which one A would pick.
 * - A control drawn as a slice of a shared box (a radial menu's segments are
 *   all the same square, cut apart by clip-path) marks the part that is its
 *   own with a data-nav-box child. Rung and measured by their boxes, every segment
 *   wore the same ring round the whole wheel and no direction could reach
 *   the others.
 */
export const ringTarget = (element: HTMLElement) => {
  const own = element.querySelector<HTMLElement>(':scope > [data-nav-box]')
  const ownBox = own?.getBoundingClientRect()
  if (own && ownBox && ownBox.width > 0 && ownBox.height > 0) return own
  if (element.matches(PILL)) return element
  const row = element.closest<HTMLElement>('.setting-row')
  if (row) return onlyStop(row) ? row : element
  // A field inside the label that contains it is that whole label: measuring
  // only the input leaves the focus ring on the inner control instead of its
  // full container (icon search, for example).
  const label = element.matches('input, select, textarea') ? element.closest<HTMLElement>('label') : null
  return label && onlyStop(label) ? label : element
}

/**
 * The box directional moves measure a control by: its ring's, except that a
 * slider's thumb slides along with its value, so the slider is where it sits
 * -- a value near one end must not make Down from the field above read as a
 * move sideways.
 */
export const navBox = (element: HTMLElement): DOMRect => {
  const ring = ringTarget(element)
  if (ring === element && element.getAttribute('role') === 'slider') {
    const slider = element.parentElement?.closest<HTMLElement>('[data-adjusting]')
    if (slider) return slider.getBoundingClientRect()
  }
  return ring.getBoundingClientRect()
}
