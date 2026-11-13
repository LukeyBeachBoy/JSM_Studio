import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { ButtonGlyph } from '../components/glyphs/ButtonGlyph'
import { controllerPageAvailable, CONTROL_PAGES, LIBRARY_PAGES, SETTINGS_PAGES, isStudioPage, pageMeta, studioHub, type PrimaryTab } from './pages'
import type { ShellWidth } from './useShellWidth'

export type ControllerStatus =
  | { kind: 'connected'; name: string; battery?: string; charging?: boolean }
  | { kind: 'searching' }

type PageTabsProps = {
  width: ShellWidth
  deviceType?: number
  current: PrimaryTab
  onSelect: (tab: PrimaryTab) => void
  status: ControllerStatus
  /** Drawer mode only: the current section, shown beside the page. */
  sectionLabel?: string
  onOpenDrawer: () => void
  drawerOpen: boolean
}

/** LB / RB either side of the tabs, drawn as the controller's own bumpers (D11;
 *  console v2 V1 moved tabs from the triggers to the bumpers). */
export const TriggerMark = ({ side }: { side: 'LB' | 'RB' }) => <span className="trigger-mark" aria-hidden="true"><ButtonGlyph button={side} size={22} /></span>

export function PageTabs({ width, current, onSelect, sectionLabel, onOpenDrawer, drawerOpen, deviceType }: PageTabsProps) {
  const { t } = useTranslation()
  const studio = isStudioPage(current)
  const tabList = useRef<HTMLDivElement>(null)
  const strip = useRef<HTMLElement>(null)
  const label = (tab: PrimaryTab) => t(pageMeta(tab).labelKey, pageMeta(tab).label)

  // Names stay visible; selecting a tab scrolls only its horizontal strip.
  useLayoutEffect(() => {
    const list = tabList.current
    const active = list?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!list || !active) return
    if (active.offsetLeft < list.scrollLeft) list.scrollLeft = active.offsetLeft
    else if (active.offsetLeft + active.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = active.offsetLeft + active.offsetWidth - list.clientWidth
  }, [current, width, t])

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
        {(studioHub(current) === 'library' ? LIBRARY_PAGES : studioHub(current) === 'settings' ? SETTINGS_PAGES : CONTROL_PAGES).filter(item => controllerPageAvailable(item.tab, deviceType)).map(item => tab(item.tab))}
      </div>
      <TriggerMark side="RB" />
    </nav>
  )
}
