import { useEffect, useState } from 'react'

export type ShellSection = { id: string; label: string; active: boolean; onSelect: () => void }

type SectionListProps = {
  sections: ShellSection[]
  ariaLabel: string
}

/**
 * The in-page section list (HANDOFF.md, "Shell decisions"): 216px (184 below
 * 1280), 40px items, stepped by LB/RB. The current section carries the row
 * fill; there is no second highlight for focus, the ring does that.
 */
export function SectionList({ sections, ariaLabel }: SectionListProps) {
  return (
    <nav className="section-list" data-focus-scope="sections" aria-label={ariaLabel}>
      {sections.map(section => (
        <button key={section.id} type="button" className="section-item" data-state={section.active ? 'current' : undefined}
          aria-current={section.active ? 'true' : undefined} onClick={section.onSelect}>
          {section.label}
        </button>
      ))}
    </nav>
  )
}

export const SECTION_PICKED_EVENT = 'jsm:section-picked'

export const scrollToSection = (id: string, attempt = 0) => {
  const target = document.getElementById(id)
  // The list is known before a lazy page has drawn every section; a click in
  // that moment waits for its section (up to 2s) instead of doing nothing.
  if (!target) {
    if (attempt < 40) window.setTimeout(() => scrollToSection(id, attempt + 1), 50)
    return
  }
  // Tell the scroll spy which one was asked for: on a page whose left and
  // right sit side by side both are equally near the top, and position alone
  // would always answer "the left one".
  window.dispatchEvent(new CustomEvent(SECTION_PICKED_EVENT, { detail: id }))
  target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  // Any other programmatic scroll -- a lazy page focusing its first control,
  // say -- cancels a smooth scroll where it stands. Once it should have
  // arrived, finish the jump if it did not.
  window.setTimeout(() => {
    const host = target.closest<HTMLElement>('.shell-scroll')
    if (!host || !target.isConnected) return
    const offset = target.getBoundingClientRect().top - host.getBoundingClientRect().top
    const atEnd = host.scrollTop + host.clientHeight >= host.scrollHeight - 2
    if (Math.abs(offset) > 4 && !(atEnd && offset > 0)) target.scrollIntoView({ block: 'start' })
  }, 700)
}

/**
 * Sections a page declares in its own markup: any element in the page with
 * an id and a data-section="Label". Pages rebuilt on the design mark their
 * groups this way, so the shell needs no per-page list for them.
 */
export function useDiscoveredSections(pageKey: string) {
  const [found, setFound] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    const host = document.querySelector('.shell-scroll')
    if (!host) return
    const read = () => {
      const next = Array.from(host.querySelectorAll<HTMLElement>('[data-section][id]'))
        .map(element => ({ id: element.id, label: element.dataset.section ?? element.id }))
      setFound(previous => previous.length === next.length && previous.every((item, index) => item.id === next[index].id && item.label === next[index].label) ? previous : next)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-section', 'id'] })
    return () => observer.disconnect()
  }, [pageKey])
  return found
}
