import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useShell } from '../../../shell/ShellContext'
import { HintCapsule } from '../../../shell/HintCapsule'
import type { Hint } from '../../../shell/hintLabels'
import { PAD_EVENT, type PadEventDetail } from '../../../nav/useControllerNavigation'
import styles from './SubPage.module.css'

// A full-screen sub-page (console v2: StickFineTuneAim, BindingWhileHolding,
// BindingFineTune, the pickers, the New configuration wizard…). It covers the
// whole window with its own header -- the breadcrumb "Wardogs · Sticks · Right
// stick ▸ Fine-tune", the mode being edited, the one status chip -- and its own
// docked footer, so the hints stay in the order and place they have everywhere.
//
// It is a focus trap the shell already understands (data-focus-trap): the pad
// lands on [data-autofocus] or the first control inside, and B / Escape closes it
// through its data-modal-close button, handing focus back to what opened it.
// LT / RT reach it as pad events (nav/useControllerNavigation sends them to an
// open overlay; the keyboard's [ and ] do the same): `onStep` gets them, and the
// footer names them with `stepLabel` ("Group", "Part", "Step").
//
// Sub-pages stack: Fine-tune ▸ Advanced is a SubPage opened from inside one.

type SubPageProps = {
  open: boolean
  onClose: () => void
  /** The path after the configuration name, up to the page this opened from:
   *  ['Sticks', 'Right stick']. The configuration comes from the shell. */
  trail: string[]
  /** This page: "Fine-tune". */
  title: string
  /** Beside the breadcrumb: the mode, "Vehicles · Changed in this mode". Defaults
   *  to the mode being edited when it is not Default. */
  badge?: ReactNode
  /** The footer's left side; defaults to the breadcrumb with the open group. */
  where?: string
  /** What LT / RT step on this page; omit when they do nothing. */
  stepLabel?: string
  onStep?: (direction: -1 | 1) => void
  /** B's label: "Back to Sticks". Default "Back". */
  backLabel?: string
  /** Hints every row gets unless it names that button itself. */
  hints?: Hint[]
  /** No breadcrumb chip row (a picker draws its own header in the body). */
  bare?: boolean
  /** The breadcrumb's first crumb; defaults to the configuration. Settings
   *  pages pass "Settings" (they are for every configuration). */
  crumbRoot?: string
  children: ReactNode
}

export function SubPage({ open, onClose, trail, title, badge, where, stepLabel, onStep, backLabel = 'Back', hints, bare, crumbRoot, children }: SubPageProps) {
  const shell = useShell()
  const root = useRef<HTMLDivElement>(null)
  const latest = useRef(onStep)
  latest.current = onStep

  useEffect(() => {
    if (!open) return
    const node = root.current
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button !== 'LT' && button !== 'RT') return
      // Claimed whether or not the page steps, so a trigger never reaches the
      // page underneath.
      event.preventDefault()
      latest.current?.(button === 'LT' ? -1 : 1)
      // Stepping swaps what the focused row says ("Use Steering") without moving focus,
      // so the footer has to be asked to read it again once the new group has rendered.
      requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new Event('jsm:interaction-hint'))))
    }
    node?.addEventListener(PAD_EVENT, onPad)
    return () => node?.removeEventListener(PAD_EVENT, onPad)
  }, [open])

  if (!open) return null
  const crumbs = [crumbRoot ?? shell.configName ?? 'Configuration', ...trail]
  const modeBadge = badge ?? (!crumbRoot && shell.modeName ? `${shell.modeName} · Changed in this layer` : null)
  const extra: Hint[] = [
    ...(hints ?? []),
    ...(stepLabel ? [{ button: 'LT/RT' as const, label: stepLabel }] : []),
    { button: 'B', label: backLabel },
  ]
  // The way out for a mouse (B / Esc for a pad or keyboard): a visible "‹ Back" in the header, or a small
  // chip at the top left of a page that draws its own header. The pad skips it; it is also the focus trap's close.
  const backButton = (
    <button type="button" className={bare ? styles.backFloating : styles.back} tabIndex={-1} data-nav-skip data-modal-close aria-label={backLabel} onClick={onClose}>
      <span aria-hidden="true">‹</span> {backLabel}
    </button>
  )
  return createPortal(
    <div ref={root} className={styles.layer} data-focus-trap="true" data-subpage="" role="dialog" aria-modal="true" aria-label={`${crumbs.join(' · ')} · ${title}`}>
      <main className={styles.body}>{children}</main>
      {!bare && (
        <header className={styles.header}>
          {backButton}
          <span className={styles.crumbs}>
            {crumbs.map((crumb, index) => <span key={index} className={styles.crumb}>{crumb}</span>)}
            <span className={styles.arrow} aria-hidden="true">▸</span>
            <b className={styles.title}>{title}</b>
          </span>
          {modeBadge && <span className={styles.badge}>{modeBadge}</span>}
          <span className={styles.chip}>{shell.statusChip}</span>
        </header>
      )}
      <footer className={styles.footer}>
        <HintCapsule width={shell.width} family={shell.family} controller={shell.controller} where={where ?? `${crumbs.join(' · ')} · ${title}`} extraHints={extra} />
      </footer>
      {bare && backButton}
    </div>,
    document.body,
  )
}
