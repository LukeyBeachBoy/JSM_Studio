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
export const CLEAR_BOTTOM = 44 + 16 + 16

/**
 * Bring `element` into view in its page, measured against where the page is
 * going rather than where it is mid-flight. Does nothing for elements outside
 * the page's scroller (dialogs, the title bar).
 */
export function ensureVisible(element: HTMLElement, options: { smooth?: boolean } = { smooth: true }) {
  const host = element.closest<HTMLElement>('.shell-scroll')
  if (!host) return false
  const view = host.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const pending = scrollDestination(host) - host.scrollTop
  const top = box.top - pending, bottom = box.bottom - pending
  const room = view.height - CLEAR_TOP - CLEAR_BOTTOM
  let delta = 0
  if (box.height > room) delta = top - (view.top + CLEAR_TOP)
  else if (top < view.top + CLEAR_TOP) delta = top - (view.top + CLEAR_TOP)
  else if (bottom > view.bottom - CLEAR_BOTTOM) delta = bottom - (view.bottom - CLEAR_BOTTOM)
  if (Math.abs(delta) < 1) return false
  scrollHostBy(host, delta, options)
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
