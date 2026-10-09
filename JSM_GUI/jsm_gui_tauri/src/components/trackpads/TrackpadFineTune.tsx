import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ButtonDefinition } from '../../keymap/schema'
import { SubPage, FineTune, AdvancedParts, ModeCards, OpenRow, SegmentedRow, ValueRow, stepGroup, type FineTuneGroup } from '../ui/console'
import { SummaryRow } from '../ui/SummaryRow'
import { MenuPreview } from '../keymap/MenuPreview'
import { ScreenAreaPreview } from '../keymap/ScreenAreaPreview'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { getKeymapValue, updateKeymapEntry } from '../../utils/keymap'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { previewHaptic } from '../../utils/hapticPreview'
import { hasSeparatePadFeedback, padFeedbackPolicyChanges, padFeedbackValue } from '../../utils/padFeedback'
import { SMOOTHING_PRESETS, smoothingPreset, strengthWord } from '../../utils/mouseFeel'
import { TOUCHPAD_DUAL_STAGE_OPTIONS, TOUCH_STICK_AXIS_VALUES } from '../../utils/touchpadConfig'
import { MOUSE_AREA_FIT_OPTIONS, describeMouseArea } from '../../utils/mouseArea'
import { accelSensitivityAt, normalizeAccelCurveLink, normalizeAccelCurveType, TOUCHPAD_ACCEL_DEFAULTS, type AccelCurveParams } from '../../utils/accelCurve'
import { isSet, Note, readNumber, readWord, SubHead, VisualPanel, writeChoice, writeKey, writeKeys } from '../sticks/shared'
import { FEEL_STRENGTHS, TOUCHPAD_ACCEL_PRESETS, near } from '../sticks/presets'
import { MoreModeArt, StickCardArt } from '../sticks/stickModes'
import { SHAPE_NAMES, padCardOf, padKey, padPrefix, type PadSide } from './padModes'
import type { PadConfig, TrackpadsPageProps } from './TrackpadsPage'
import p4 from '../sticks/P4.module.css'
import styles from './Trackpads.module.css'

// Trackpads ▸ Fine-tune (console v2: TrackpadsFineTune, TrackpadsGlideClick,
// TrackpadsFineTuneMore, TrackpadsTouchClick, TrackpadsTouchStick,
// TrackpadsClick, TrackpadsFeel). The groups are Speed & curve, Glide, Zones
// (with Layout, Touch and click and Touch stick parts on LB / RB), Click,
// Mouse area, Feel, and More (Touch, Click, While holding…, directions).
// Speed, glide, click and the shared feel are one setting for both pads
// (TOUCHPAD_*): the rail note says so.

type Props = {
  page: TrackpadsPageProps
  pad: PadConfig
  name: string
  group: string
  onGroup: (group: string) => void
  onClose: () => void
  onDirections: () => void
  onHolding: () => void
  onOthers: () => void
  selected: ButtonDefinition | null
  stepRegion: () => void
}

const tryIt = { label: 'Try it', run: () => window.dispatchEvent(new Event('jsm:start-test')) }
const PARTS = [{ id: 'layout', label: 'Layout' }, { id: 'touch', label: 'Touch and click' }, { id: 'stick', label: 'Touch stick' }] as const
type PartId = typeof PARTS[number]['id']

const EFFECT_NAMES: Record<string, string> = { OFF: 'Off', TICK: 'Tick', CLICK: 'Click', TONE: 'Tone', RUMBLE: 'Rumble', SWEEP: 'Sweep', PULSE: 'Pulse', TAP: 'Tap' }

