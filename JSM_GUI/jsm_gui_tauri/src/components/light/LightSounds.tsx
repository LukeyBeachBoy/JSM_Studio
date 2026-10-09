import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react'
import { SubPage, OpenRow, ValueRow, SegmentedRow } from '../ui/console'
import { usePreferences } from '../../platform/preferenceStore'
import { desktopBridge } from '../../platform/desktopBridge'
import type { TelemetryDevice } from '../../hooks/useTelemetry'
import { getKeymapValue, removeKeymapEntry, updateKeymapEntry } from '../../utils/keymap'
import { layerHue, layerSlotOf, readLayers, writeLayers, type ConfigLayer } from '../../utils/layers'
import { LIGHT_BAR_PRESETS, hsvFromHex } from '../keymap/lightBarColor'
import { LightBarPopover } from '../keymap/LightBarPopover'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { ControllerMarks } from '../modes/ControllerMarks'
import { SoundLibraryPage } from '../sounds/SoundLibraryPage'
import { Icon } from '../icons/Icon'
import styles from './Light.module.css'

// Controller light & sounds (console v2, ControllerLight.dc.html): this
// configuration's light -- previewed live on the controller as ◂ ▸ walk the
// colours (D14), kept with A -- its brightness, a light per mode, the power-on
// jingle and your sounds (Settings ▸ Controller has the defaults), and the
// trackpads' rotation for this configuration. Opened from Layout's quick menu
// (jsm:open-light-sounds) and from Settings ▸ Controller.

const PAD_CANT = { left: 10.7, right: -10.5 } as const
const colourName = (hex: string | null | undefined) => {
  if (!hex) return 'Default'
  const preset = LIGHT_BAR_PRESETS.find(item => item.hex.toLowerCase() === hex.toLowerCase())
  return preset?.name ?? hex.toUpperCase()
}
const hexOf = (raw?: string) => { const match = raw?.match(/^x([0-9a-f]{6})$/i); return match ? `#${match[1].toLowerCase()}` : null }

type Props = {
  open: boolean
  onClose: () => void
  /** Default, imports resolved: the configuration's own light and rotation. */
  text: string
  /** Writes Default. */
  onChange: Dispatch<SetStateAction<string>>
  /** Modes, for "Light while a mode is on" (written into each mode). */
  layers: ConfigLayer[]
  onChangeDocument: (next: string | ((previous: string) => string)) => void
  device?: TelemetryDevice
  /** Settings ▸ Controller, where the defaults live. */
  onOpenSettings: () => void
  fromSettings?: boolean
}

export function LightSounds({ open, ...props }: Props) {
  return open ? <LightSoundsBody {...props} /> : null
}

