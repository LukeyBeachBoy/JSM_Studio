import { useEffect, useRef, useState } from 'react'
import { keyboard, defaultPreferences, previewFrame, shortcutLabels, type KeyboardPreferences, type ShortcutAction } from '../keyboard/bridge'
import { KeyboardView, ShortcutGlyph } from '../keyboard/KeyboardView'
import { AppSelect } from './ui/AppSelect'
import { HapticEffectSelect } from './ui/HapticEffectSelect'
import type { HapticEffect } from '../utils/hapticBindings'
import { NumberField } from './NumberField'
import { controllerVisualFamily } from '../utils/controllerStatus'
import './VirtualKeyboardSettings.css'
const layouts = [
  { id: 'standard', title: 'Standard', hint: 'Use either touchpad, the D-pad or left stick to choose a key.' },
  { id: 'split', title: 'Split', hint: 'Each touchpad selects its half. Click either pad to type.' },
  { id: 'daisywheel', title: 'Daisywheel', hint: 'Left stick + face buttons to type; full stop, comma, ? and apostrophe are on the letter petals. Hold the right trigger for numbers and symbols, and add the left trigger for the rest.' },
] as const
const buttons = [['L', 'Left bumper'], ['R', 'Right bumper'], ['ZL', 'Left trigger'], ['ZR', 'Right trigger'], ['L3', 'Left stick click'], ['R3', 'Right stick click'], ['+', 'Menu'], ['-', 'View'], ['W', 'West face button'], ['N', 'North face button'], ['E', 'East face button'], ['UP', 'D-pad up'], ['DOWN', 'D-pad down'], ['LEFT', 'D-pad left'], ['RIGHT', 'D-pad right'], ['LSL', 'Left rear button'], ['RSL', 'Right rear button'], ['L3+R3', 'Both stick clicks'], ['L+R', 'Both bumpers']]
export function VirtualKeyboardSettings({ controllerType }: { controllerType?: number }) {
  const [preferences, setPreferences] = useState<KeyboardPreferences | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve())
  const saveRevision = useRef(0)
  useEffect(() => { let live = true; keyboard.getPreferences().then(p => { if (live) setPreferences(p) }).catch(e => { if (live) setError(String(e)) }); return () => { live = false } }, [])
  const save = async (next: KeyboardPreferences, continuous = false) => {
    const revision = ++saveRevision.current
    // Keep slider focus/adjust mode while persisting each nudge. Reflect the
    // latest value immediately, and serialize writes so an older save cannot win.
    setPreferences(next); setError('')
    if (!continuous) setBusy(true)
    const pending = saveQueue.current.then(() => keyboard.savePreferences(next))
    saveQueue.current = pending.catch(() => {})
    try {
      const saved = await pending
      if (revision === saveRevision.current) setPreferences(saved)
    } catch (e) { if (revision === saveRevision.current) setError(String(e)) }
    finally { if (revision === saveRevision.current) setBusy(false) }
  }
  const changeShortcut = (action: ShortcutAction, command: string) => {
    if (!preferences) return
    const bindings = { ...preferences.shortcuts[preferences.layout] }
    const previous = bindings[action]
    const existing = (Object.keys(bindings) as ShortcutAction[]).find(a => a !== action && bindings[a] === command)
    if (existing) bindings[existing] = previous
    bindings[action] = command
    void save({ ...preferences, shortcuts: { ...preferences.shortcuts, [preferences.layout]: bindings } })
  }
  return <section className="keyboard-settings" aria-label="Virtual keyboard" data-section="keyboard">
    <div className="keyboard-settings-title"><span className="keyboard-settings-icon" aria-hidden="true">⌨</span><div><h3>Virtual keyboard</h3><p>Type anywhere from your controller.</p></div></div>
    <label className="keyboard-settings-row"><span>Keyboard layout</span><AppSelect aria-label="Keyboard layout" value={preferences?.layout ?? 'split'} disabled={!preferences || busy} onChange={event => { if (preferences) void save({ ...preferences, layout: event.target.value as KeyboardPreferences['layout'] }) }}>{layouts.map(layout => <option key={layout.id} value={layout.id}>{layout.title}</option>)}</AppSelect></label>
    <p className="keyboard-settings-hint">{layouts.find(l => l.id === preferences?.layout)?.hint}</p>
    <label className="keyboard-settings-row"><span>Keyboard appearance</span><AppSelect aria-label="Keyboard appearance" value={preferences?.appearance ?? 'theme'} disabled={!preferences || busy} onChange={event => { if (preferences) void save({ ...preferences, appearance: event.target.value as KeyboardPreferences['appearance'] }) }}><option value="theme">Match app theme</option><option value="dark">Neutral dark</option><option value="light">Neutral light</option></AppSelect></label>
    {preferences?.layout === 'daisywheel' && <>
      <label className="keyboard-settings-row"><span>Character grouping</span><AppSelect aria-label="Daisywheel character grouping" value={preferences.daisywheelVariant} disabled={busy} onChange={e => void save({ ...preferences, daisywheelVariant: e.target.value as KeyboardPreferences['daisywheelVariant'] })}><option value="classic">Classic</option><option value="inputlabs">Input Labs tweaked</option></AppSelect></label>
      <p className="keyboard-settings-hint">Tweaked grouping keeps vowels on A. <a href="https://inputlabs.io/blog/alphanumeric_input" target="_blank" rel="noreferrer">Design by Input Labs</a></p>
      <label className="keyboard-settings-row"><span>Right stick as D-pad<small>Keep the left stick on the petals; use the right stick for center shortcuts.</small></span><input type="checkbox" aria-label="Right stick as D-pad" checked={preferences.rightStickDpad} disabled={busy} onChange={e => void save({ ...preferences, rightStickDpad: e.target.checked })} /></label>
    </>}
    {preferences && preferences.layout !== 'daisywheel' && <NumberField label="Pad press threshold" value={Math.round((preferences.padPressThreshold ?? 0.08) * 100)} min={0} max={20} step={1} unit="%" disabled={busy} hint="Force a Steam Controller pad press needs to type. 8% matches Steam’s keyboard; below about 5% a letter can type while your thumb is still sliding onto it. 0 uses the physical click." onChange={value => { if (value !== '') void save({ ...preferences, padPressThreshold: Number(value) / 100 }, true) }} />}
    {preferences && preferences.layout !== 'daisywheel' && <NumberField label="Touch smoothing" value={Math.round((preferences.touchSmoothing ?? 0.5) * 100)} min={0} max={100} step={5} unit="%" disabled={busy} hint="Steadies the touch cursor while you aim, without slowing fast swipes. 0 shows the raw pad." onChange={value => { if (value !== '') void save({ ...preferences, touchSmoothing: Number(value) / 100 }, true) }} />}
    {preferences && preferences.layout !== 'daisywheel' && <NumberField label="Vertical steadying" value={Math.round((preferences.verticalSteadying ?? 0.7) * 100)} min={0} max={100} step={5} unit="%" disabled={busy} hint="How much sideways drift to hold back while you swipe up or down. Diagonal and sideways moves are unaffected, and the cursor catches back up when you move sideways." onChange={value => { if (value !== '') void save({ ...preferences, verticalSteadying: Number(value) / 100 }, true) }} />}
    {preferences && <div className="keyboard-settings-preview" aria-label="Selected keyboard layout preview"><KeyboardView frame={{ ...previewFrame(preferences), controllerType: controllerType ?? 0 }} preview /></div>}
    <details className="keyboard-settings-shortcuts keyboard-settings-haptics"><summary>Haptics</summary>
      <label className="keyboard-settings-row"><span>Feedback type</span><HapticEffectSelect ariaLabel="Keyboard haptic feedback type" value={(preferences?.hapticType ?? 'automatic').toUpperCase() as HapticEffect | 'AUTOMATIC'} includeAdaptive adaptiveLabel="Steam keyboard" disabled={!preferences || busy} onChange={effect => { if (preferences) void save({ ...preferences, hapticType: effect.toLowerCase() as KeyboardPreferences['hapticType'] }) }} /></label>
      <p className="keyboard-settings-hint">Feedback when trackpads or sticks select and type keys, and when shortcuts activate. Steam keyboard reproduces the captured selection ticks, press/release ticks and short touch/shortcut pulses. Pulse strength is fixed by the controller; intensity adjusts ticks.</p>
      {preferences && <NumberField label="Haptic intensity" value={preferences.hapticIntensity ?? 35} min={0} max={100} step={1} unit="%" disabled={busy || preferences.hapticType === 'off'} hint="Key presses feel stronger than selection changes. 0% silences keyboard feedback." onChange={value => { if (value !== '') void save({ ...preferences, hapticIntensity: Number(value) }, true) }} />}
    </details>
    <details className="keyboard-settings-shortcuts"><summary>Controller shortcuts</summary>
      <p className="keyboard-settings-hint">Saved separately for each layout. Choosing an assigned button swaps its actions.</p>
      <button type="button" className="button button--sm keyboard-shortcuts-reset" disabled={!preferences || busy} onClick={() => { if (preferences) void save({ ...preferences, shortcuts: { ...preferences.shortcuts, [preferences.layout]: { ...defaultPreferences.shortcuts[preferences.layout] } } }) }}>Reset to defaults</button>
      {preferences && (Object.keys(shortcutLabels) as ShortcutAction[]).map(action => <label className="keyboard-settings-row" key={action}><span>{shortcutLabels[action]}</span><span className="keyboard-settings-choice"><ShortcutGlyph command={preferences.shortcuts[preferences.layout][action]} family={controllerVisualFamily(controllerType)} /><AppSelect aria-label={shortcutLabels[action]} value={preferences.shortcuts[preferences.layout][action]} disabled={busy} onChange={event => changeShortcut(action, event.target.value)}>{buttons.filter(([c]) => preferences.layout === 'daisywheel' ? !['W', 'N', 'E'].includes(c) : !['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(c)).map(([c, name]) => <option key={c} value={c}>{name}</option>)}</AppSelect></span></label>)}
      <p className="keyboard-settings-hint">Hold Move or Resize and drag either touchpad. Move also uses the right stick; Resize also uses the left stick. Reset restores the default size and position.</p>
    </details>
    <p className="keyboard-settings-hint keyboard-settings-opening">Open from Global Chords: hold <ShortcutGlyph command="HOME" family={controllerVisualFamily(controllerType)} /> or <ShortcutGlyph command="MISC1" family={controllerVisualFamily(controllerType)} />, then <ShortcutGlyph command="W" family={controllerVisualFamily(controllerType)} />.</p>
    <button type="button" className="button button--sm" disabled={!preferences || busy} onClick={() => { setError(''); void keyboard.setOpen(true).catch(e => setError(String(e))) }}>Open keyboard</button>
    {error && <p role="alert" className="keyboard-settings-error">{error}</p>}
  </section>
}