export function TrackpadFineTune(props: Props) {
  const { page, pad, name, onGroup, onClose } = props
  const [groupId, partFromRequest] = props.group.split(':')
  const [part, setPart] = useState<PartId>((partFromRequest as PartId) || 'layout')
  const [advanced, setAdvanced] = useState<string | null>(null)
  const text = page.readText
  const setText = page.setText
  const side = pad.side
  const P = padPrefix(side)
  const card = padCardOf(text, side)
  const isMouse = card === 'MOUSE'
  // A pad of zones has Layout and Touch and click; a touch stick has Touch and click and the stick.
  const zoneParts = PARTS.filter(item => card === 'TOUCH_STICK' ? item.id !== 'layout' : item.id !== 'stick')
  const zonePart: PartId = zoneParts.some(item => item.id === part) ? part : zoneParts[0].id
  const live = pad.live?.touched ? { x: pad.live.x, y: pad.live.y } : null

  // ---- Speed & curve
  const sens = readNumber(text, `${P}TOUCHPAD_SENS`, 1)
  const sensY = readNumber(text, `${P}TOUCHPAD_SENS`, sens, 1)
  const accel = page.accel?.values
  const link = normalizeAccelCurveLink(page.accel?.link)
  const minGain = accel?.minGain ?? TOUCHPAD_ACCEL_DEFAULTS.minGain
  const maxGain = accel?.maxGain ?? TOUCHPAD_ACCEL_DEFAULTS.maxGain
  const curveType = normalizeAccelCurveType(accel?.curve)
  const accelPreset = link === 'TOUCHPAD_USES_GYRO' ? 'gyro' : TOUCHPAD_ACCEL_PRESETS.find(item => (item.value === 'off' ? near(minGain, 1) && near(maxGain, 1) : item.curve === curveType && near(item.minGain, minGain) && near(item.maxGain, maxGain)))?.value ?? 'custom'
  const writeSens = (x: number, y?: number) => writeKey(setText, `${P}TOUCHPAD_SENS`, y === undefined || near(x, y) ? x : [x, y])
  const params = (preset?: typeof TOUCHPAD_ACCEL_PRESETS[number]): AccelCurveParams => ({
    curveType: preset?.curve ?? curveType, minSens: preset?.minGain ?? minGain, maxSens: preset?.maxGain ?? maxGain,
    minThreshold: preset?.minSpeed ?? accel?.minThreshold ?? TOUCHPAD_ACCEL_DEFAULTS.minThreshold, maxThreshold: preset?.maxSpeed ?? accel?.maxThreshold ?? TOUCHPAD_ACCEL_DEFAULTS.maxThreshold,
    naturalVHalf: accel?.naturalVHalf ?? TOUCHPAD_ACCEL_DEFAULTS.naturalVHalf, powerVRef: accel?.powerVRef ?? TOUCHPAD_ACCEL_DEFAULTS.powerVRef, powerExponent: accel?.powerExponent ?? TOUCHPAD_ACCEL_DEFAULTS.powerExponent,
    sigmoidMid: accel?.sigmoidMid ?? TOUCHPAD_ACCEL_DEFAULTS.sigmoidMid, sigmoidWidth: accel?.sigmoidWidth ?? TOUCHPAD_ACCEL_DEFAULTS.sigmoidWidth, jumpTau: accel?.jumpTau ?? TOUCHPAD_ACCEL_DEFAULTS.jumpTau,
  })
  const movement = readNumber(text, 'TOUCHPAD_MOVEMENT_THRESHOLD', 0)
  const speedGroup: FineTuneGroup = {
    id: 'speed', label: 'Speed & curve', title: 'Speed & curve', description: 'How far the cursor goes for a swipe, and whether fast swipes go further.',
    status: !isMouse ? 'Used when this pad is a mouse' : `${isSet(text, `${P}TOUCHPAD_SENS`) ? `${sens.toFixed(2)}×` : 'Default speed'} · ${accelPreset === 'off' ? 'no speed-up' : accelPreset === 'gyro' ? 'same curve as gyro' : `${accelPreset} speed-up`}`,
    changed: isSet(text, `${P}TOUCHPAD_SENS`, 'TOUCHPAD_ACCEL_MIN_GAIN', 'TOUCHPAD_ACCEL_MAX_GAIN', 'TOUCHPAD_ACCEL_CURVE', 'ACCEL_CURVE_LINK', 'TOUCHPAD_MOVEMENT_THRESHOLD', 'TOUCHPAD_ACCELERATION'),
    content: <>
      {!isMouse && <Note>{name} isn’t set to Mouse, so these only apply once it is.</Note>}
      <ValueRow hero label="Sensitivity" setting={`${P}TOUCHPAD_SENS`} value={sens} min={0} max={10} step={0.05} fineStep={0.01} format={value => `${value.toFixed(2)}×`}
        caption="Up and down follow this; Advanced can set them apart." onX={tryIt} onChange={value => writeSens(value, near(sens, sensY) ? undefined : sensY)} onReset={() => writeKey(setText, `${P}TOUCHPAD_SENS`, null)} />
      <SegmentedRow label="Speed up fast swipes" hint="Slow swipes stay precise; quick flicks cross the screen." setting="TOUCHPAD_ACCEL_MAX_GAIN" value={accelPreset} onX={tryIt}
        options={[...TOUCHPAD_ACCEL_PRESETS.map(item => ({ value: item.value, label: item.label, caption: item.caption })), { value: 'gyro', label: 'Same as gyro', caption: 'Same as gyro: borrows the gyro’s curve shape.' }, { value: 'custom', label: 'Custom', caption: 'Custom: your own curve, under Advanced.' }]}
        onChange={value => {
          const found = TOUCHPAD_ACCEL_PRESETS.find(item => item.value === value)
          if (value === 'gyro') writeKeys(setText, { ACCEL_CURVE_LINK: 'TOUCHPAD_USES_GYRO' })
          else if (found) writeChoice(setText, { ACCEL_CURVE_LINK: link === 'TOUCHPAD_USES_GYRO' ? null : page.accel?.link ?? null, TOUCHPAD_ACCEL_CURVE: found.curve === 'LINEAR' ? null : found.curve, TOUCHPAD_ACCEL_MIN_GAIN: found.minGain === 1 ? null : found.minGain, TOUCHPAD_ACCEL_MAX_GAIN: found.maxGain === 1 ? null : found.maxGain }, { TOUCHPAD_ACCEL_CURVE: 'LINEAR', TOUCHPAD_ACCEL_MIN_GAIN: 1, TOUCHPAD_ACCEL_MAX_GAIN: 1 })
          else setAdvanced('curve')
        }} />
      <ValueRow label="Hold still when resting" hint="Ignore a thumb creeping slower than this" setting="TOUCHPAD_MOVEMENT_THRESHOLD" value={movement} min={0} max={500} step={5} format={value => value === 0 ? 'Off' : `${value} px/s`}
        onChange={value => writeKey(setText, 'TOUCHPAD_MOVEMENT_THRESHOLD', value || null)} onReset={() => writeKey(setText, 'TOUCHPAD_MOVEMENT_THRESHOLD', null)} />
      <OpenRow label="Advanced" hint="Up and down speed, simple speed-up, curve type, speed range, start and top gain, curve shape, give gyro this curve" onOpen={() => setAdvanced('vertical')} />
    </>,
    visual: <AccelVisual speed={pad.speed ?? 0} current={params()} presets={TOUCHPAD_ACCEL_PRESETS.map(item => ({ label: item.label, params: params(item) }))} />,
  }

  // ---- Glide
  const decay = readNumber(text, 'TOUCHPAD_TRACKBALL_DECAY', 0)
  const minVelocity = readNumber(text, 'TOUCHPAD_TRACKBALL_MIN_VELOCITY', 200)
  const cutoff = readNumber(text, 'TOUCHPAD_MIN_CUTOFF', 6)
  const speedCoeff = readNumber(text, 'TOUCHPAD_SPEED_COEFF', 0.6)
  const dCutoff = readNumber(text, 'TOUCHPAD_D_CUTOFF', 15)
  const smoothing = smoothingPreset(cutoff, speedCoeff)
  const glideGroup: FineTuneGroup = {
    id: 'glide', label: 'Glide', title: 'Glide', description: 'Whether the cursor keeps going after a flick, and how steady a resting thumb is.',
    status: `${decay > 0 ? `Coasts · flicks over ${minVelocity} px/s` : 'Stops when you lift'} · ${smoothing === 'custom' ? 'custom smoothing' : `${SMOOTHING_PRESETS.find(item => item.id === smoothing)?.label ?? ''} smoothing`}`,
    changed: isSet(text, 'TOUCHPAD_TRACKBALL_DECAY', 'TOUCHPAD_TRACKBALL_MIN_VELOCITY', 'TOUCHPAD_MIN_CUTOFF', 'TOUCHPAD_SPEED_COEFF', 'TOUCHPAD_D_CUTOFF'),
    content: <>
      <ValueRow hero label="Keep moving after a flick" setting="TOUCHPAD_TRACKBALL_DECAY" value={decay} min={0} max={60} step={1} format={value => value === 0 ? 'Off' : `On · ${value}`}
        caption={decay === 0 ? 'Default. Off stops the cursor the moment you lift.' : 'Higher values end the coast sooner.'} onX={tryIt}
        onChange={value => writeKey(setText, 'TOUCHPAD_TRACKBALL_DECAY', value || null)} onReset={() => writeKey(setText, 'TOUCHPAD_TRACKBALL_DECAY', null)} />
      <ValueRow label="Only coast from flicks over" hint="Used once coasting is on" setting="TOUCHPAD_TRACKBALL_MIN_VELOCITY" value={minVelocity} min={0} max={2000} step={25} fineStep={1} format={value => `${value} px/s`}
        disabled={decay === 0 ? 'Turn on Keep moving after a flick first.' : undefined}
        onChange={value => writeKey(setText, 'TOUCHPAD_TRACKBALL_MIN_VELOCITY', value)} onReset={() => writeKey(setText, 'TOUCHPAD_TRACKBALL_MIN_VELOCITY', null)} />
      <SegmentedRow label="Steady a resting thumb" hint="Smooths slow movement; quick flicks escape it." setting="TOUCHPAD_MIN_CUTOFF" value={smoothing}
        options={[...SMOOTHING_PRESETS.map(item => ({ value: item.id, label: item.label })), { value: 'custom', label: 'Custom' }]}
        onChange={value => { const found = SMOOTHING_PRESETS.find(item => item.id === value); if (found) writeKeys(setText, { TOUCHPAD_MIN_CUTOFF: found.cutoff, TOUCHPAD_SPEED_COEFF: found.speed }) }}
        onReset={() => writeKeys(setText, { TOUCHPAD_MIN_CUTOFF: null, TOUCHPAD_SPEED_COEFF: null })} />
      <SubHead>{smoothing === 'custom' ? 'Custom, exactly' : `${SMOOTHING_PRESETS.find(item => item.id === smoothing)?.label}, exactly`}</SubHead>
      <ValueRow label="Smoothing cutoff" hint="Lower smooths resting and slow movement more" setting="TOUCHPAD_MIN_CUTOFF" value={cutoff} min={0} max={20} step={0.5} fineStep={0.1} format={value => `${value} Hz`}
        onChange={value => writeKey(setText, 'TOUCHPAD_MIN_CUTOFF', value)} onReset={() => writeKey(setText, 'TOUCHPAD_MIN_CUTOFF', null)} />
      <ValueRow label="How soon flicks escape" hint="Higher keeps quick flicks responsive" setting="TOUCHPAD_SPEED_COEFF" value={speedCoeff} min={0} max={5} step={0.05} fineStep={0.01}
        onChange={value => writeKey(setText, 'TOUCHPAD_SPEED_COEFF', value)} onReset={() => writeKey(setText, 'TOUCHPAD_SPEED_COEFF', null)} />
      <ValueRow label="Speed reading cutoff" hint="Steadies the speed estimate; higher reacts faster" setting="TOUCHPAD_D_CUTOFF" value={dCutoff} min={0.01} max={120} step={1} fineStep={0.1} format={value => `${value} Hz`}
        onChange={value => writeKey(setText, 'TOUCHPAD_D_CUTOFF', value)} onReset={() => writeKey(setText, 'TOUCHPAD_D_CUTOFF', null)} />
    </>,
    visual: <GlideVisual decay={decay} minVelocity={minVelocity} speed={pad.speed ?? 0} />,
  }

  // ---- Zones (parts)
  const shape = readWord(text, padKey.gridShape(side)) || 'RECTANGLE'
  const size = (getKeymapValue(text, padKey.gridSize(side)) ?? '2 1').trim().split(/\s+/).map(Number)
  const cols = size[0] || 2
  const rowsCount = size[1] || 1
  const deadzone = readNumber(text, padKey.gridDeadzone(side), 0)
  const rotationKey = side === 'single' ? null : `${P}TOUCHPAD_ROTATION`
  const rotation = rotationKey ? readNumber(text, rotationKey, 0) : 0
  const dualKey = `${P}TOUCHPAD_DUAL_STAGE_MODE`
  const dual = readWord(text, dualKey) || 'NO_SKIP'
  const skip = readNumber(text, 'TRIGGER_SKIP_DELAY', 150)
  const stickKey = `${P}TOUCH_STICK_MODE`
  const stickMode = readWord(text, stickKey)
  const zonesChanged = isSet(text, padKey.gridShape(side), padKey.gridSize(side), padKey.gridDeadzone(side), dualKey, stickKey, `${P}TOUCH_STICK_RADIUS`, `${P}TOUCH_DEADZONE_INNER`, `${P}TOUCH_RING_MODE`, `${P}TOUCH_STICK_AXIS`, ...(rotationKey ? [rotationKey] : []))
  const zoneCount = shape === 'FOUR_WAY' ? 4 : shape === 'EIGHT_WAY' ? 8 : cols * rowsCount
  const partStatus: Record<PartId, string> = {
    layout: `${SHAPE_NAMES[shape] ?? shape} · ${shape === 'RECTANGLE' ? `${cols} × ${rowsCount}` : `dead zone ${Math.round(deadzone * 100)}%`}`,
    touch: DUAL_CAPTIONS[dual] ?? TOUCHPAD_DUAL_STAGE_OPTIONS.find(option => option.value === dual)?.label ?? dual,
    stick: stickMode ? stickMode.replace(/_/g, ' ').toLowerCase() : 'Off · radius, ring, axis',
  }
  // Touch and click: how the pad's touch and click bindings share a press. Any mode with
  // those bindings uses it, so a mouse pad has it under Click and a pad of zones under Zones.
  const touchAndClick = (partHints?: string) => <>
        <ModeCards columns={4} value={dual} useLabel={() => 'Use this'} hints={partHints}
          options={TOUCHPAD_DUAL_STAGE_OPTIONS.map(option => ({ value: option.value, label: option.label, caption: DUAL_CAPTIONS[option.value], art: <DualStageArt mode={option.value} /> }))}
          onChange={value => writeKey(setText, dualKey, value === 'NO_SKIP' ? null : value)} />
        <Note>{DUAL_EXPLAIN[dual] ?? ''}</Note>
        <ValueRow label="Quick click window" hint="Shared with the triggers’ skip cards" setting="TRIGGER_SKIP_DELAY" value={skip} min={0} max={2000} step={10} fineStep={1} format={value => `${value} ms`} extraHints={partHints}
          onChange={value => writeKey(setText, 'TRIGGER_SKIP_DELAY', value)} onReset={() => writeKey(setText, 'TRIGGER_SKIP_DELAY', null)} />
  </>
  const zonesGroup: FineTuneGroup = {
    id: 'zones', label: 'Zones', title: 'Zones', description: `How the ${name.toLowerCase()} is split up, and how touching and pressing work together.`,
    status: `${zoneCount} zone${zoneCount === 1 ? '' : 's'} · ${partStatus.touch.toLowerCase()} · ${stickMode ? `touch stick ${partStatus.stick}` : 'no touch stick'}`, changed: zonesChanged,
    content: <ZoneParts part={zonePart} parts={zoneParts} onPart={setPart} status={partStatus}>
      {zonePart === 'layout' && <>
        <span className={p4.cardsLabel}>Shape</span>
        <ModeCards columns={4} value={shape} useLabel={option => `Use ${option.label}`} hints="LB/RB:Part"
          options={['RECTANGLE', 'FOUR_WAY', 'EIGHT_WAY', 'RADIAL'].map(value => ({ value, label: SHAPE_NAMES[value], art: <ShapeArt shape={value} /> }))}
          onChange={value => writeKey(setText, padKey.gridShape(side), value === 'RECTANGLE' ? null : value)} />
        <ValueRow label="Columns" hint={shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' ? '4-way and 8-way always have their own zones. Used by Grid and Wheel.' : 'Zones across the pad, up to five'} setting={padKey.gridSize(side)} value={cols} min={1} max={5} step={1}
          disabled={shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' ? 'Used by Grid and Wheel only.' : undefined} extraHints="LB/RB:Part"
          onChange={value => writeKey(setText, padKey.gridSize(side), `${value} ${rowsCount}`)} onReset={() => writeKey(setText, padKey.gridSize(side), null)} />
        <ValueRow label="Rows" hint={shape === 'RADIAL' ? 'Columns × rows is the number of slices' : 'Zones down the pad, up to five'} setting={padKey.gridSize(side)} value={rowsCount} min={1} max={5} step={1}
          disabled={shape === 'FOUR_WAY' || shape === 'EIGHT_WAY' ? 'Used by Grid and Wheel only.' : undefined} extraHints="LB/RB:Part"
          onChange={value => writeKey(setText, padKey.gridSize(side), `${cols} ${value}`)} />
        <ValueRow hero label="Centre dead zone" setting={padKey.gridDeadzone(side)} value={Math.round(deadzone * 100)} min={0} max={95} step={5} fineStep={1} format={value => `${value}%`} extraHints="LB/RB:Part"
          caption="A thumb resting in the middle presses nothing, so it can’t flicker between zones." disabled={shape === 'RECTANGLE' ? 'A grid has no middle ring. Pick 4-way, 8-way or Wheel.' : undefined}
          onChange={value => writeKey(setText, padKey.gridDeadzone(side), value ? Number((value / 100).toFixed(3)) : null)} onReset={() => writeKey(setText, padKey.gridDeadzone(side), null)} />
        <ValueRow label="Turn the zones" hint="Rotate the layout to match how your thumb sits. Also turns the mouse and the touch stick on this pad." setting={rotationKey ?? undefined}
          value={rotation} min={-180} max={180} step={5} fineStep={0.5} format={value => `${value > 0 ? '+' : ''}${value}°`} extraHints="LB/RB:Part"
          disabled={rotationKey ? undefined : 'A one-pad controller’s pad can’t be turned.'}
          onChange={value => rotationKey && writeKey(setText, rotationKey, value || null)} onReset={() => rotationKey && writeKey(setText, rotationKey, null)} />
      </>}
      {zonePart === 'touch' && touchAndClick('LB/RB:Part')}
      {zonePart === 'stick' && <TouchStickPart page={page} pad={pad} onDirections={props.onDirections} />}
    </ZoneParts>,
    visual: zonePart === 'stick' ? <TouchStickVisual live={live} radius={readNumber(text, `${P}TOUCH_STICK_RADIUS`, 0)} />
      : <VisualPanel title={name} chip={live ? (props.selected ? 'touching' : 'live') : 'thumb off the pad'} caption={shape === 'RECTANGLE' ? 'Touch the pad to try it.' : 'The ring is the dead zone. Touch the pad to try it.'}>
        {pad.menu ? <MenuPreview menu={pad.menu} aspect={page.padAspect} fill selectedCommand={props.selected?.command ?? null} onSelect={page.onSelectRegion} livePoint={live} managedFocus /> : <p className={p4.note}>Bind a zone to draw the pad.</p>}
      </VisualPanel>,
  }

  // ---- Click
  const dampen = readNumber(text, 'TOUCHPAD_CLICK_DAMPEN', 0)
  const dampenAt = readNumber(text, 'TOUCHPAD_CLICK_DAMPEN_THRESHOLD', 0)
  const lift = readNumber(text, 'TOUCHPAD_LIFT_SPEED', 150)
  const fit = pad.card.mouseAreaFit ?? 'STRETCH'
  const clickGroup: FineTuneGroup = {
    id: 'click', label: 'Click', title: 'Click', description: 'Keep your aim still while you press the pad in, and as your thumb lifts off.',
    status: `${dampen ? `Damping ${Math.round(dampen * 100)}%` : 'Damping off'} · ${dampenAt ? `full at ${dampenAt.toFixed(2)}` : 'full at the click'} · lift guard ${lift ? `${lift} px/s` : 'off'}`,
    changed: isSet(text, 'TOUCHPAD_CLICK_DAMPEN', 'TOUCHPAD_CLICK_DAMPEN_THRESHOLD', 'TOUCHPAD_LIFT_SPEED'),
    content: <>
      <ValueRow hero label="Hold still while clicking" setting="TOUCHPAD_CLICK_DAMPEN" value={Math.round(dampen * 100)} min={0} max={100} step={5} fineStep={1} format={value => value === 0 ? 'Off' : `${value}%`}
        caption="How much cursor movement a press takes away. 100% stops it." onChange={value => writeKey(setText, 'TOUCHPAD_CLICK_DAMPEN', value ? value / 100 : null)} onReset={() => writeKey(setText, 'TOUCHPAD_CLICK_DAMPEN', null)} />
      <ValueRow label="Fully still from" hint="Used once holding still is on. Read the pressure on the right." setting="TOUCHPAD_CLICK_DAMPEN_THRESHOLD" value={dampenAt} min={0} max={1} step={0.01} fineStep={0.001}
        format={value => value === 0 ? 'At the click' : `pressure ${value.toFixed(3)}`} disabled={dampen === 0 ? 'Turn on Hold still while clicking first.' : undefined}
        onChange={value => writeKey(setText, 'TOUCHPAD_CLICK_DAMPEN_THRESHOLD', value || null)} onReset={() => writeKey(setText, 'TOUCHPAD_CLICK_DAMPEN_THRESHOLD', null)} />
      <ValueRow label="Lift-off guard" hint="Holds the cursor as your thumb rolls off" setting="TOUCHPAD_LIFT_SPEED" value={lift} min={0} max={1000} step={10} format={value => value === 0 ? 'Off' : `${value} px/s`}
        onChange={value => writeKey(setText, 'TOUCHPAD_LIFT_SPEED', value)} onReset={() => writeKey(setText, 'TOUCHPAD_LIFT_SPEED', null)} />
      {card === 'MOUSE_AREA' && <SegmentedRow label="Pad fit" hint="Only for a pad set to Mouse area" setting={`${P}TOUCHPAD_AREA_FIT`} value={fit} disabled={card === 'MOUSE_AREA' ? undefined : 'Pad fit is used by a pad set to Mouse area.'}
        options={MOUSE_AREA_FIT_OPTIONS.map(option => ({ value: option.value, label: option.value === 'STRETCH' ? 'Stretch to fill' : 'Keep pad shape' }))} onChange={value => pad.card.onMouseAreaFitChange?.(value)} />}
      {(card === 'MOUSE' || card === 'MOUSE_AREA') && touchAndClick()}
    </>,
    visual: <PressureVisual pressure={pad.pressure ?? 0} dampenAt={dampenAt} />,
  }

  // ---- Mouse area
  const area = pad.card.mouseArea ?? null
  const areaGroup: FineTuneGroup = {
    id: 'area', label: 'Mouse area', title: 'Mouse area', description: 'The part of the screen the pad maps to, when the pad is set to Mouse area.',
    status: card === 'MOUSE_AREA' ? `${describeMouseArea(area)} · ${fit === 'STRETCH' ? 'stretched' : 'pad shape'}` : 'Used when this pad is a mouse area', changed: isSet(text, `${P}TOUCHPAD_AREA`, `${P}TOUCHPAD_AREA_FIT`),
    content: <>
      {card !== 'MOUSE_AREA' && <Note>{name} isn’t set to Mouse area, so these only apply once it is.</Note>}
      <OpenRow label="Screen area" hint={`Where the pad lands on screen · ${describeMouseArea(area)}`} value="Draw" onOpen={() => pad.card.onPickMouseArea?.()} hints="A:Draw on screen" />
      <SegmentedRow label="Pad fit" hint="How a square pad lies over a wide box" setting={`${P}TOUCHPAD_AREA_FIT`} value={fit}
        options={MOUSE_AREA_FIT_OPTIONS.map(option => ({ value: option.value, label: option.value === 'STRETCH' ? 'Stretch to fill' : 'Keep pad shape' }))} onChange={value => pad.card.onMouseAreaFitChange?.(value)} />
    </>,
    visual: <VisualPanel title={`${name} is this box`} chip={live ? 'cursor follows your thumb' : undefined}><ScreenAreaPreview area={area} fit={fit} padAspect={page.padAspect} width={400} /></VisualPanel>,
  }

  // ---- Feel
  const feelGroup = feelGroupFor(page, pad, name)

  // ---- More
  const moreGroup: FineTuneGroup = {
    id: 'more', label: 'More', title: 'Touch, click and more', description: 'The pad’s own touch and click bindings, and changes while another button is held.',
    status: [pad.touch && `touch ${page.describe(pad.touch.command).binding || 'unbound'}`, pad.click && `click ${page.describe(pad.click.command).binding || 'unbound'}`].filter(Boolean).join(' · ') || 'While holding…',
    content: <>
      {pad.touch && <div>{page.renderButton(pad.touch, { label: 'Touch', subtitle: 'Your thumb on the pad', modeshifts: true })}</div>}
      {pad.click && <div>{page.renderButton(pad.click, { label: 'Click', subtitle: 'Pressing the pad in', modeshifts: true })}</div>}
      <OpenRow label="Mode shift" hint="Hold another button to change this pad" onOpen={props.onHolding} />
      <OpenRow label="Touch-stick directions" hint="Shared by every touch stick" onOpen={props.onDirections} />
      {pad.other?.length ? <OpenRow label="Other controller types" hint={`${pad.other.length} bindings for inputs this pad doesn’t have`} onOpen={props.onOthers} /> : null}
    </>,
  }

  // Only what the pad's current mode uses: a pad set to Mouse has no zones, a pad of zones has no speed.
  const groups = {
    MOUSE: [speedGroup, glideGroup, clickGroup, feelGroup, moreGroup],
    MOUSE_AREA: [areaGroup, clickGroup, feelGroup, moreGroup],
    ZONES: [zonesGroup, feelGroup, moreGroup],
    TOUCH_STICK: [zonesGroup, feelGroup, moreGroup],
  }[card as 'MOUSE' | 'MOUSE_AREA' | 'ZONES' | 'TOUCH_STICK'] ?? [feelGroup, moreGroup]
  const active = groups.some(item => item.id === groupId) ? groupId : groups[0].id
  const shared = active === 'speed' || active === 'glide' || active === 'click' ? 'Shared by both pads: speed-up, glide and click are one setting for every pad.' : active === 'feel' ? 'Each pad can have its own feel, or share one.' : undefined

  return (
    <>
      <SubPage open onClose={onClose} trail={['Trackpads', name]} title="Fine-tune" stepLabel="Group" backLabel="Back to Trackpads"
        onStep={direction => onGroup(stepGroup(groups, active, direction))}
        where={`Trackpads · ${name} · Fine-tune · ${groups.find(item => item.id === active)?.label ?? ''}${active === 'zones' ? ` · ${PARTS.find(item => item.id === zonePart)?.label}` : ''}`}>
        <div data-trackpad-fine-tune-page={side}>
          <FineTune groups={groups} active={active} onActive={onGroup} railNote={shared} />
        </div>
      </SubPage>
      <SubPage open={advanced !== null} onClose={() => setAdvanced(null)} trail={['Trackpads', name, 'Fine-tune']} title="Advanced" stepLabel="Part" backLabel="Back to Fine-tune"
        onStep={direction => setAdvanced(value => stepGroup([{ id: 'vertical' }, { id: 'curve' }], value ?? 'vertical', direction))}>
        <AdvancedParts active={advanced ?? 'vertical'} onActive={setAdvanced} parts={[
          { id: 'vertical', eyebrow: 'Speed & curve', title: 'Up and down, and simple speed-up', description: 'Give up and down their own speed, or add the older one-number speed-up.',
            content: <>
              <SummaryRow label="Up and down speed" hint={near(sens, sensY) ? 'Same as left/right' : 'Its own speed'} setting={`${P}TOUCHPAD_SENS`} toggle={{ on: !near(sens, sensY), onChange: on => writeSens(sens, on ? Number((sens * 0.8).toFixed(2)) : undefined) }} />
              {!near(sens, sensY) && <ValueRow label="Up and down" setting={`${P}TOUCHPAD_SENS`} value={sensY} min={0} max={10} step={0.05} fineStep={0.01} format={value => `${value.toFixed(2)}×`} onChange={value => writeSens(sens, value)} />}
              <ValueRow label="Simple speed-up" hint="Older one-number speed-up: quick swipes go up to 4× further. 0 is off." setting="TOUCHPAD_ACCELERATION" value={readNumber(text, 'TOUCHPAD_ACCELERATION', 0)} min={0} max={10} step={0.1} fineStep={0.01}
                format={value => value === 0 ? 'Off' : value.toFixed(2)} onChange={value => writeKey(setText, 'TOUCHPAD_ACCELERATION', value || null)} onReset={() => writeKey(setText, 'TOUCHPAD_ACCELERATION', null)} />
            </> },
          { id: 'curve', eyebrow: 'Speed & curve', title: 'Curve', description: 'Curve type, speed range, start and top gain and the curve’s shape, in the curve editor.',
            content: <>
              <OpenRow label="Edit the curve" hint="Curve type, speed range, start and top gain, curve shape" value={curveType.toLowerCase()} onOpen={() => window.dispatchEvent(new CustomEvent('jsm:accel-curve', { detail: 'touchpad' }))} />
              <SummaryRow label="Give gyro this curve" hint="The gyro borrows the trackpad’s curve shape" setting="ACCEL_CURVE_LINK"
                toggle={{ on: link === 'GYRO_USES_TOUCHPAD', onChange: on => writeKey(setText, 'ACCEL_CURVE_LINK', on ? 'GYRO_USES_TOUCHPAD' : null) }} />
              <SummaryRow label="Use the gyro’s curve" hint="The trackpad borrows the gyro’s curve shape" setting="ACCEL_CURVE_LINK"
                toggle={{ on: link === 'TOUCHPAD_USES_GYRO', onChange: on => writeKey(setText, 'ACCEL_CURVE_LINK', on ? 'TOUCHPAD_USES_GYRO' : null) }} />
            </> },
        ]} />
      </SubPage>
    </>
  )
}

/** The Zones group's part strip: LB / RB step Layout, Touch and click, Touch stick. */
function ZoneParts({ part, parts, onPart, status, children }: { part: PartId; parts: readonly (typeof PARTS)[number][]; onPart: (part: PartId) => void; status: Record<PartId, string>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const latest = useRef({ part, onPart, parts })
  latest.current = { part, onPart, parts }
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button !== 'LB' && button !== 'RB') return
      event.preventDefault()
      const list = latest.current.parts
      const index = list.findIndex(item => item.id === latest.current.part)
      latest.current.onPart(list[(index + (button === 'LB' ? -1 : 1) + list.length) % list.length].id)
    }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [])
  // A new part puts focus on its chosen card, or its first setting.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      ;(node.querySelector<HTMLElement>('[role="radio"][data-current="true"]') ?? node.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]'))?.focus({ preventScroll: true })
    })
  }, [part])
  return (
    <div ref={ref} className={styles.parts} data-zone-part={part}>
      <div className={styles.partStrip} role="tablist" aria-label="Part">
        <span className={styles.partKey} aria-hidden="true">LB</span>
        {parts.map(item => (
          <div key={item.id} role="tab" aria-selected={item.id === part} className={styles.part} data-current={item.id === part ? 'true' : undefined} onClick={() => onPart(item.id)}>
            <b>{item.label}</b><span>{status[item.id]}</span>
          </div>
        ))}
        <span className={styles.partKey} aria-hidden="true">RB</span>
      </div>
      {children}
    </div>
  )
}

