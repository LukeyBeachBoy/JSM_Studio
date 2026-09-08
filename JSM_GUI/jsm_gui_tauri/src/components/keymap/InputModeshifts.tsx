import { useState, type Dispatch, type SetStateAction } from 'react'
import { AppSelect } from '../ui/AppSelect'
import { HelpButton } from '../HelpButton'
import { NumberField } from '../NumberField'
import { BindingEditor } from './BindingEditor'
import { getButtonBindingRows, getKeymapValue, serializeBindingExpression } from '../../utils/keymap'
import { parseRowsToCommands, updateCommandExpression, type BindingCommandPatch } from '../../utils/bindingCommands'
import { addModeshift, modeshiftTriggers, readModeshift, removeModeshift, renameModeshift, writeModeshift, type ModeshiftTarget } from '../../utils/modeshift'
import type { VirtualControllerType } from '../../utils/virtualController'
import type { LivePadTouch } from './TouchpadGridSection'
import styles from './InputModeshifts.module.css'

type Props = {
  target: ModeshiftTarget
  text: string
  onChange: Dispatch<SetStateAction<string>>
  modifiers: { value: string; label: string; disabled?: boolean }[]
  virtualControllerType: VirtualControllerType
  onEnableVirtualController?: () => void
  beginValueCapture: (key: string, label: string, onCaptured: (value: string) => void) => void
  isCapturingValue: (key: string) => boolean
  captureLabel: string
  livePad?: LivePadTouch | null
}

function ShiftedBinding({ button, trigger, ...props }: Props & { button: ModeshiftTarget['buttons'][number]; trigger: string }) {
  const value = readModeshift(props.text, trigger, button.command) ?? getKeymapValue(props.text, button.command) ?? 'NONE'
  const commands = parseRowsToCommands(getButtonBindingRows(`${button.command} = ${value}`, button.command), button.command)
  const [drafts, setDrafts] = useState<{ value: string; patches: Record<number, BindingCommandPatch> }>({ value, patches: {} })
  return <div className={styles.binding}>
    <h5>{button.label}</h5>
    {commands.map((command, index) => {
      const id = `${props.target.id}:${trigger}:${button.command}:${index}`
      const displayed = { ...command, ...(drafts.value === value ? drafts.patches[index] : {}) }
      const update = (patch: BindingCommandPatch) => {
        const merged = { ...displayed, ...patch }
        const expression = updateCommandExpression(command, { ...merged, outputValue: merged.outputValue || 'NONE' })
        if (expression) {
          const nextValue = serializeBindingExpression(expression)
          setDrafts(previous => ({ value: nextValue, patches: { ...(previous.value === value ? previous.patches : {}), [index]: merged } }))
          props.onChange(previous => writeModeshift(previous, trigger, button.command, nextValue))
        }
      }
      return <BindingEditor key={id} command={displayed} modifierOptions={[]} specialOptions={[{ value: 'NONE', label: 'Unbound' }]} virtualControllerType={props.virtualControllerType}
        isCapturing={props.isCapturingValue(id)} captureLabel={props.captureLabel} onChange={update}
        onCapture={() => props.beginValueCapture(id, button.label, outputValue => update({ outputValue }))}
        onEnableVirtualController={props.onEnableVirtualController} />
    })}
  </div>
}

