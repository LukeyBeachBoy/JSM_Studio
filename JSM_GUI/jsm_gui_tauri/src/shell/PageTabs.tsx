import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { Menu } from '../components/ui/Menu'
import { CONTROL_PAGES, STUDIO_PAGES, TUNING_PAGES, isStudioPage, isTuningPage, pageMeta, type PrimaryTab } from './pages'
import type { ShellWidth } from './useShellWidth'

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
  /** Studio only: where the back chip returns to. */
  returnLabel: string
  onReturn: () => void
}

/** The shoulder-shaped LT / RT marks either side of the tabs. */
export const TriggerMark = ({ label }: { label: string }) => <b className="trigger-mark" aria-hidden="true">{label}</b>

function ControllerStatusLabel({ status }: { status: ControllerStatus }) {
  if (status.kind === 'searching') {
    return <span className="controller-status" data-state="searching" role="status"><span className="controller-status__dot" />No controller · searching</span>
  }
  return (
    <span className="controller-status" data-state="connected" role="status">
      <span className="controller-status__dot" />
      {status.name}{status.battery ? ` · ${status.battery}` : ''}
    </span>
  )
}

export function PageTabs({ width, current, onSelect, status, sectionLabel, onOpenDrawer, drawerOpen, returnLabel, onReturn }: PageTabsProps) {
  const { t } = useTranslation()
  const studio = isStudioPage(current)
  const label = (tab: PrimaryTab) => t(pageMeta(tab).labelKey, pageMeta(tab).label)

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
        <span className="page-tabs__spacer" />
        <ControllerStatusLabel status={status} />
      </nav>
    )
  }

  const tab = (tab: PrimaryTab) => {
    const meta = pageMeta(tab)
    const selected = tab === current
    // Below 1280px only the selected tab keeps its name; the rest are icons,
    // named by their tooltip and accessible name.
    const showLabel = width === 'wide' || selected
    return (
      <button key={tab} type="button" className="page-tab" aria-current={selected ? 'page' : undefined}
        data-state={selected ? 'selected' : undefined} title={showLabel ? undefined : label(tab)}
        aria-label={showLabel ? undefined : label(tab)} onClick={() => onSelect(tab)}>
        {/* The Studio strip is words only (16k); icons stand in for names only
            where the names do not fit. */}
        {(!studio || !showLabel) && <Icon name={meta.icon} size={18} />}
        {showLabel && <span>{label(tab)}</span>}
      </button>
    )
  }

  const tuningSelected = isTuningPage(current)
  return (
    <nav className={`page-tabs${studio ? ' page-tabs--studio' : ''}`} data-focus-scope="page-tabs" aria-label={studio ? 'Studio' : 'Pages'}>
      {studio && (
        <button type="button" className="back-chip" onClick={onReturn} title={`Back to ${returnLabel}`}>
          <Icon name="back" size={16} />
          {(() => {
            const at = returnLabel.indexOf(' · ')
            // One text run, so the chip reads as one line.
            return at < 0 ? <span>{returnLabel}</span> : <span>{returnLabel.slice(0, at)}<span className="back-chip__page">{returnLabel.slice(at)}</span></span>
          })()}
        </button>
      )}
      <TriggerMark label="LT" />
      <div className="page-tabs__list">
        {(studio ? STUDIO_PAGES : CONTROL_PAGES).map(item => tab(item.tab))}
        {!studio && (
          <Menu
            ariaLabel="Tuning pages"
            width={280}
            items={TUNING_PAGES.map(item => ({
              label: t(item.labelKey, item.label),
              icon: <Icon name={item.icon} size={18} />,
              checked: item.tab === current,
              onSelect: () => onSelect(item.tab),
            }))}
            trigger={
              <button type="button" className="page-tab page-tab--menu" aria-current={tuningSelected ? 'page' : undefined}
                data-state={tuningSelected ? 'selected' : undefined} aria-label={width === 'wide' || tuningSelected ? undefined : 'Tuning'} title={width === 'wide' || tuningSelected ? undefined : 'Tuning'}>
                <Icon name="tuning" size={18} />
                {(width === 'wide' || tuningSelected) && <span>Tuning</span>}
                <span className="titlebar__chevron" aria-hidden="true"><Icon name="chevronDown" size={16} /></span>
              </button>
            }
          />
        )}
      </div>
      <TriggerMark label="RT" />
      <span className="page-tabs__spacer" />
      <ControllerStatusLabel status={status} />
    </nav>
  )
}
