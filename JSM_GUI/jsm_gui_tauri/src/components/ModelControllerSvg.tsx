import { createElement, useId, useMemo, type CSSProperties } from 'react'
import { useLayerPresentation } from './useLayerPresentation'
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
  const { selected: layer, color: layerColor, overrides, provenance } = useLayerPresentation()
  const id = useId().replace(/:/g, '')
  const key = controllerArtworkModel(device)
  const model = key ? models[key] : undefined
  // Static shells keep the same markup across telemetry frames.
  const artwork = useMemo(() => {
    const scope = (markup: string) => (key === 'azeron-cyborg' ? markup.replace(/<text data-button-label="JOY21"[^>]*>21<\/text>/, '') : markup).replace(/id="([^"]+)"/g, `id="${id}-$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}-$1)`)
    return model ? { front: { __html: scope(model.front) }, back: { __html: scope(model.back) } } : undefined
  }, [id, model, key])
  if (!key || !model || !artwork) return null
  const pressed = getPressedControllerCommandSet(device)
  const inputAliases = (command: string) => key === 'azeron-cyborg' && command === 'JOY20' ? ['JOY20', 'UP', 'DOWN', 'LEFT', 'RIGHT'] : key === 'azeron-cyborg' && command === 'LUP' ? ['LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING'] : aliases(command)
  const activeCommand = (command: string) => inputAliases(command).find(c => c === selectedCommand)
    ?? inputAliases(command).find(c => boundCommands?.has(c)) ?? command
  const highlight = (command: string) => inputAliases(command).some(c => selectedCommand === c || boundCommands?.has(c))
  const triggerValue = (command: string) => command === 'ZL' ? device.status?.triggers.left : command === 'ZR' ? device.status?.triggers.right : undefined
  const inputName = (command: string) => key === 'azeron-cyborg'
    ? ({ JOY20: 'Five-way nub · Up, Down, Left, Right and click 20', JOY21: '21 · Stick click', JOY25: '25 · Upper thumb button', JOY22: '22 · Lower thumb button' } as Record<string, string>)[command] ?? controllerButtonGlyph(device.type, command)
    : controllerButtonGlyph(device.type, command)
  const control = ({ command, tag, attrs }: Control, index: number) => {
    const value = triggerValue(command)
    const held = inputAliases(command).some(input => pressed.has(input)) || (value ?? 0) > 0.01
    const fiveWayNub = key === 'azeron-cyborg' && ['UP', 'DOWN', 'LEFT', 'RIGHT', 'JOY20'].includes(command)
    const changed = inputAliases(command).some(overrides)
    const source = provenance?.group(inputAliases(command))
    const color = source?.color ?? (layer ? changed ? layerColor : 'var(--text-3)' : undefined)
    const sourced = source && source.kind !== 'unset'
    return <g key={`${command}-${index}`} data-command={command} data-active={held} data-value={value} className={styles.input}
      data-layer-override={layer && changed ? 'true' : undefined} data-binding-source={source?.kind} style={color ? { '--input-color': color, '--input-dash': source?.kind === 'base' ? '5 3' : source?.kind === 'mixed' ? '2 3' : 'none' } as CSSProperties : undefined}
      role={onSelectCommand ? "button" : undefined} tabIndex={onSelectCommand ? 0 : undefined} aria-label={bindingLabels?.[activeCommand(command)] ?? inputName(command)}
      onClick={() => onSelectCommand?.(activeCommand(command))}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCommand?.(activeCommand(command)) } }}>
      <title>{`${inputName(command)}${bindingLabels?.[activeCommand(command)] ? `: ${bindingLabels[activeCommand(command)]}` : ''}${source && source.kind !== 'unset' ? ` · ${source.label}` : ''}${showRawTelemetry && value !== undefined ? ` (${value.toFixed(3)})` : ''}`}</title>
      {createElement(tag, { ...attrs, className: styles.hit, style: {
        fillOpacity: value !== undefined ? Math.max(0, Math.min(1, value)) * .65 : held ? .5 : sourced || changed || highlight(command) ? .18 : 0,
        strokeOpacity: fiveWayNub ? held || sourced || changed || inputAliases(command).includes(selectedCommand ?? '') ? .75 : 0 : held || sourced || changed || highlight(command) ? 1 : 0,
      } })}
    </g>
  }
  const focusView = backView === 'focus'
  const views = !model.back || focusView && !modelBackInput(device, selectedCommand) ? ['front'] as const : ['front', 'back'] as const
  return <div className={styles.views} data-controller-model={key} data-back-view={focusView ? 'focus' : undefined} data-single-view={!model.back || undefined}>
    {views.map(view => <div key={view} className={styles.view} data-view={view}>
      <svg viewBox={'viewBox' in model ? String(model.viewBox) : '0 0 1117 750'} role="img" aria-label={`${model.name} ${view}${view === 'back' ? ', mirrored' : ''}`}>
        <g className={styles.art} dangerouslySetInnerHTML={artwork[view]} />
        {(view === 'front' ? model.controls : model.backControls).map(control)}
        {view === 'front' && model.sticks.map(([cx, cy, r], index) => {
          const command = key === 'azeron-cyborg' ? 'LUP' : index ? 'R3' : 'L3'
          const stick = index ? device.status?.rightStick : device.status?.leftStick
          const x = clamp(stick?.x ?? 0), y = clamp(stick?.y ?? 0)
          const adjusted = (index ? device.status?.adjustedRightStick : device.status?.adjustedLeftStick) ?? stick
          const ax = clamp(adjusted?.x ?? 0), ay = clamp(adjusted?.y ?? 0)
          const cyborg = key === 'azeron-cyborg', travel = r * (cyborg ? .8 : .55)
          return <g key={command}>
            {cyborg ? control({ command, tag: 'path', attrs: { d: `M${cx-r} ${cy}a${r} ${r} 0 1 0 ${r*2} 0a${r} ${r} 0 1 0 ${-r*2} 0 M${cx-r*.7} ${cy}a${r*.7} ${r*.7} 0 1 1 ${r*1.4} 0a${r*.7} ${r*.7} 0 1 1 ${-r*1.4} 0`, fillRule: 'evenodd' } }, 100 + index) : control({ command, tag: 'circle', attrs: { cx: String(cx), cy: String(cy), r: String(r) } }, 100 + index)}
            {cyborg && (Math.hypot(x, y) > .02 || Math.hypot(ax, ay) > .02) && <g className={styles.vectors} aria-hidden="true" pointerEvents="none">
              <path className={styles.stickAxes} d={`M${cx - travel} ${cy}H${cx + travel} M${cx} ${cy - travel}V${cy + travel}`} />
              <line className={styles.rawVector} data-stick-vector="physical" x1={cx} y1={cy} x2={cx + x * travel} y2={cy - y * travel} />
              <circle className={styles.rawDot} cx={cx + x * travel} cy={cy - y * travel} r={r * .09} />
              <line className={styles.adjustedVector} data-stick-vector="adjusted" x1={cx} y1={cy} x2={cx + ax * travel} y2={cy - ay * travel} />
            </g>}
            <circle pointerEvents="none" className={cyborg ? styles.adjustedDot : styles.stickDot} data-stick={command} cx={cx + (cyborg ? ax : x) * travel} cy={cy - (cyborg ? ay : y) * travel} r={cyborg && Math.hypot(ax, ay) <= .02 ? 0 : r * .14} />
            {cyborg && <text data-button-label="JOY21" x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className={styles.stickNumber} pointerEvents="none">21</text>}
          </g>
        })}
        {view === 'front' && key.startsWith('dual') && device.status?.leftPad?.touched && <circle className={styles.stickDot}
          cx={558.5 + clamp(device.status.leftPad.x) * 140} cy={(key === 'dualsense-edge' ? 118 : 180) - clamp(device.status.leftPad.y) * 60} r="10" />}
      </svg>
      <span className={styles.caption}>{view === 'front' ? (focusView ? frontCaption ?? 'Front' : 'Front') : (focusView ? backCaption ?? 'Back' : 'Back · mirrored')}</span>
    </div>)}
  </div>
}