const DUAL_CAPTIONS: Record<string, string> = {
  NO_FULL: 'Pressing in adds nothing', NO_SKIP: 'Both fire', NO_SKIP_EXCLUSIVE: 'Touch first; a click takes over', MUST_SKIP: 'Click in time for click alone',
  MUST_SKIP_R: 'A quick click swaps to click', MAY_SKIP: 'Touch waits; a later click still adds', MAY_SKIP_R: 'Quick click swaps; a later one adds',
}
const DUAL_EXPLAIN: Record<string, string> = {
  NO_FULL: 'Only touch fires; pressing the pad in adds nothing.', NO_SKIP: 'Touch fires as you land; pressing in adds the click on top.',
  NO_SKIP_EXCLUSIVE: 'Touch fires first; once you press in, the click takes over.', MUST_SKIP: 'Touch waits a moment. Press in before it starts and only the click fires; otherwise only touch.',
  MAY_SKIP: 'Touch waits a moment. Press in before it starts and only the click fires. After it starts, a click fires as well.', MUST_SKIP_R: 'Touch fires at once; a quick click swaps it for the click.',
  MAY_SKIP_R: 'Touch fires at once; a quick click swaps it, a later click adds on.',
}

/** A timeline picture per touch/click behaviour: quick and slow press, touch and click lanes. */
function DualStageArt({ mode }: { mode: string }) {
  const lane = (y: number, from: number, to: number, color: string, dashed = false) => to > from ? <rect x={from} y={y} width={to - from} height="6" rx="3" fill={dashed ? 'none' : color} stroke={color} strokeDasharray={dashed ? '3 2' : undefined} /> : null
  const touchQuick = mode === 'MUST_SKIP' || mode === 'MAY_SKIP' ? [0, 0] : mode === 'MUST_SKIP_R' || mode === 'MAY_SKIP_R' ? [10, 22] : mode === 'NO_SKIP_EXCLUSIVE' ? [10, 24] : [10, 50]
  const clickQuick = mode === 'NO_FULL' ? [0, 0] : [24, 50]
  const touchSlow = mode === 'MUST_SKIP' || mode === 'MAY_SKIP' ? [76, 110] : [62, 110]
  const clickSlow = mode === 'NO_FULL' || mode === 'MUST_SKIP' || mode === 'MUST_SKIP_R' ? [0, 0] : [92, 110]
  // Two labelled bars (Touch, Click) for a quick press and a slow one, at a size that reads on a card.
  const shift = (range: number[]) => range.map(v => 30 + v * 0.75)
  const tq = shift(touchQuick), ts = shift(touchSlow), cq = shift(clickQuick), cs = shift(clickSlow)
  return (
    <svg viewBox="0 0 120 50" aria-hidden="true">
      <text x="34" y="9" fill="#808c99" fontSize="9">Quick</text><text x="80" y="9" fill="#808c99" fontSize="9">Slow</text>
      <text x="2" y="22" fill="var(--accent)" fontSize="9" fontWeight="600">Touch</text>
      <text x="2" y="38" fill="#e3eaf1" fontSize="9" fontWeight="600">Click</text>
      {mode === 'MUST_SKIP' || mode === 'MAY_SKIP' ? lane(16, 30 + 62 * 0.75, 30 + 76 * 0.75, '#aebbc8', true) : null}
      {lane(16, tq[0], tq[1], 'var(--accent)')}{lane(16, ts[0], ts[1], 'var(--accent)')}
      {lane(32, cq[0], cq[1], '#e3eaf1')}{lane(32, cs[0], cs[1], '#e3eaf1')}
      <path d="M75 12 V44" stroke="rgba(255,255,255,.1)" />
    </svg>
  )
}

