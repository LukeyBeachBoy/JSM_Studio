import { useContext, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { SettingOrigins } from './SettingOrigin'
import { layerEntries } from '../utils/layers'
import type { SensitivityValues } from '../utils/keymap'
import type { GyroActivationMode } from '../utils/gyroActivation'
import type { AccelCurveLink } from '../utils/accelCurve'
import type { TelemetrySample } from '../hooks/useTelemetry'
import type { GyroDevice } from './gyro/GyroContext'
import { useShell } from '../shell/ShellContext'
import { GYRO_ROUTE_EVENT, takeGyroRoute, type GyroGroup, type GyroRoute, type GyroSub } from '../utils/gyroRoutes'
import { GyroEnvProvider, useGyro, type GyroEnv } from './gyro/GyroContext'
import { GyroMore, useGyroMoreEntries } from './gyro/GyroMore'
import { GyroFront } from './gyro/GyroFront'
import { GyroFineTune } from './gyro/GyroFineTune'
import { MatchFullTurn } from './gyro/MatchFullTurn'
import { WhenOn } from './gyro/WhenOn'
import { WhileHolding, HeldScope } from './gyro/WhileHolding'
import { Recalibrate } from './gyro/Recalibrate'
import { TiltSettings, type TiltPart } from './gyro/TiltSettings'
import styles from './gyro/Gyro.module.css'

// The Gyro tab (console v2, Gyro*.dc.html): the three questions on the front,
// Fine-tune ▸ (Speed, Steadiness, Direction, Rumble, each with its Advanced),
// When is gyro on?, While holding…, Recalibrate and Match a full turn as
// sub-pages over it. App passes the configuration and its writer; every screen
// reads and writes keys directly (components/gyro/*), so a held variant can
// run the same screens on its projection.
//
// The props below the first group are the pre-redesign page's, kept so App's
// wiring and other callers stay compatible; the screens no longer need them.

export type GyroPageProps = {
  embedded?: boolean
  configText: string
  setConfigText: Dispatch<SetStateAction<string>>
  devices?: GyroDevice[]
  sample: TelemetrySample | null
  isCalibrating: boolean
  lockMessage?: string
  touchpadGridCommands?: string[]
  ignoredDevices?: string[]
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
  counterOsMouseSpeed: boolean
  onCounterOsMouseSpeedChange: (enabled: boolean) => void
  onOpenCalibration?: () => void
  /** Test mode with the configuration as it is now (D13). */
  onTryIt?: () => void
  /** CALIBRATE_GYRO. */
  onRecalibrate?: () => void
  /** The countdown status (seconds left), when telemetry has no gyroCal. */
  calibrationCountdown?: number | null
  /** Settings ▸ Controller (firmware re-centring). */
  onOpenControllerSettings?: () => void

  sensitivity?: SensitivityValues
  modeshiftSensitivity?: SensitivityValues
  gyroActivationMode?: GyroActivationMode
  gyroActivationButton?: string
  touchpadMode?: string
  touchpadGridCells?: number
  statusMessage?: string | null
  hasPendingChanges?: boolean
  onApply?: () => void
  onCancel?: () => void
  mode?: 'static' | 'accel'
  sensitivityView?: 'base' | 'modeshift'
  telemetry?: { omega: string; sensX: string; sensY: string; timestamp: string; sampleHz?: string }
  modeshiftButton?: string | null
  accelCurveLink?: string
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
  [legacyHandler: `on${string}Change`]: unknown
}

type Overlay =
  | { view: 'fine-tune'; group: GyroGroup; sub?: GyroSub | null }
  | { view: 'when-on' }
  | { view: 'while-holding'; trigger?: string }
  | { view: 'calibrate' }
  | { view: 'match-turn' }
  | null

export function GyroPage(props: GyroPageProps) {
  const shell = useShell()
  const origins = useContext(SettingOrigins)
  const ownKeys = useMemo(() => new Set(Object.keys(layerEntries(origins.own)).filter(key => !key.includes(',')).map(key => key.toUpperCase())), [origins.own])
  const env: GyroEnv = {
    text: props.configText,
    setText: props.setConfigText,
    rootText: props.configText,
    setRootText: props.setConfigText,
    held: null,
    ownKeys,
    locked: props.isCalibrating ? props.lockMessage ?? 'Calibrating. Gyro settings unlock when it finishes.' : undefined,
    family: shell.family,
    sample: props.sample,
    devices: props.devices,
    callbacks: {
      onOpenCalibration: props.onOpenCalibration,
      onRecalibrate: props.onRecalibrate,
      onTryIt: props.onTryIt,
      counterOsMouseSpeed: props.counterOsMouseSpeed,
      onCounterOsMouseSpeedChange: props.onCounterOsMouseSpeedChange,
      ignoredDevices: props.ignoredDevices,
      onToggleIgnoreDevice: props.onToggleIgnoreDevice,
      onOpenControllerSettings: props.onOpenControllerSettings,
      gridCommands: props.touchpadGridCommands,
    },
  }
  return <GyroEnvProvider value={env}><GyroBody isCalibrating={props.isCalibrating} countdown={props.calibrationCountdown ?? null} /></GyroEnvProvider>
}

/** The screens, inside the provider: every one reads the configuration through useGyro. */
function GyroBody({ isCalibrating, countdown }: { isCalibrating: boolean; countdown: number | null }) {
  const env = useGyro()
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [fineGroup, setFineGroup] = useState<GyroGroup>('speed')
  const [routeKey, setRouteKey] = useState(0)
  // Stacked over the base screens: Mode shift from When is gyro on?, and Tilt's.
  const [holding, setHolding] = useState(false)
  const [holdingTrigger, setHoldingTrigger] = useState<string | null>(null)
  const [tiltHolding, setTiltHolding] = useState(false)

  // Links into the tab (Review changes, a configuration error, the curve
  // editor's gyro tab) land on the screen that edits the setting.
  useEffect(() => {
    const go = (route: GyroRoute | null) => {
      if (!route) return
      setHolding(false); setTiltHolding(false)
      if (route.view === 'front') setOverlay(null)
      else if (route.view === 'fine-tune') { setFineGroup(route.group); setOverlay({ view: 'fine-tune', group: route.group, sub: route.sub ?? null }); setRouteKey(key => key + 1) }
      else if (route.view === 'while-holding') { setOverlay({ view: 'when-on' }); setHolding(true); setHoldingTrigger(route.trigger ?? null) }
      else setOverlay({ view: route.view })
    }
    go(takeGyroRoute())
    // The route rides on the event; a request made before this page mounted waits in takeGyroRoute.
    const onRoute = (event: Event) => { const route = (event as CustomEvent<GyroRoute | undefined>).detail; takeGyroRoute(); go(route ?? null) }
    window.addEventListener(GYRO_ROUTE_EVENT, onRoute)
    return () => window.removeEventListener(GYRO_ROUTE_EVENT, onRoute)
  }, [])

  const close = () => setOverlay(null)
  const openFine = (group: GyroGroup, sub: GyroSub | null = null) => { setFineGroup(group); setOverlay({ view: 'fine-tune', group, sub }); setRouteKey(key => key + 1) }
  const trail = ['Gyro']
  // Y on the front and in Fine-tune: the rest (the other screens, copy and paste tuning).
  const more = useGyroMoreEntries([
    { id: 'when-on', label: 'When is gyro on?', hint: 'Combine inputs, and see whether gyro is on right now', onSelect: () => setOverlay({ view: 'when-on' }) },
    { id: 'while-holding', label: 'Mode shift', hint: 'Hold a button: slower while aiming, off in menus, a stick when driving', onSelect: () => { setOverlay({ view: 'when-on' }); setHolding(true) } },
    { id: 'recalibrate', label: 'Recalibrate', hint: 'Fix aim that slowly drifts on its own', onSelect: () => setOverlay({ view: 'calibrate' }) },
    { id: 'match-turn', label: 'Match a full turn (360°)', hint: 'Turn once in game and the speed is set for you', onSelect: () => setOverlay({ view: 'match-turn' }) },
    { id: 'tilt', label: 'Tilt', hint: 'What tilting the controller does, and when', onSelect: () => openFine('tilt') },
  ])

  return (
    <>
      <GyroMore entries={more} eyebrow="Gyro" x={env.callbacks.onTryIt} className={styles.moreHost}>
        <div className={styles.page} data-gyro-page="" aria-disabled={isCalibrating || undefined}>
          {env.locked && <p className={styles.lockNote} role="status">{env.locked}</p>}
          <GyroFront onFineTune={() => openFine(fineGroup)} onWhenOn={() => setOverlay({ view: 'when-on' })}
            onCalibrate={() => setOverlay({ view: 'calibrate' })} onMatchTurn={() => setOverlay({ view: 'match-turn' })} />
        </div>
      </GyroMore>
      <GyroFineTune open={overlay?.view === 'fine-tune'} onClose={close} trail={trail} group={fineGroup} onGroup={setFineGroup}
        initialSub={overlay?.view === 'fine-tune' ? overlay.sub : null} routeKey={routeKey} onTiltWhileHolding={() => setTiltHolding(true)} more={more} />
      <MatchFullTurn open={overlay?.view === 'match-turn'} onClose={close} trail={trail} />
      <WhenOn open={overlay?.view === 'when-on'} onClose={close} trail={trail} onWhileHolding={() => setHolding(true)}
        onRecalibrate={() => setOverlay({ view: 'calibrate' })} onMatchTurn={() => setOverlay({ view: 'match-turn' })} />
      {overlay?.view === 'calibrate' && <Recalibrate open onClose={close} trail={trail} isCalibrating={isCalibrating} countdown={countdown} />}
      <WhileHolding open={holding} onClose={() => { setHolding(false); setHoldingTrigger(null) }} initialEditing={holdingTrigger} trail={[...trail, 'When is gyro on?']} source="gyro"
        renderEditor={(trigger, closeEditor, editorTrail) => <HeldScope trigger={trigger}><HeldGyroEditor trail={editorTrail} onClose={closeEditor} /></HeldScope>} />
      <WhileHolding open={tiltHolding} onClose={() => setTiltHolding(false)} trail={[...trail, 'Fine-tune', 'Tilt']} source="tilt"
        renderEditor={(trigger, closeEditor, editorTrail) => <HeldScope trigger={trigger}><HeldTiltEditor trail={editorTrail} onClose={closeEditor} /></HeldScope>} />
    </>
  )
}

/** A held variant's gyro: the Fine-tune groups, scoped to the held input. */
function HeldGyroEditor({ trail, onClose }: { trail: string[]; onClose: () => void }) {
  const [group, setGroup] = useState<GyroGroup>('speed')
  return <GyroFineTune open onClose={onClose} trail={trail} group={group} onGroup={setGroup} />
}

/** A held variant's tilt: Tilt's parts, scoped to the held input. */
function HeldTiltEditor({ trail, onClose }: { trail: string[]; onClose: () => void }) {
  const [part, setPart] = useState<TiltPart>('behaviour')
  return <TiltSettings open onClose={onClose} trail={trail} part={part} onPart={setPart} held />
}
