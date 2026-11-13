import { useState } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import type { ButtonDefinition } from '../keymap/schema'
import { controllerLayoutDevice, controllerLayoutModels, controllerModelKey, controllerVariantLabel } from '../utils/controllerLayouts'
import { controllerButtonLabel, controllerSupportsInput, controllerVisualFamily } from '../utils/controllerStatus'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { ModelControllerSvg } from './ModelControllerSvg'
import { InputGlyph } from './glyphs/InputGlyph'
import { InputText } from './glyphs/InputText'
import styles from './GlobalChordsPage.module.css'

export function HoldInputPicker({ devices, controllerModel, selected, definitions, onToggle, onListen, purpose }: {
  devices?: TelemetryDevice[]; controllerModel?: string | null; selected: string[]; definitions: ButtonDefinition[]
  onToggle: (command: string) => void; onListen?: () => void; purpose?: string
}) {
  const [model, setModel] = useState(controllerModel || controllerModelKey(devices?.[0]) || 'type-24')
  const [nubOpen, setNubOpen] = useState(false)
  const device = controllerLayoutDevice(model, devices)!
  const family = controllerVisualFamily(device.type)
  const selectable = (command: string) => !/^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$/.test(command) && controllerSupportsInput(device, command)
  const toggleDrawing = (command: string) => {
    if (device.type === 25 && ['JOY20', 'UP', 'DOWN', 'LEFT', 'RIGHT'].includes(command)) { setNubOpen(true); return }
    const input = device.type === 25 && command === 'LUP' ? 'JOY21' : command
    if (selectable(input)) onToggle(input)
  }
  const marks = new Set(selected)
  const mouseButton = (command: string, y: number, label: string) => <g role="button" tabIndex={0} aria-label={label} aria-pressed={selected.includes(command)}
    data-mouse-input={command} onClick={() => onToggle(command)}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(command) } }}>
    <rect x="18" y={y} width="50" height="40" rx="12" fill={selected.includes(command) ? 'var(--accent)' : 'var(--surface-row)'} stroke="var(--text-2)" strokeWidth="2" />
    <text x="43" y={y + 25} textAnchor="middle" fill="var(--text-1)" pointerEvents="none">{command === 'MOUSE_BACK' ? '4' : '5'}</text>
  </g>
  return <div className={styles.inputPicker}>
    <p>{purpose ?? 'Choose inputs on the picture or below. Select several to hold them together; select one again to remove it. Changes save as you choose.'}</p>
    {onListen && <button type="button" className="button button--secondary" onClick={onListen}>Listen for input instead</button>}
    <div className={styles.pickerColumns}>
      <section aria-label="Choose on the controller picture">
        <label className={styles.pictureController}>Controller picture
          <select data-autofocus aria-label="Controller picture" value={model} onChange={event => setModel(event.target.value)}>
            {[...new Set([model, ...controllerLayoutModels])].map(key => <option key={key} value={key}>{controllerVariantLabel(controllerLayoutDevice(key))}</option>)}
          </select>
        </label>
        <p>Showing {controllerVariantLabel(device)}. This changes the picture; Which controller controls where the swap applies.</p>
        {device.type === 25
          ? <ModelControllerSvg device={device} boundCommands={marks} onSelectCommand={toggleDrawing} />
          : <ControllerStatusSvg device={device} boundCommands={marks} onSelectCommand={toggleDrawing} />}
      </section>
      <section aria-label="Inputs to hold">
        <h2>Hold together</h2>
        {device.type === 25 && nubOpen && <section aria-label="Five-way nub inputs">
          <h3>Five-way nub</h3>
          <p>Choose the direction or click to hold.</p>
          <div className={styles.chips}>
            {(['UP', 'DOWN', 'LEFT', 'RIGHT', 'JOY20'] as const).map(command => <button key={command} type="button" className={styles.chip} aria-pressed={selected.includes(command)} onClick={() => onToggle(command)}>
              {command === 'JOY20' ? 'Click (20)' : command[0] + command.slice(1).toLowerCase()}
            </button>)}
          </div>
        </section>}
        <p aria-live="polite"><InputText text={selected.length ? selected.map(command => command === 'MOUSE_BACK' ? 'Mouse Back' : command === 'MOUSE_FORWARD' ? 'Mouse Forward' : controllerButtonLabel(definitions.find(button => button.command === command) ?? {command, descriptionKey:command, playstation:command, xbox:command}, family)).join(' + ') : 'No inputs selected'} /></p>
        <div className={styles.mousePicker}>
          <svg viewBox="0 0 180 230" role="img" aria-label="Mouse side buttons">
            <path d="M35 92Q35 18 100 18Q163 18 163 92V150Q163 212 100 212Q35 212 35 150Z" fill="var(--surface-row)" stroke="var(--text-2)" strokeWidth="2" />
            <path d="M100 18V94M37 94H160" fill="none" stroke="var(--text-2)" strokeWidth="2" />
            <rect x="92" y="39" width="16" height="32" rx="8" fill="var(--text-3)" />
            {mouseButton('MOUSE_FORWARD', 84, 'Mouse Forward (button 5)')}
            {mouseButton('MOUSE_BACK', 132, 'Mouse Back (button 4)')}
          </svg>
          <div className={styles.chips}>
            {['MOUSE_BACK', 'MOUSE_FORWARD'].map(command => <button type="button" key={command} className={styles.chip} aria-pressed={selected.includes(command)} onClick={() => onToggle(command)}>
              <InputGlyph command={command} size={28} title={command === 'MOUSE_BACK' ? 'Mouse Back (button 4)' : 'Mouse Forward (button 5)'} />
            </button>)}
          </div>
        </div>
        <div className={styles.chips} role="group" aria-label="Buttons to hold together">
          {definitions.filter(button => selectable(button.command) || selected.includes(button.command)).map(button => <button type="button" key={button.command} className={styles.chip}
            aria-pressed={selected.includes(button.command)} onClick={() => onToggle(button.command)}>
            <InputGlyph command={button.command} family={family} size={18} />{controllerButtonLabel(button, family)}
          </button>)}
        </div>
      </section>
    </div>
  </div>
}