function ModeshiftCard({ trigger, ...props }: Props & { trigger: string }) {
  const { target, text, onChange } = props
  const [selectedCell, setSelectedCell] = useState(0)
  const triggers = modeshiftTriggers(text, target)
  const read = (key: string, fallback: string) => readModeshift(text, trigger, key) ?? getKeymapValue(text, key) ?? fallback
  const write = (key: string, value: string) => onChange(previous => writeModeshift(previous, trigger, key, value))
  const mode = target.mode ? read(target.mode.key, target.mode.defaultValue) : ''
  const grid = target.grid
  const dimensions = grid ? read(grid.sizeKey, '2 2').split(/\s+/).map(Number) : [1, 1]
  const columns = Math.max(1, Math.min(5, dimensions[0] || 2))
  const rows = Math.max(1, Math.min(5, dimensions[1] || 2))
  const gridButtons = target.buttons.slice(0, columns * rows)
  const selected = gridButtons[Math.min(selectedCell, gridButtons.length - 1)]
  const live = props.livePad?.touched ? Math.min(rows - 1, Math.max(0, Math.floor((props.livePad.y + 1) / 2 * rows))) * columns + Math.min(columns - 1, Math.max(0, Math.floor((props.livePad.x + 1) / 2 * columns))) : -1
  return <section className={styles.card} aria-label={`${target.title} modeshift`}>
    <div className={styles.heading}>
      <h4>Modeshift <HelpButton title="Modeshift">This card replaces this input’s mode and bindings while its trigger is held. Releasing the trigger restores the normal card. Other input groups keep their own bindings.</HelpButton></h4>
      <button type="button" className="ghost-btn" onClick={() => onChange(previous => removeModeshift(previous, target, trigger))}>Remove modeshift</button>
    </div>
    <label className={styles.selectField}>Modeshift trigger <span className={styles.required}>Required</span>
      <AppSelect aria-label="Modeshift trigger" value={trigger} onChange={event => onChange(previous => renameModeshift(previous, target, trigger, event.target.value))}>
        {props.modifiers.filter(option => !option.disabled && ((!triggers.includes(option.value) && !target.buttons.some(button => button.command === option.value)) || option.value === trigger)).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </AppSelect>
    </label>
    {target.mode && <label className={styles.selectField}>Shifted mode
      <AppSelect aria-label="Shifted mode" value={mode} onChange={event => write(target.mode!.key, event.target.value)}>
        {target.mode.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </AppSelect>
    </label>}
    {grid && mode === 'GRID_AND_STICK' ? <>
      <p className={styles.hint}>The region under your thumb activates as soon as the trigger is pressed. Release the trigger to return to the normal mode.</p>
      {read(grid.clickKey, 'OFF') === 'ON' && <button type="button" className="ghost-btn" onClick={() => write(grid.clickKey, 'OFF')}>Activate with the modeshift trigger only</button>}
      <div className={styles.dimensions}>
        <NumberField label="Columns" value={columns} min={1} max={5} onChange={value => write(grid.sizeKey, `${Number(value) || 1} ${rows}`)} />
        <NumberField label="Rows" value={rows} min={1} max={5} onChange={value => write(grid.sizeKey, `${columns} ${Number(value) || 1}`)} />
      </div>
      <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {gridButtons.map((button, index) => <button key={button.command} type="button" aria-pressed={button === selected} className={`${styles.cell} ${index === live ? styles.live : ''}`} onClick={() => setSelectedCell(index)}>
          <strong>{button.command}</strong><span>{read(button.command, 'NONE')}</span>
        </button>)}
      </div>
      {selected && <ShiftedBinding key={`${trigger}:${selected.command}`} {...props} trigger={trigger} button={selected} />}
    </> : !grid ? <div className={styles.bindings}>
      {target.buttons.map(button => <ShiftedBinding key={button.command} {...props} trigger={trigger} button={button} />)}
    </div> : mode === 'MOUSE' ? <div className={styles.dimensions}>
      {['Horizontal', 'Vertical'].map((axis, index) => {
        const key = target.mode!.key.replace('_MODE', '_SENS')
        const sens = read(key, '1 1').split(/\s+/)
        return <NumberField key={axis} label={`${axis} sensitivity`} value={Number(sens[index] ?? sens[0])} min={0} max={10} step={0.1} onChange={value => { sens[index] = value; write(key, `${sens[0]} ${sens[1] ?? sens[0]}`) }} />
      })}
    </div> : null}
    {grid && getKeymapValue(text, trigger) && getKeymapValue(text, trigger) !== 'NONE' && <p className={styles.hint}>The trigger also has its own binding ({getKeymapValue(text, trigger)}). Clear it under Touch and click buttons if you only want the shifted action.</p>}
  </section>
}

export function InputModeshifts(props: Props) {
  const [adding, setAdding] = useState(false)
  const triggers = modeshiftTriggers(props.text, props.target)
  const available = props.modifiers.filter(option => !option.disabled && !triggers.includes(option.value) && !props.target.buttons.some(button => button.command === option.value))
  const click = props.target.grid?.clickButton
  const modifiers = props.modifiers.map(option => option.value === click ? { ...option, label: 'Pad click' } : option)
  return <div className={styles.list}>
    {triggers.map(trigger => <ModeshiftCard key={`${props.target.id}:${trigger}`} {...props} modifiers={modifiers} trigger={trigger} />)}
    {adding ? <section className={styles.card} aria-label={`New ${props.target.title} modeshift`}>
      <div className={styles.heading}><h4>Add modeshift</h4><button type="button" className="ghost-btn" onClick={() => setAdding(false)}>Cancel</button></div>
      <label className={styles.selectField}>Modeshift trigger <span className={styles.required}>Required</span>
        <AppSelect aria-label="Modeshift trigger" value="" onChange={event => {
          props.onChange(previous => addModeshift(previous, props.target, event.target.value))
          setAdding(false)
        }}>
          <option value="">Choose a trigger…</option>
          {available.map(option => <option key={option.value} value={option.value}>{option.value === click ? 'Pad click' : option.label}</option>)}
        </AppSelect>
      </label>
    </section> : <button type="button" className={`ghost-btn ${styles.add}`} disabled={!available.length} onClick={() => setAdding(true)}>Add modeshift</button>}
  </div>
}