function ShapeArt({ shape }: { shape: string }) {
  return (
    <svg viewBox="0 0 80 60" aria-hidden="true">
      <rect x="14" y="4" width="52" height="52" rx="6" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" />
      {shape === 'RECTANGLE' && <path d="M31 4 V56 M48 4 V56 M14 21 H66 M14 38 H66" stroke="rgba(255,255,255,.18)" />}
      {shape === 'FOUR_WAY' && <><path d="M14 4 L40 30 L66 4 Z" fill="color-mix(in srgb, var(--accent) 90%, transparent)" /><path d="M14 56 L66 4 M14 4 L66 56" stroke="rgba(255,255,255,.18)" /><circle cx="40" cy="30" r="6" fill="#0e1419" stroke="rgba(255,255,255,.2)" /></>}
      {shape === 'EIGHT_WAY' && <><path d="M14 56 L66 4 M14 4 L66 56 M40 4 V56 M14 30 H66" stroke="rgba(255,255,255,.18)" /><circle cx="40" cy="30" r="6" fill="#0e1419" stroke="rgba(255,255,255,.2)" /></>}
      {shape === 'RADIAL' && <><circle cx="40" cy="30" r="22" fill="none" stroke="rgba(255,255,255,.18)" /><path d="M40 8 V52 M18 30 H62 M24 14 L56 46 M56 14 L24 46" stroke="rgba(255,255,255,.12)" /><circle cx="40" cy="30" r="7" fill="#0e1419" stroke="rgba(255,255,255,.2)" /></>}
    </svg>
  )
}

