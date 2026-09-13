import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { NumberField } from './NumberField'
import { desktopBridge } from '../platform/desktopBridge'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { showToast } from '../utils/toast'
const help = 'Time JoyShockMapper waits between reading controller state, in milliseconds. This affects the whole controller, including gyro and trackpads. A shorter interval can reduce latency but increases processing work; it does not change the hardware report rate. The backend uses whole milliseconds.'
export function PollingSettings({ text, effectiveText, onChange, global = false }: { text: string; effectiveText: string; onChange: Dispatch<SetStateAction<string>>; global?: boolean }) {
 const [defaultMs, setDefaultMs] = useState(3)
 const [pending, setPending] = useState(3)
 const [ready, setReady] = useState(false)
 const [saving, setSaving] = useState(false)
 useEffect(() => { let cancelled = false; desktopBridge.getRuntimeMappingState().then(state => { if (!cancelled) { setDefaultMs(state.defaultPollingMs ?? 3); setPending(state.defaultPollingMs ?? 3); setReady(true) } }).catch(error => showToast(String(error), 'error')); return () => { cancelled = true } }, [])
 const explicit = getKeymapValue(text, 'TICK_TIME')
 const inherited = getKeymapValue(effectiveText, 'TICK_TIME')
 return <section><h3>Controller Polling</h3>
   {global ? <><NumberField label="Default Polling Interval" value={pending} onChange={value => { if (value) setPending(Math.min(100, Math.max(1, Math.round(Number(value))))) }} min={1} max={100} step={1} unit="ms" hint={help} disabled={!ready || saving} />
     <button type="button" className="secondary-btn" disabled={!ready || saving || pending === defaultMs} onClick={async () => { setSaving(true); try { const result = await desktopBridge.setDefaultPollingMs(pending); setDefaultMs(result.defaultPollingMs ?? pending); showToast('Polling default saved. Apply a profile to activate it.', 'success') } catch(error) { showToast(String(error), 'error') } finally { setSaving(false) } }}>Save Default</button>
     <p>Used by profiles without a polling override. Existing profile and imported values take precedence.</p></> : <>
     <NumberField label="Profile Polling Override" value={explicit ?? ''} placeholder={inherited ?? String(defaultMs)} min={1} max={100} step={1} unit="ms" hint={help}
       onChange={value => onChange(previous => value === '' ? removeKeymapEntry(previous, 'TICK_TIME') : updateKeymapEntry(previous, 'TICK_TIME', [String(Math.round(Number(value)))]))} />
     <button className="ghost-btn" disabled={!explicit} onClick={() => onChange(previous => removeKeymapEntry(previous, 'TICK_TIME'))}>Use Inherited / Default</button>
     <p>Effective: {inherited ?? defaultMs} ms · {explicit ? 'This Profile' : inherited ? 'Imported Configuration' : 'Global Default'}</p>
   </>}
 </section>
}
