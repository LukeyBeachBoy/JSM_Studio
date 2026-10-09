import { useEffect, useRef, type ReactNode } from 'react'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { ConfigName } from '../ConfigName'
import styles from './Settings.module.css'

// Pieces the Settings categories share (console v2, Settings*.dc.html), on
// top of the kit (ui/console): a switch row where A turns it on or off at
// once, section headings, a status strip and a note. Everything here is for
// every configuration, so there is nothing to save: each change writes at once.

type SwitchRowProps = {
  label: ReactNode
  hint?: ReactNode
  on: boolean | null
  onChange: (next: boolean) => void
  /** Y: put it back the way it came. */
  onReset?: () => void
  /** The JSM key behind it, for Show config names (V12). */
  setting?: string
  /** Still focusable, says why (Kit: unavailable). */
  disabled?: string
  pending?: boolean
  id?: string
}

/** A row that is a switch: A turns it on or off (Settings ▸ Controller). */
export function SwitchRow({ label, hint, on, onChange, onReset, setting, disabled, pending, id }: SwitchRowProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const reset = useRef(onReset)
  reset.current = onReset
  useEffect(() => {
    const node = ref.current
    const onPad = (event: Event) => {
      if ((event as CustomEvent<PadEventDetail>).detail.button === 'Y' && reset.current) { event.preventDefault(); reset.current() }
    }
    node?.addEventListener(PAD_EVENT, onPad)
    return () => node?.removeEventListener(PAD_EVENT, onPad)
  }, [])
  const unknown = on === null
  return (
    <button ref={ref} type="button" id={id} role="switch" aria-checked={unknown ? undefined : on} aria-busy={unknown || pending || undefined}
      className={styles.switchRow} aria-disabled={disabled ? 'true' : undefined} data-reason={disabled}
      data-hints={disabled ? 'B:Back' : [`A:${on ? 'Turn off' : 'Turn on'}`, onReset ? 'Y:Reset to default' : '', 'B:Back'].filter(Boolean).join(';')}
      data-caption={typeof hint === 'string' ? hint : undefined}
      onKeyDown={event => { if ((event.key === 'y' || event.key === 'Y') && onReset) { event.preventDefault(); onReset() } }}
      onClick={() => { if (!disabled && !unknown && !pending) onChange(!on) }}>
      <span className={styles.rowText}>
        <span className={styles.rowLabel} data-caption-label="">{label}{setting && <ConfigName name={setting} />}</span>
        {hint && <span className={styles.rowHint}>{hint}</span>}
      </span>
      <span className={styles.switch} data-on={on ? 'true' : undefined} aria-hidden="true"><span /></span>
    </button>
  )
}

/** A group heading inside a category: "On-screen keyboard · Hold Steam then X to open". */
export function SettingsSection({ id, title, note, action, children }: { id?: string; title: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-label={typeof title === 'string' ? title : undefined}>
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
        {action && <span className={styles.sectionAction}>{action}</span>}
      </header>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

/** One line of help under a group. */
export function SettingsNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>
}

/** A row of state chips: "Hiding is on · HidHide installed · JSM still reads them". */
export function StatusStrip({ items, action }: { items: { label: string; tone?: 'ok' | 'warn' | 'off' }[]; action?: ReactNode }) {
  return (
    <div className={styles.strip} role="status">
      {items.map(item => <span key={item.label} className={styles.stripItem} data-tone={item.tone ?? 'ok'}><span className={styles.stripDot} aria-hidden="true" />{item.label}</span>)}
      {action && <span className={styles.stripAction}>{action}</span>}
    </div>
  )
}

/** The page's two columns: settings, and an aside (a preview, a test, a picture). */
export function SettingsColumns({ main, aside, asideLabel }: { main: ReactNode; aside?: ReactNode; asideLabel?: string }) {
  return (
    <div className={styles.columns} data-aside={aside ? 'true' : undefined}>
      <div className={styles.mainColumn} data-nav-region="settings">{main}</div>
      {aside && <aside className={styles.aside} aria-label={asideLabel} data-nav-region="aside">{aside}</aside>}
    </div>
  )
}

/** A choice that is Y's menu of the rest (Kit: Y never does something destructive directly). */
export function useY(handler: (() => void) | undefined, host: React.RefObject<HTMLElement | null>) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const node = host.current
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      if ((event as CustomEvent<PadEventDetail>).detail.button === 'Y' && latest.current) { event.preventDefault(); latest.current() }
    }
    node?.addEventListener(PAD_EVENT, onPad)
    return () => node?.removeEventListener(PAD_EVENT, onPad)
  }, [host])
}

/** X for a page (or a part of it): the pad's X and the keyboard's X. */
export function usePadButton(button: 'X' | 'Y', handler: (() => boolean | void) | undefined, host: React.RefObject<HTMLElement | null>) {
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const node = host.current
    if (!node) return
    const onPad = (event: Event) => {
      if (event.defaultPrevented) return
      if ((event as CustomEvent<PadEventDetail>).detail.button === button && latest.current && latest.current() !== false) event.preventDefault()
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [host, button])
}