function LightSoundsBody({ onClose, text, onChange, layers, onChangeDocument, device, onOpenSettings, fromSettings }: Omit<Props, 'open'>) {
  const { runtime } = usePreferences()
  const defaultColor = runtime?.ledColor ?? '#ffffff'
  const saved = hexOf(getKeymapValue(text, 'LIGHT_BAR'))
  const level = getKeymapValue(text, 'LED_BRIGHTNESS')
  const brightness = level === undefined ? runtime?.ledBrightness ?? 100 : Number(level)
  const swatches = useMemo(() => [...LIGHT_BAR_PRESETS.map(preset => preset.hex), 'custom', 'default'], [])
  const startIndex = saved ? Math.max(0, swatches.indexOf(saved)) : swatches.length - 1
  const [index, setIndex] = useState(saved && !LIGHT_BAR_PRESETS.some(p => p.hex === saved) ? swatches.indexOf('custom') : startIndex)
  const [custom, setCustom] = useState(saved && !LIGHT_BAR_PRESETS.some(p => p.hex === saved) ? saved : '#af52de')
  const [previewing, setPreviewing] = useState<string | null>(null)
  const [popover, setPopover] = useState(false)
  const [library, setLibrary] = useState(false)
  const strip = useRef<HTMLDivElement>(null)
  const shown = previewing ?? saved ?? defaultColor
  const valueAt = (i: number) => swatches[i] === 'custom' ? custom : swatches[i] === 'default' ? null : swatches[i]

  // D14: the controller shows the colour being looked at, and goes back to the
  // configuration's own light when the preview ends.
  const ownLight = useRef(saved ?? defaultColor)
  ownLight.current = saved ?? defaultColor
  const send = (hex: string) => { void desktopBridge.runCalibrationCommand(`LIGHT_BAR = x${hex.replace('#', '').toUpperCase()}`).catch(() => {}) }
  const preview = (hex: string | null) => { const colour = hex ?? defaultColor; setPreviewing(colour); send(colour) }
  const endPreview = () => { if (previewing) { setPreviewing(null); send(ownLight.current) } }
  useEffect(() => () => { send(ownLight.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const keep = (hex: string | null) => {
    onChange(previous => hex === null ? removeKeymapEntry(previous, 'LIGHT_BAR') : updateKeymapEntry(previous, 'LIGHT_BAR', [`x${hex.slice(1).toUpperCase()}`]))
    setPreviewing(null)
    send(hex ?? defaultColor)
  }
  const step = (by: 1 | -1) => { const next = (index + by + swatches.length) % swatches.length; setIndex(next); preview(valueAt(next)) }
  const onStripKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); strip.current?.closest('[data-subpage]')?.querySelector<HTMLElement>('[aria-label="Light & sounds"] [role="slider"]')?.focus({ preventScroll: true }) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (swatches[index] === 'custom') setPopover(true); else keep(valueAt(index)) }
  }
  useEffect(() => {
    const node = strip.current
    if (!node) return
    const onPad = (event: Event) => { if ((event as CustomEvent<PadEventDetail>).detail.button === 'Y') { event.preventDefault(); setIndex(swatches.length - 1); keep(null) } }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  })

  // Light while a mode is on: "Same" is no override.
  const modeLight = (layer: ConfigLayer) => hexOf(layer.overrides.LIGHT_BAR)
  const setModeLight = (layer: ConfigLayer, hex: string | null) => onChangeDocument(previous => writeLayers(previous, readLayers(previous).map(item => {
    if (item.id !== layer.id) return item
    const overrides = { ...item.overrides }
    if (hex) overrides.LIGHT_BAR = `x${hex.slice(1).toUpperCase()}`
    else delete overrides.LIGHT_BAR
    return { ...item, overrides }
  })))

  const left = getKeymapValue(text, 'LEFT_TOUCHPAD_ROTATION'), right = getKeymapValue(text, 'RIGHT_TOUCHPAD_ROTATION')
  const rotation = left === undefined && right === undefined ? 'default'
    : Number(left ?? 0) === 0 && Number(right ?? 0) === 0 ? 'mounted'
    : Math.abs(Number(left) - PAD_CANT.left) < .05 && Math.abs(Number(right) - PAD_CANT.right) < .05 ? 'level' : 'custom'
  const setRotation = (value: string) => onChange(previous => {
    if (value === 'default') return removeKeymapEntry(removeKeymapEntry(previous, 'LEFT_TOUCHPAD_ROTATION'), 'RIGHT_TOUCHPAD_ROTATION')
    const [l, r] = value === 'level' ? [PAD_CANT.left, PAD_CANT.right] : value === 'mounted' ? [0, 0] : [Number(left ?? runtime?.leftPadRotation ?? 0), Number(right ?? runtime?.rightPadRotation ?? 0)]
    return updateKeymapEntry(updateKeymapEntry(previous, 'LEFT_TOUCHPAD_ROTATION', [l]), 'RIGHT_TOUCHPAD_ROTATION', [r])
  })
  const hue = hsvFromHex(shown).h
  const jingle = runtime?.bootSoundLevel
  return (
    <SubPage open onClose={() => { endPreview(); onClose() }} trail={fromSettings ? ['Settings', 'Controller'] : ['Layout']} title="Controller light & sounds" badge={null} where={`${fromSettings ? 'Settings · Controller' : 'Layout'} · Light & sounds`} backLabel={fromSettings ? 'Back to Settings' : 'Back to Layout'}>
      <div className={styles.page}>
        <section className={styles.well} aria-label="Light · this configuration">
          <header className={styles.wellHead}><span className={styles.eyebrow}>Light · this configuration</span>{previewing && <span className={styles.live}>● Previewing on your controller</span>}</header>
          <div className={styles.art}>
            <span className={styles.callout} style={{ color: shown }}>Light · {colourName(previewing ?? saved ?? null) === 'Default' ? `Default (${colourName(defaultColor)})` : colourName(previewing ?? saved)} · {brightness}%</span>
            <ControllerMarks device={device} width={430} marks={[{ command: 'HOME', color: shown, ring: true }]} label={`Controller light ${colourName(shown)}`} />
          </div>
          <div ref={strip} className={styles.colourPanel} tabIndex={0} role="listbox" aria-label="Light bar color" data-arrows="horizontal" data-autofocus=""
            aria-activedescendant={`light-swatch-${index}`}
            data-hints={`MOVE:Preview;A:${swatches[index] === 'custom' ? 'Custom colour' : 'Keep colour'};Y:Back to Default`}
            data-caption="Controller light colour · Default follows Settings ▸ Controller."
            onKeyDown={onStripKey} onBlur={endPreview}>
            <svg className={styles.wheel} viewBox="0 0 200 200" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => {
                const a0 = (i * 30 - 90) * Math.PI / 180, a1 = ((i + 1) * 30 - 90) * Math.PI / 180
                const p = (a: number, r: number) => `${100 + r * Math.cos(a)} ${100 + r * Math.sin(a)}`
                return <path key={i} d={`M${p(a0, 96)} A96 96 0 0 1 ${p(a1, 96)} L${p(a1, 74)} A74 74 0 0 0 ${p(a0, 74)} Z`} fill={`hsl(${i * 30} 85% 58%)`} />
              })}
              <circle cx="100" cy="100" r="62" fill={shown} />
              <circle cx={100 + 85 * Math.cos((hue - 90) * Math.PI / 180)} cy={100 + 85 * Math.sin((hue - 90) * Math.PI / 180)} r="10" fill="none" stroke="var(--art-line)" strokeWidth="4" />
            </svg>
            <div className={styles.colourText}>
              <header><b>Colour</b> <span>{colourName(valueAt(index)) === 'Default' ? `Default (${colourName(defaultColor)})` : colourName(valueAt(index))}</span><small>Saved: {saved ? colourName(saved) : `Default (${colourName(defaultColor)})`}</small></header>
              <div className={styles.swatches}>
                {swatches.map((swatch, i) => <span key={swatch} id={`light-swatch-${i}`} role="option" aria-selected={i === index}
                  aria-label={swatch === 'custom' ? 'Custom' : swatch === 'default' ? 'Default' : colourName(swatch)}
                  className={swatch === 'default' ? styles.defaultPill : styles.swatch} data-current={i === index ? 'true' : undefined}
                  data-saved={(swatch === 'default' ? !saved : swatch === 'custom' ? !!saved && !LIGHT_BAR_PRESETS.some(p => p.hex === saved) : saved === swatch) ? 'true' : undefined}
                  style={swatch === 'custom' ? { background: custom } : swatch === 'default' ? undefined : { background: swatch }}
                  onClick={() => { setIndex(i); if (swatch === 'custom') setPopover(true); else keep(valueAt(i)) }}>
                  {swatch === 'default' ? 'Default' : swatch === 'custom' ? <Icon name="appearance" size={16} /> : null}
                </span>)}
              </div>
              <p className={styles.caption}>Default follows Settings ▸ Controller.</p>
            </div>
          </div>
          {popover && <LightBarPopover anchor={strip.current} color={custom} onChange={hex => { setCustom(hex); preview(hex) }} onClose={() => { setPopover(false); keep(custom); strip.current?.focus() }} />}
        </section>

        <section className={styles.side} aria-label="Light & sounds">
          <header className={styles.sideHead}><p>For this configuration. Anything on Default follows Settings.</p></header>
          <ValueRow label="Brightness" hero setting="LED_BRIGHTNESS" value={brightness} min={0} max={100} step={5} format={value => `${value}%`}
            caption="Default comes from Settings ▸ Controller" onChange={value => onChange(previous => updateKeymapEntry(previous, 'LED_BRIGHTNESS', [value]))}
            onReset={() => onChange(previous => removeKeymapEntry(previous, 'LED_BRIGHTNESS'))} />
          <div className={styles.modes} role="group" aria-label="Light while a layer is on">
            <b>Light while a layer is on</b><small>Say which layer you’re in, e.g. red on the map</small>
            <div className={styles.modeChips}>
              {layers.length ? layers.map((layer, position) => <ModeChip key={layer.id} layer={layer} hue={layerHue(layerSlotOf(position))} value={modeLight(layer)}
                onPreview={preview} onEnd={endPreview} onChange={hex => setModeLight(layer, hex)} />)
                : <span className={styles.caption}>No layers yet. Add one on the Layers tab.</span>}
            </div>
          </div>
          <span className={styles.eyebrow}>Sounds</span>
          <OpenRow label="Power-on jingle" hint="The controller’s own start-up tune" value={jingle === 0 ? 'Silenced · Settings ▸ Controller' : 'Plays · Settings ▸ Controller'} onOpen={onOpenSettings} hints="A:Open Settings" />
          <OpenRow label="Your sounds" hint="Tunes from MP3 or MIDI, played from any button" value="Sound library" onOpen={() => setLibrary(true)} hints="A:Open" />
          <span className={styles.eyebrow}>Trackpads</span>
          <SegmentedRow label="Trackpad rotation" hint="Level with the controller · from Settings" value={rotation}
            options={[{ value: 'default', label: 'Default', caption: `As Settings ▸ Controller: left ${runtime?.leftPadRotation ?? 0}°, right ${runtime?.rightPadRotation ?? 0}°` },
              { value: 'mounted', label: 'As mounted', caption: 'The pads read as they sit, turned out with the grips' },
              { value: 'level', label: 'Level', caption: 'Turns them 10.7° and −10.5°, so a swipe up reads as up' },
              { value: 'custom', label: 'Custom', caption: 'Each pad its own angle, below' }]}
            onChange={setRotation} onReset={() => setRotation('default')} />
          {rotation !== 'default' && <>
            <ValueRow label="Left pad" setting="LEFT_TOUCHPAD_ROTATION" hint="Degrees the left pad's reading is turned; also turns its zones and touch stick" value={Number(left ?? 0)} min={-180} max={180} step={0.5} fineStep={0.1} format={value => `${value}°`}
              onChange={value => onChange(previous => updateKeymapEntry(previous, 'LEFT_TOUCHPAD_ROTATION', [value]))} onReset={() => setRotation('default')} />
            <ValueRow label="Right pad" setting="RIGHT_TOUCHPAD_ROTATION" hint="Degrees the right pad's reading is turned; also turns its zones and mouse" value={Number(right ?? 0)} min={-180} max={180} step={0.5} fineStep={0.1} format={value => `${value}°`}
              onChange={value => onChange(previous => updateKeymapEntry(previous, 'RIGHT_TOUCHPAD_ROTATION', [value]))} onReset={() => setRotation('default')} />
          </>}
        </section>
      </div>
      {library && <SoundLibraryPage onClose={() => setLibrary(false)} trail={[fromSettings ? 'Settings' : 'Layout', 'Light & sounds']} onOpenSettings={() => { setLibrary(false); onOpenSettings() }} />}
    </SubPage>
  )
}

