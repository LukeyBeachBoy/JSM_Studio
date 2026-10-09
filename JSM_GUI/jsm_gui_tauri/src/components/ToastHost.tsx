import { useEffect, useRef, useState } from 'react'
import { toastClearEventName, toastEventName, type ToastKind } from '../utils/toast'
import styles from './Misc.module.css'

type ToastPayload = {
  message: string
  kind?: ToastKind
}

type Toast = ToastPayload & { id: string; at: number }

// System States 17h: toasts stack rather than replace each other, and an
// error stays longer and can be dismissed early. They are never in the focus
// order (the pad has no business in a toast), so an error still goes by
// itself in the end rather than needing the mouse. They dock bottom right,
// above the hint capsule, away from the title bar's chips and the test
// banner (UX review 2026-10-09, S10), and leave with the screen they were
// about: a page change or the end of a test takes them down (clearToasts).
// One sentence per action: the same message is never shown twice at once.
const TOAST_MS = 3000
const ERROR_MS = 6000
const MAX_STACK = 3

export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = (id: string) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts(current => current.filter(item => item.id !== id))
  }

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<ToastPayload>)?.detail
      if (!detail?.message) return
      const next = { id: crypto.randomUUID(), at: performance.now(), ...detail }
      setToasts(current => {
        // The same sentence again only restarts its clock.
        const same = current.find(item => item.message === detail.message)
        if (same) { window.clearTimeout(timers.current.get(same.id)); timers.current.delete(same.id) }
        const without = current.filter(item => item !== same)
        // The oldest goes when the stack is full.
        const kept = without.slice(Math.max(0, without.length + 1 - MAX_STACK))
        without.slice(0, without.length - kept.length).forEach(item => { window.clearTimeout(timers.current.get(item.id)); timers.current.delete(item.id) })
        return [...kept, next]
      })
      timers.current.set(next.id, window.setTimeout(() => dismiss(next.id), next.kind === 'error' ? ERROR_MS : TOAST_MS))
    }
    const clear = (event: Event) => {
      const olderThanMs = (event as CustomEvent<{ olderThanMs: number }>).detail?.olderThanMs ?? 0
      const cutoff = performance.now() - olderThanMs
      setToasts(current => {
        const gone = current.filter(item => item.at <= cutoff)
        gone.forEach(item => { window.clearTimeout(timers.current.get(item.id)); timers.current.delete(item.id) })
        return gone.length ? current.filter(item => item.at > cutoff) : current
      })
    }
    window.addEventListener(toastEventName, listener as EventListener)
    window.addEventListener(toastClearEventName, clear as EventListener)
    const pending = timers.current
    return () => {
      window.removeEventListener(toastEventName, listener as EventListener)
      window.removeEventListener(toastClearEventName, clear as EventListener)
      pending.forEach(timer => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  if (!toasts.length) return null

  return (
    <div className={styles.toastStack}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`${styles.toast} ${
            toast.kind === 'error' ? styles.toastError : toast.kind === 'warn' ? styles.toastWarn : styles.toastSuccess
          }`}
          onClick={() => dismiss(toast.id)}
          aria-label="Dismiss"
        >
          {toast.kind === 'error' || toast.kind === 'warn'
            ? <span className={styles.toastDot} aria-hidden="true" />
            : <svg className={styles.toastCheck} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  )
}
