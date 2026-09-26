import { useEffect, useRef, useState } from 'react'
import { toastEventName, type ToastKind } from '../utils/toast'
import styles from './Misc.module.css'

type ToastPayload = {
  message: string
  kind?: ToastKind
}

type Toast = ToastPayload & { id: string }

// System States 17h: toasts stack rather than replace each other, stay 4 s,
// and an error stays longer and can be dismissed early. They are never in the
// focus order (the pad has no business in a toast), so an error still goes
// by itself in the end rather than needing the mouse.
const TOAST_MS = 4000
const ERROR_MS = 8000
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
      const next = { id: crypto.randomUUID(), ...detail }
      setToasts(current => {
        // The oldest goes when the stack is full.
        const kept = current.slice(Math.max(0, current.length + 1 - MAX_STACK))
        current.slice(0, current.length - kept.length).forEach(item => { window.clearTimeout(timers.current.get(item.id)); timers.current.delete(item.id) })
        return [...kept, next]
      })
      timers.current.set(next.id, window.setTimeout(() => dismiss(next.id), next.kind === 'error' ? ERROR_MS : TOAST_MS))
    }
    window.addEventListener(toastEventName, listener as EventListener)
    const pending = timers.current
    return () => {
      window.removeEventListener(toastEventName, listener as EventListener)
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
          title="Dismiss"
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
