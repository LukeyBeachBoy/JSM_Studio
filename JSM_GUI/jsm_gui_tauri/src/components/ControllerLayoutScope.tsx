import { useMemo, useState } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { AppSelect } from './ui/AppSelect'
import { controllerModelKey, controllerVariantLabel, controllerPadSource, hasControllerVariant, resetControllerVariant, setControllerPadSource, unavailableControllerInputs, regularControllerGamepad } from '../utils/controllerLayouts'
import { InputGlyph } from './glyphs/InputGlyph'
import { controllerVisualFamily } from '../utils/controllerStatus'
import styles from './ControllerLayoutScope.module.css'

type Props = { text: string; effectiveText: string; devices?: TelemetryDevice[]; model: string; onModel: (key: string) => void; onChange: (text: string) => void }
export function ControllerLayoutScope({ text, effectiveText, devices, model, onModel, onChange }: Props) {
  const [resetting, setResetting] = useState(false)
  const device = devices?.find(candidate => controllerModelKey(candidate) === model) ?? (model ? {type: Number(model.match(/type-(\d+)/)?.[1]), handle: 0, ...(model.endsWith('-edge') ? {vid:0x054c,pid:0x0df2} : {})} as TelemetryDevice : undefined)
  const models = [...new Map((devices ?? []).map(candidate => [controllerModelKey(candidate), candidate])).values()]
  const missing = useMemo(() => unavailableControllerInputs(effectiveText, device), [effectiveText, device?.type, device?.vid, device?.pid, device?.supportedButtons])
  const single = ['type-4', 'type-5', 'type-5-edge'].includes(model)
  const dualLayout = /^\s*(LEFT|RIGHT)_(TOUCHPAD|GRID|TOUCH)_/m.test(effectiveText)
  const variant = hasControllerVariant(text, model) || /^\s*#\s*@controller-pad\s+/m.test(text) && controllerPadSource(text, model) === 'left'
  const savedModels = [...new Set([...text.matchAll(/#\s*@controller(?:-pad)?\s+(type-\d+(?:-edge)?)/g)].map(match => match[1]))].filter(key => !models.some(candidate => controllerModelKey(candidate) === key))
  if (model && !savedModels.includes(model) && !models.some(candidate => controllerModelKey(candidate) === model)) savedModels.push(model)
  return <section className={styles.scope} aria-label="Controller layout">
    <div className={styles.header}>
      <label className={styles.target}>Editing for <AppSelect aria-label="Editing for controller" value={model} onChange={event => onModel(event.target.value)}>
        <option value="">Shared base</option>
        {models.map(candidate => <option key={controllerModelKey(candidate)} value={controllerModelKey(candidate)}>{controllerVariantLabel(candidate)}</option>)}
      {savedModels.map(key => <option key={key} value={key}>{controllerVariantLabel({type:Number(key.match(/type-(\d+)/)?.[1]),handle:0} as TelemetryDevice)} (disconnected)</option>)}
      </AppSelect></label>
      <span className={styles.note}>{model ? variant ? 'Controller variant · edits leave the shared base unchanged' : 'Inherited layout · your first edit creates a controller variant' : 'Shared base · edits affect controllers that inherit these values'}</span>
      {model && <button type="button" className="button button--secondary button--sm" onClick={() => onChange(regularControllerGamepad(text, effectiveText, model))}>Use regular gamepad</button>}
      {model && variant && <button type="button" className="button button--tertiary button--sm" onClick={() => setResetting(true)}>Reset variant</button>}
    </div>
    {single && dualLayout && <label className={styles.target}>Touchpad uses <AppSelect aria-label="Touchpad fallback source" value={controllerPadSource(text, model)} onChange={event => onChange(setControllerPadSource(text, model, event.target.value as 'left' | 'right'))}>
      <option value="right">Steam right trackpad</option><option value="left">Steam left trackpad</option>
    </AppSelect><span className={styles.note}>The other trackpad layout stays saved in the base.</span></label>}
    {missing.length > 0 && <details className={styles.missing}><summary>{missing.length} unavailable binding{missing.length === 1 ? '' : 's'} · saved for their original controller</summary>
      <p>Choose another input to make these actions available on this controller. Existing sticks and buttons are kept as configured.</p>
      <ul>{missing.map((entry, index) => <li key={`${entry.assignment}:${entry.input}:${index}`}><InputGlyph command={entry.input} family={controllerVisualFamily(device?.type)} size={20} /><strong>{entry.input}</strong><span>{entry.assignment} → {entry.value}</span></li>)}</ul>
    </details>}
    {resetting && <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setResetting(false) } }}>
      <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-controller-variant">
        <h3 id="reset-controller-variant">Reset this controller variant?</h3><p>This removes overrides for {controllerVariantLabel(device)} and returns to the inherited layout. Your other controller layouts stay saved. Undo can restore these changes.</p>
        <div className="confirm-dialog__actions"><button type="button" className="button button--secondary" data-modal-close onClick={() => setResetting(false)}>Cancel</button><button type="button" className="button button--danger-solid" onClick={() => { onChange(resetControllerVariant(text, model)); setResetting(false) }}>Reset variant</button></div>
      </div>
    </div>}
  </section>
}
