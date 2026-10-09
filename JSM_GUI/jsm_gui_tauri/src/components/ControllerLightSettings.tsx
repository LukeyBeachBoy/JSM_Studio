import { useState, type Dispatch, type SetStateAction } from 'react'
import { usePreferences } from '../platform/preferenceStore'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { LightBarPicker } from './keymap/LightBarPicker'
import { SummaryRow } from './ui/SummaryRow'
import { Sheet } from './ui/Sheet'
import { NumberField } from './NumberField'
import styles from './Keymap.module.css'

export function ControllerLightSettings({ text, onChange }: { text: string; onChange: Dispatch<SetStateAction<string>> }) {
  const [open, setOpen] = useState(false)
  const { runtime } = usePreferences()
  const raw = getKeymapValue(text, 'LIGHT_BAR')
  const color = raw?.match(/^x([0-9a-f]{6})$/i)?.[1]
  const defaultColor = runtime?.ledColor ?? '#ffffff'
  const shown = color ? `#${color}` : defaultColor
  const level = getKeymapValue(text, 'LED_BRIGHTNESS')
  const brightness = level === undefined ? runtime?.ledBrightness ?? 100 : Number(level)
  return <>
    <SummaryRow id="controller-light-row" label="Controller light" setting="LIGHT_BAR" hint="Color and brightness for this configuration."
      value={<span className={styles.lightBarSummary}><span className={styles.lightBarPreview} style={{ background: shown }} role="img" aria-label={`LED color ${shown}`} />{brightness}%</span>}
      onActivate={() => setOpen(true)} />
    <Sheet open={open} onClose={() => setOpen(false)} eyebrow="Configuration" title="Controller light" description="Unset values use the defaults from App settings."
      hints={[{ button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }]}>
      <div className="sheet-embed">
        <LightBarPicker value={color ? `#${color}` : null} defaultColor={defaultColor}
          onChange={next => onChange(previous => next === null ? removeKeymapEntry(previous, 'LIGHT_BAR') : updateKeymapEntry(previous, 'LIGHT_BAR', [`x${next.slice(1)}`]))} />
        <NumberField setting="LED_BRIGHTNESS" label="Profile brightness" value={brightness} min={0} max={100} step={5} unit="%"
          onChange={next => { if (next !== '') onChange(previous => updateKeymapEntry(previous, 'LED_BRIGHTNESS', [Number(next)])) }} />
        {level !== undefined && <button className="button button--secondary" onClick={() => onChange(previous => removeKeymapEntry(previous, 'LED_BRIGHTNESS'))}>Use app brightness</button>}
      </div>
    </Sheet>
  </>
}
