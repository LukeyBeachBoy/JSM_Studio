import { useEffect, useRef, useState } from 'react'

/**
 * Highlights whichever of these DOM ids sits nearest the top of the
 * scrolling content area. Shared by every sidebar sub-list that jumps within
 * one long page rather than switching between exclusive tabs, so a click and
 * a scroll agree about which entry is "current".
 *
 * Harmless to call for a page that isn't mounted: `document.getElementById`
 * finds nothing, so the hook just keeps reporting the first id.
 */
export function useSectionScrollSpy(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null)
  const firstId = ids[0] ?? null
  // The section last chosen from the list. A ref, not effect state: the list
  // is rediscovered as a lazy page mounts, which restarts the effect below,
  // and a pick made just before that must survive it.
  const picked = useRef<string | null>(null)
  // A new page starts on its first section until the spy finds better.
  useEffect(() => { setActiveId(firstId); picked.current = null }, [firstId])

  useEffect(() => {
    const scrollerEl = document.querySelector<HTMLElement>('.shell-scroll')

    const pick = () => {
      // Measured against the top of the scrolling area, not of the window: the
      // utility bar sits above it, and counting that band as "on screen" kept
      // the previous section lit for its whole height.
      const fold = scrollerEl?.getBoundingClientRect().top ?? 0
      // A short last section can never reach the top: once the page is
      // scrolled as far as it goes, the section asked for is the answer.
      const chosen = picked.current
      if (chosen && scrollerEl && scrollerEl.scrollTop + scrollerEl.clientHeight >= scrollerEl.scrollHeight - 2) {
        const target = document.getElementById(chosen)
        const top = target ? target.getBoundingClientRect().top - fold : -1
        if (target && top >= 0 && top < scrollerEl.clientHeight) { setActiveId(chosen); return }
      }
      let best: { id: string; distance: number } | null = null
      for (const id of ids) {
        const target = document.getElementById(id)
        if (!target) continue
        const top = target.getBoundingClientRect().top - fold
        // A section already scrolled past still counts -- at the very bottom of
        // a short page nothing else can reach the fold -- but never ahead of one
        // that is actually on screen.
        const distance = top >= 0 ? top : Math.abs(top) + 10000
        if (!best || distance < best.distance - 2 || (id === chosen && Math.abs(distance - best.distance) <= 2)) best = { id, distance }
      }
      if (best) setActiveId(best.id)
    }

    const onPicked = (event: Event) => {
      picked.current = (event as CustomEvent<string>).detail
      pick()
    }
    window.addEventListener('jsm:section-picked', onPicked)
    pick()
    const scroller: HTMLElement | Window = scrollerEl ?? window
    scroller.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    // Pages load lazily, so the anchors can arrive after this runs; look again
    // when the content changes, at most once a frame.
    let frame = 0
    const observer = new MutationObserver(() => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; pick() })
    })
    if (scrollerEl) observer.observe(scrollerEl, { childList: true, subtree: true })
    return () => {
      scroller.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
      window.removeEventListener('jsm:section-picked', onPicked)
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join('|')])

  return activeId
}