/** Zones ▸ Touch stick (TrackpadsTouchStick). */
function TouchStickPart({ page, pad, onDirections }: { page: TrackpadsPageProps; pad: PadConfig; onDirections: () => void }) {
  const P = padPrefix(pad.side)
  const text = page.readText
  const mode = readWord(text, `${P}TOUCH_STICK_MODE`)
  const [moreOpen, setMoreOpen] = useState(false)
  const value = !mode ? 'OFF' : mode === 'NO_MOUSE' ? 'NO_MOUSE' : mode === 'AIM' || mode === 'HYBRID_AIM' ? 'AIM' : mode === 'FLICK' || mode === 'FLICK_ONLY' || mode === 'ROTATE_ONLY' ? 'FLICK' : 'MORE'
  const write = (next: string | null) => writeKey(page.setText, `${P}TOUCH_STICK_MODE`, next)
  const axis = readWord(text, `${P}TOUCH_STICK_AXIS`) || 'STANDARD'
  const ring = readWord(text, `${P}TOUCH_RING_MODE`)
  const yHint = 'Y:Bind directions;LB/RB:Part'
  const moreModes = ['MOUSE_RING', 'MOUSE_AREA', 'SCROLL_WHEEL', 'LEFT_STICK', 'RIGHT_STICK', 'INNER_RING', 'OUTER_RING', 'HYBRID_AIM', 'FLICK_ONLY', 'ROTATE_ONLY']
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const onPad = (event: Event) => { if ((event as CustomEvent<PadEventDetail>).detail.button === 'Y' && !event.defaultPrevented) { event.preventDefault(); onDirections() } }
    node.addEventListener(PAD_EVENT, onPad)
    return () => node.removeEventListener(PAD_EVENT, onPad)
  }, [onDirections])
  return (
    <div ref={ref} className={p4.bindRows} data-touch-stick-part="">
      <span className={p4.cardsLabel}>Dragging acts as</span>
      <ModeCards columns={5} value={value} hints={yHint}
        options={[{ value: 'OFF', label: 'Off', art: <PadOffArt /> }, { value: 'NO_MOUSE', label: 'Directions you bind', art: <StickCardArt card="MOVING" /> }, { value: 'AIM', label: 'Looking around', art: <StickCardArt card="LOOK" /> }, { value: 'FLICK', label: 'Flick to turn', art: <StickCardArt card="FLICK" /> }]}
        more={{ label: value === 'MORE' ? mode.replace(/_/g, ' ').toLowerCase() : 'More', caption: 'Mouse ring, mouse area, scroll wheel, gamepad sticks', count: moreModes.length, current: value === 'MORE', onOpen: () => setMoreOpen(open => !open) }}
        onChange={next => write(next === 'OFF' ? null : next === 'AIM' && (mode === 'HYBRID_AIM') ? mode : next === 'FLICK' && /FLICK_ONLY|ROTATE_ONLY/.test(mode) ? mode : next)} />
      {moreOpen && <ModeCards columns={5} value={mode} hints={yHint} useLabel={option => `Use ${option.label}`}
        options={moreModes.map(item => ({ value: item, label: item.replace(/_/g, ' ').toLowerCase().replace(/^./, letter => letter.toUpperCase()), art: <MoreModeArt entry={item === 'INNER_RING' || item === 'OUTER_RING' ? 'RINGS' : item === 'LEFT_STICK' || item === 'RIGHT_STICK' ? 'ANGLE' : item as 'MOUSE_RING'} /> }))}
        onChange={write} />}
      <ValueRow hero label="Stick size" hint="How far you drag for a full push. The dashed circle grows with it." setting={`${P}TOUCH_STICK_RADIUS`} value={readNumber(text, `${P}TOUCH_STICK_RADIUS`, 0)} min={0} max={2000} step={10} fineStep={1}
        format={v => v === 0 ? 'Default' : `${v}`} extraHints={yHint} disabled={mode ? undefined : 'Pick what dragging acts as first.'}
        onChange={v => writeKey(page.setText, `${P}TOUCH_STICK_RADIUS`, v || null)} onReset={() => writeKey(page.setText, `${P}TOUCH_STICK_RADIUS`, null)} />
      <ValueRow label="Ignore small drags" hint="The middle that sends nothing" setting={`${P}TOUCH_DEADZONE_INNER`} value={readNumber(text, `${P}TOUCH_DEADZONE_INNER`, 0)} min={0} max={500} step={5} fineStep={1}
        format={v => v === 0 ? 'Default' : `${v}`} extraHints={yHint} disabled={mode ? undefined : 'Pick what dragging acts as first.'}
        onChange={v => writeKey(page.setText, `${P}TOUCH_DEADZONE_INNER`, v || null)} onReset={() => writeKey(page.setText, `${P}TOUCH_DEADZONE_INNER`, null)} />
      <SegmentedRow label="Ring" hint="When the ring binding is held" setting={`${P}TOUCH_RING_MODE`} value={ring || 'DEFAULT'} extraHints={yHint}
        options={[{ value: 'DEFAULT', label: 'Default' }, { value: 'INNER', label: 'Inner' }, { value: 'OUTER', label: 'Outer' }]}
        onChange={v => writeKey(page.setText, `${P}TOUCH_RING_MODE`, v === 'DEFAULT' ? null : v)} />
      <SegmentedRow label="Direction" hint="Flip up and down or left and right" setting={`${P}TOUCH_STICK_AXIS`} value={axis} extraHints={yHint}
        options={TOUCH_STICK_AXIS_VALUES.map(v => ({ value: v, label: v === 'STANDARD' ? 'Normal' : v === 'INVERTED' ? 'Flip both' : v === 'X_INVERTED' ? 'Flip left-right' : 'Flip up-down' }))}
        onChange={v => writeKey(page.setText, `${P}TOUCH_STICK_AXIS`, v === 'STANDARD' ? null : v)} />
      <OpenRow label="Bind directions" hint="Up, down, left, right and ring · shared by every touch stick" onOpen={onDirections} hints="A:Open;LB/RB:Part" />
      <Note>Speed, speed-up and flick settings are shared with the sticks: Sticks ▸ Fine-tune.</Note>
    </div>
  )
}

