import { useEffect, useRef } from 'react'
import { ringTarget } from '../nav/navBox'

// Focus glide (HANDOFF: focus model): with the pad driving, the focus ring is
// one shared highlight that moves from control to control instead of a ring
// blinking out here and in there. The element keeps its selected fill; only
// the ring moves.
//
// It is driven a frame at a time rather than by a CSS transition, because
// everything it follows moves on its own: a page slides in, a picker scales
// up, the page scrolls under it, a row lifts a pixel on focus. So:
//
// - Every frame the ring reads where its control is now. Moving with a
//   sliding page or a scroll is just following, never a jump at the end.
// - A move within a scope eases position, size and corner radius together
//   from wherever the ring is drawn at that moment. Going from a half-width
//   control to a full-width one used to snap the size at the start of the
//   glide; now the shape morphs with it. A burst of presses retargets the
//   glide in flight rather than restarting it.
// - Arriving in another scope (a dialog, an opened list) does not glide: the
//   ring waits until its control has stopped moving -- a list is positioned
//   and scaled in after it takes focus -- and fades in there. It used to fly
//   in from wherever the list was first measured.
// - The ring is clipped to its control's scroll area, so a control scrolled
//   under the title bar or the capsule does not drag a ring over them.

const SCOPE = '[data-radix-popper-content-wrapper], [data-focus-scope], [role="dialog"], [role="alertdialog"], main, .shell-scroll'
const PILL = '.button, .icon-button, .back-chip, .segmented > *'
const CLIP = '.sheet__body, [data-subpage] > main, .shell-scroll,[role="listbox"], [role="menu"], .modal-card, [data-focus-scope]'

const GLIDE_MS = 150
const REVEAL_WAIT_MS = 400
/** How far the ring's glow may spill past its scroll area. */
const SPILL = 6

// ringTarget (nav/navBox.ts): the element that wears the ring -- a setting row
// with one pad stop rings as a whole. The D-pad measures moves by the same box.

type Box = { x: number; y: number; w: number; h: number; r: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const easeOut = (t: number) => 1 - (1 - t) ** 3
const same = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5

export function FocusGlide() {
  const highlight = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = highlight.current
    if (!node) return
    let target: HTMLElement | null = null
    let scope: Element | null = null
    let frame = 0
    // What is drawn now, where a glide started, and when.
    let drawn: Box | null = null
    let from: Box | null = null
    let glideStart = 0
    // Arriving in a new scope: the ring waits for its control to hold still.
    let revealing = false
    let revealStart = 0
    let lastSeen: Box | null = null
    let stillFrames = 0
    let written = ''

    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
    const active = () => document.body.dataset.inputSource === 'controller'

    const clear = () => {
      if (target) delete target.dataset.glideTarget
      target = null
      scope = null
      drawn = null
      from = null
      revealing = false
      cancelAnimationFrame(frame)
      frame = 0
      node.dataset.visible = 'false'
      written = ''
      delete document.body.dataset.focusGlide
    }

    const measure = (element: HTMLElement): Box | null => {
      if (!element.isConnected) return null
      const rect = element.getBoundingClientRect()
      if (!rect.width || !rect.height) return null
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height, r: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 }
    }

    const draw = (box: Box, element: HTMLElement) => {
      // Clip to the control's scroll area, letting the glow spill a little.
      const area = element.parentElement?.closest<HTMLElement>(CLIP)?.getBoundingClientRect()
      let clip = 'none'
      let hidden = false
      if (area) {
        const top = area.top - box.y, left = area.left - box.x
        const bottom = box.y + box.h - area.bottom, right = box.x + box.w - area.right
        hidden = top >= box.h || left >= box.w || bottom >= box.h || right >= box.w
        if (top > -SPILL || left > -SPILL || bottom > -SPILL || right > -SPILL) {
          clip = `inset(${Math.max(-SPILL, top)}px ${Math.max(-SPILL, right)}px ${Math.max(-SPILL, bottom)}px ${Math.max(-SPILL, left)}px round ${box.r}px)`
        }
      }
      const key = `${box.x.toFixed(1)},${box.y.toFixed(1)},${box.w.toFixed(1)},${box.h.toFixed(1)},${box.r.toFixed(1)},${clip},${hidden}`
      if (key === written) return
      written = key
      node.style.transform = `translate(${box.x}px, ${box.y}px)`
      node.style.width = `${box.w}px`
      node.style.height = `${box.h}px`
      node.style.borderRadius = `${box.r}px`
      node.style.clipPath = clip
      node.dataset.clipped = hidden ? 'true' : 'false'
    }

    const tick = (now: number) => {
      frame = 0
      if (!target || !active()) return
      const live = measure(target)
      if (!live) { clear(); return }
      if (revealing) {
        stillFrames = lastSeen && same(lastSeen, live) ? stillFrames + 1 : 0
        lastSeen = live
        if (stillFrames < 2 && now - revealStart < REVEAL_WAIT_MS) { frame = requestAnimationFrame(tick); return }
        revealing = false
        drawn = live
        from = null
        draw(live, target)
        node.dataset.visible = 'true'
      } else if (from) {
        const t = Math.min(1, (now - glideStart) / GLIDE_MS)
        const e = easeOut(t)
        drawn = { x: lerp(from.x, live.x, e), y: lerp(from.y, live.y, e), w: lerp(from.w, live.w, e), h: lerp(from.h, live.h, e), r: lerp(from.r, live.r, e) }
        if (t >= 1) from = null
        draw(drawn, target)
      } else {
        drawn = live
        draw(live, target)
      }
      // Keep following while shown: whatever moves the control (a scroll, a
      // page sliding in, rows opening above it) moves the ring with it.
      frame = requestAnimationFrame(tick)
    }

    const run = () => { if (!frame) frame = requestAnimationFrame(tick) }

    const follow = (element: HTMLElement) => {
      if (!active()) { clear(); return }
      const next = ringTarget(element)
      const nextScope = next.closest(SCOPE)
      const shown = node.dataset.visible === 'true' && drawn
      if (target && target !== next) delete target.dataset.glideTarget
      const sameScope = nextScope === scope
      target = next
      scope = nextScope
      target.dataset.glideTarget = ''
      node.dataset.shape = next.matches(PILL) ? 'pill' : 'row'
      document.body.dataset.focusGlide = 'on'
      if (shown && sameScope && !reduced()) {
        // Glide from wherever the ring is drawn right now.
        from = { ...drawn! }
        glideStart = performance.now()
      } else if (!shown || !sameScope) {
        from = null
        revealing = true
        revealStart = performance.now()
        lastSeen = null
        stillFrames = 0
        node.dataset.visible = 'false'
      }
      run()
    }

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body) follow(event.target)
    }
    // Focus going nowhere (B leaving a text field) leaves the ring where it
    // is: that control is still where the pad continues from. It goes when
    // its control does, or when the mouse takes over.
    const onFocusOut = () => {
      window.setTimeout(() => { if (target && !target.isConnected) clear() }, 0)
    }
    // The pad taking over (or handing back to the mouse) shows or hides it.
    const sourceWatch = new MutationObserver(() => {
      if (!active()) clear()
      else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) follow(document.activeElement)
      else if (target) run()
    })
    sourceWatch.observe(document.body, { attributes: true, attributeFilter: ['data-input-source'] })

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    return () => {
      clear()
      sourceWatch.disconnect()
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return <div ref={highlight} className="focus-glide" aria-hidden="true" data-visible="false" />
}
