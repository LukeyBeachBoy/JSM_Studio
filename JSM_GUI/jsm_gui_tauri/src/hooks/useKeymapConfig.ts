import { useConfigHistory } from './useConfigHistory'
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { defaultLayer, foldLayer, projectLayer, readLayers, writeLayers } from '../utils/layers'
import { getKeymapValue } from '../utils/keymap'
import { keyName } from '../constants/configKeys'
import { useSensitivityConfig } from './useSensitivityConfig'
import { useTouchpadConfig } from './useTouchpadConfig'
import { useGripConfig } from './useGripConfig'
import { useStickConfig } from './useStickConfig'
import { useBindingsConfig } from './useBindingsConfig'
import { useConfigIncludes } from './useConfigIncludes'
import { INCLUDE_ROOT } from '../utils/configIncludes'
import { dropRedundantOverrides } from '../utils/inheritedOverrides'
import { controllerBase, projectController, foldController } from '../utils/controllerLayouts'

export function useKeymapConfig(controllerModel = '') {
  const history = useConfigHistory()
  const { text: documentText, setText: setDocumentText } = history
  const [selectedLayer, selectLayer] = useState('')
  // Memoized because this hook re-renders with every telemetry frame, and each
  // of these is a full pass over the profile (split, a regex per line, a
  // JSON.parse per layer). The text only changes when the profile is edited.
  const baseText = useMemo(() => controllerBase(defaultLayer(documentText)), [documentText])
  const includes = useConfigIncludes(baseText, INCLUDE_ROOT)
  const controllerProjection = useCallback((text: string) => controllerModel ? projectController(text, controllerModel, includes.resolveText(controllerBase(text))) : text, [controllerModel, includes.resolveText])
  const projectedDocument = useMemo(() => controllerProjection(documentText), [controllerProjection, documentText])
  const layers = useMemo(() => readLayers(projectedDocument), [projectedDocument])
  const layerId = layers.some(layer => layer.id === selectedLayer) ? selectedLayer : ''
  const projection = useCallback((text: string) => {
    const projected = controllerProjection(text)
    return projectLayer(layerId ? writeLayers(includes.resolveText(defaultLayer(projected)), readLayers(projected)) : projected, layerId)
  }, [layerId, includes.resolveText, controllerProjection])
  const fold = useCallback((document: string, id: string, next: string, before: string) => {
    const projected = controllerProjection(document)
    const edited = foldLayer(projected, id, next, before)
    return controllerModel ? foldController(document, controllerModel, projected, edited) : edited
  }, [controllerModel, controllerProjection])
  const configText = useMemo(() => projection(documentText), [projection, documentText])
  // Every edit made through the controls lands here, so this is where a value
  // set back to what the imports already say stops being an override (see
  // utils/inheritedOverrides). Only the Default layer: a layer's overrides
  // are measured against Default, which foldLayer owns. A profile that
  // imports nothing has nothing to inherit, and is passed straight through.
  const hasImports = includes.resolution !== null
  const settle = useCallback((id: string, before: string, after: string) =>
    id || !hasImports ? after : dropRedundantOverrides(before, after, includes.resolveText), [hasImports, includes.resolveText])
  const setConfigText: Dispatch<SetStateAction<string>> = useCallback(update => {
    setDocumentText(previous => {
      const before = projection(previous)
      return fold(previous, layerId, settle(layerId, before, typeof update === 'function' ? update(before) : update), before)
    })
  }, [layerId, setDocumentText, projection, settle, fold])
  const resetConfigHistory = useCallback((text: string) => { selectLayer(''); history.reset(text) }, [history.reset])
  // The same projection and write, for a layer other than the one being
  // edited: On-screen menus (2d) draws and moves every layer's menus at once.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resolveText is the only part of includes it reads, as with projection above
  const projectionFor = useCallback((id: string, text: string) => {
    const projected = controllerProjection(text)
    return projectLayer(id ? writeLayers(includes.resolveText(defaultLayer(projected)), readLayers(projected)) : projected, id)
  }, [includes.resolveText, controllerProjection])
  const setConfigTextFor = useCallback((id: string, update: (previous: string) => string) => {
    setDocumentText(previous => {
      const before = projectionFor(id, previous)
      return fold(previous, id, settle(id, before, update(before)), before)
    })
  }, [setDocumentText, projectionFor, settle, fold])
  const [appliedConfig, setAppliedConfig] = useState('')

  // A profile that imports a template is not the same thing as the text in its
  // file. Every read below goes through the resolved text so inherited settings
  // show up; writes still go to configText, so changing an inherited value
  // writes an override into this profile rather than editing the template.
  const readText = useMemo(() => projectLayer(writeLayers(controllerModel ? projectedDocument : includes.effectiveText, layers), layerId), [includes.effectiveText, layers, layerId, controllerModel, projectedDocument])

  const sensitivityConfig = useSensitivityConfig({ configText, readText, setConfigText })
  const touchpadConfig = useTouchpadConfig({ configText, readText, setConfigText })
  const gripConfig = useGripConfig({ configText, readText, setConfigText })
  const stickConfig = useStickConfig({ configText, readText, setConfigText })
  const bindingsConfig = useBindingsConfig({ configText, readText, setConfigText })

  const ignoredGyroDevices = useMemo(() => {
    const raw = getKeymapValue(readText, keyName.IGNORE_GYRO_DEVICES) ?? ''
    return raw
      .split(/\s+/)
      .map(token => token.trim())
      .filter(Boolean)
      .map(token => token.toLowerCase())
  }, [readText])

  // Compared in the form an edit leaves the text in. The first edit folds the
  // document through writeLayers, which re-emits the layer block and trims
  // the end, so a hand-written file that was touched and put back (a slider
  // adjusted and reverted with B, a value cleared again) differed from the
  // loaded text by layout alone and read as unsaved for good.
  const canonical = useCallback((text: string) => writeLayers(text, readLayers(text)), [])
  const textChanged = useMemo(() => documentText !== appliedConfig && canonical(documentText) !== canonical(appliedConfig), [documentText, appliedConfig, canonical])
  // A sensitivity draft only counts when saving would still write something:
  // every value typed is already in the text, so a draft typed and then set
  // back (or set back to what the imports say) is not an unsaved change.
  // Asked of the side-effect-free preview: finalizing itself clears the
  // drafts and writes the text, which must never happen while rendering.
  const { hasPendingSensitivityChanges, pendingSensitivity, previewPendingValues } = sensitivityConfig
  const draftChanged = useMemo(() => {
    if (!hasPendingSensitivityChanges) return false
    const finalized = fold(documentText, layerId, settle(layerId, configText, previewPendingValues(pendingSensitivity)), configText)
    return finalized !== appliedConfig && canonical(finalized) !== canonical(appliedConfig)
  }, [hasPendingSensitivityChanges, pendingSensitivity, previewPendingValues, documentText, layerId, configText, appliedConfig, settle, canonical, fold])
  const hasPendingChanges = textChanged || draftChanged
  const handleCancel = () => {
    sensitivityConfig.resetPendingSensitivityChanges()
    setDocumentText(appliedConfig)
  }

  return {
    documentText, setDocumentText, layers, layerId, projectedDocument,
    setDocumentTextAsAction: history.setTextAsAction,
    selectCreatedLayer: selectLayer,
    selectLayer: (id: string) => {
      setConfigText(sensitivityConfig.finalizePendingValues())
      sensitivityConfig.resetPendingSensitivityChanges()
      selectLayer(id)
    },
    savedLayerText: projection(appliedConfig),
    foldConfigText: (text: string) => fold(documentText, layerId, text, configText),
    configText,
    // The text the runtime would execute: this profile with its imports
    // resolved in place. Read-only -- never save it over a profile.
    effectiveConfigText: readText,
    configIncludes: { ...includes, effectiveText: readText },
    /** Import-resolved text as the given layer reads it (every layer, not just the edited one). */
    readTextFor: (id: string) => projectionFor(id, documentText),
    setConfigTextFor,
    setConfigText,
    resetConfigHistory,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoTarget: history.undoTarget,
    redoTarget: history.redoTarget,
    undo: () => { sensitivityConfig.resetPendingSensitivityChanges(); history.undo() },
    redo: () => { sensitivityConfig.resetPendingSensitivityChanges(); history.redo() },
    appliedConfig,
    setAppliedConfig,
    hasPendingChanges,
    handleCancel,
    ignoredGyroDevices,
    // Pending sensitivity drafts are written back here on save, so they go
    // through the same check: a draft equal to the import writes no line.
    finalizePendingValues: () => fold(documentText, layerId, settle(layerId, configText, sensitivityConfig.finalizePendingValues()), configText),
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
    handleSteadyingFloorChange: sensitivityConfig.handleSteadyingFloorChange,
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
    handleGyroClickDampenChange: sensitivityConfig.handleGyroClickDampenChange,
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
    handleDualSensPairChange: sensitivityConfig.handleDualSensPairChange,
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
    touchpadMinCutoffValue: touchpadConfig.touchpadMinCutoffValue,
    touchpadSpeedCoeffValue: touchpadConfig.touchpadSpeedCoeffValue,
    touchpadTrackballDecayValue: touchpadConfig.touchpadTrackballDecayValue,
    touchpadTrackballMinVelocityValue: touchpadConfig.touchpadTrackballMinVelocityValue,
    handleTouchpadMinCutoffChange: touchpadConfig.handleTouchpadMinCutoffChange,
    handleTouchpadSpeedCoeffChange: touchpadConfig.handleTouchpadSpeedCoeffChange,
    handleTouchpadTrackballDecayChange: touchpadConfig.handleTouchpadTrackballDecayChange,
    handleTouchpadTrackballMinVelocityChange: touchpadConfig.handleTouchpadTrackballMinVelocityChange,
    touchpadMovementThresholdValue: touchpadConfig.touchpadMovementThresholdValue,
    handleTouchpadMovementThresholdChange: touchpadConfig.handleTouchpadMovementThresholdChange,
    touchpadHapticIntensityValue: touchpadConfig.touchpadHapticIntensityValue,
    touchpadHapticEffectValue: touchpadConfig.touchpadHapticEffectValue,
    touchpadHapticIntervalValue: touchpadConfig.touchpadHapticIntervalValue,
    touchpadClickHapticIntensityValue: touchpadConfig.touchpadClickHapticIntensityValue,
    touchpadClickHapticEffectValue: touchpadConfig.touchpadClickHapticEffectValue,
    handleTouchpadHapticIntensityChange: touchpadConfig.handleTouchpadHapticIntensityChange,
    handleTouchpadHapticEffectChange: touchpadConfig.handleTouchpadHapticEffectChange,
    handleTouchpadHapticIntervalChange: touchpadConfig.handleTouchpadHapticIntervalChange,
    handleTouchpadClickHapticIntensityChange: touchpadConfig.handleTouchpadClickHapticIntensityChange,
    handleTouchpadClickHapticEffectChange: touchpadConfig.handleTouchpadClickHapticEffectChange,
    touchpadReleaseHapticIntensityValue: touchpadConfig.touchpadReleaseHapticIntensityValue,
    touchpadReleaseHapticEffectValue: touchpadConfig.touchpadReleaseHapticEffectValue,
    handleTouchpadReleaseHapticIntensityChange: touchpadConfig.handleTouchpadReleaseHapticIntensityChange,
    handleTouchpadReleaseHapticEffectChange: touchpadConfig.handleTouchpadReleaseHapticEffectChange,
    touchpadClickDampenValue: touchpadConfig.touchpadClickDampenValue,
    touchpadClickDampenThresholdValue: touchpadConfig.touchpadClickDampenThresholdValue,
    handleTouchpadClickDampenChange: touchpadConfig.handleTouchpadClickDampenChange,
    handleTouchpadClickDampenThresholdChange: touchpadConfig.handleTouchpadClickDampenThresholdChange,
    leftGripHapticsValue: gripConfig.leftGripHapticsValue,
    rightGripHapticsValue: gripConfig.rightGripHapticsValue,
    handleLeftGripHapticsChange: gripConfig.handleLeftGripHapticsChange,
    handleRightGripHapticsChange: gripConfig.handleRightGripHapticsChange,
    gripSensorRangeValue: gripConfig.gripSensorRangeValue,
    gripFlickerGuardValue: gripConfig.gripFlickerGuardValue,
    gripHapticIntensityValue: gripConfig.gripHapticIntensityValue,
    gripHapticEffectValue: gripConfig.gripHapticEffectValue,
    gripReleaseHapticIntensityValue: gripConfig.gripReleaseHapticIntensityValue,
    gripReleaseHapticEffectValue: gripConfig.gripReleaseHapticEffectValue,
    handleGripSensorRangeChange: gripConfig.handleGripSensorRangeChange,
    handleGripFlickerGuardChange: gripConfig.handleGripFlickerGuardChange,
    handleGripHapticIntensityChange: gripConfig.handleGripHapticIntensityChange,
    handleGripHapticEffectChange: gripConfig.handleGripHapticEffectChange,
    handleGripReleaseHapticIntensityChange: gripConfig.handleGripReleaseHapticIntensityChange,
    handleGripReleaseHapticEffectChange: gripConfig.handleGripReleaseHapticEffectChange,
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
    touchpadSensitivityYValue: touchpadConfig.touchpadSensitivityYValue,
    leftTouchpadSensitivityYValue: touchpadConfig.leftTouchpadSensitivityYValue,
    rightTouchpadSensitivityYValue: touchpadConfig.rightTouchpadSensitivityYValue,
    touchpadDualStageModeValue: touchpadConfig.touchpadDualStageModeValue,
    gridRequiresClickValue: touchpadConfig.gridRequiresClickValue,
    leftGridRequiresClickValue: touchpadConfig.leftGridRequiresClickValue,
    rightGridRequiresClickValue: touchpadConfig.rightGridRequiresClickValue,
    touchStickModeValue: touchpadConfig.touchStickModeValue,
    leftTouchStickModeValue: touchpadConfig.leftTouchStickModeValue,
    rightTouchStickModeValue: touchpadConfig.rightTouchStickModeValue,
    touchDeadzoneInnerValue: touchpadConfig.touchDeadzoneInnerValue,
    leftTouchDeadzoneInnerValue: touchpadConfig.leftTouchDeadzoneInnerValue,
    rightTouchDeadzoneInnerValue: touchpadConfig.rightTouchDeadzoneInnerValue,
    touchRingModeValue: touchpadConfig.touchRingModeValue,
    leftTouchRingModeValue: touchpadConfig.leftTouchRingModeValue,
    rightTouchRingModeValue: touchpadConfig.rightTouchRingModeValue,
    touchStickRadiusValue: touchpadConfig.touchStickRadiusValue,
    leftTouchStickRadiusValue: touchpadConfig.leftTouchStickRadiusValue,
    rightTouchStickRadiusValue: touchpadConfig.rightTouchStickRadiusValue,
    touchStickAxisValue: touchpadConfig.touchStickAxisValue,
    leftTouchStickAxisValue: touchpadConfig.leftTouchStickAxisValue,
    rightTouchStickAxisValue: touchpadConfig.rightTouchStickAxisValue,
    touchpadWarnings: touchpadConfig.touchpadWarnings,
    handleTouchpadModeChange: touchpadConfig.handleTouchpadModeChange,
    handleLeftTouchpadModeChange: touchpadConfig.handleLeftTouchpadModeChange,
    handleRightTouchpadModeChange: touchpadConfig.handleRightTouchpadModeChange,
    handleGridSizeChange: touchpadConfig.handleGridSizeChange,
    gridShapeValue: touchpadConfig.gridShapeValue,
    leftGridShapeValue: touchpadConfig.leftGridShapeValue,
    rightGridShapeValue: touchpadConfig.rightGridShapeValue,
    gridDeadzoneValue: touchpadConfig.gridDeadzoneValue,
    leftGridDeadzoneValue: touchpadConfig.leftGridDeadzoneValue,
    rightGridDeadzoneValue: touchpadConfig.rightGridDeadzoneValue,
    handleGridShapeChange: touchpadConfig.handleGridShapeChange,
    handleLeftGridShapeChange: touchpadConfig.handleLeftGridShapeChange,
    handleRightGridShapeChange: touchpadConfig.handleRightGridShapeChange,
    handleGridDeadzoneChange: touchpadConfig.handleGridDeadzoneChange,
    handleLeftGridDeadzoneChange: touchpadConfig.handleLeftGridDeadzoneChange,
    handleRightGridDeadzoneChange: touchpadConfig.handleRightGridDeadzoneChange,
    handleLeftGridSizeChange: touchpadConfig.handleLeftGridSizeChange,
    handleRightGridSizeChange: touchpadConfig.handleRightGridSizeChange,
    handleTouchpadSensitivityChange: touchpadConfig.handleTouchpadSensitivityChange,
    handleTouchpadSensitivityYChange: touchpadConfig.handleTouchpadSensitivityYChange,
    handleLeftTouchpadSensitivityYChange: touchpadConfig.handleLeftTouchpadSensitivityYChange,
    handleRightTouchpadSensitivityYChange: touchpadConfig.handleRightTouchpadSensitivityYChange,
    handleLeftTouchpadSensitivityChange: touchpadConfig.handleLeftTouchpadSensitivityChange,
    handleRightTouchpadSensitivityChange: touchpadConfig.handleRightTouchpadSensitivityChange,
    handleTouchpadDualStageModeChange: touchpadConfig.handleTouchpadDualStageModeChange,
    handleLeftTouchpadDualStageModeChange: touchpadConfig.handleLeftTouchpadDualStageModeChange,
    handleRightTouchpadDualStageModeChange: touchpadConfig.handleRightTouchpadDualStageModeChange,
    handleGridRequiresClickChange: touchpadConfig.handleGridRequiresClickChange,
    handleLeftGridRequiresClickChange: touchpadConfig.handleLeftGridRequiresClickChange,
    handleRightGridRequiresClickChange: touchpadConfig.handleRightGridRequiresClickChange,
    handleTouchStickModeChange: touchpadConfig.handleTouchStickModeChange,
    handleLeftTouchStickModeChange: touchpadConfig.handleLeftTouchStickModeChange,
    handleRightTouchStickModeChange: touchpadConfig.handleRightTouchStickModeChange,
    handleTouchDeadzoneInnerChange: touchpadConfig.handleTouchDeadzoneInnerChange,
    handleLeftTouchDeadzoneInnerChange: touchpadConfig.handleLeftTouchDeadzoneInnerChange,
    handleRightTouchDeadzoneInnerChange: touchpadConfig.handleRightTouchDeadzoneInnerChange,
    handleTouchRingModeChange: touchpadConfig.handleTouchRingModeChange,
    handleLeftTouchRingModeChange: touchpadConfig.handleLeftTouchRingModeChange,
    handleRightTouchRingModeChange: touchpadConfig.handleRightTouchRingModeChange,
    handleTouchStickRadiusChange: touchpadConfig.handleTouchStickRadiusChange,
    handleLeftTouchStickRadiusChange: touchpadConfig.handleLeftTouchStickRadiusChange,
    handleRightTouchStickRadiusChange: touchpadConfig.handleRightTouchStickRadiusChange,
    handleTouchStickAxisChange: touchpadConfig.handleTouchStickAxisChange,
    handleLeftTouchStickAxisChange: touchpadConfig.handleLeftTouchStickAxisChange,
    handleRightTouchStickAxisChange: touchpadConfig.handleRightTouchStickAxisChange,
    touchpadAccelerationValue: touchpadConfig.touchpadAccelerationValue,
    handleAcceleration: touchpadConfig.handleTouchpadAccelerationChange,
    touchpadAccelValues: touchpadConfig.touchpadAccelValues,
    accelCurveLinkValue: touchpadConfig.accelCurveLinkValue,
    handleTouchpadAccelCurveChange: touchpadConfig.handleTouchpadAccelCurveChange,
    handleTouchpadAccelParamChange: touchpadConfig.handleTouchpadAccelParamChange,
    handleAccelCurveLinkChange: touchpadConfig.handleAccelCurveLinkChange,
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
    handleBindGamepadPassthrough: bindingsConfig.handleBindGamepadPassthrough,
    handleBindDirectionsToWasd: bindingsConfig.handleBindDirectionsToWasd,
    handleTrackballDecayChange: bindingsConfig.handleTrackballDecayChange,
    virtualControllerType: bindingsConfig.virtualControllerType,
    virtualControllerWarnings: bindingsConfig.virtualControllerWarnings,
    handleVirtualControllerTypeChange: bindingsConfig.handleVirtualControllerTypeChange,
    resetPendingSensitivityChanges: sensitivityConfig.resetPendingSensitivityChanges,
  }
}