const PadOffArt = () => <svg viewBox="0 0 120 90" aria-hidden="true"><rect x="34" y="18" width="52" height="52" rx="8" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" /><path d="M42 62 L78 26" stroke="#aebbc8" strokeWidth="2" /></svg>

function TouchStickVisual({ live, radius }: { live: { x: number; y: number } | null; radius: number }) {
  const r = 60 + Math.min(60, radius / 20)
  return (
    <VisualPanel title="Pad as a stick" chip={live ? 'dragging' : 'thumb off the pad'} caption="Where you land is the centre; the dashed circle is a full push.">
      <svg viewBox="0 0 300 260" role="img" aria-label="Touch stick">
        <rect x="20" y="10" width="260" height="240" rx="18" fill="rgba(8,12,18,.72)" stroke="rgba(255,255,255,.16)" />
        <circle cx="150" cy="130" r={r} fill="none" stroke="#aebbc8" strokeDasharray="4 4" />
        <circle cx="150" cy="130" r="4" fill="#aebbc8" />
        {live && <><path d={`M150 130 L${150 + live.x * 120} ${130 + live.y * 110}`} stroke="var(--accent)" strokeWidth="2" /><circle cx={150 + live.x * 120} cy={130 + live.y * 110} r="9" fill="#a6d65a" stroke="#e3eaf1" strokeWidth="2" /></>}
      </svg>
    </VisualPanel>
  )
}

