import { useState } from 'react'
import { useTelemetry } from '../../hooks/useTelemetry'
import { selectedController } from '../../utils/controllerSelection'
import { controllerModelKey, controllerTargetKey, controllerVariantLabel, controllerLayoutDevice } from '../../utils/controllerLayouts'
import { controllerNavigationEnabled, anyControllerNavigation } from '../../utils/controllerNavigation'
import { CyborgStickDefaults } from '../sticks/CyborgStickDefaults'
import { desktopBridge } from '../../platform/desktopBridge'
import { patchRuntimePreferences, usePreferences } from '../../platform/preferenceStore'
import { showToast } from '../../utils/toast'
import { padFeedback, setFeedbackStrength, useFeedbackStrength, type FeedbackStrength } from '../../nav/feedback'
import { useDensity, type Density } from '../../hooks/useDisplayPrefs'
import { OpenRow, SegmentedRow, ValueRow } from '../ui/console'
import { CalibrationAndLight, ControllerSounds, DefaultLightRow, HardwareCalibrationRow, TrackpadRotation } from '../ControllerPreferences'
import { VirtualKeyboardSettings } from '../VirtualKeyboardSettings'
import { SettingsSection, SwitchRow } from './SettingsKit'
import styles from './Settings.module.css'

// Settings ▸ Controller (console v2, Settings.dc.html and
// SettingsControllerMore.dc.html): how the controller drives this app, then
// its keyboard, calibration and light, sounds and pads. Every row is the
// control: A turns a switch, ◂ ▸ change a choice, Y puts it back.

/** Navigate this app with the controller: the rule that pauses the live
 *  configuration while the app is in front so the pad drives it. */
function NavigateRow() {
  const { runtime } = usePreferences()
  const { sample } = useTelemetry(true)
  const devices = sample?.devices ?? []
  const [chosen, setChosen] = useState(() => selectedController() || 'type-24')
  const target = chosen || controllerTargetKey(devices[0]) || 'type-24'
  const targets = [...new Set([...devices.map(controllerTargetKey), target, ...Object.keys(runtime?.controllerNavOverrides ?? {}), 'type-24', 'type-25'])]
  const [pending, setPending] = useState(false)
  const change = async (next: boolean) => {
    if (pending) return
    setPending(true)
    try {
      const state = await desktopBridge.setControllerNavEnabled(next, target)
      patchRuntimePreferences(state)
      window.dispatchEvent(new CustomEvent('jsm:controller-nav', { detail: anyControllerNavigation(state) }))
    } catch {
      showToast('Could not change controller navigation.', 'error')
    } finally {
      setPending(false)
    }
  }
  return <>
    <SegmentedRow label="Controller for app navigation" hint="Choose the controller whose navigation preference you want to change. Saved across all configurations."
      value={target} options={targets.map(value => {
        const device = controllerLayoutDevice(value, devices)
        const siblings = devices.filter(candidate => controllerModelKey(candidate) === controllerModelKey(device))
        const index = siblings.findIndex(candidate => controllerTargetKey(candidate) === value)
        return { value, label: controllerVariantLabel(device && !value.includes('-device-') ? { ...device, controllerId: undefined } : device) + (siblings.length > 1 && index >= 0 ? ` · Controller ${index + 1}` : !value.includes('-device-') ? ' defaults' : '') }
      })} onChange={setChosen} disabled={pending ? 'Saving navigation preference' : undefined} />
    <SwitchRow label="Navigate this app with the controller" hint="Applies only to the controller chosen above. When off, its normal configuration stays active while this app is in front."
      on={runtime ? controllerNavigationEnabled(runtime, target) : null} pending={pending} onChange={next => void change(next)} onReset={() => void change(target.split('-device-')[0] !== 'type-25')} />
  </>
}

/** Show where my thumb is on the trackpads: the always-on-top overlay. */
function ThumbOverlayRow() {
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const change = async (next: boolean) => {
    setPending(true)
    patchRuntimePreferences({ trackpadOverlayEnabled: next })
    try { await desktopBridge.setTrackpadOverlayEnabled(next) } catch { patchRuntimePreferences({ trackpadOverlayEnabled: !next }) }
    setPending(false)
  }
  return <SwitchRow label="Show where my thumb is on the trackpads" hint="Draws the pad's menu and your thumb over the game. Games in borderless windowed only"
    on={runtime ? Boolean(runtime.trackpadOverlayEnabled) : null} pending={pending} onChange={next => void change(next)} onReset={() => void change(false)} />
}

/** Show a countdown while calibrating: the calibration HUD over games. */
function CountdownRow() {
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const change = async (next: boolean) => {
    setPending(true)
    patchRuntimePreferences({ calibrationHudEnabled: next })
    const state = await desktopBridge.setCalibrationHudEnabled(next)
    if (!state) patchRuntimePreferences({ calibrationHudEnabled: !next })
    setPending(false)
  }
  return <SwitchRow label="Show a countdown while calibrating" hint="Over the game, so you know when to put the controller down and when it is done"
    on={runtime ? runtime.calibrationHudEnabled !== false : null} pending={pending} onChange={next => void change(next)} onReset={() => void change(true)} />
}

