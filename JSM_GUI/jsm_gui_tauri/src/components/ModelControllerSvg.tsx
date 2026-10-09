import { createElement, useId, useMemo } from 'react'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerButtonGlyph, getPressedControllerCommandSet } from '../utils/controllerStatus'
import { controllerArtworkModel } from '../utils/controllerArtwork'
import models from './controllerModels.json'
import styles from './ModelControllerSvg.module.css'

type Props = {
  device: TelemetryDevice
  boundCommands?: Set<string>
  selectedCommand?: string | null
  bindingLabels?: Record<string, string | undefined>
  onSelectCommand?: (command: string) => void
  showRawTelemetry?: boolean
  /** 'always' (default) draws front and back; 'focus' draws the back only while
   *  an input that lives there is selected (console v2 Layout: "Back · right grip"). */
  backView?: 'always' | 'focus'
  /** Captions under each view in 'focus' mode. */
  frontCaption?: string
  backCaption?: string
}
type Control = { command: string; tag: string; attrs: Record<string, string | undefined> }
const clamp = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
const aliases = (command: string) => command === 'L3' ? ['L3', 'LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING', 'LTOUCH']
  : command === 'R3' ? ['R3', 'RUP', 'RDOWN', 'RLEFT', 'RRIGHT', 'RRING', 'RTOUCH']
  : command === 'ZL' ? ['ZL', 'ZLF'] : command === 'ZR' ? ['ZR', 'ZRF'] : [command]

/** Whether an input is drawn only on this model's back art (paddles, and the
 *  shoulders the front art leaves out). */
export function modelBackInput(device: Pick<TelemetryDevice, 'type' | 'vid' | 'pid'>, command: string | null | undefined) {
  const key = controllerArtworkModel(device)
  const model = key ? models[key] : undefined
  if (!model || !command) return false
  const front = new Set(model.controls.flatMap(control => aliases(control.command)))
  return model.backControls.some(control => aliases(control.command).includes(command)) && !front.has(command)
}

export function ModelControllerSvg({ device, boundCommands, selectedCommand, bindingLabels, onSelectCommand, showRawTelemetry, backView = 'always', frontCaption, backCaption }: Props) {
  const id = useId().replace(/:/g, '')
  const key = controllerArtworkModel(device)
  const model = key ? models[key] : undefined
  // Static shells keep the same markup across telemetry frames.
  const artwork = useMemo(() => {
    const scope = (markup: string) => markup.replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
    return model ? { front: { __html: scope(model.front) }, back: { __html: scope(model.back) } } : undefined
  }, [id, model])
  if (!key || !model || !artwork) return null
  const pressed = getPressedControllerCommandSet(device)
  const activeCommand = (command: string) => aliases(command).find(c => c === selectedCommand)
    ?? aliases(command).find(c => boundCommands?.has(c)) ?? command
  const highlight = (command: string) => aliases(command).some(c => selectedCommand === c || boundCommands?.has(c))
  const triggerValue = (command: string) => command === 'ZL' ? device.status?.triggers.left : command === 'ZR' ? device.status?.triggers.right : undefined
  const control = ({ command, tag, attrs }: Control, index: number) => {
    const value = triggerValue(command)
    const held = pressed.has(command) || (value ?? 0) > 0.01
    return <g key={`${command}-${index}`} data-command={command} data-active={held} data-value={value} className={styles.input}
      role={onSelectCommand ? "button" : undefined} tabIndex={onSelectCommand ? 0 : undefined} aria-label={bindingLabels?.[activeCommand(command)] ?? controllerButtonGlyph(device.type, command)}
      onClick={() => onSelectCommand?.(activeCommand(command))}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCommand?.(activeCommand(command)) } }}>
      <title>{`${controllerButtonGlyph(device.type, command)}${bindingLabels?.[activeCommand(command)] ? `: ${bindingLabels[activeCommand(command)]}` : ''}${showRawTelemetry && value !== undefined ? ` (${value.toFixed(3)})` : ''}`}</title>
      {createElement(tag, { ...attrs, className: styles.hit, style: {
        fillOpacity: value !== undefined ? Math.max(0, Math.min(1, value)) * .65 : held ? .5 : highlight(command) ? .18 : 0,
        strokeOpacity: held || highlight(command) ? 1 : 0,
      } })}
    </g>
  }
  const focusView = backView === 'focus'
  const views = focusView && !modelBackInput(device, selectedCommand) ? ['front'] as const : ['front', 'back'] as const
  return <div className={styles.views} data-controller-model={key} data-back-view={focusView ? 'focus' : undefined}>
    {views.map(view => <div key={view} className={styles.view} data-view={view}>
      <svg viewBox="0 0 1117 750" role="img" aria-label={`${model.name} ${view}${view === 'back' ? ', mirrored' : ''}`}>
        <g className={styles.art} dangerouslySetInnerHTML={artwork[view]} />
        {(view === 'front' ? model.controls : model.backControls).map(control)}
        {view === 'front' && model.sticks.map(([cx, cy, r], index) => {
          const command = index ? 'R3' : 'L3'
          const stick = index ? device.status?.rightStick : device.status?.leftStick
          const x = clamp(stick?.x ?? 0), y = clamp(stick?.y ?? 0)
          return <g key={command}>
            {control({ command, tag: 'circle', attrs: { cx: String(cx), cy: String(cy), r: String(r) } }, 100 + index)}
            <circle className={styles.stickDot} data-stick={command} cx={cx + x * r * .55} cy={cy - y * r * .55} r={r * .18} />
          </g>
        })}
        {view === 'front' && key.startsWith('dual') && device.status?.leftPad?.touched && <circle className={styles.stickDot}
          cx={558.5 + clamp(device.status.leftPad.x) * 140} cy={(key === 'dualsense-edge' ? 118 : 180) - clamp(device.status.leftPad.y) * 60} r="10" />}
      </svg>
      <span className={styles.caption}>{view === 'front' ? (focusView ? frontCaption ?? 'Front' : 'Front') : (focusView ? backCaption ?? 'Back' : 'Back · mirrored')}</span>
    </div>)}
  </div>
}
