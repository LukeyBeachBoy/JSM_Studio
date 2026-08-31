import { useMemo, useState } from 'react'
import { getKeymapValue } from '../utils/keymap'
import { keyName } from '../constants/configKeys'
import { useSensitivityConfig } from './useSensitivityConfig'
import { useTouchpadConfig } from './useTouchpadConfig'
import { useStickConfig } from './useStickConfig'
import { useBindingsConfig } from './useBindingsConfig'

export function useKeymapConfig() {
  const [configText, setConfigText] = useState('')
  const [appliedConfig, setAppliedConfig] = useState('')

  const sensitivityConfig = useSensitivityConfig({ configText, setConfigText })
  const touchpadConfig = useTouchpadConfig({ configText, setConfigText })
  const stickConfig = useStickConfig({ configText, setConfigText })
  const bindingsConfig = useBindingsConfig({ configText, setConfigText })

  const ignoredGyroDevices = useMemo(() => {
    const raw = getKeymapValue(configText, keyName.IGNORE_GYRO_DEVICES) ?? ''
    return raw
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
      .map(token => token.toLowerCase())
  }, [configText])

  const hasPendingChanges = configText !== appliedConfig || sensitivityConfig.hasPendingSensitivityChanges
  const handleCancel = () => {
    sensitivityConfig.resetPendingSensitivityChanges()
    setConfigText(appliedConfig)
  }

  return {
    configText,
    setConfigText,
    appliedConfig,
    setAppliedConfig,
    hasPendingChanges,
    handleCancel,
    ignoredGyroDevices,
    finalizePendingValues: sensitivityConfig.finalizePendingValues,
    // Sensitivity slice
    sensitivityView: sensitivityConfig.sensitivityView,
    setSensitivityView: sensitivityConfig.setSensitivityView,
    sensitivityModeshiftButton: sensitivityConfig.sensitivityModeshiftButton,
    sensitivity: sensitivityConfig.sensitivity,
    modeshiftSensitivity: sensitivityConfig.modeshiftSensitivity,
    activeSensitivityPrefix: sensitivityConfig.activeSensitivityPrefix,
    baseMode: sensitivityConfig.baseMode,
    modeshiftMode: sensitivityConfig.modeshiftMode,
    selectedBaseMode: sensitivityConfig.selectedBaseMode,
    selectedModeshiftMode: sensitivityConfig.selectedModeshiftMode,
    holdPressTimeSeconds: sensitivityConfig.holdPressTimeSeconds,
    holdPressTimeIsCustom: sensitivityConfig.holdPressTimeIsCustom,
    doublePressWindowSeconds: sensitivityConfig.doublePressWindowSeconds,
    doublePressWindowIsCustom: sensitivityConfig.doublePressWindowIsCustom,
    simPressWindowSeconds: sensitivityConfig.simPressWindowSeconds,
    simPressWindowIsCustom: sensitivityConfig.simPressWindowIsCustom,
    lightBarColor: sensitivityConfig.lightBarColor,
    handleLightBarChange: sensitivityConfig.handleLightBarChange,
    triggerThresholdValue: sensitivityConfig.triggerThresholdValue,
    handleSensitivityModeshiftButtonChange: sensitivityConfig.handleSensitivityModeshiftButtonChange,
    handleThresholdChange: sensitivityConfig.handleThresholdChange,
    handleCutoffSpeedChange: sensitivityConfig.handleCutoffSpeedChange,
    handleCutoffRecoveryChange: sensitivityConfig.handleCutoffRecoveryChange,
    handleSmoothTimeChange: sensitivityConfig.handleSmoothTimeChange,
    handleSmoothThresholdChange: sensitivityConfig.handleSmoothThresholdChange,
    handleSmoothingDecayChange: sensitivityConfig.handleSmoothingDecayChange,
    handleOneEuroFilterChange: sensitivityConfig.handleOneEuroFilterChange,
    handleOneEuroMinCutoffChange: sensitivityConfig.handleOneEuroMinCutoffChange,
    handleOneEuroSpeedCoeffChange: sensitivityConfig.handleOneEuroSpeedCoeffChange,
    handleAngleSnapChange: sensitivityConfig.handleAngleSnapChange,
    handleAngleSnapSmoothChange: sensitivityConfig.handleAngleSnapSmoothChange,
    handleDecelBrakeStrengthChange: sensitivityConfig.handleDecelBrakeStrengthChange,
    handleDecelBrakeThresholdChange: sensitivityConfig.handleDecelBrakeThresholdChange,
    handleTickTimeChange: sensitivityConfig.handleTickTimeChange,
    handleHoldPressTimeChange: sensitivityConfig.handleHoldPressTimeChange,
    handleDoublePressWindowChange: sensitivityConfig.handleDoublePressWindowChange,
    handleSimPressWindowChange: sensitivityConfig.handleSimPressWindowChange,
    handleTriggerThresholdChange: sensitivityConfig.handleTriggerThresholdChange,
    handleGyroSpaceChange: sensitivityConfig.handleGyroSpaceChange,
    handleGyroAxisXChange: sensitivityConfig.handleGyroAxisXChange,
    handleGyroAxisYChange: sensitivityConfig.handleGyroAxisYChange,
    handleGyroOutputChange: sensitivityConfig.handleGyroOutputChange,
    handleDualSensChange: sensitivityConfig.handleDualSensChange,
    handleStaticSensChange: sensitivityConfig.handleStaticSensChange,
    handleRollContributionChange: sensitivityConfig.handleRollContributionChange,
    handleModeSelection: sensitivityConfig.handleModeSelection,
    handleInGameSensChange: sensitivityConfig.handleInGameSensChange,
    handleRealWorldCalibrationChange: sensitivityConfig.handleRealWorldCalibrationChange,
    switchToStaticMode: sensitivityConfig.switchToStaticMode,
    handleAccelCurveChange: sensitivityConfig.handleAccelCurveChange,
    handleNaturalVHalfChange: sensitivityConfig.handleNaturalVHalfChange,
    handlePowerVRefChange: sensitivityConfig.handlePowerVRefChange,
    handlePowerExponentChange: sensitivityConfig.handlePowerExponentChange,
    handleJumpTauChange: sensitivityConfig.handleJumpTauChange,
    handleSigmoidMidChange: sensitivityConfig.handleSigmoidMidChange,
    handleSigmoidWidthChange: sensitivityConfig.handleSigmoidWidthChange,
    switchToAccelMode: sensitivityConfig.switchToAccelMode,
    // Touchpad slice
    touchpadModeValue: touchpadConfig.touchpadModeValue,
    lightTouchThreshold: touchpadConfig.lightTouchThreshold,
    handleLightTouchThresholdChange: touchpadConfig.handleLightTouchThresholdChange,
    leftTouchpadModeValue: touchpadConfig.leftTouchpadModeValue,
    rightTouchpadModeValue: touchpadConfig.rightTouchpadModeValue,
    leftGridSizeValue: touchpadConfig.leftGridSizeValue,
    rightGridSizeValue: touchpadConfig.rightGridSizeValue,
    leftTouchpadSensitivityValue: touchpadConfig.leftTouchpadSensitivityValue,
    rightTouchpadSensitivityValue: touchpadConfig.rightTouchpadSensitivityValue,
    leftTouchpadDualStageModeValue: touchpadConfig.leftTouchpadDualStageModeValue,
    rightTouchpadDualStageModeValue: touchpadConfig.rightTouchpadDualStageModeValue,
    gridSizeValue: touchpadConfig.gridSizeValue,
    touchpadSensitivityValue: touchpadConfig.touchpadSensitivityValue,
    touchpadDualStageModeValue: touchpadConfig.touchpadDualStageModeValue,
    touchStickModeValue: touchpadConfig.touchStickModeValue,
    touchDeadzoneInnerValue: touchpadConfig.touchDeadzoneInnerValue,
    touchRingModeValue: touchpadConfig.touchRingModeValue,
    touchStickRadiusValue: touchpadConfig.touchStickRadiusValue,
    touchStickAxisValue: touchpadConfig.touchStickAxisValue,
    touchpadWarnings: touchpadConfig.touchpadWarnings,
    handleTouchpadModeChange: touchpadConfig.handleTouchpadModeChange,
    handleLeftTouchpadModeChange: touchpadConfig.handleLeftTouchpadModeChange,
    handleRightTouchpadModeChange: touchpadConfig.handleRightTouchpadModeChange,
    handleGridSizeChange: touchpadConfig.handleGridSizeChange,
    handleLeftGridSizeChange: touchpadConfig.handleLeftGridSizeChange,
    handleRightGridSizeChange: touchpadConfig.handleRightGridSizeChange,
    handleTouchpadSensitivityChange: touchpadConfig.handleTouchpadSensitivityChange,
    handleLeftTouchpadSensitivityChange: touchpadConfig.handleLeftTouchpadSensitivityChange,
    handleRightTouchpadSensitivityChange: touchpadConfig.handleRightTouchpadSensitivityChange,
    handleTouchpadDualStageModeChange: touchpadConfig.handleTouchpadDualStageModeChange,
    handleLeftTouchpadDualStageModeChange: touchpadConfig.handleLeftTouchpadDualStageModeChange,
    handleRightTouchpadDualStageModeChange: touchpadConfig.handleRightTouchpadDualStageModeChange,
    handleTouchStickModeChange: touchpadConfig.handleTouchStickModeChange,
    handleTouchDeadzoneInnerChange: touchpadConfig.handleTouchDeadzoneInnerChange,
    handleTouchRingModeChange: touchpadConfig.handleTouchRingModeChange,
    handleTouchStickRadiusChange: touchpadConfig.handleTouchStickRadiusChange,
    handleTouchStickAxisChange: touchpadConfig.handleTouchStickAxisChange,
    // Stick slice
    handleStickDeadzoneChange: stickConfig.handleStickDeadzoneChange,
    handleStickModeChange: stickConfig.handleStickModeChange,
    handleRingModeChange: stickConfig.handleRingModeChange,
    handleStickModeShiftChange: stickConfig.handleStickModeShiftChange,
    handleAdaptiveTriggerChange: stickConfig.handleAdaptiveTriggerChange,
    stickAimHandlers: stickConfig.stickAimHandlers,
    stickFlickSettings: stickConfig.stickFlickSettings,
    stickFlickHandlers: stickConfig.stickFlickHandlers,
    mouseRingRadiusValue: stickConfig.mouseRingRadiusValue,
    handleMouseRingRadiusChange: stickConfig.handleMouseRingRadiusChange,
    counterOsMouseSpeedEnabled: stickConfig.counterOsMouseSpeedEnabled,
    handleCounterOsMouseSpeedChange: stickConfig.handleCounterOsMouseSpeedChange,
    stickDeadzoneDefaults: stickConfig.stickDeadzoneDefaults,
    leftStickDeadzone: stickConfig.leftStickDeadzone,
    rightStickDeadzone: stickConfig.rightStickDeadzone,
    stickModes: stickConfig.stickModes,
    stickModeShiftAssignments: stickConfig.stickModeShiftAssignments,
    stickAimSettings: stickConfig.stickAimSettings,
    adaptiveTriggerValue: stickConfig.adaptiveTriggerValue,
    zlModeValue: stickConfig.zlModeValue,
    zrModeValue: stickConfig.zrModeValue,
    handleZlModeChange: stickConfig.handleZlModeChange,
    handleZrModeChange: stickConfig.handleZrModeChange,
    handleStickSensChange: stickConfig.handleStickSensChange,
    handleStickPowerChange: stickConfig.handleStickPowerChange,
    handleStickAccelerationRateChange: stickConfig.handleStickAccelerationRateChange,
    handleStickAccelerationCapChange: stickConfig.handleStickAccelerationCapChange,
    handleToggleIgnoreGyroDevice: stickConfig.handleToggleIgnoreGyroDevice,
    scrollSensValue: stickConfig.scrollSensValue,
    handleScrollSensChange: stickConfig.handleScrollSensChange,
    // Bindings slice
    handleFaceButtonBindingChange: bindingsConfig.handleFaceButtonBindingChange,
    handleModifierChange: bindingsConfig.handleModifierChange,
    handleSpecialActionAssignment: bindingsConfig.handleSpecialActionAssignment,
    handleClearSpecialAction: bindingsConfig.handleClearSpecialAction,
    gyroActivation: bindingsConfig.gyroActivation,
    handleGyroActivationModeChange: bindingsConfig.handleGyroActivationModeChange,
    handleGyroActivationButtonChange: bindingsConfig.handleGyroActivationButtonChange,
    trackballDecayValue: bindingsConfig.trackballDecayValue,
    handleTrackballDecayChange: bindingsConfig.handleTrackballDecayChange,
    virtualControllerType: bindingsConfig.virtualControllerType,
    virtualControllerWarnings: bindingsConfig.virtualControllerWarnings,
    handleVirtualControllerTypeChange: bindingsConfig.handleVirtualControllerTypeChange,
    resetPendingSensitivityChanges: sensitivityConfig.resetPendingSensitivityChanges,
  }
}
