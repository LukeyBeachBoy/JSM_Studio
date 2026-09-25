import { useEffect, useRef } from 'react'

// Focus glide (HANDOFF: focus model): with the pad driving, the focus ring is
// one shared highlight that translates from control to control over --dur-3
// on --ease-emphasis, instead of a ring blinking out here and in there. It
// glides within a scope (title bar, tabs, sections, the page, a dialog) and
// snaps when focus crosses into another. The element keeps its selected fill;
// only the ring moves, and only transform animates.

const SCOPE = '[data-focus-scope], [role="dialog"], [role="alertdialog"], main, .shell-scroll'
const PILL = '.button, .icon-button, .back-chip, .segmented > *'

// The element that wears the ring: a setting row rings as a whole.
const ringTarget = (element: HTMLElement) =>
  element.closest<HTMLElement>('.setting-row') ?? element

export function FocusGlide() {
  const highlight = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = highlight.current
    if (!node) return
    let target: HTMLElement | null = null
    let scope: Element | null = null
    let frame = 0
    let glidingUntil = 0
    // A scroll into view or a size change during a glide retargets it rather
    // than cutting it short.
    const reposition = () => place(performance.now() < glidingUntil)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reposition) : null

    const active = () => document.body.dataset.inputSource === 'controller'

    const clear = () => {
      if (target) delete target.dataset.glideTarget
      observer?.disconnect()
      target = null
      scope = null
      node.dataset.visible = 'false'
      delete document.body.dataset.focusGlide
    }

    function place(animate: boolean) {
      if (!target || !node) return
      const rect = target.getBoundingClientRect()
      if (!rect.width || !rect.height || !target.isConnected) { clear(); return }
      const style = getComputedStyle(target)
      node.dataset.animate = animate ? 'true' : 'false'
      node.dataset.shape = target.matches(PILL) ? 'pill' : 'row'
      node.style.width = `${rect.width}px`
      node.style.height = `${rect.height}px`
      node.style.borderRadius = style.borderRadius
      node.style.transform = `translate(${rect.left}px, ${rect.top}px)`
      node.dataset.visible = 'true'
    }

    const follow = (element: HTMLElement) => {
      if (!active()) { clear(); return }
      const next = ringTarget(element)
      const nextScope = next.closest(SCOPE)
      // Glide within a scope; arriving from another one (or from nowhere) snaps.
      const animate = node.dataset.visible === 'true' && nextScope === scope && !matchMedia('(prefers-reduced-motion: reduce)').matches
      if (target && target !== next) delete target.dataset.glideTarget
      observer?.disconnect()
      target = next
      scope = nextScope
      target.dataset.glideTarget = ''
      document.body.dataset.focusGlide = 'on'
      observer?.observe(target)
      glidingUntil = animate ? performance.now() + 300 : 0
      place(animate)
    }

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body) follow(event.target)
    }
    const onFocusOut = (event: FocusEvent) => {
      // Focus leaving the window, or into nothing: the ring goes with it.
      if (!event.relatedTarget) window.setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) clear() }, 0)
    }
    // Scrolling and resizing move the element under a fixed highlight; follow
    // without animating so the ring stays on it.
    const onMove = () => {
      if (!target) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(reposition)
    }
    // The pad taking over (or handing back to the mouse) shows or hides it.
    const sourceWatch = new MutationObserver(() => {
      if (!active()) clear()
      else if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) follow(document.activeElement)
    })
    sourceWatch.observe(document.body, { attributes: true, attributeFilter: ['data-input-source'] })

    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      clear()
      cancelAnimationFrame(frame)
      sourceWatch.disconnect()
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [])

  return <div ref={highlight} className="focus-glide" aria-hidden="true" data-visible="false" />
}
