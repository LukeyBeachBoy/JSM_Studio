export type ToastKind = 'success' | 'warn' | 'error'

export const toastEventName = 'app-toast'

export function showToast(message: string, kind: ToastKind = 'success') {
  window.dispatchEvent(new CustomEvent<{ message: string; kind?: ToastKind }>(toastEventName, { detail: { message, kind } }))
}

export const toastClearEventName = 'app-toast-clear'

/**
 * Take the toasts down: the page changed, or a test ended, and what they said
 * belongs to the screen before. `olderThanMs` keeps a toast raised by the very
 * action that caused the change ("Wardogs 2 is a copy of Wardogs").
 */
export function clearToasts(olderThanMs = 0) {
  window.dispatchEvent(new CustomEvent<{ olderThanMs: number }>(toastClearEventName, { detail: { olderThanMs } }))
}