const RUMBLE: { value: FeedbackStrength; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

/** Rumble when moving around the app ◂ Medium ▸ (nav/feedback.ts). */
function RumbleRow() {
  const strength = useFeedbackStrength()
  return <SegmentedRow label="Rumble when moving around the app" hint="Ticks as you move, choose and step; pads without haptics get a short rumble"
    value={strength} options={RUMBLE} onChange={next => { setFeedbackStrength(next as FeedbackStrength); padFeedback('select') }} onReset={() => setFeedbackStrength('medium')} />
}

const DISTANCES: { value: Density; label: string; caption: string }[] = [
  { value: 'couch', label: 'Couch', caption: 'Bigger text and targets for playing from across the room. Desk keeps today’s density.' },
  { value: 'desk', label: 'Desk', caption: 'Today’s density, for a screen at arm’s length. Couch makes text and targets bigger.' },
]

/** Screen distance ◂ Couch ▸ (V10), also on Look & language. */
export function ScreenDistanceRow() {
  const { density, setDensity } = useDensity()
  return <SegmentedRow label="Screen distance" value={density} options={DISTANCES} onChange={next => setDensity(next as Density)} onReset={() => setDensity('desk')} data={{ 'data-setting-row': 'density' }} />
}

/** MODES' light and sounds surface (also on Layout's quick menu): a cancelable
 *  event, so whoever listens takes it. */
const openLightAndSounds = () => { window.dispatchEvent(new CustomEvent('jsm:open-light-sounds', { cancelable: true })) }

function ControllerPolling() {
  const { runtime } = usePreferences()
  const [pending, setPending] = useState(false)
  const interval = runtime?.defaultPollingMs ?? 3
  const change = async (value: number) => {
    if (pending) return
    setPending(true)
    try { patchRuntimePreferences(await desktopBridge.setDefaultPollingMs(value)) }
    catch (error) { showToast(`Could not save controller polling: ${error instanceof Error ? error.message : String(error)}`, 'error') }
    finally { setPending(false) }
  }
  return <SettingsSection title="Controller input">
    <ValueRow global setting="TICK_TIME" label="Controller polling" value={interval} min={1} max={100} step={1} fineStep={0.5}
      hint={`Shared default for all controller inputs · approximately ${Math.round(1000 / interval)} reads per second`}
      caption="This is the mapper's read interval, not the controller's hardware report rate. Configurations can override it."
      format={value => `Every ${value} ms`} disabled={!runtime ? 'Loading controller settings…' : pending ? 'Saving controller polling…' : undefined}
      onChange={value => void change(value)} onReset={() => void change(3)} data={{ 'data-controller-polling': '' }} />
    <OpenRow label="This configuration’s polling override" hint="Open Buttons → Configuration timing. Existing overrides stay unchanged."
      onOpen={() => window.dispatchEvent(new Event('jsm:open-configuration-timing'))} />
  </SettingsSection>
}

const CONTROLLER_AREAS = [
  ['navigation', 'App navigation'], ['overlays', 'Overlays & light'], ['keyboard', 'On-screen keyboard'],
  ['calibration', 'Calibration'], ['sounds', 'Sounds'], ['trackpads', 'Trackpads'], ['cyborg', 'Cyborg defaults'],
] as const

export function ControllerSettings({ controllerType }: { controllerType?: number }) {
  const [area, setArea] = useState<string>(() => { try { const saved = sessionStorage.getItem('jsm:controller-settings-area'); return CONTROLLER_AREAS.some(([value]) => value === saved) ? saved! : 'navigation' } catch { return 'navigation' } })
  const chooseArea = (value: string) => { setArea(value); try { sessionStorage.setItem('jsm:controller-settings-area', value) } catch { /* Storage may be disabled. */ } }
  return (
    <div className={styles.mainColumn} style={{ maxWidth: 980 }}>
      <ControllerPolling />
      <nav className={styles.areaNav} aria-label="Controller settings groups">
        {CONTROLLER_AREAS.map(([value, label]) => <button type="button" key={value} aria-pressed={area === value}
          aria-controls={`controller-area-${value}`} onClick={() => chooseArea(value)}>{label}</button>)}
      </nav>
      <div id="controller-area-navigation" hidden={area !== 'navigation'}>
        <SettingsSection title="App navigation"><NavigateRow /><RumbleRow /></SettingsSection>
      </div>
      <div id="controller-area-overlays" hidden={area !== 'overlays'}>
        <SettingsSection title="Overlays & light">
          <ThumbOverlayRow /><CountdownRow /><DefaultLightRow />
          <OpenRow label="This configuration’s light and sounds" hint="Overrides the default light and sounds for this configuration"
            onOpen={openLightAndSounds} hints="A:Open;B:Back" data={{ 'data-open-light-sounds': '' }} />
        </SettingsSection>
      </div>
      <div id="controller-area-keyboard" hidden={area !== 'keyboard'}><VirtualKeyboardSettings controllerType={controllerType} /></div>
      <div id="controller-area-calibration" hidden={area !== 'calibration'}>
        <SettingsSection title="Hardware calibration"><HardwareCalibrationRow /></SettingsSection>
        <CalibrationAndLight />
      </div>
      <div id="controller-area-sounds" hidden={area !== 'sounds'}><ControllerSounds /></div>
      <div id="controller-area-trackpads" hidden={area !== 'trackpads'}><TrackpadRotation /></div>
      <div id="controller-area-cyborg" hidden={area !== 'cyborg'}><LiveCyborgDefaults /></div>
    </div>
  )
}

export { SettingsSection }

function LiveCyborgDefaults() {
  const { sample } = useTelemetry()
  const device = sample?.devices?.find(device => device.type === 25)
  return <CyborgStickDefaults raw={device?.status?.leftStick ?? null} />
}
