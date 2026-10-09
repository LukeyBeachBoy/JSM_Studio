import { useState } from 'react'
import { desktopBridge } from '../../platform/desktopBridge'
import { patchRuntimePreferences, usePreferences } from '../../platform/preferenceStore'
import { showToast } from '../../utils/toast'
import { padFeedback, setFeedbackStrength, useFeedbackStrength, type FeedbackStrength } from '../../nav/feedback'
import { useDensity, type Density } from '../../hooks/useDisplayPrefs'
import { OpenRow, SegmentedRow } from '../ui/console'
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
  const [pending, setPending] = useState(false)
  const change = async (next: boolean) => {
    setPending(true)
    const previous = runtime?.controllerNavEnabled ?? !next
    patchRuntimePreferences({ controllerNavEnabled: next })
    try {
      const state = await desktopBridge.setControllerNavEnabled(next)
      patchRuntimePreferences({ controllerNavEnabled: state.controllerNavEnabled })
      window.dispatchEvent(new CustomEvent('jsm:controller-nav', { detail: state.controllerNavEnabled }))
    } catch {
      patchRuntimePreferences({ controllerNavEnabled: previous })
      showToast('Could not change controller navigation.', 'error')
    } finally {
      setPending(false)
    }
  }
  return <SwitchRow label="Navigate this app with the controller" hint="While the app is in front, the controller moves around it instead of playing the live configuration"
    on={runtime ? runtime.controllerNavEnabled : null} pending={pending} onChange={next => void change(next)} onReset={() => void change(true)} />
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

export function ControllerSettings({ controllerType }: { controllerType?: number }) {
  return (
    <div className={styles.mainColumn} style={{ maxWidth: 980 }}>
      <div className={styles.sectionBody}>
        <NavigateRow />
        <ScreenDistanceRow />
        <RumbleRow />
        <HardwareCalibrationRow />
        <ThumbOverlayRow />
        <CountdownRow />
        <DefaultLightRow />
        <OpenRow label="This configuration’s light and sounds" hint="The light and sounds this configuration sets for itself; the ones above apply when it sets none"
          onOpen={openLightAndSounds} hints="A:Open;B:Back" data={{ 'data-open-light-sounds': '' }} />
      </div>
      <VirtualKeyboardSettings controllerType={controllerType} />
      <CalibrationAndLight />
      <ControllerSounds />
      <TrackpadRotation />
    </div>
  )
}

export { SettingsSection }