function AccelVisual({ speed, current, presets }: { speed: number; current: AccelCurveParams; presets: { label: string; params: AccelCurveParams }[] }) {
  const top = 3000
  const maxGain = Math.max(2.6, current.maxSens)
  const path = (p: AccelCurveParams) => Array.from({ length: 61 }, (_, index) => { const v = (index / 60) * top; return `${index ? 'L' : 'M'}${40 + (v / top) * 320},${190 - (accelSensitivityAt(v, p) / maxGain) * 160}` }).join(' ')
  return (
    <VisualPanel title="How the cursor responds" chip={`live ${Math.round(speed)} px/s`} caption="Move to Gentle, Strong or Same as gyro to see the curve before you pick it.">
      <svg viewBox="0 0 380 220" role="img" aria-label="Trackpad speed-up curve">
        <path d="M40 30 V190 H360" stroke="rgba(255,255,255,.08)" strokeWidth="1.5" fill="none" />
        {presets.map(preset => <g key={preset.label}><path d={path(preset.params)} stroke="#808c99" strokeWidth="1.5" strokeDasharray="4 4" fill="none" /><text x="356" y={190 - (accelSensitivityAt(top, preset.params) / maxGain) * 160 - 4} fill="#808c99" fontSize="10" textAnchor="end">{preset.label}</text></g>)}
        <path d={path(current)} stroke="var(--accent)" strokeWidth="2" fill="none" />
        <circle cx={40 + (Math.min(speed, top) / top) * 320} cy={190 - (accelSensitivityAt(Math.min(speed, top), current) / maxGain) * 160} r="5" fill="#a6d65a" stroke="#e3eaf1" strokeWidth="2" />
        <text x="200" y="212" fill="#808c99" fontSize="10" textAnchor="middle">How fast you swipe →</text>
      </svg>
    </VisualPanel>
  )
}

