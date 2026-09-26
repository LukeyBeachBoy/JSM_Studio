import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { NumberField } from './NumberField'
import { desktopBridge } from '../platform/desktopBridge'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../utils/keymap'
import { showToast } from '../utils/toast'
import { getPreferenceSnapshot, patchRuntimePreferences } from '../platform/preferenceStore'
import styles from './PollingSettings.module.css'

const help = 'Time JoyShockMapper waits between reading controller state, in milliseconds. This affects the whole controller, including gyro and trackpads. A shorter interval can reduce latency but increases processing work; it does not change the hardware report rate. The backend uses whole milliseconds.'
const hz = (ms: number) => Math.round(1000 / Math.max(1, ms))

// Controller polling (Tuning and Studio Pages 16d): the interval with where it
// comes from -- this profile, an import, or the global default -- and a table
// of all three, so an override is never a mystery. On Preferences (global)
// it is the default every profile starts from.
export function PollingSettings({ text, effectiveText, onChange, global = false, importName }: {
  text: string; effectiveText: string; onChange: Dispatch<SetStateAction<string>>; global?: boolean
  /** The import the inherited value comes from, when there is one. */
  importName?: string | null
}) {
  // Read at startup (preferenceStore), so the page opens on the real value.
  const cachedMs = getPreferenceSnapshot().runtime ? getPreferenceSnapshot().runtime?.defaultPollingMs ?? 3 : null
  const [defaultMs, setDefaultMs] = useState(cachedMs ?? 3)
  const [pending, setPending] = useState(cachedMs ?? 3)
  const [ready, setReady] = useState(cachedMs !== null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let cancelled = false
    desktopBridge.getRuntimeMappingState()
      .then(state => { if (!cancelled) { setDefaultMs(state.defaultPollingMs ?? 3); setPending(state.defaultPollingMs ?? 3); setReady(true) } })
      .catch(error => showToast(String(error), 'error'))
    return () => { cancelled = true }
  }, [])
  const explicit = getKeymapValue(text, 'TICK_TIME')
  const inherited = getKeymapValue(effectiveText, 'TICK_TIME')
  const imported = !explicit && inherited ? inherited : null

  if (global) return (
    <section className={styles.polling}>
      <h3 className={styles.heading}>Controller Polling</h3>
      <NumberField label="Default Polling Interval" value={pending} onChange={value => { if (value) setPending(Math.min(100, Math.max(1, Math.round(Number(value))))) }} min={1} max={100} step={1} unit="ms" hint={help} disabled={!ready || saving} />
      <div className={styles.actions}>
        <button type="button" className="button button--secondary" disabled={!ready || saving || pending === defaultMs} onClick={async () => {
          setSaving(true)
          try { const result = await desktopBridge.setDefaultPollingMs(pending); setDefaultMs(result.defaultPollingMs ?? pending); patchRuntimePreferences({ defaultPollingMs: result.defaultPollingMs ?? pending }); showToast('Polling default saved. Apply a profile to activate it.', 'success') }
          catch (error) { showToast(String(error), 'error') }
          finally { setSaving(false) }
        }}>Save Default</button>
        <p className={styles.note}>Used by profiles without a polling override. Profile and imported values take precedence.</p>
      </div>
    </section>
  )

  const effective = Number(explicit ?? inherited ?? defaultMs)
  const write = (value: string) => onChange(previous => value === '' ? removeKeymapEntry(previous, 'TICK_TIME') : updateKeymapEntry(previous, 'TICK_TIME', [String(Math.round(Number(value)))]))
  const source = explicit ? 'This profile overrides the global default.' : imported ? `Inherited from ${importName ?? 'an imported configuration'}.` : 'Using the global default.'
  return (
    <section className={styles.polling}>
      <h3 className={styles.heading}>Controller Polling</h3>
      <NumberField setting="TICK_TIME" label="Polling interval" value={explicit ?? ''} placeholder={inherited ?? String(defaultMs)} min={1} max={100} step={1} unit="ms"
        hint={`${source} ${help}`} onChange={write} />
      <dl className={styles.sources}>
        <div className={styles.effective}><dt>Effective</dt><dd>{effective} ms · {hz(effective)} Hz</dd></div>
        <div><dt>This profile</dt><dd className={explicit ? styles.set : undefined}>{explicit ? `${explicit} ms` : 'not set'}</dd></div>
        <div><dt>{importName ?? 'Imports'}</dt><dd>{imported ? `${imported} ms` : 'not set'}</dd></div>
        <div><dt>Global default</dt><dd>{defaultMs} ms</dd></div>
      </dl>
      <button type="button" className="button button--tertiary button--sm" disabled={!explicit} onClick={() => onChange(previous => removeKeymapEntry(previous, 'TICK_TIME'))}>Use Inherited / Default</button>
    </section>
  )
}
