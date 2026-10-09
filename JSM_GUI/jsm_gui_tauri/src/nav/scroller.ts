// One owner for programmatic scrolling of the page (.shell-scroll).
//
// LB/RB section jumps, the pad keeping focus in view, and page entry all used
// to scroll on their own -- native smooth scrollIntoView, instant scrollBy,
// and a timer that "finished" a smooth scroll 700 ms later. Pressed quickly,
// each cancelled or overrode the others and the page was thrown about. Now
// they all go through here: one animation per host that is retargeted, never
// restarted, so a burst of presses reads as one continuous glide toward the
// latest target, and anything measuring "where will this be" can ask for the
// destination instead of the in-flight position.

import { ringTarget } from './navBox'

type Flight = {
  from: number
  to: number
  start: number
  duration: number
  frame: number
  /** The section this flight is taking the page to, for LB/RB stepping. */
  section?: string
}

const flights = new WeakMap<HTMLElement, Flight>()
/** Where the last section jump left the page, while it is still there. */
const landed = new WeakMap<HTMLElement, { section: string; top: number }>()

const finish = (host: HTMLElement, flight: Flight) => {
  flights.delete(host)
  delete host.dataset.navScrolling
  if (flight.section) landed.set(host, { section: flight.section, top: host.scrollTop })
}

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const easeOut = (t: number) => 1 - (1 - t) ** 3
const maxScroll = (host: HTMLElement) => Math.max(0, host.scrollHeight - host.clientHeight)

export const pageScrollHost = () => document.querySelector<HTMLElement>('.shell-scroll')

/** Use the element that really scrolls, including nested editor columns. */
const isScrollHost = (element: HTMLElement) =>
  element.clientHeight > 0 && element.scrollHeight > element.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(element).overflowY)

function nearestScrollHost(element: HTMLElement | null, boundary?: HTMLElement) {
  for (let node = element; node; node = node.parentElement) {
    if (isScrollHost(node)) return node
    if (node === boundary) break
  }
  return null
}