function GlideVisual({ decay, minVelocity, speed }: { decay: number; minVelocity: number; speed: number }) {
  const coast = decay > 0 ? Math.max(20, 160 - decay * 2) : 0
  return (
    <VisualPanel title="A flick, then you lift" chip={`live ${Math.round(speed)} px/s`} caption="Turn coasting up to see the dashed path. Higher values end the coast sooner.">
      <svg viewBox="0 0 380 200" role="img" aria-label="Glide">
        <path d="M30 150 C90 140 130 100 170 90" stroke="var(--accent)" strokeWidth="2.5" fill="none" />
        {coast > 0 ? <path d={`M170 90 L${170 + coast} ${90 - coast * 0.3}`} stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" /> : <text x="178" y="86" fill="#808c99" fontSize="11">Off · stops where you lift</text>}
        <circle cx="170" cy="90" r="5" fill="#e3eaf1" />
        <path d="M30 186 H350" stroke="rgba(255,255,255,.1)" />
        <path d={`M30 ${186 - (minVelocity / 2000) * 60} H350`} stroke="#808c99" strokeDasharray="3 3" />
        <text x="350" y={182 - (minVelocity / 2000) * 60} fill="#808c99" fontSize="10" textAnchor="end">{minVelocity} px/s</text>
      </svg>
    </VisualPanel>
  )
}

/** Pressure over the last few seconds, buffered from telemetry. */
function PressureVisual({ pressure, dampenAt }: { pressure: number; dampenAt: number }) {
  const history = useRef<number[]>([])
  history.current = [...history.current.slice(-119), pressure]
  const points = history.current.map((value, index) => `${index ? 'L' : 'M'}${30 + (index / 119) * 330},${170 - Math.min(1, value) * 140}`).join(' ')
  return (
    <VisualPanel title="Press, click, let go" chip={`pressure ${pressure.toFixed(3)}`} caption="Press the pad and read the pressure; set Fully still just below where it clicks.">
      <svg viewBox="0 0 380 200" role="img" aria-label={`Pressure ${pressure.toFixed(3)}`}>
        <path d="M30 170 H360 M30 20 V170" stroke="rgba(255,255,255,.1)" />
        {dampenAt > 0 && <><path d={`M30 ${170 - dampenAt * 140} H360`} stroke="var(--accent)" strokeDasharray="4 4" /><text x="358" y={166 - dampenAt * 140} fill="var(--accent)" fontSize="10" textAnchor="end">Fully still</text></>}
        <path d={points} stroke="#a6d65a" strokeWidth="2" fill="none" />
        <text x="195" y="192" fill="#808c99" fontSize="10" textAnchor="middle">time →</text>
      </svg>
    </VisualPanel>
  )
}

/** Feel (TrackpadsFeel): this pad's motor on touch, click and release. */
function feelGroupFor(page: TrackpadsPageProps, pad: PadConfig, name: string): FineTuneGroup {
  const text = page.readText
  const side = pad.side
  const SIDE = side === 'right' ? 'RIGHT' : 'LEFT'
  const read = (key: string) => getKeymapValue(text, key) ?? undefined
  const twoPads = side !== 'single'
  const separate = twoPads && hasSeparatePadFeedback(read, SIDE)
  const key = (field: string) => separate ? `${SIDE}_TOUCHPAD_${field}` : `TOUCHPAD_${field}`
  const value = (field: string, fallback: string) => twoPads ? padFeedbackValue(read, SIDE, field) || fallback : (read(`TOUCHPAD_${field}`) ?? fallback)
  const previewSide = side === 'left' ? 'left' : side === 'right' ? 'right' : 'both'
  const column = (title: string, intro: string, intensityField: string, effectField: string, fallbackEffect: string, extra?: ReactNode) => {
    const intensity = Number(value(intensityField, '0')) || 0
    const effect = value(effectField, fallbackEffect).toUpperCase()
    const strength = FEEL_STRENGTHS.find(item => item.intensity === intensity)?.value ?? (intensity === 0 ? 'off' : 'custom')
    const effects = HAPTIC_EFFECT_CHOICES.filter(item => item !== 'OFF').map(item => ({ value: item, label: EFFECT_NAMES[item] ?? item }))
    if (!effects.some(item => item.value === effect)) effects.push({ value: effect as typeof effects[number]['value'], label: `${effect.toLowerCase()} (imported)` })
    const feel = { label: 'Try it', run: () => previewHaptic(effect, intensity || 50, previewSide) }
    return (
      <div className={styles.feelColumn} data-feel={title.toLowerCase()}>
        <b>{title}</b><span>{intro}</span>
        <SegmentedRow label="Strength" setting={key(intensityField)} value={strength} onX={feel}
          options={[...FEEL_STRENGTHS.map(item => ({ value: item.value, label: item.label })), ...(strength === 'custom' ? [{ value: 'custom', label: `${intensity}%` }] : [])]}
          onChange={next => { const found = FEEL_STRENGTHS.find(item => item.value === next); if (found) { writeChoice(page.setText, { [key(intensityField)]: found.intensity || (separate ? 0 : null) }, { [key(intensityField)]: 0 }); if (found.intensity) previewHaptic(effect, found.intensity, previewSide) } }} />
        <SegmentedRow label="Effect" setting={key(effectField)} value={effect} options={effects} onX={feel} disabled={intensity === 0 ? 'Pick a strength first.' : undefined}
          onChange={next => { writeKey(page.setText, key(effectField), next); previewHaptic(next, intensity, previewSide) }} />
        {extra}
      </div>
    )
  }
  const intensities = ['HAPTIC_INTENSITY', 'CLICK_HAPTIC_INTENSITY', 'RELEASE_HAPTIC_INTENSITY'].map(field => Number(value(field, '0')) || 0)
  const interval = Number(value('HAPTIC_INTERVAL', '250')) || 250
  return {
    id: 'feel', label: 'Feel', title: 'Feel', description: `What the ${name.toLowerCase()}’s own motor plays as you touch it, press it and let go.`,
    status: `${separate ? 'Its own feel' : twoPads ? 'Shared' : 'Pad'} · ${intensities.every(item => item === 0) ? 'touch, click and release off' : `touch ${strengthWord(intensities[0]).toLowerCase()} · click ${strengthWord(intensities[1]).toLowerCase()} · release ${strengthWord(intensities[2]).toLowerCase()}`}`,
    changed: separate || intensities.some(item => item > 0),
    content: <>
      {twoPads && <SummaryRow label={`${name} has its own feel`} hint={`The ${side === 'left' ? 'right' : 'left'} pad keeps the shared feel`} setting={`${SIDE}_TOUCHPAD_HAPTICS`}
        toggle={{ on: separate, onChange: on => page.setText?.(previous => Object.entries(padFeedbackPolicyChanges(read, SIDE, on)).reduce((next, [k, v]) => writeKeyText(next, k, v), previous)) }} />}
      <div className={styles.feelColumns}>
        {column('Touch', 'Ticks as your thumb moves', 'HAPTIC_INTENSITY', 'HAPTIC_EFFECT', 'TICK', <>
          <ValueRow label="Tick every" setting={key('HAPTIC_INTERVAL')} value={interval} min={5} max={2000} step={5} format={v => `${v} px`} onChange={v => writeKey(page.setText, key('HAPTIC_INTERVAL'), v)} />
          <small className={styles.feelNote}>Only while the pad moves the mouse</small>
        </>)}
        {column('Click', 'One pulse as the pad goes in', 'CLICK_HAPTIC_INTENSITY', 'CLICK_HAPTIC_EFFECT', 'CLICK')}
        {column('Release', 'One pulse as it comes back up', 'RELEASE_HAPTIC_INTENSITY', 'RELEASE_HAPTIC_EFFECT', 'TICK')}
      </div>
    </>,
  }
}

const writeKeyText = (text: string, key: string, value: string) => updateKeymapEntry(text, key, [value])
export type { PadSide }
