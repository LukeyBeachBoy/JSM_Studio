import { useCallback, useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { ButtonGlyph } from '../components/glyphs/ButtonGlyph'
import { CONTROL_PAGES, LIBRARY_PAGES, SETTINGS_PAGES, isStudioPage, pageMeta, studioHub, type PrimaryTab } from './pages'
import type { ShellWidth } from './useShellWidth'
import { useShowsKeys } from '../nav/inputSource'

export type ControllerStatus =
  | { kind: 'connected'; name: string; battery?: string; charging?: boolean }
  | { kind: 'searching' }

type PageTabsProps = {
  width: ShellWidth
  current: PrimaryTab
  onSelect: (tab: PrimaryTab) => void
  status: ControllerStatus
  /** Drawer mode only: the current section, shown beside the page. */
  sectionLabel?: string
  onOpenDrawer: () => void
  drawerOpen: boolean
}

// How much of the strip has to give for it to fit beside the game chip and
// the status chip, measured rather than guessed from the window's width (a
// long game name, the keys' chips, "Unsaved", a translation all take room):
//   labels   every tab named
//   icons    the selected tab named, the rest icons
//   tight    every tab an icon, closer together
//   squeeze  tight, and the title bar's own chips give way too (the Home
//            chip keeps its mark, the game's name shortens)
// Whatever the window's width: the Library's three tabs keep their names at
// 1100, where Layout's eight cannot. The strip never scrolls a tab half out
// of sight, and never runs under its neighbours.
const FITS = ['labels', 'icons', 'tight', 'squeeze'] as const
type Fit = typeof FITS[number]

/** LB / RB either side of the tabs, drawn as the controller's own bumpers (D11;
 *  console v2 V1 moved tabs from the triggers to the bumpers). */
export const TriggerMark = ({ side }: { side: 'LB' | 'RB' }) => <span className="trigger-mark" aria-hidden="true"><ButtonGlyph button={side} size={22} /></span>

export function PageTabs({ width, current, onSelect, sectionLabel, onOpenDrawer, drawerOpen }: PageTabsProps) {
  const { t } = useTranslation()
  const studio = isStudioPage(current)
  const tabList = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLElement>(null)
  const showsKeys = useShowsKeys()
  const label = (tab: PrimaryTab) => t(pageMeta(tab).labelKey, pageMeta(tab).label)

  // Try each fit in turn, widest first, until the tabs fit. DOM only, so it
  // settles before the frame is painted and React's renders never undo it.
  const fit = useCallback(() => {
    const nav = strip.current
    const list = tabList.current
    if (!nav || !list) return
    const bar = nav.closest<HTMLElement>('.titlebar')
    let chosen: Fit = FITS[FITS.length - 1]
    for (const candidate of FITS) {
      nav.dataset.fit = candidate
      if (bar) { if (candidate === 'squeeze') bar.dataset.squeeze = 'true'; else delete bar.dataset.squeeze }
      if (list.scrollWidth <= list.clientWidth + 1) { chosen = candidate; break }
    }
    // A tab without its name says it in the footer when focused.
    list.querySelectorAll<HTMLElement>('.page-tab').forEach(tab => {
      const named = chosen === 'labels' || (chosen === 'icons' && tab.getAttribute('aria-current') === 'page')
      if (named) delete tab.dataset.caption
      else tab.dataset.caption = tab.getAttribute('aria-label') ?? ''
    })
    // Still too wide (only ever in a window narrower than the shell is drawn
    // for): the selected tab stays in sight.
    if (list.scrollWidth > list.clientWidth + 1) list.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [width])

  useLayoutEffect(() => { fit() }, [fit, current, showsKeys, t])
  useLayoutEffect(() => {
    const nav = strip.current
    if (!nav) return
    const observer = new ResizeObserver(() => fit())
    observer.observe(nav)
    void document.fonts?.ready.then(() => fit())
    return () => { observer.disconnect(); delete nav.closest<HTMLElement>('.titlebar')?.dataset.squeeze }
  }, [fit])

  if (width === 'narrow') {
    const meta = pageMeta(current)
    return (
      <nav className="page-tabs page-tabs--drawer" data-focus-scope="page-tabs" aria-label="Pages">
        <button type="button" className="page-tabs__drawer-button" aria-expanded={drawerOpen} aria-controls="shell-drawer" onClick={onOpenDrawer}>
          <Icon name="more" size={18} />
          <Icon name={meta.icon} size={18} />
          {label(current)}
          {sectionLabel && <><span className="page-tabs__dot">·</span><span className="page-tabs__section">{sectionLabel}</span></>}
        </button>
      </nav>
    )
  }

  const tab = (tab: PrimaryTab) => {
    const meta = pageMeta(tab)
    const selected = tab === current
    // Both are drawn; the strip's fit (above) shows one or the other. A tab
    // drawn as its icon is named by its accessible name and its caption.
    // Tabs are words only (console v2 Layout header, 16k); icons stand in for
    // names only where the names do not fit.
    return (
      <button key={tab} type="button" className="page-tab" aria-current={selected ? 'page' : undefined}
        data-state={selected ? 'selected' : undefined}
        aria-label={label(tab)} onClick={() => onSelect(tab)}>
        <Icon name={meta.icon} size={18} className="page-tab__icon" />
        <span className="page-tab__label">{label(tab)}</span>
      </button>
    )
  }

  return (
    <nav ref={strip} className={`page-tabs${studio ? ' page-tabs--studio' : ''}`} data-focus-scope="page-tabs" data-tauri-drag-region data-hub={studioHub(current)} aria-label={studio ? 'Studio' : 'Pages'}>
      <TriggerMark side="LB" />
      <div className="page-tabs__list" ref={tabList}>
        {(studioHub(current) === 'library' ? LIBRARY_PAGES : studioHub(current) === 'settings' ? SETTINGS_PAGES : CONTROL_PAGES).map(item => tab(item.tab))}
      </div>
      <TriggerMark side="RB" />
    </nav>
  )
}
