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
      // The current section is the one the top of the view is in: the last
      // to have reached the fold. Picking whichever top was nearest below the
      // fold was right only while sections were short -- on the stacked
      // trackpads it lit "Right trackpad" while the left pad filled the view.
      // Sections side by side share a top; the one asked for wins the tie.
      const tops = ids.flatMap(id => {
        const target = document.getElementById(id)
        // A jump lands a section its scroll-margin below the fold; that counts.
        return target ? [{ id, top: target.getBoundingClientRect().top - fold - (Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0) }] : []
      })
      if (!tops.length) return
      const reached = tops.filter(entry => entry.top <= 2)
      const pool = reached.length
        ? reached.filter(entry => entry.top >= Math.max(...reached.map(other => other.top)) - 2)
        // Nothing has reached the fold yet (the page header is above them all):
        // the first one down.
        : tops.filter(entry => entry.top <= Math.min(...tops.map(other => other.top)) + 2)
      setActiveId((pool.find(entry => entry.id === chosen) ?? pool[0]).id)
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
