import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { GyroPage, type GyroPageProps } from './GyroPage'
import { InputModeshifts } from './keymap/InputModeshifts'
import { useSensitivityConfig } from '../hooks/useSensitivityConfig'
import { foldModeshift, projectModeshift, type ModeshiftTarget } from '../utils/modeshift'
import { isGyroModeshiftKey, TILT_MODESHIFT_KEYS, SHARED_MOTION_OUTPUT_KEYS } from '../utils/gyroSettingsScope'
import { MotionInputTuning } from './MotionInputTuning'
import { STICK_MODE_VALUES, formatStickModeLabel } from '../constants/sticks'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { getKeymapValue, updateKeymapEntry, removeKeymapEntry } from '../utils/keymap'
import { controllerVisualFamily } from '../utils/controllerStatus'

export function GyroModeshifts({ input = 'gyro', ...props }: GyroPageProps & { input?: 'gyro' | 'tilt' }) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(props.devices?.[0]?.type)
  const target = useMemo<ModeshiftTarget>(() => ({
    id: input, title: input === 'gyro' ? 'Gyro' : 'Tilt', buttons: [],
    settings: [...new Set(props.configText.split(/\r?\n/).flatMap(line => {
      const match = line.match(/^\s*[^#,=]+,\s*([^=]+?)\s*=/)
      const key = match?.[1].trim().toUpperCase()
      return key && (input === 'gyro' ? isGyroModeshiftKey(key) : TILT_MODESHIFT_KEYS.test(key) || SHARED_MOTION_OUTPUT_KEYS.test(key)) ? [key] : []
    }))],
    mode: input === 'tilt' ? { key: 'MOTION_STICK_MODE', defaultValue: 'NO_MOUSE', options: [...STICK_MODE_VALUES, 'LEFT_STEER_X', 'RIGHT_STEER_X'].map(value => ({ value, label: value === 'NO_MOUSE' ? 'Directional actions' : formatStickModeLabel(value, t) })) } : { key: 'GYRO_OUTPUT', defaultValue: 'MOUSE', options: [
      { value: 'MOUSE', label: 'Mouse' }, { value: 'LEFT_STICK', label: 'Left joystick' },
      { value: 'RIGHT_STICK', label: 'Right joystick' }, { value: 'PS_MOTION', label: 'PlayStation motion' },
    ] },
  }), [props.configText, input, t])
  return <InputModeshifts heading={`${target.title} modeshifts`} target={target} text={props.configText} onChange={props.setConfigText}
    controllerFamily={family} virtualControllerType="NONE"
    modifiers={buildModifierOptions(props.touchpadMode === 'GRID_AND_STICK', props.touchpadGridCells, props.touchpadGridCommands).map(option => ({ ...option, label: resolveModifierOptionLabel(option, t, family) }))}
    beginValueCapture={() => undefined} isCapturingValue={() => false} captureLabel=""
    actions={{ hasPendingChanges: props.hasPendingChanges, onApply: props.onApply, onCancel: props.onCancel }}
    renderEditor={trigger => input === 'gyro' ? <ShiftedGyroEditor {...props} trigger={trigger} /> :
      <MotionInputTuning text={props.configText} setText={props.setConfigText} prefix={`${trigger},`} disabled={props.isCalibrating}
        deviceType={props.devices?.[0]?.type} gridCommands={props.touchpadGridCommands} />} />
}

function ShiftedGyroEditor({ trigger, ...props }: GyroPageProps & { trigger: string }) {
  const projected = useMemo(() => projectModeshift(props.configText, trigger), [props.configText, trigger])
  const { setConfigText } = props
  const setProjected = useCallback<Dispatch<SetStateAction<string>>>(update => {
    const next = typeof update === 'function' ? update(projected) : update
    // Virtual device creation is global even when selected from a shifted editor.
    const controller = getKeymapValue(next, 'VIRTUAL_CONTROLLER')
    const originalController = getKeymapValue(projected, 'VIRTUAL_CONTROLLER')
    const controllerChanged = controller !== originalController
    const scoped = !controllerChanged ? next : originalController
      ? updateKeymapEntry(next, 'VIRTUAL_CONTROLLER', [originalController])
      : removeKeymapEntry(next, 'VIRTUAL_CONTROLLER')
    setConfigText(previous => {
      const folded = foldModeshift(previous, trigger, scoped, {}, projected)
      return !controllerChanged ? folded : controller
        ? updateKeymapEntry(folded, 'VIRTUAL_CONTROLLER', [controller])
        : removeKeymapEntry(folded, 'VIRTUAL_CONTROLLER')
    })
  }, [projected, setConfigText, trigger])
  const tuning = useSensitivityConfig({ configText: projected, setConfigText: setProjected })
  const commitPending = () => { if (tuning.hasPendingSensitivityChanges) tuning.finalizePendingValues() }
  return <div onBlurCapture={commitPending} onKeyDownCapture={event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') commitPending()
  }}><GyroPage {...props} embedded configText={projected} setConfigText={setProjected}
    sensitivity={tuning.sensitivity} modeshiftSensitivity={undefined} sensitivityView="base" modeshiftButton={null}
    mode={tuning.selectedBaseMode ?? tuning.baseMode} onModeChange={tuning.handleModeSelection}
    onMinThresholdChange={tuning.handleThresholdChange('MIN_GYRO_THRESHOLD')}
    onMaxThresholdChange={tuning.handleThresholdChange('MAX_GYRO_THRESHOLD')}
    onMinSensXChange={tuning.handleDualSensChange('MIN_GYRO_SENS', 0)}
    onMinSensYChange={tuning.handleDualSensChange('MIN_GYRO_SENS', 1)}
    onMaxSensXChange={tuning.handleDualSensChange('MAX_GYRO_SENS', 0)}
    onMaxSensYChange={tuning.handleDualSensChange('MAX_GYRO_SENS', 1)}
    onStaticSensXChange={tuning.handleStaticSensChange(0)} onStaticSensYChange={tuning.handleStaticSensChange(1)}
    accelCurveLink={undefined} onAccelCurveLinkChange={undefined}
    onInGameSensChange={tuning.handleInGameSensChange}
    onRealWorldCalibrationChange={tuning.handleRealWorldCalibrationChange}
    onGyroSpaceChange={tuning.handleGyroSpaceChange}
    onGyroAxisXChange={tuning.handleGyroAxisXChange}
    onGyroAxisYChange={tuning.handleGyroAxisYChange}
    onGyroOutputChange={tuning.handleGyroOutputChange}
    onAccelCurveChange={tuning.handleAccelCurveChange}
    onNaturalVHalfChange={tuning.handleNaturalVHalfChange}
    onPowerVRefChange={tuning.handlePowerVRefChange}
    onPowerExponentChange={tuning.handlePowerExponentChange}
    onSigmoidMidChange={tuning.handleSigmoidMidChange}
    onSigmoidWidthChange={tuning.handleSigmoidWidthChange}
    onJumpTauChange={tuning.handleJumpTauChange}
    onRollContributionChange={tuning.handleRollContributionChange}
    onCutoffSpeedChange={tuning.handleCutoffSpeedChange}
    onCutoffRecoveryChange={tuning.handleCutoffRecoveryChange}
    onSteadyingFloorChange={tuning.handleSteadyingFloorChange}
    onSmoothTimeChange={tuning.handleSmoothTimeChange}
    onSmoothThresholdChange={tuning.handleSmoothThresholdChange}
    onSmoothingDecayChange={tuning.handleSmoothingDecayChange}
    onOneEuroFilterChange={tuning.handleOneEuroFilterChange}
    onOneEuroMinCutoffChange={tuning.handleOneEuroMinCutoffChange}
    onOneEuroSpeedCoeffChange={tuning.handleOneEuroSpeedCoeffChange}
    onAngleSnapChange={tuning.handleAngleSnapChange}
    onAngleSnapSmoothChange={tuning.handleAngleSnapSmoothChange}
    onDecelBrakeStrengthChange={tuning.handleDecelBrakeStrengthChange}
    onDecelBrakeThresholdChange={tuning.handleDecelBrakeThresholdChange}
    onGyroClickDampenChange={tuning.handleGyroClickDampenChange}
  /></div>
}
