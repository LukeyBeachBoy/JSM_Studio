import { useEffect, useState } from 'react'
import styles from './PageSideNav.module.css'

export type PageSideNavItem = {
  /** id of the element on the page this entry jumps to. */
  id: string
  label: string
  /** Short badge on the left, e.g. L / R for a per-side block. */
  tag?: string
}

type Props = {
  items: PageSideNavItem[]
  ariaLabel: string
}

// A within-page index for long pages that are really two or three stacked
// sections -- the trackpad page being one tall column of Left pad, Right pad and
// the shared buttons, where reaching the right pad meant scrolling past the
// whole of the left one. Jumps rather than filters: both pads stay on the page,
// which is what you want when you are matching one side's settings to the
// other's.
export function PageSideNav({ items, ariaLabel }: Props) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null)

  // Highlights whichever section is nearest the top of the viewport. Reading the
  // intersection ratio instead would keep a tall section lit while a short one
  // scrolled past it, so compare distance to the top edge directly.
  //
  // The elements are looked up on every tick rather than once: the panel they
  // live in is lazy, so on the render that mounts this rail none of them exist
  // yet, and resolving them up front would leave the rail permanently inert.
  useEffect(() => {
    const scrollerEl = document.querySelector<HTMLElement>('.shell-scroll')

    const pick = () => {
      // Measured against the top of the scrolling area, not of the window: the
      // utility bar sits above it, and counting that band as "on screen" kept
      // the previous section lit for its whole height.
      const fold = scrollerEl?.getBoundingClientRect().top ?? 0
      let best: { id: string; distance: number } | null = null
      for (const item of items) {
        const target = document.getElementById(item.id)
        if (!target) continue
        const top = target.getBoundingClientRect().top - fold
        // A section already scrolled past still counts -- at the very bottom of a
        // short page nothing else can reach the fold -- but never ahead of one
        // that is actually on screen.
        const distance = top >= 0 ? top : Math.abs(top) + 10000
        if (!best || distance < best.distance) best = { id: target.id, distance }
      }
      if (best) setActiveId(best.id)
    }

    pick()
    const scroller: HTMLElement | Window = scrollerEl ?? window
    scroller.addEventListener('scroll', pick, { passive: true })
    window.addEventListener('resize', pick)
    return () => {
      scroller.removeEventListener('scroll', pick)
      window.removeEventListener('resize', pick)
    }
  }, [items])

  if (items.length < 2) return null

  return (
    <nav className={styles.rail} aria-label={ariaLabel}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={`${styles.item} ${activeId === item.id ? styles.active : ''}`}
          onClick={() => {
            const target = document.getElementById(item.id)
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setActiveId(item.id)
          }}
        >
          {item.tag && <span className={styles.tag} aria-hidden="true">{item.tag}</span>}
          <span className={styles.label}>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
