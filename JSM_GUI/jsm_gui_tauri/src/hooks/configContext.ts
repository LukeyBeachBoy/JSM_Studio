import { createContext, useContext } from 'react'
import { scopedConfig, replaceScope } from '../utils/configScopes'

export const ConfigBaseline = createContext<{ text: string; saved: string; onChange?: (text: string) => void }>({ text: '', saved: '' })
export const DirtyScope = createContext<RegExp | null>(null)
export function useScopedActions(fallback: boolean, onCancel?: () => void) {
  const { text, saved, onChange } = useContext(ConfigBaseline)
  const match = useContext(DirtyScope)
  return {
    dirty: match ? scopedConfig(text, match) !== scopedConfig(saved, match) : fallback,
    cancel: match && onChange ? () => onChange(replaceScope(text, scopedConfig(saved, match), match)) : onCancel,
  }
}
