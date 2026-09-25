import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/icons/Icon'
import { CONTROL_PAGES, TUNING_PAGES, isTuningPage, pageMeta, type PrimaryTab } from './pages'
import type { ShellSection } from './SectionList'
import type { ControllerStatus } from './PageTabs'

type NavDrawerProps = {
  open: boolean
  onClose: () => void
  current: PrimaryTab
  onSelect: (tab: PrimaryTab) => void
  onOpenStudio: () => void
  sections: ShellSection[]
  eyebrow: string
  status: ControllerStatus
}

/**
 * Below 1060px the page tabs and section list fold into one drawer (JSM Shell
 * 3c): every page, the current page's sections unfolded under it, Tuning and
 * Studio. It traps focus and closes on B / Esc, returning focus to the button
 * that opened it.
 */
export function NavDrawer({ open, onClose, current, onSelect, onOpenStudio, sections, eyebrow, status }: NavDrawerProps) {
  const { t } = useTranslation()
  const [tuningOpen, setTuningOpen] = useState(() => isTuningPage(current))
  const panel = useRef<HTMLElement>(null)
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      panel.current?.querySelector<HTMLElement>('[aria-current="true"], [aria-current="page"]')?.focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', onKey, true)
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open) return null
  const label = (tab: PrimaryTab) => t(pageMeta(tab).labelKey, pageMeta(tab).label)
  const go = (tab: PrimaryTab) => { onSelect(tab); onClose() }

  return (
    <div className="shell-drawer" data-focus-trap="true">
      <div className="shell-drawer__scrim" data-modal-close onClick={onClose} />
      <aside id="shell-drawer" ref={panel} className="drawer" role="dialog" aria-modal="true" aria-label="Navigation" data-focus-scope="drawer" data-hints="MOVE:Move;A:Go;B:Close">
        <div className="drawer__eyebrow">{eyebrow}</div>
        {CONTROL_PAGES.map(item => {
          const selected = item.tab === current
          return (
            <div key={item.tab} className="drawer__group">
              <button type="button" className="nav-item" data-state={selected ? 'selected' : undefined}
                aria-current={selected ? 'page' : undefined} onClick={() => go(item.tab)}>
                <Icon name={item.icon} size={18} />{label(item.tab)}
              </button>
              {selected && sections.length > 0 && (
                <div className="drawer__subitems">
                  {sections.map(section => (
                    <button key={section.id} type="button" className="nav-subitem" data-state={section.active ? 'current' : undefined}
                      aria-current={section.active ? 'true' : undefined} onClick={() => { section.onSelect(); onClose() }}>
                      {section.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <button type="button" className="nav-item" aria-expanded={tuningOpen} onClick={() => setTuningOpen(value => !value)}>
          <Icon name="tuning" size={18} />Tuning
          <span className="nav-item__trail" aria-hidden="true"><Icon name={tuningOpen ? 'chevronDown' : 'chevronRight'} size={16} /></span>
        </button>
        {tuningOpen && (
          <div className="drawer__subitems">
            {TUNING_PAGES.map(item => (
              <button key={item.tab} type="button" className="nav-subitem" data-state={item.tab === current ? 'current' : undefined}
                aria-current={item.tab === current ? 'page' : undefined} onClick={() => go(item.tab)}>
                {label(item.tab)}
              </button>
            ))}
          </div>
        )}
        <div className="drawer__spacer" />
        <button type="button" className="nav-item" onClick={() => { onOpenStudio(); onClose() }}>
          <Icon name="library" size={18} />Studio
          <span className="nav-item__note">Library, preferences…</span>
        </button>
        <div className="drawer__status" data-state={status.kind}>
          <span className="controller-status__dot" />
          {status.kind === 'connected' ? `${status.name}${status.battery ? ` · ${status.battery}` : ''}` : 'No controller · searching'}
        </div>
      </aside>
    </div>
  )
}
