import { useMemo, type Dispatch, type SetStateAction } from 'react'
import { AppSelect } from '../ui/AppSelect'
import { HelpButton } from '../HelpButton'
import { NumberField } from '../NumberField'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../../utils/keymap'

export function TrackpadModeshift({ side, text, onChange, modifiers }: {
  side: 'left' | 'right'; text: string; onChange: Dispatch<SetStateAction<string>>;
  modifiers: { value: string; label: string }[];
}) {
  const prefix = side.toUpperCase()
  const modeKey = `${prefix}_TOUCHPAD_MODE`
  const chord = useMemo(() => text.split(/\r?\n/).map(line => line.match(new RegExp(`^\\s*([^#,=]+),\\s*${modeKey}\\s*=\\s*(\\w+)`))).find(Boolean), [text, modeKey])
  const button = chord?.[1].trim() ?? ''
  const click = side === 'left' ? 'MISC3' : 'MISC2'
  const mode = chord?.[2] ?? 'GRID_AND_STICK'
  const grid = (getKeymapValue(text, `${prefix}_GRID_SIZE`) ?? '2 1').split(/\s+/).map(Number)
  return <section className="tuning-anchor">
    <h4>Modeshift <HelpButton title="Trackpad modeshift">Hold a button to temporarily change this pad’s mode. Choose Pad click to aim with the mouse normally, then activate the grid cell under your thumb when you click. Release to return to the normal mode. Grid bindings and size are configured below. A separate ordinary pad-click binding will also fire; remove it if you only want the grid action.</HelpButton></h4>
    <label>Shift button<AppSelect value={button || 'off'} onChange={e => onChange(prev => {
      let next = button ? removeKeymapEntry(prev, `${button},${modeKey}`) : prev
      if (e.target.value !== 'off') next = updateKeymapEntry(next, `${e.target.value},${modeKey}`, [mode])
      return next
    })}>
      <option value="off">No modeshift</option>
      <option value={click}>Pad click</option>
      {modifiers.filter(m => m.value && m.value !== click).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
    </AppSelect></label>
    {button && <>
      <label>Shifted mode<AppSelect value={mode} onChange={e => onChange(prev => updateKeymapEntry(prev, `${button},${modeKey}`, [e.target.value]))}>
        <option value="GRID_AND_STICK">Grid and stick</option><option value="MOUSE">Mouse</option>
      </AppSelect></label>
      {mode === 'GRID_AND_STICK' && <div className="flex-inputs">
        <NumberField label="Columns" value={grid[0]} min={1} max={5} onChange={v => onChange(prev => updateKeymapEntry(prev, `${prefix}_GRID_SIZE`, [Number(v), grid[1] ?? 1]))} />
        <NumberField label="Rows" value={grid[1] ?? 1} min={1} max={5} onChange={v => onChange(prev => updateKeymapEntry(prev, `${prefix}_GRID_SIZE`, [grid[0], Number(v)]))} />
      </div>}
    </>}
  </section>
}
