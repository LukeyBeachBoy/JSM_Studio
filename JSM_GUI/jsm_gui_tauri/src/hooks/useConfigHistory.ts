import { useCallback, useRef, useState, type SetStateAction } from 'react'

/** One step of the undo history: the text before a change, and when the
 *  change that replaced it was made (Review changes' History timeline). */
export type HistoryStep = { text: string; at: number }

export function useConfigHistory() {
  const [text, render] = useState('')
  const state = useRef({ text: '', at: 0, past: [] as HistoryStep[], future: [] as HistoryStep[], time: 0 })
  const setText = useCallback((action: SetStateAction<string>) => {
    const s = state.current
    const next = typeof action === 'function' ? action(s.text) : action
    if (next === s.text) return
    const now = performance.now()
    // A slider drag or the multiple writes of one preset is one undo gesture.
    if (now - s.time > 350 || !s.past.length) s.past = [...s.past, { text: s.text, at: s.at }].slice(-100)
    s.future = []
    s.time = now
    s.text = next
    s.at = Date.now()
    render(next)
  }, [])
  const reset = useCallback((text: string) => {
    state.current = { text, at: Date.now(), past: [], future: [], time: 0 }
    render(text)
  }, [])
  const setTextAsAction = useCallback((action: SetStateAction<string>) => {
    state.current.time = -Infinity
    setText(action)
    state.current.time = -Infinity
  }, [setText])
  const travel = (redo: boolean) => {
    const s = state.current
    const from = redo ? s.future : s.past
    const next = from.pop()
    if (next === undefined) return
    ;(redo ? s.past : s.future).push({ text: s.text, at: s.at })
    s.text = next.text
    s.at = next.at
    s.time = 0
    render(next.text)
  }
  const { past, future } = state.current
  return { text, setText, setTextAsAction, reset, undo: () => travel(false), redo: () => travel(true),
    canUndo: past.length > 0, canRedo: future.length > 0,
    // What Undo and Redo would put back, so the Configuration menu can name it.
    undoTarget: past[past.length - 1]?.text, redoTarget: future[future.length - 1]?.text,
    /** The steps behind and ahead, oldest first, and when the current text was made. */
    past, future, currentAt: state.current.at }
}
