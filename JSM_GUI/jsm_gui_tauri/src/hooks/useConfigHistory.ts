import { useCallback, useRef, useState, type SetStateAction } from 'react'

export function useConfigHistory() {
  const [text, render] = useState('')
  const state = useRef({ text: '', past: [] as string[], future: [] as string[], time: 0 })
  const setText = useCallback((action: SetStateAction<string>) => {
    const s = state.current
    const next = typeof action === 'function' ? action(s.text) : action
    if (next === s.text) return
    const now = performance.now()
    // A slider drag or the multiple writes of one preset is one undo gesture.
    if (now - s.time > 350 || !s.past.length) s.past = [...s.past, s.text].slice(-100)
    s.future = []
    s.time = now
    s.text = next
    render(next)
  }, [])
  const reset = useCallback((text: string) => {
    state.current = { text, past: [], future: [], time: 0 }
    render(text)
  }, [])
  const travel = (redo: boolean) => {
    const s = state.current
    const from = redo ? s.future : s.past
    const next = from.pop()
    if (next === undefined) return
    ;(redo ? s.past : s.future).push(s.text)
    s.text = next
    s.time = 0
    render(next)
  }
  return { text, setText, reset, undo: () => travel(false), redo: () => travel(true),
    canUndo: state.current.past.length > 0, canRedo: state.current.future.length > 0 }
}