/** One mode's light: ◂ ▸ walks Same and the colours, previewing each; A keeps it. */
function ModeChip({ layer, hue, value, onPreview, onEnd, onChange }: { layer: ConfigLayer; hue: string; value: string | null; onPreview: (hex: string | null) => void; onEnd: () => void; onChange: (hex: string | null) => void }) {
  const options = [null, ...LIGHT_BAR_PRESETS.map(preset => preset.hex)]
  const [index, setIndex] = useState(Math.max(0, options.indexOf(value)))
  const looking = options[index]
  const step = (by: 1 | -1) => { const next = (index + by + options.length) % options.length; setIndex(next); if (options[next]) onPreview(options[next]); else onEnd() }
  return <div className={styles.modeChip} tabIndex={0} role="slider" aria-label={`${layer.name} light`} aria-valuetext={colourName(looking) === 'Default' ? 'Same' : colourName(looking)} data-arrows="horizontal"
    style={{ '--mode-hue': hue } as CSSProperties} data-changed={looking !== value ? 'true' : undefined}
    data-hints={`MOVE:Preview;A:Keep;${value ? 'Y:Same as the configuration' : ''}`}
    data-caption={`${layer.name} · the light while ${layer.name} is on${value ? ` · ${colourName(value)}` : ' · same as the configuration'}`}
    onBlur={() => { setIndex(Math.max(0, options.indexOf(value))); onEnd() }}
    onClick={() => { const next = (index + 1) % options.length; setIndex(next); onChange(options[next]); onEnd() }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); step(event.key === 'ArrowRight' ? 1 : -1) }
      else if (event.key === 'Enter') { event.preventDefault(); onChange(looking); onEnd() }
      else if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setIndex(0); onChange(null); onEnd() }
    }} data-pad-keys="Y">
    <span className={styles.modeSwatch} aria-hidden="true" />{layer.name} · {looking ? <><span className={styles.dot} style={{ background: looking }} aria-hidden="true" />{colourName(looking)}</> : 'Same'}
  </div>
}
