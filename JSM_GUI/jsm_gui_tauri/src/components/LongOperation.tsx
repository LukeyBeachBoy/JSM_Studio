import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import styles from './LongOperation.module.css'

// Long operation in progress (System States 17f): blocking work sits in a
// small dialog with its progress, and Cancel when the work can stop. Work
// that finishes inside 400 ms never shows it.

type Operation = {
  id: number
  title: string
  /** 0..1, or undefined while the work cannot say how far along it is. */
  fraction?: number
  detail?: string
  cancel?: () => void
  cancelling?: boolean
  startedAt: number
}

export type OperationReport = {
  /** How far along, 0..1, and what is happening now. */
  progress: (fraction: number | undefined, detail?: string) => void
  /** Set when the person pressed Cancel; the work checks it between steps. */
  readonly signal: AbortSignal
}

const SHOW_AFTER_MS = 400
let current: Operation | null = null
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(listener => listener())
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const snapshot = () => current

/**
 * Runs `work` behind the progress dialog. Pass `cancellable` when the work
 * checks `signal` and can stop cleanly; otherwise no Cancel is offered.
 */
export async function runLongOperation<T>(
  title: string,
  work: (report: OperationReport) => Promise<T>,
  options: { cancellable?: boolean; detail?: string } = {},
): Promise<T> {
  const controller = new AbortController()
  const id = nextId++
  const operation: Operation = { id, title, detail: options.detail, startedAt: Date.now() }
  if (options.cancellable) {
    operation.cancel = () => {
      if (current?.id !== id) return
      controller.abort()
      current = { ...current, cancelling: true, detail: 'Stopping…' }
      emit()
    }
  }
  current = operation
  emit()
  const report: OperationReport = {
    progress: (fraction, detail) => {
      if (current?.id !== id || current.cancelling) return
      current = { ...current, fraction, detail: detail ?? current.detail }
      emit()
    },
    signal: controller.signal,
  }
  try {
    return await work(report)
  } finally {
    if (current?.id === id) {
      current = null
      emit()
    }
  }
}

/** Thrown by work that stopped because the person pressed Cancel. */
export class OperationCancelled extends Error {
  constructor() { super('Cancelled') }
}
export const throwIfCancelled = (signal: AbortSignal) => { if (signal.aborted) throw new OperationCancelled() }

export function LongOperationHost() {
  const operation = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [visible, setVisible] = useState(false)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!operation) { setVisible(false); return }
    const wait = SHOW_AFTER_MS - (Date.now() - operation.startedAt)
    if (wait <= 0) { setVisible(true); return }
    const timer = window.setTimeout(() => setVisible(true), wait)
    return () => window.clearTimeout(timer)
  }, [operation?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus sits on Cancel while the dialog is up, and goes back after.
  useEffect(() => {
    if (!visible) {
      returnFocus.current?.focus?.()
      returnFocus.current = null
      return
    }
    returnFocus.current = document.activeElement as HTMLElement | null
    // With nothing to cancel, the dialog itself holds focus so A cannot
    // press whatever was focused behind it.
    ;(cancelRef.current ?? dialogRef.current)?.focus()
  }, [visible])

  if (!operation || !visible) return null
  const percent = operation.fraction === undefined ? undefined : Math.round(Math.max(0, Math.min(1, operation.fraction)) * 100)
  // data-focus-trap keeps the pad's arrows, bumpers and triggers inside the
  // dialog while it is up, like any other overlay (useKeyboardNav).
  return (
    <div className={styles.backdrop} data-focus-trap="true">
      <div ref={dialogRef} tabIndex={-1} className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="long-operation-title" aria-busy="true"
        onKeyDown={event => { if (event.key === 'Escape' && operation.cancel) { event.preventDefault(); operation.cancel() } }}>
        <span id="long-operation-title" className={styles.title}>{operation.title}</span>
        <div className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={percent === undefined ? operation.detail : `${percent}%`}>
          {percent === undefined
            ? <span className={styles.indeterminate} />
            : <span className={styles.fill} style={{ transform: `scaleX(${percent / 100})` }} />}
        </div>
        <div className={styles.meta}>
          <span>{operation.detail ?? ''}</span>
          {percent !== undefined && <span className={styles.percent}>{percent}%</span>}
        </div>
        <div className={styles.actions}>
          {operation.cancel
            ? <button ref={cancelRef} type="button" className="button button--tertiary" data-modal-close onClick={operation.cancel} disabled={operation.cancelling}>Cancel</button>
            : <span className={styles.noCancel}>This can't be stopped part way.</span>}
        </div>
      </div>
    </div>
  )
}