/** An open overlay owns scrolling even while focus is on its header/footer. */
export function activeScrollHost() {
  const overlays = document.querySelectorAll<HTMLElement>('.modal-overlay, [data-focus-trap="true"]')
  const overlay = overlays[overlays.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (overlay) {
    const focused = overlay.contains(active) ? nearestScrollHost(active, overlay) : null
    return focused ?? Array.from(overlay.querySelectorAll<HTMLElement>('*')).find(isScrollHost) ?? null
  }
  return nearestScrollHost(active) ?? pageScrollHost()
}

/** Where the host is headed: the flight's target, else where it is. */
export const scrollDestination = (host: HTMLElement) => flights.get(host)?.to ?? host.scrollTop

/**
 * The section an LB/RB jump is going to, or the one it arrived at while the
 * page has not moved since. The scroll spy only catches up a render later;
 * stepping from its answer in that moment went back a section.
 */
export const sectionInFlight = (host = pageScrollHost()) => {
  if (!host) return null
  const flying = flights.get(host)?.section
  if (flying) return flying
  const last = landed.get(host)
  return last && Math.abs(host.scrollTop - last.top) <= 2 ? last.section : null
}

export function cancelScroll(host: HTMLElement | null = pageScrollHost()) {
  if (!host) return
  const flight = flights.get(host)
  if (!flight) return
  cancelAnimationFrame(flight.frame)
  flights.delete(host)
  delete host.dataset.navScrolling
}

/**
 * Scroll `host` to `top`. A flight already under way is retargeted from where
 * it is now, so repeated calls never jump back or stall.
 */
export function scrollHostTo(host: HTMLElement, top: number, options: { smooth?: boolean; section?: string; duration?: number } = {}) {
  const to = Math.round(Math.min(maxScroll(host), Math.max(0, top)))
  const current = flights.get(host)
  if (!options.smooth || reducedMotion()) {
    cancelScroll(host)
    host.scrollTop = to
    return
  }
  if (current) cancelAnimationFrame(current.frame)
  if (Math.abs(to - host.scrollTop) < 1) { cancelScroll(host); host.scrollTop = to; return }
  const distance = Math.abs(to - host.scrollTop)
  const flight: Flight = {
    from: host.scrollTop,
    to,
    start: performance.now(),
    // Long jumps take a little longer, but never so long that a burst of
    // presses queues up behind the animation.
    duration: options.duration ?? Math.min(320, 160 + distance * 0.12),
    frame: 0,
    section: options.section ?? (current && current.to === to ? current.section : undefined),
  }
  flights.set(host, flight)
  host.dataset.navScrolling = 'true'
  const step = (now: number) => {
    if (flights.get(host) !== flight) return
    const t = Math.min(1, (now - flight.start) / flight.duration)
    host.scrollTop = flight.from + (flight.to - flight.from) * easeOut(t)
    if (t < 1) { flight.frame = requestAnimationFrame(step); return }
    finish(host, flight)
  }
  flight.frame = requestAnimationFrame(step)
  // Animation frames stop while the window is hidden or throttled; the jump
  // must still arrive, so a timer lands it if the frames have not.
  window.setTimeout(() => {
    if (flights.get(host) !== flight) return
    cancelAnimationFrame(flight.frame)
    host.scrollTop = flight.to
    finish(host, flight)
  }, flight.duration + 150)
}

/** Scroll by a delta relative to where the page is headed. */
export function scrollHostBy(host: HTMLElement, delta: number, options: { smooth?: boolean } = {}) {
  scrollHostTo(host, scrollDestination(host) + delta, options)
}

// Keep what the pad lands on clear of the top of the page and of the capsule.
export const CLEAR_TOP = 96
// The hint bar docks under the scroll area (console v2, V2), so the page only
// keeps a little breathing room at the bottom.
export const CLEAR_BOTTOM = 24

/**
 * Bring the full focus ring into view in its actual scrolling container,
 * measured against the destination rather than the in-flight position.
 */
export function ensureVisible(element: HTMLElement, options: { smooth?: boolean } = { smooth: true }) {
  const host = nearestScrollHost(element)
  if (!host) return false
  const view = host.getBoundingClientRect()
  // Dialog entrance animations can scale the frame. DOM rectangles use
  // screen pixels; scrollTop uses the unscaled layout's pixels.
  const scale = host.offsetHeight > 0 ? view.height / host.offsetHeight : 1
  if (scale <= 0) return false
  const viewTop = view.top + host.clientTop * scale
  const viewBottom = viewTop + host.clientHeight * scale
  const box = ringTarget(element).getBoundingClientRect()
  const inPage = host.matches('.shell-scroll')
  const clearTop = inPage ? CLEAR_TOP : 8
  const clearBottom = inPage ? CLEAR_BOTTOM : 8
  const pending = (scrollDestination(host) - host.scrollTop) * scale
  const top = box.top - pending, bottom = box.bottom - pending
  const room = viewBottom - viewTop - clearTop - clearBottom
  let delta = 0
  if (box.height > room) delta = top - (viewTop + clearTop)
  else if (top < viewTop + clearTop) delta = top - (viewTop + clearTop)
  else if (bottom > viewBottom - clearBottom) delta = bottom - (viewBottom - clearBottom)
  if (Math.abs(delta) >= 1) scrollHostBy(host, delta / scale, options)
  return true
}

/** The page is being moved by the person (wheel, drag, right stick): stop steering it. */
export function watchManualScroll(host: HTMLElement) {
  const stop = () => cancelScroll(host)
  host.addEventListener('wheel', stop, { passive: true })
  host.addEventListener('pointerdown', stop, { passive: true })
  host.addEventListener('touchstart', stop, { passive: true })
  return () => {
    host.removeEventListener('wheel', stop)
    host.removeEventListener('pointerdown', stop)
    host.removeEventListener('touchstart', stop)
  }
}
