import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_STICK_DEADZONE_INNER, DEFAULT_STICK_DEADZONE_OUTER } from '../constants/defaults'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import {
  BindingSlot,
  BindingWriteMode,
  ButtonBindingRow,
  getButtonBindingRows,
  getKeymapValue,
} from '../utils/keymap'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import {
  BUMPER_BUTTONS,
  CENTER_BUTTONS,
  DPAD_BUTTONS,
  FACE_BUTTONS,
  LEFT_STICK_BUTTONS,
  MINI_BUTTONS,
  MISC_BUTTONS,
  PADDLE_BUTTONS,
  RIGHT_STICK_BUTTONS,
  TOUCH_STICK_BUTTONS,
  STICK_AIM_DEFAULTS,
  TOUCH_BUTTONS,
  TRIGGER_BUTTONS,
  buildTouchpadGridButton,
  getSpecialOptionList,
  type ButtonDefinition,
} from '../keymap/schema'
import { useBindingCapture } from '../keymap/useBindingCapture'
import { useButtonRowState } from '../keymap/useButtonRowState'
import { ButtonBindingsCard } from './keymap/ButtonBindingsCard'
import { ButtonGridSection } from './keymap/ButtonGridSection'
import { Card } from './Card'
import keymapStyles from './Keymap.module.css'
import { GlobalControlsSection } from './keymap/GlobalControlsSection'
import { KeymapSection } from './KeymapSection'
import { MappingRulesHelpModal } from './keymap/MappingRulesHelpModal'
import stickStyles from './Sticks.module.css'
import { TouchpadGridSection } from './keymap/TouchpadGridSection'
import { TouchpadSettingsSection, TouchpadModeCard, type TouchpadModeCardConfig } from './keymap/TouchpadSettingsSection'
import { SideBlock } from './keymap/SideBlock'
import { TouchpadAccelSection } from './keymap/TouchpadAccelSection'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../hooks/useTouchpadConfig'
import type { AccelCurveLink, AccelCurveShape } from '../utils/accelCurve'
import { TouchpadSensorSection } from './keymap/TouchpadSensorSection'
import { GripSettingsSection } from './keymap/GripSettingsSection'
import { TouchpadStickSection } from './keymap/TouchpadStickSection'
import { SectionActions } from './SectionActions'
import { controllerHasTwoTrackpads } from '../utils/controllerStatus'
import {
  BumperIcon,
  ButtonsIcon,
  CenterButtonsIcon,
  DPadIcon,
  ExtraButtonsIcon,
  JoystickIcon,
  PaddleIcon,
  TriggersIcon,
} from './NavIcons'
import { resolveTouchpadGrids } from '../utils/touchpadGrids'
import { StickSettingsCard } from './StickSettingsCard'
import { NumberField } from './NumberField'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import type { VirtualControllerType, VirtualControllerWarning } from '../utils/virtualController'
import { normalizeTouchpadMode, type TouchpadWarning } from '../utils/touchpadConfig'

type KeymapControlsProps = {
  configText: string
  hasPendingChanges: boolean
  isCalibrating: boolean
  statusMessage?: string | null
  onApply: () => void
  onCancel: () => void
  onBindingChange: (
    button: string,
    slot: BindingSlot,
    rowId: string,
    value: string | null,
    options?: { modifier?: string; writeMode?: BindingWriteMode }
  ) => void
  onAssignSpecialAction: (special: string, buttonCommand: string) => void
  onClearSpecialAction: (special: string, buttonCommand: string) => void
  trackballDecay: string
  onTrackballDecayChange: (value: string) => void
  holdPressTimeSeconds: number
  onHoldPressTimeChange: (value: string) => void
  holdPressTimeIsCustom: boolean
  holdPressTimeDefault: number
  onModifierChange: (
    button: string,
    slot: BindingSlot,
    rowId: string,
    previousModifier: string | undefined,
    nextModifier: string,
    binding: string | null
  ) => void
  doublePressWindowSeconds: number
  doublePressWindowIsCustom: boolean
  onDoublePressWindowChange: (value: string) => void
  simPressWindowSeconds: number
  simPressWindowIsCustom: boolean
  onSimPressWindowChange: (value: string) => void
  lightBarColor: string | null
  onLightBarChange: (color: string | null) => void
  triggerThreshold: number
  onTriggerThresholdChange: (value: string) => void
  view?: 'full' | 'touchpad'
  lockMessage?: string
  visibleSections?: string[]
  touchpadMode?: string
  touchpadMinCutoff?: number
  touchpadSpeedCoeff?: number
  touchpadTrackballDecay?: number
  touchpadTrackballMinVelocity?: number
  onTouchpadMinCutoffChange?: (value: string) => void
  onTouchpadSpeedCoeffChange?: (value: string) => void
  onTouchpadTrackballDecayChange?: (value: string) => void
  onTouchpadTrackballMinVelocityChange?: (value: string) => void
  gripSensorRange?: number
  gripFlickerGuard?: number
  gripHapticIntensity?: number
  gripHapticEffect?: string
  gripReleaseHapticIntensity?: number
  gripReleaseHapticEffect?: string
  onGripSensorRangeChange?: (value: string) => void
  onGripFlickerGuardChange?: (value: string) => void
  onGripHapticIntensityChange?: (value: string) => void
  onGripHapticEffectChange?: (value: string) => void
  onGripReleaseHapticIntensityChange?: (value: string) => void
  onGripReleaseHapticEffectChange?: (value: string) => void
  touchpadDualStageMode?: string
  onTouchpadModeChange?: (value: string) => void
  onTouchpadDualStageModeChange?: (value: string) => void
  leftTouchpadMode?: string
  rightTouchpadMode?: string
  leftTouchpadDualStageMode?: string
  rightTouchpadDualStageMode?: string
  onLeftTouchpadModeChange?: (value: string) => void
  onRightTouchpadModeChange?: (value: string) => void
  onLeftTouchpadDualStageModeChange?: (value: string) => void
  onRightTouchpadDualStageModeChange?: (value: string) => void
  leftGridColumns?: number
  leftGridRows?: number
  rightGridColumns?: number
  rightGridRows?: number
  onLeftGridSizeChange?: (cols: number, rows: number) => void
  onRightGridSizeChange?: (cols: number, rows: number) => void
  leftTouchpadSensitivity?: number
  rightTouchpadSensitivity?: number
  onLeftTouchpadSensitivityChange?: (value: string) => void
  onRightTouchpadSensitivityChange?: (value: string) => void
  leftTouchpadSensitivityY?: number
  rightTouchpadSensitivityY?: number
  onLeftTouchpadSensitivityYChange?: (value: string) => void
  onRightTouchpadSensitivityYChange?: (value: string) => void
  touchpadSensitivityY?: number
  onTouchpadSensitivityYChange?: (value: string) => void
  gridColumns?: number
  gridRows?: number
  onGridSizeChange?: (cols: number, rows: number) => void
  touchpadSensitivity?: number
  onTouchpadSensitivityChange?: (value: string) => void
  touchpadSmoothing?: number
  onTouchpadSmoothingChange?: (value: string) => void
  touchpadAcceleration?: number
  onTouchpadAccelerationChange?: (value: string) => void
  /** Your own names for what each input does, shown on the Overview diagram. */
  bindingLabels?: Record<string, string>
  onBindingLabelChange?: (command: string, label: string) => void
  touchpadAccelValues?: TouchpadAccelValues
  accelCurveLink?: string
  gyroAccelShape?: AccelCurveShape
  onTouchpadAccelCurveChange?: (value: string) => void
  onTouchpadAccelParamChange?: (param: TouchpadAccelParamKey, value: string) => void
  onAccelCurveLinkChange?: (value: AccelCurveLink) => void
  touchDeadzoneInner?: string
  touchRingMode?: string
  touchStickMode?: string
  touchStickRadius?: string
  touchStickAxis?: string
  leftTouchStickMode?: string
  rightTouchStickMode?: string
  leftTouchDeadzoneInner?: string
  rightTouchDeadzoneInner?: string
  leftTouchRingMode?: string
  rightTouchRingMode?: string
  leftTouchStickRadius?: string
  rightTouchStickRadius?: string
  leftTouchStickAxis?: string
  rightTouchStickAxis?: string
  onTouchDeadzoneInnerChange?: (value: string) => void
  onTouchRingModeChange?: (value: string) => void
  onTouchStickModeChange?: (value: string) => void
  onTouchStickRadiusChange?: (value: string) => void
  onTouchStickAxisChange?: (value: string) => void
  onLeftTouchStickModeChange?: (value: string) => void
  onRightTouchStickModeChange?: (value: string) => void
  onLeftTouchDeadzoneInnerChange?: (value: string) => void
  onRightTouchDeadzoneInnerChange?: (value: string) => void
  onLeftTouchRingModeChange?: (value: string) => void
  onRightTouchRingModeChange?: (value: string) => void
  onLeftTouchStickRadiusChange?: (value: string) => void
  onRightTouchStickRadiusChange?: (value: string) => void
  onLeftTouchStickAxisChange?: (value: string) => void
  onRightTouchStickAxisChange?: (value: string) => void
  touchpadWarnings?: TouchpadWarning[]
  stickDeadzoneSettings?: {
    defaults: { inner: string; outer: string }
    left: { inner: string; outer: string }
    right: { inner: string; outer: string }
  }
  onStickDeadzoneChange?: (side: 'LEFT' | 'RIGHT', type: 'INNER' | 'OUTER', value: string) => void
  stickModeSettings?: {
    left: { mode: string; ring: string }
    right: { mode: string; ring: string }
  }
  onStickModeChange?: (side: 'LEFT' | 'RIGHT', mode: string) => void
  onRingModeChange?: (side: 'LEFT' | 'RIGHT', mode: string) => void
  stickAimSettings?: {
    displaySensX: string
    displaySensY: string
    power: string
    accelerationRate: string
    accelerationCap: string
  }
  stickAimHandlers?: {
    onSensXChange: (value: string) => void
    onSensYChange: (value: string) => void
    onPowerChange: (value: string) => void
    onAccelerationRateChange: (value: string) => void
    onAccelerationCapChange: (value: string) => void
  }
  stickFlickSettings?: {
    flickTime: string
    flickTimeExponent: string
    snapMode: string
    snapStrength: string
    deadzoneAngle: string
  }
  stickFlickHandlers?: {
    onFlickTimeChange: (value: string) => void
    onFlickTimeExponentChange: (value: string) => void
    onSnapModeChange: (value: string) => void
    onSnapStrengthChange: (value: string) => void
    onDeadzoneAngleChange: (value: string) => void
  }
  mouseRingRadius?: string
  onMouseRingRadiusChange?: (value: string) => void
  scrollSens?: string
  onScrollSensChange?: (value: string) => void
  stickModeShiftAssignments?: Record<string, { target: 'LEFT' | 'RIGHT'; mode: string }[]>
  onStickModeShiftChange?: (button: string, target: 'LEFT' | 'RIGHT', mode?: string) => void
  adaptiveTriggerValue?: string
  onAdaptiveTriggerChange?: (value: string) => void
  zlModeValue?: string
  zrModeValue?: string
  onZlModeChange?: (value: string) => void
  onZrModeChange?: (value: string) => void
  devices?: TelemetryDevice[]
  selectedMappingCommand?: string | null
  onSelectedMappingCommandChange?: (command: string | null) => void
  virtualControllerType?: VirtualControllerType
  virtualControllerWarnings?: VirtualControllerWarning[]
  onVirtualControllerTypeChange?: (value: VirtualControllerType) => void
}

type StickAimSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickAimSettings']>
  handlers: NonNullable<KeymapControlsProps['stickAimHandlers']>
  disabled?: boolean
}

const StickAimSettings = ({ values, handlers, disabled }: StickAimSettingsProps) => {
  const { t } = useTranslation()
  const sensXValue = values.displaySensX
  const sensYValue = values.displaySensY
  const powerValue = values.power ?? ''
  const accelRateValue = values.accelerationRate ?? ''
  const accelCapValue = values.accelerationCap ?? ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  return (
    <div className={stickStyles.stickAimSettings} data-capture-ignore="true">
      <small>{t('keymap.stickAimNote')}</small>
      <div className={stickStyles.stickAimGrid}>
        <NumberField
          label={t('keymap.stickSensitivityHorizontal')}
          value={sensXValue}
          onChange={handlers.onSensXChange}
          min={0}
          max={1200}
          step={1}
          coarseStep={30}
          unit="°/s"
          placeholder={formatDefault(STICK_AIM_DEFAULTS.sens)}
          disabled={disabled}
        />
        <NumberField
          label={t('keymap.stickSensitivityVertical')}
          value={sensYValue}
          onChange={handlers.onSensYChange}
          min={0}
          max={1200}
          step={1}
          coarseStep={30}
          unit="°/s"
          placeholder={formatDefault(STICK_AIM_DEFAULTS.sens)}
          disabled={disabled}
        />
      </div>
      <AdvancedDisclosure>
        <div className={stickStyles.stickAimGrid}>
          <NumberField
            label={t('keymap.stickPower')}
            value={powerValue}
            onChange={handlers.onPowerChange}
            min={0.1}
            max={6}
            step={0.1}
            coarseStep={0.5}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.power)}
            disabled={disabled}
          />
          <NumberField
            label={t('keymap.accelerationRate')}
            value={accelRateValue}
            onChange={handlers.onAccelerationRateChange}
            min={0}
            max={50}
            step={0.1}
            coarseStep={1}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.accelerationRate)}
            disabled={disabled}
          />
          <NumberField
            label={t('keymap.accelerationCap')}
            value={accelCapValue}
            onChange={handlers.onAccelerationCapChange}
            min={0}
            max={10000}
            step={1}
            coarseStep={100}
            placeholder={formatDefault(STICK_AIM_DEFAULTS.accelerationCap)}
            disabled={disabled}
          />
        </div>
      </AdvancedDisclosure>
    </div>
  )
}

type StickFlickSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickFlickSettings']>
  handlers: NonNullable<KeymapControlsProps['stickFlickHandlers']>
  disabled?: boolean
}

const StickFlickSettings = ({ values, handlers, disabled }: StickFlickSettingsProps) => {
  const { t } = useTranslation()
  const snapMode = values.snapMode || ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  return (
    <div className="stick-flick-settings" data-capture-ignore="true">
      <small>{t('keymap.stickFlickNote')}</small>
      <div className={stickStyles.stickAimGrid}>
        <NumberField
          label={t('keymap.flickTime')}
          value={values.flickTime}
          onChange={handlers.onFlickTimeChange}
          min={0}
          max={1}
          step={0.01}
          unit="s"
          placeholder={formatDefault('0.1')}
          disabled={disabled}
        />
        <label>
          {t('keymap.snapMode')}
          <select className="app-select" value={snapMode} onChange={(event) => handlers.onSnapModeChange(event.target.value)} disabled={disabled}>
            <option value="">{t('common.defaultValue', { value: 'NONE' })}</option>
            <option value="4">{t('keymap.snapToFour')}</option>
            <option value="8">{t('keymap.snapToEight')}</option>
          </select>
        </label>
      </div>
      <AdvancedDisclosure>
        <div className={stickStyles.stickAimGrid}>
          <NumberField
            label={t('keymap.flickTimeExponent')}
            value={values.flickTimeExponent}
            onChange={handlers.onFlickTimeExponentChange}
            min={0}
            max={2}
            step={0.1}
            placeholder={formatDefault('0.0')}
            disabled={disabled}
          />
          <NumberField
            label={t('keymap.snapStrength')}
            value={values.snapStrength}
            onChange={handlers.onSnapStrengthChange}
            min={0}
            max={1}
            step={0.01}
            coarseStep={0.05}
            placeholder={formatDefault('1.0')}
            disabled={disabled || !snapMode}
          />
          <NumberField
            label={t('keymap.forwardDeadzoneAngle')}
            value={values.deadzoneAngle}
            onChange={handlers.onDeadzoneAngleChange}
            min={0}
            max={180}
            step={1}
            coarseStep={5}
            unit="°"
            placeholder={formatDefault('0')}
            disabled={disabled}
          />
        </div>
      </AdvancedDisclosure>
    </div>
  )
}

const MAPPING_BUTTON_GROUPS: Record<string, { titleKey: string; descriptionKey?: string; buttons: ButtonDefinition[]; icon: JSX.Element }> = {
  face: { titleKey: 'keymap.faceButtonsTitle', descriptionKey: 'keymap.faceButtonsDescription', buttons: FACE_BUTTONS, icon: <ButtonsIcon /> },
  dpad: { titleKey: 'keymap.dpadTitle', descriptionKey: 'keymap.dpadDescription', buttons: DPAD_BUTTONS, icon: <DPadIcon /> },
  bumpers: {
    titleKey: 'keymap.bumpersTitle',
    descriptionKey: 'keymap.bumpersDescription',
    buttons: [...BUMPER_BUTTONS, ...MINI_BUTTONS],
    icon: <BumperIcon />,
  },
  triggers: { titleKey: 'keymap.triggersTitle', descriptionKey: 'keymap.triggersDescription', buttons: TRIGGER_BUTTONS, icon: <TriggersIcon /> },
  center: {
    titleKey: 'keymap.centerButtonsTitle',
    descriptionKey: 'keymap.centerButtonsDescription',
    buttons: CENTER_BUTTONS,
    icon: <CenterButtonsIcon />,
  },
  paddles: { titleKey: 'keymap.paddlesTitle', descriptionKey: 'keymap.paddlesDescription', buttons: PADDLE_BUTTONS, icon: <PaddleIcon /> },
  leftStick: {
    titleKey: 'keymap.leftStickTitle',
    descriptionKey: 'keymap.leftStickDescription',
    buttons: LEFT_STICK_BUTTONS,
    icon: <JoystickIcon />,
  },
  rightStick: {
    titleKey: 'keymap.rightStickTitle',
    descriptionKey: 'keymap.rightStickDescription',
    buttons: RIGHT_STICK_BUTTONS,
    icon: <JoystickIcon />,
  },
  extra: { titleKey: 'keymap.extraButtonsTitle', descriptionKey: 'keymap.extraButtonsDescription', buttons: MISC_BUTTONS, icon: <ExtraButtonsIcon /> },
}

// Directional presses (Up/Down/Left/Right) only mean anything when the stick
// is in one of these digital-direction modes. Once it's in a whole-stick mode
// (AIM, a mouse mode, LEFT_STICK/RIGHT_STICK passthrough, ...) those four
// commands are never sent, so listing them as bindable is just noise -- Steam
// Input folds them away the same way once a stick has a "mode" applied.
// Click/Ring/Touch stay visible in every mode: those fire independently of
// which mode the stick's continuous output is in.
const STICK_DIRECTIONAL_MODES = new Set(['', 'NO_MOUSE', 'INNER_RING', 'OUTER_RING'])
const STICK_DIRECTION_COMMANDS: Record<'leftStick' | 'rightStick', Set<string>> = {
  leftStick: new Set(['LUP', 'LDOWN', 'LLEFT', 'LRIGHT']),
  rightStick: new Set(['RUP', 'RDOWN', 'RLEFT', 'RRIGHT']),
}

function visibleButtonsForGroup(groupKey: string, buttons: ButtonDefinition[], leftStickMode: string, rightStickMode: string) {
  const directionCommands =
    groupKey === 'leftStick' ? STICK_DIRECTION_COMMANDS.leftStick :
    groupKey === 'rightStick' ? STICK_DIRECTION_COMMANDS.rightStick :
    null
  if (!directionCommands) return buttons
  const mode = (groupKey === 'leftStick' ? leftStickMode : rightStickMode).toUpperCase()
  if (STICK_DIRECTIONAL_MODES.has(mode)) return buttons
  return buttons.filter(button => !directionCommands.has(button.command.toUpperCase()))
}

// Which hand an input belongs to, for the left-then-right layout. Anything not
// obviously one-sided (face buttons, Steam/QAM, d-pad) stays unsplit.
const LEFT_SIDE_COMMANDS = new Set(['L', 'ZL', 'ZLF', 'LSL', 'LSR', 'LMINI', 'MISC3', 'MISC6', 'L3', 'LTOUCH', 'LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING'])
const RIGHT_SIDE_COMMANDS = new Set(['R', 'ZR', 'ZRF', 'RSR', 'RSL', 'RMINI', 'MISC2', 'MISC5', 'R3', 'RTOUCH', 'RUP', 'RDOWN', 'RLEFT', 'RRIGHT', 'RRING'])
const SIDE_SPLIT_GROUPS = new Set(['triggers', 'bumpers', 'paddles', 'mini', 'extra'])

function splitButtonsBySide(buttons: ButtonDefinition[]) {
  const left: ButtonDefinition[] = []
  const right: ButtonDefinition[] = []
  const rest: ButtonDefinition[] = []
  buttons.forEach(button => {
    const key = button.command.toUpperCase()
    if (LEFT_SIDE_COMMANDS.has(key)) left.push(button)
    else if (RIGHT_SIDE_COMMANDS.has(key)) right.push(button)
    else rest.push(button)
  })
  return { left, right, rest }
}

const allMappingButtons = () => {
  const seen = new Set<string>()
  return Object.values(MAPPING_BUTTON_GROUPS)
    .flatMap(group => group.buttons)
    .filter(button => {
      const key = button.command.toUpperCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function KeymapControls({
  configText,
  hasPendingChanges,
  isCalibrating,
  statusMessage,
  onApply,
  onCancel,
  onBindingChange,
  onAssignSpecialAction,
  onClearSpecialAction,
  trackballDecay,
  onTrackballDecayChange,
  holdPressTimeSeconds,
  onHoldPressTimeChange,
  holdPressTimeIsCustom,
  holdPressTimeDefault,
  onModifierChange,
  doublePressWindowSeconds,
  doublePressWindowIsCustom,
  onDoublePressWindowChange,
  simPressWindowSeconds,
  simPressWindowIsCustom,
  onSimPressWindowChange,
  lightBarColor,
  onLightBarChange,
  triggerThreshold,
  onTriggerThresholdChange,
  view = 'full',
  lockMessage,
  visibleSections,
  touchpadMode: touchpadModeProp = '',
  touchpadMinCutoff,
  touchpadSpeedCoeff,
  touchpadTrackballDecay,
  touchpadTrackballMinVelocity,
  onTouchpadMinCutoffChange,
  onTouchpadSpeedCoeffChange,
  onTouchpadTrackballDecayChange,
  onTouchpadTrackballMinVelocityChange,
  gripSensorRange,
  gripFlickerGuard,
  gripHapticIntensity,
  gripHapticEffect,
  gripReleaseHapticIntensity,
  gripReleaseHapticEffect,
  onGripSensorRangeChange,
  onGripFlickerGuardChange,
  onGripHapticIntensityChange,
  onGripHapticEffectChange,
  onGripReleaseHapticIntensityChange,
  onGripReleaseHapticEffectChange,
  touchpadDualStageMode = '',
  onTouchpadModeChange,
  onTouchpadDualStageModeChange,
  leftTouchpadMode,
  rightTouchpadMode,
  leftTouchpadDualStageMode,
  rightTouchpadDualStageMode,
  onLeftTouchpadModeChange,
  onRightTouchpadModeChange,
  onLeftTouchpadDualStageModeChange,
  onRightTouchpadDualStageModeChange,
  leftGridColumns,
  leftGridRows,
  rightGridColumns,
  rightGridRows,
  onLeftGridSizeChange,
  onRightGridSizeChange,
  leftTouchpadSensitivity,
  leftTouchpadSensitivityY,
  rightTouchpadSensitivityY,
  touchpadSensitivityY,
  onLeftTouchpadSensitivityYChange,
  onRightTouchpadSensitivityYChange,
  onTouchpadSensitivityYChange,
  rightTouchpadSensitivity,
  onLeftTouchpadSensitivityChange,
  onRightTouchpadSensitivityChange,
  gridColumns = 2,
  gridRows = 2,
  onGridSizeChange,
  touchpadSensitivity,
  onTouchpadSensitivityChange,
  touchpadSmoothing,
    onTouchpadSmoothingChange,
    touchpadAcceleration,
    onTouchpadAccelerationChange,
    bindingLabels,
    onBindingLabelChange,
    touchpadAccelValues,
    accelCurveLink,
    gyroAccelShape,
    onTouchpadAccelCurveChange,
    onTouchpadAccelParamChange,
    onAccelCurveLinkChange,
  touchDeadzoneInner = '',
  touchRingMode = '',
  touchStickMode = '',
  touchStickRadius = '',
  touchStickAxis = '',
  leftTouchStickMode = '', rightTouchStickMode = '', leftTouchDeadzoneInner = '', rightTouchDeadzoneInner = '', leftTouchRingMode = '', rightTouchRingMode = '', leftTouchStickRadius = '', rightTouchStickRadius = '', leftTouchStickAxis = '', rightTouchStickAxis = '',
  onTouchDeadzoneInnerChange,
  onTouchRingModeChange,
  onTouchStickModeChange,
  onTouchStickRadiusChange,
  onTouchStickAxisChange,
  onLeftTouchStickModeChange, onRightTouchStickModeChange, onLeftTouchDeadzoneInnerChange, onRightTouchDeadzoneInnerChange, onLeftTouchRingModeChange, onRightTouchRingModeChange, onLeftTouchStickRadiusChange, onRightTouchStickRadiusChange, onLeftTouchStickAxisChange, onRightTouchStickAxisChange,
  touchpadWarnings,
  stickDeadzoneSettings,
  onStickDeadzoneChange,
  stickModeSettings,
  onStickModeChange,
  onRingModeChange,
  stickModeShiftAssignments,
  onStickModeShiftChange,
  stickAimSettings,
  stickAimHandlers,
  stickFlickSettings,
  stickFlickHandlers,
  mouseRingRadius,
  onMouseRingRadiusChange,
  scrollSens,
  onScrollSensChange,
  adaptiveTriggerValue = '',
  onAdaptiveTriggerChange = () => {},
  zlModeValue = '',
  zrModeValue = '',
  onZlModeChange = () => {},
  onZrModeChange = () => {},
  devices,
  selectedMappingCommand,
  onSelectedMappingCommandChange,
  virtualControllerType = 'NONE',
  virtualControllerWarnings,
  onVirtualControllerTypeChange,
}: KeymapControlsProps) {
  void (touchpadSmoothing && onTouchpadSmoothingChange && touchpadAcceleration && onTouchpadAccelerationChange)
  const { t } = useTranslation()
  const [mappingHelpOpen, setMappingHelpOpen] = useState(false)
  const [selectedTouchpadGridCommand, setSelectedTouchpadGridCommand] = useState<string | null>(null)
  const listSectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const {
    manualRows,
    ensureManualRow,
    updateManualRow,
    removeManualRow,
    stickShiftDisplayModes,
    updateStickShiftDisplayMode,
    replaceStickShiftDisplayModes,
    getRowEditorMode,
    setRowEditorMode,
  } = useButtonRowState()
  const { captureLabel, beginCapture, beginValueCapture, cancelCapture, isCapturing, isCapturingValue } = useBindingCapture((button, slot, rowId, value, options) => {
    onBindingChange(button, slot, rowId, value, options)
    const isComboSlot = slot === 'chord' || slot === 'simultaneous' || slot === 'diagonal'
    if (value && isComboSlot && manualRows[button]?.[slot]?.some(entry => entry.id === rowId)) {
      removeManualRow(button, slot, rowId)
    }
  })

  const isVisible = (section: string) => {
    if (!visibleSections || visibleSections.length === 0) return true
    return visibleSections.includes(section)
  }

  // On a two-pad controller the shared TOUCHPAD_MODE is usually unset and the
  // real answer lives in the per-pad modes, so a page keying off the shared value
  // alone showed grid bindings for a pad in mouse mode and hid the grid widget
  // for a pad actually in grid mode.
  const touchpadMode = useMemo(() => {
    const shared = normalizeTouchpadMode(touchpadModeProp)
    if (shared) return shared
    const left = normalizeTouchpadMode(leftTouchpadMode ?? '')
    const right = normalizeTouchpadMode(rightTouchpadMode ?? '')
    return left === 'GRID_AND_STICK' || right === 'GRID_AND_STICK' ? 'GRID_AND_STICK' : left || right
  }, [leftTouchpadMode, rightTouchpadMode, touchpadModeProp])

  const gridActive = touchpadMode === 'GRID_AND_STICK'
  const clampedGridCols = Math.max(1, Math.min(5, gridColumns || 1))
  const clampedGridRows = Math.max(1, Math.min(5, gridRows || 1))
  const clampedGridCells = touchpadMode === 'GRID_AND_STICK' ? Math.min(25, clampedGridCols * clampedGridRows) : 0
  const configuredGridButtons = gridActive ? clampedGridCells : 0

  // A controller with two pads gives each its own grid: its own size, its own
  // cells, its own bindings. Both pads used to drive the same T1..Tn, so a cell
  // on one pad fired the other's binding. A single-pad controller, and a two-pad
  // controller configured only through the shared TOUCHPAD_MODE, still get the
  // one shared grid.
  const touchpadGridPads = useMemo(() => {
    const pads = resolveTouchpadGrids({
      touchpadMode: touchpadModeProp,
      leftMode: leftTouchpadMode,
      rightMode: rightTouchpadMode,
      columns: gridColumns,
      rows: gridRows,
      leftColumns: leftGridColumns,
      leftRows: leftGridRows,
      rightColumns: rightGridColumns,
      rightRows: rightGridRows,
    })
    return pads.map(pad => ({
      ...pad,
      buttons: Array.from({ length: pad.cells }, (_, index) =>
        buildTouchpadGridButton(
          index + 1,
          Math.floor(index / pad.columns) + 1,
          (index % pad.columns) + 1,
          pad.prefix
        )
      ),
    }))
  }, [
    gridColumns,
    gridRows,
    leftGridColumns,
    leftGridRows,
    leftTouchpadMode,
    rightGridColumns,
    rightGridRows,
    rightTouchpadMode,
    touchpadModeProp,
  ])

  const touchpadGridButtons = useMemo<ButtonDefinition[]>(
    () => touchpadGridPads.flatMap(pad => pad.buttons),
    [touchpadGridPads]
  )

  const touchpadGridCommands = useMemo(
    () => touchpadGridButtons.map(button => button.command),
    [touchpadGridButtons]
  )

  const modifierOptions = useMemo(() => {
    return buildModifierOptions(gridActive, configuredGridButtons, touchpadGridCommands).map(option => ({
      value: option.value,
      label: resolveModifierOptionLabel(option, t),
      disabled: option.disabled,
    }))
  }, [configuredGridButtons, gridActive, t, touchpadGridCommands])

  const bindingRowsByButton = useMemo(() => {
    const record: Record<string, ButtonBindingRow[]> = {}
    ;[
      ...FACE_BUTTONS,
      ...DPAD_BUTTONS,
      ...BUMPER_BUTTONS,
      ...MINI_BUTTONS,
      ...TRIGGER_BUTTONS,
      ...CENTER_BUTTONS,
      ...PADDLE_BUTTONS,
      ...LEFT_STICK_BUTTONS,
      ...RIGHT_STICK_BUTTONS,
      ...TOUCH_BUTTONS,
      ...TOUCH_STICK_BUTTONS,
      ...MISC_BUTTONS,
      ...touchpadGridButtons,
    ].forEach(({ command }) => {
      record[command] = getButtonBindingRows(configText, command, manualRows[command] ?? {})
    })
    return record
  }, [configText, manualRows, touchpadGridButtons])

  // A page names the groups it is about, and gets exactly those, in the order the
  // groups are declared. Previously only a single group could be focused, which
  // is why every control lived on one long page: there was no way to say
  // "Buttons" and mean face buttons, bumpers, centre and paddles together.
  const focusedMappingGroups = useMemo(
    () => (visibleSections ?? []).filter(section => section in MAPPING_BUTTON_GROUPS),
    [visibleSections]
  )

  const leftStickModeForVisibility = stickModeSettings?.left?.mode ?? ''
  const rightStickModeForVisibility = stickModeSettings?.right?.mode ?? ''

  const visualMappingGroups = useMemo(() => {
    const entries = focusedMappingGroups.length === 0
      ? Object.entries(MAPPING_BUTTON_GROUPS)
      : Object.entries(MAPPING_BUTTON_GROUPS).filter(([key]) => focusedMappingGroups.includes(key))
    return entries.map(([key, group]) => ({
      ...group,
      buttons: visibleButtonsForGroup(key, group.buttons, leftStickModeForVisibility, rightStickModeForVisibility),
    }))
  }, [focusedMappingGroups, leftStickModeForVisibility, rightStickModeForVisibility])

  // The list layout walks the same set, so the jump bar and the page agree.
  const listMappingGroups = useMemo(() => {
    const entries = focusedMappingGroups.length === 0
      ? Object.entries(MAPPING_BUTTON_GROUPS)
      : Object.entries(MAPPING_BUTTON_GROUPS).filter(([key]) => focusedMappingGroups.includes(key))
    return entries.map(([key, group]) => [key, {
      ...group,
      buttons: visibleButtonsForGroup(key, group.buttons, leftStickModeForVisibility, rightStickModeForVisibility),
    }] as const)
  }, [focusedMappingGroups, leftStickModeForVisibility, rightStickModeForVisibility])

  const visualMappingButtons = useMemo(
    () => visualMappingGroups.flatMap(group => group.buttons),
    [visualMappingGroups]
  )

  const visualButtonByCommand = useMemo(() => {
    const record: Record<string, ButtonDefinition> = {}
    allMappingButtons().forEach(button => {
      record[button.command.toUpperCase()] = button
    })
    return record
  }, [])

  const specialsByButton = useMemo(() => {
    const assignments: Record<string, string | undefined> = {}
    getSpecialOptionList(t).forEach(binding => {
      const assignment = getKeymapValue(configText, binding.value)
      if (!assignment) return
      assignment
        .split(/\s+/)
        .filter(Boolean)
        .forEach(token => {
          assignments[token.toUpperCase()] = binding.value
        })
    })
    return assignments
  }, [configText, t])

  const selectedVisualCommand = selectedMappingCommand?.toUpperCase() ?? ''
  const selectedVisualButton =
    visualMappingButtons.find(button => button.command.toUpperCase() === selectedVisualCommand) ??
    visualMappingButtons[0] ??
    visualButtonByCommand[selectedVisualCommand] ??
    allMappingButtons()[0]
  // Whichever pad is being touched drives the grid's live dot. The grid's
  // bindings are shared between the two pads, so showing one dot rather than two
  // matches what a press will actually do.
  // Only a controller with two pads gets a left and a right pad to configure.
  // With nothing connected we cannot tell, so we offer both rather than hiding
  // settings a Steam Controller owner came here to edit; a config that already
  // sets per-pad values keeps them visible either way.
  // Read the config rather than the resolved values: the per-pad grid size falls
  // back to 2x1 whether or not the config sets it, so it can't tell us anything.
  const hasPerPadSettings = useMemo(
    () => /^\s*(LEFT|RIGHT)_(TOUCHPAD_MODE|GRID_SIZE|TOUCHPAD_SENS|TOUCH_STICK_MODE)\b/im.test(configText ?? ''),
    [configText]
  )
  const showPerPadTouchpads = useMemo(() => {
    if (hasPerPadSettings) return true
    if (!devices || devices.length === 0) return true
    return devices.some(device => controllerHasTwoTrackpads(device.type))
  }, [devices, hasPerPadSettings])

  const livePadTouches = useMemo(() => {
    const status = devices?.find(device => device.status)?.status
    const read = (pad?: { x: number; y: number; touched?: boolean } | null) =>
      pad?.touched ? { x: pad.x, y: pad.y, touched: true } : null
    return { left: read(status?.leftPad), right: read(status?.rightPad) }
  }, [devices])

  // The shared grid belongs to a single-pad controller, where either reported
  // point is that pad's.
  const livePadTouch = livePadTouches.left ?? livePadTouches.right

  useEffect(() => {
    if (view !== 'full') return
    if (!selectedVisualButton) return
    if (selectedMappingCommand?.toUpperCase() === selectedVisualButton.command.toUpperCase()) return
    onSelectedMappingCommandChange?.(selectedVisualButton.command)
  }, [onSelectedMappingCommandChange, selectedMappingCommand, selectedVisualButton, view])

  useEffect(() => {
    if (view !== 'touchpad' || !gridActive || touchpadGridButtons.length === 0) return
    const selectedStillExists = touchpadGridButtons.some(
      button => button.command.toUpperCase() === selectedTouchpadGridCommand?.toUpperCase()
    )
    if (!selectedStillExists) {
      setSelectedTouchpadGridCommand(touchpadGridButtons[0].command)
    }
  }, [gridActive, selectedTouchpadGridCommand, touchpadGridButtons, view])

  const showFullLayout = view === 'full'
  const showGlobalOnlyLayout = showFullLayout && visibleSections?.length === 1 && visibleSections[0] === 'global'
  const showMappedLayout = showFullLayout && !showGlobalOnlyLayout
  // Press timing and virtual output apply to the whole config, not to whichever
  // control you happen to be editing. Repeating them above every control page was
  // most of what made those pages feel like a wall of settings, so they only
  // appear where they belong now: on their own page.
  const showConfigWidePanels = showMappedLayout && (visibleSections ?? []).includes('global')
  const deadzoneDefaults = stickDeadzoneSettings?.defaults ?? {
    inner: DEFAULT_STICK_DEADZONE_INNER,
    outer: DEFAULT_STICK_DEADZONE_OUTER,
  }
  const leftDeadzoneValues = stickDeadzoneSettings?.left ?? { inner: '', outer: '' }
  const rightDeadzoneValues = stickDeadzoneSettings?.right ?? { inner: '', outer: '' }
  const leftStickModes = stickModeSettings?.left ?? { mode: '', ring: '' }
  const rightStickModes = stickModeSettings?.right ?? { mode: '', ring: '' }

  useEffect(() => {
    replaceStickShiftDisplayModes(prev => {
      if (!stickModeShiftAssignments) return {}
      const next: Record<string, 'tap' | 'extra'> = {}
      Object.keys(prev).forEach(button => {
        if (stickModeShiftAssignments[button]?.length) {
          next[button] = prev[button]
        }
      })
      Object.keys(stickModeShiftAssignments).forEach(button => {
        if (stickModeShiftAssignments[button]?.length && !next[button]) {
          next[button] = 'tap'
        }
      })
      return next
    })
  }, [replaceStickShiftDisplayModes, stickModeShiftAssignments])

  const holdPressTimeInputValue = Number.isFinite(holdPressTimeSeconds) ? holdPressTimeSeconds : holdPressTimeDefault
  const doublePressInputValue = Number.isFinite(doublePressWindowSeconds) ? doublePressWindowSeconds : holdPressTimeDefault
  const simPressInputValue = Number.isFinite(simPressWindowSeconds) ? simPressWindowSeconds : holdPressTimeDefault

  const renderButtonCard = (button: ButtonDefinition) => {
    const rows = bindingRowsByButton[button.command] ?? []
    return (
      <ButtonBindingsCard
        button={button}
        rows={rows}
        modifierOptions={modifierOptions}
        specialsByButton={specialsByButton}
        stickModeShiftAssignments={stickModeShiftAssignments}
        stickShiftDisplayModes={stickShiftDisplayModes}
        updateStickShiftDisplayMode={updateStickShiftDisplayMode}
        manualRows={manualRows}
        ensureManualRow={ensureManualRow}
        updateManualRow={updateManualRow}
        removeManualRow={removeManualRow}
        getRowEditorMode={getRowEditorMode}
        setRowEditorMode={setRowEditorMode}
        captureLabel={captureLabel}
        isCapturing={isCapturing}
        isCapturingValue={isCapturingValue}
        beginCapture={beginCapture}
        beginValueCapture={beginValueCapture}
        cancelCapture={cancelCapture}
        onBindingChange={onBindingChange}
        onModifierChange={onModifierChange}
        onAssignSpecialAction={onAssignSpecialAction}
        onClearSpecialAction={onClearSpecialAction}
        onStickModeShiftChange={onStickModeShiftChange}
        trackballDecay={trackballDecay}
        onTrackballDecayChange={onTrackballDecayChange}
        virtualControllerType={virtualControllerType ?? 'NONE'}
        bindingLabel={bindingLabels?.[button.command.toUpperCase()]}
        onBindingLabelChange={onBindingLabelChange}
      />
    )
  }

  const actionsProps = {
    hasPendingChanges,
    statusMessage,
    onApply,
    onCancel,
    applyDisabled: isCalibrating,
  }

  const renderVirtualControllerWarning = (warning: VirtualControllerWarning) => {
    if (warning.kind === 'modeRequired') {
      return t('keymap.virtualControllerWarningModeRequired')
    }
    return t('keymap.virtualControllerWarningSchemeMismatch', {
      detected: t(`keymap.virtualControllerType_${warning.detectedType}`),
      current: t(`keymap.virtualControllerType_${virtualControllerType ?? 'NONE'}`),
    })
  }

  const renderTouchpadWarning = (warning: TouchpadWarning) => {
    if (warning.code === 'psTouchpadNeedsDs4') return t('keymap.touchpadWarningPsTouchpadNeedsDs4')
    if (warning.code === 'touchStickRequiresGrid') return t('keymap.touchpadWarningTouchStickRequiresGrid')
    return t('keymap.touchpadWarningGridSizeInvalid', { value: warning.rawValue ?? '' })
  }

  const scrollToListSection = (groupKey: string) => {
    listSectionRefs.current[groupKey]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isTouchpadButtonBound = (command: string) => {
    const key = command.toUpperCase()
    const rows = bindingRowsByButton[key] ?? bindingRowsByButton[command] ?? []
    // A row exists for every editable slot whether or not anything is in it, so
    // counting rows made every touch button look bound -- which is why the touch
    // stick directions showed up on a pad that was not acting as a stick.
    const hasBinding = rows.some(row => Boolean(row.binding) || Boolean(row.expression))
    return hasBinding || Boolean(specialsByButton[key] || specialsByButton[command])
  }

  // Touch-stick directions only mean something when a pad is actually acting as a
  // stick. Showing them beside Touch and Click regardless is what made this page
  // read as a wall of settings for a mode you are not in. Anything already bound
  // still shows, so an existing config never hides bindings you cannot then find.
  const showTouchStickButtons =
    gridActive || TOUCH_STICK_BUTTONS.some(button => isTouchpadButtonBound(button.command))
  const touchpadButtonSectionButtons = showTouchStickButtons ? [...TOUCH_BUTTONS, ...TOUCH_STICK_BUTTONS] : TOUCH_BUTTONS

  // Per-pad cards for a two-pad controller. Each side gets its own mode, grid
  // and touch stick, stacked left-then-right rather than interleaved.
  const leftPadCard: TouchpadModeCardConfig | undefined = showPerPadTouchpads
    ? {
        mode: leftTouchpadMode ?? '',
        dualStageMode: leftTouchpadDualStageMode ?? '',
        gridColumns: leftGridColumns ?? gridColumns,
        gridRows: leftGridRows ?? gridRows,
        sensitivity: leftTouchpadSensitivity,
        sensitivityY: leftTouchpadSensitivityY,
        smoothing: touchpadSmoothing,
        acceleration: touchpadAcceleration,
        onModeChange: onLeftTouchpadModeChange,
        onGridSizeChange: onLeftGridSizeChange,
        onSensitivityChange: onLeftTouchpadSensitivityChange,
        onSensitivityYChange: onLeftTouchpadSensitivityYChange,
        onDualStageModeChange: onLeftTouchpadDualStageModeChange,
        onSmoothingChange: onTouchpadSmoothingChange,
        onAccelerationChange: onTouchpadAccelerationChange,
      }
    : undefined
  const rightPadCard: TouchpadModeCardConfig | undefined = showPerPadTouchpads
    ? {
        mode: rightTouchpadMode ?? '',
        dualStageMode: rightTouchpadDualStageMode ?? '',
        gridColumns: rightGridColumns ?? gridColumns,
        gridRows: rightGridRows ?? gridRows,
        sensitivity: rightTouchpadSensitivity,
        sensitivityY: rightTouchpadSensitivityY,
        smoothing: touchpadSmoothing,
        acceleration: touchpadAcceleration,
        onModeChange: onRightTouchpadModeChange,
        onGridSizeChange: onRightGridSizeChange,
        onSensitivityChange: onRightTouchpadSensitivityChange,
        onSensitivityYChange: onRightTouchpadSensitivityYChange,
        onDualStageModeChange: onRightTouchpadDualStageModeChange,
        onSmoothingChange: onTouchpadSmoothingChange,
        onAccelerationChange: onTouchpadAccelerationChange,
      }
    : undefined
  const padModeFor = (side: 'left' | 'right') =>
    normalizeTouchpadMode((side === 'left' ? leftTouchpadMode : rightTouchpadMode) ?? touchpadModeProp ?? '')

  const renderTriggerMode = (side: 'left' | 'right') => (
    <div className={keymapStyles.triggerModeInline} data-capture-ignore="true">
      <label>
        {side === 'left' ? t('keymap.l2FullPullMode') : t('keymap.r2FullPullMode')}
        <select
          className="app-select"
          value={(side === 'left' ? zlModeValue : zrModeValue) || 'NO_FULL'}
          onChange={e => (side === 'left' ? onZlModeChange : onZrModeChange)(e.target.value)}
          disabled={isCalibrating}
        >
          {['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R'].map(mode => (
            <option key={mode} value={mode}>{mode === 'NO_FULL' ? t('common.defaultValue', { value: mode }) : mode}</option>
          ))}
          <option value={side === 'left' ? 'X_LT' : 'X_RT'}>
            {t('keymap.triggerVirtualPassthrough')}
          </option>
        </select>
      </label>
      {(side === 'left' ? zlModeValue : zrModeValue) === (side === 'left' ? 'X_LT' : 'X_RT') && (
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.triggerVirtualPassthroughHint')}</small>
          {virtualControllerType === 'NONE' && (
            <div className={keymapStyles.virtualControllerWarning}>
              {t('stickModes.virtualStickDisabledWarning')}
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderPadSide = (side: 'left' | 'right') => {
    const card = side === 'left' ? leftPadCard : rightPadCard
    if (!card) return null
    const pad = touchpadGridPads.find(candidate => candidate.side === side)
    const gridMode = padModeFor(side) === 'GRID_AND_STICK'
    const stickProps =
      side === 'left'
        ? {
            touchStickMode: leftTouchStickMode ?? touchStickMode,
            touchDeadzoneInner: leftTouchDeadzoneInner ?? touchDeadzoneInner,
            touchRingMode: leftTouchRingMode ?? touchRingMode,
            touchStickRadius: leftTouchStickRadius ?? touchStickRadius,
            touchStickAxis: leftTouchStickAxis ?? touchStickAxis,
            onTouchStickModeChange: onLeftTouchStickModeChange ?? onTouchStickModeChange,
            onTouchDeadzoneInnerChange: onLeftTouchDeadzoneInnerChange ?? onTouchDeadzoneInnerChange,
            onTouchRingModeChange: onLeftTouchRingModeChange ?? onTouchRingModeChange,
            onTouchStickRadiusChange: onLeftTouchStickRadiusChange ?? onTouchStickRadiusChange,
            onTouchStickAxisChange: onLeftTouchStickAxisChange ?? onTouchStickAxisChange,
          }
        : {
            touchStickMode: rightTouchStickMode ?? touchStickMode,
            touchDeadzoneInner: rightTouchDeadzoneInner ?? touchDeadzoneInner,
            touchRingMode: rightTouchRingMode ?? touchRingMode,
            touchStickRadius: rightTouchStickRadius ?? touchStickRadius,
            touchStickAxis: rightTouchStickAxis ?? touchStickAxis,
            onTouchStickModeChange: onRightTouchStickModeChange ?? onTouchStickModeChange,
            onTouchDeadzoneInnerChange: onRightTouchDeadzoneInnerChange ?? onTouchDeadzoneInnerChange,
            onTouchRingModeChange: onRightTouchRingModeChange ?? onTouchRingModeChange,
            onTouchStickRadiusChange: onRightTouchStickRadiusChange ?? onTouchStickRadiusChange,
            onTouchStickAxisChange: onRightTouchStickAxisChange ?? onTouchStickAxisChange,
          }
    return (
      <SideBlock
        key={side}
        side={side}
        title={side === 'left' ? t('keymap.leftTrackpadSection', 'Left trackpad') : t('keymap.rightTrackpadSection', 'Right trackpad')}
        description={t('keymap.touchpadSettingsDescription')}
      >
        <TouchpadModeCard config={card} />
        {gridMode && pad && isVisible('touch-grid') && (
          <TouchpadGridSection
            side={side}
            gridColumns={pad.columns}
            gridCells={pad.cells}
            livePad={side === 'left' ? livePadTouches.left : livePadTouches.right}
            renderButton={renderButtonCard}
            touchpadButtons={pad.buttons}
            selectedButton={
              pad.buttons.find(button => button.command.toUpperCase() === selectedTouchpadGridCommand?.toUpperCase()) ?? null
            }
            selectedCommand={selectedTouchpadGridCommand ?? null}
            onSelectButton={setSelectedTouchpadGridCommand}
            isButtonBound={isTouchpadButtonBound}
            {...actionsProps}
          />
        )}
        {gridMode && isVisible('touch-stick') && (
          <TouchpadStickSection
            title={side === 'left' ? t('keymap.touchStickTitleLeft', 'Left touch stick') : t('keymap.touchStickTitleRight', 'Right touch stick')}
            {...stickProps}
            {...actionsProps}
          />
        )}
        {!gridMode && (
          <SectionActions className={keymapStyles.keymapSectionActions} {...actionsProps} />
        )}
      </SideBlock>
    )
  }

  const stickModeExtras = (side: 'LEFT' | 'RIGHT') => {
    const mode = side === 'LEFT' ? stickModeSettings?.left.mode ?? '' : stickModeSettings?.right.mode ?? ''
    if ((mode === 'AIM' || (side === 'LEFT' && mode === 'HYBRID_AIM')) && stickAimSettings && stickAimHandlers) {
      return <StickAimSettings values={stickAimSettings} handlers={stickAimHandlers} disabled={isCalibrating} />
    }
    if ((mode === 'FLICK' || mode === 'FLICK_ONLY' || mode === 'ROTATE_ONLY') && stickFlickSettings && stickFlickHandlers) {
      return <StickFlickSettings values={stickFlickSettings} handlers={stickFlickHandlers} disabled={isCalibrating} />
    }
    if (mode === 'MOUSE_AREA' && mouseRingRadius !== undefined && onMouseRingRadiusChange) {
      return (
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.mouseAreaRadiusNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField
              label={t('keymap.mouseAreaRadius')}
              value={mouseRingRadius}
              onChange={onMouseRingRadiusChange}
              min={0}
              max={2000}
              step={10}
              coarseStep={100}
              unit="px"
              placeholder={t('common.enterRadius')}
              disabled={isCalibrating}
            />
          </div>
        </div>
      )
    }
    if (mode === 'SCROLL_WHEEL' && scrollSens !== undefined && onScrollSensChange) {
      return (
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.scrollSensitivityNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField
              label={t('keymap.scrollSensitivity')}
              value={scrollSens}
              onChange={onScrollSensChange}
              min={0}
              max={180}
              step={1}
              coarseStep={10}
              unit="°"
              placeholder={t('common.enterDegrees')}
              disabled={isCalibrating}
            />
          </div>
        </div>
      )
    }
    if (mode === 'LEFT_STICK' || mode === 'RIGHT_STICK') {
      return (
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('stickModes.virtualStickHint')}</small>
          {virtualControllerType === 'NONE' && (
            <div className={keymapStyles.virtualControllerWarning}>
              {t('stickModes.virtualStickDisabledWarning')}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  const renderSections = (sections: { key: string; shouldRender: boolean; node: JSX.Element }[]) =>
    sections.filter(section => section.shouldRender).map(section => <Fragment key={section.key}>{section.node}</Fragment>)

  return (
    <Card
      className="control-panel"
      lockable
      locked={isCalibrating}
      lockMessage={lockMessage ?? t('messages.lockMessage')}
    >
      {!showMappedLayout && (
        <div className={keymapStyles.keymapCardHeader}>
          <div className={keymapStyles.keymapTitleRow}>
            <h2>
              {/* The touchpad view is used twice: once for the pads' bindings and
                  once for the sensor tuning, which is a different page and needs
                  its own name. */}
              {view === 'touchpad'
                ? (isVisible('touch-sensors')
                    ? t('keymap.sensorControlsTitle', 'Trackpad & Grip Sensors')
                    : t('keymap.touchpadControlsTitle'))
                : t('keymap.controlsTitle')}
            </h2>
          </div>
        </div>
      )}

      {showGlobalOnlyLayout && (
        <GlobalControlsSection
          holdPressTimeSeconds={holdPressTimeInputValue}
          holdPressTimeIsCustom={holdPressTimeIsCustom}
          holdPressTimeDefault={holdPressTimeDefault}
          onHoldPressTimeChange={onHoldPressTimeChange}
          doublePressWindowSeconds={doublePressInputValue}
          doublePressWindowIsCustom={doublePressWindowIsCustom}
          onDoublePressWindowChange={onDoublePressWindowChange}
          simPressWindowSeconds={simPressInputValue}
          simPressWindowIsCustom={simPressWindowIsCustom}
          onSimPressWindowChange={onSimPressWindowChange}
          lightBarColor={lightBarColor}
          onLightBarChange={onLightBarChange}
          adaptiveTriggerValue={adaptiveTriggerValue}
          onAdaptiveTriggerChange={onAdaptiveTriggerChange}
          triggerThreshold={triggerThreshold}
          onTriggerThresholdChange={onTriggerThresholdChange}
          onOpenMappingHelp={() => setMappingHelpOpen(true)}
          {...actionsProps}
        />
      )}

      {showConfigWidePanels && (
        <>
          <GlobalControlsSection
            compact
            showActions={false}
            holdPressTimeSeconds={holdPressTimeInputValue}
            holdPressTimeIsCustom={holdPressTimeIsCustom}
            holdPressTimeDefault={holdPressTimeDefault}
            onHoldPressTimeChange={onHoldPressTimeChange}
            doublePressWindowSeconds={doublePressInputValue}
            doublePressWindowIsCustom={doublePressWindowIsCustom}
            onDoublePressWindowChange={onDoublePressWindowChange}
            simPressWindowSeconds={simPressInputValue}
            simPressWindowIsCustom={simPressWindowIsCustom}
            onSimPressWindowChange={onSimPressWindowChange}
            lightBarColor={lightBarColor}
            onLightBarChange={onLightBarChange}
            adaptiveTriggerValue={adaptiveTriggerValue}
            onAdaptiveTriggerChange={onAdaptiveTriggerChange}
            triggerThreshold={triggerThreshold}
            onTriggerThresholdChange={onTriggerThresholdChange}
            onOpenMappingHelp={() => setMappingHelpOpen(true)}
            {...actionsProps}
          />
          {onVirtualControllerTypeChange && (
            <section className={keymapStyles.virtualControllerPanel}>
              <div className={keymapStyles.mappingVisualHeader}>
                <div>
                  <h3>{t('keymap.virtualControllerTitle')}</h3>
                  <p>{t('keymap.virtualControllerDescription')}</p>
                </div>
              </div>
              <div className={keymapStyles.virtualControllerControls} data-capture-ignore="true">
                <label className={keymapStyles.quickComposerField}>
                  <span>{t('keymap.virtualControllerTypeLabel')}</span>
                  <select
                    className="app-select"
                    value={virtualControllerType ?? 'NONE'}
                    onChange={(event) => onVirtualControllerTypeChange(event.target.value as VirtualControllerType)}
                    disabled={isCalibrating}
                  >
                    <option value="NONE">{t('keymap.virtualControllerType_NONE')}</option>
                    <option value="XBOX">{t('keymap.virtualControllerType_XBOX')}</option>
                    <option value="DS4">{t('keymap.virtualControllerType_DS4')}</option>
                  </select>
                </label>
                <p className={keymapStyles.virtualControllerHint}>{t('keymap.virtualControllerHint')}</p>
              </div>
              {virtualControllerWarnings && virtualControllerWarnings.length > 0 && (
                <div className={keymapStyles.virtualControllerWarnings}>
                  {virtualControllerWarnings.map((warning, index) => (
                    <div key={`${warning.kind}-${index}`} className={keymapStyles.virtualControllerWarning}>
                      {renderVirtualControllerWarning(warning)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {showMappedLayout && (
        <>
          {(
            <section className={keymapStyles.mappingListShell}>
              <aside className={keymapStyles.mappingListSidebar} data-capture-ignore="true">
                <div className={keymapStyles.mappingListSidebarTitle}>{t('keymap.mappingLayoutList')}</div>
                <div className={keymapStyles.mappingListJumpBar}>
                  {listMappingGroups.map(([groupKey, group]) => (
                    <button
                      key={groupKey}
                      type="button"
                      className={keymapStyles.mappingListJumpChip}
                      onClick={() => scrollToListSection(groupKey)}
                    >
                      {t(group.titleKey)}
                    </button>
                  ))}
                </div>
              </aside>
              <div className={keymapStyles.mappingListContent}>
                {listMappingGroups.map(([groupKey, group]) => (
                  <div
                    key={groupKey}
                    ref={element => {
                      listSectionRefs.current[groupKey] = element
                    }}
                    className={keymapStyles.mappingListSectionAnchor}
                  >
                    <KeymapSection
                      title={t(group.titleKey)}
                      description={group.descriptionKey ? t(group.descriptionKey) : undefined}
                      icon={group.icon}
                    >
                      {(groupKey === 'leftStick' || groupKey === 'rightStick') && stickModeSettings && onStickModeChange && onRingModeChange && onStickDeadzoneChange && (
                        <SideBlock side={groupKey === 'leftStick' ? 'left' : 'right'} title={groupKey === 'leftStick' ? t('keymap.leftStickTitle') : t('keymap.rightStickTitle')}>
                          <div className={keymapStyles.stickSettingsInline}>
                            <StickSettingsCard
                              variant="inline"
                              title=""
                              innerValue={groupKey === 'leftStick' ? leftDeadzoneValues.inner : rightDeadzoneValues.inner}
                              outerValue={groupKey === 'leftStick' ? leftDeadzoneValues.outer : rightDeadzoneValues.outer}
                              defaultInner={deadzoneDefaults.inner}
                              defaultOuter={deadzoneDefaults.outer}
                              modeValue={groupKey === 'leftStick' ? leftStickModes.mode : rightStickModes.mode}
                              ringValue={groupKey === 'leftStick' ? leftStickModes.ring : rightStickModes.ring}
                              onModeChange={(value) => onStickModeChange(groupKey === 'leftStick' ? 'LEFT' : 'RIGHT', value)}
                              onRingChange={(value) => onRingModeChange(groupKey === 'leftStick' ? 'LEFT' : 'RIGHT', value)}
                              onInnerChange={(value) => onStickDeadzoneChange(groupKey === 'leftStick' ? 'LEFT' : 'RIGHT', 'INNER', value)}
                              onOuterChange={(value) => onStickDeadzoneChange(groupKey === 'leftStick' ? 'LEFT' : 'RIGHT', 'OUTER', value)}
                              disabled={isCalibrating}
                              modeExtras={stickModeExtras(groupKey === 'leftStick' ? 'LEFT' : 'RIGHT')}
                            />
                          </div>
                          <div className={keymapStyles.keymapGrid}>
                            {group.buttons.map(button => (
                              <div key={button.command}>{renderButtonCard(button)}</div>
                            ))}
                          </div>
                        </SideBlock>
                      )}
                      {groupKey !== 'leftStick' && groupKey !== 'rightStick' && (() => {
                        const split = splitButtonsBySide(group.buttons)
                        const sided = SIDE_SPLIT_GROUPS.has(groupKey) && split.left.length > 0 && split.right.length > 0
                        if (!sided) {
                          return (
                            <div className={keymapStyles.keymapGrid}>
                              {group.buttons.map(button => (
                                <div key={button.command}>{renderButtonCard(button)}</div>
                              ))}
                            </div>
                          )
                        }
                        return (
                          <>
                            {(['left', 'right'] as const).map(side => (
                              <SideBlock key={side} side={side}>
                                {groupKey === 'triggers' && renderTriggerMode(side)}
                                <div className={keymapStyles.keymapGrid}>
                                  {(side === 'left' ? split.left : split.right).map(button => (
                                    <div key={button.command}>{renderButtonCard(button)}</div>
                                  ))}
                                </div>
                              </SideBlock>
                            ))}
                            {split.rest.length > 0 && (
                              <div className={keymapStyles.keymapGrid}>
                                {split.rest.map(button => (
                                  <div key={button.command}>{renderButtonCard(button)}</div>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </KeymapSection>
                  </div>
                ))}
                <SectionActions
                  className={keymapStyles.keymapSectionActions}
                  {...actionsProps}
                />
              </div>
            </section>
          )}
        </>
      )}

      {view === 'touchpad' && (
        <>
          {renderSections([
            {
              key: 'touch-sides',
              shouldRender: showPerPadTouchpads && (isVisible('touch-grid') || isVisible('touch-stick')),
              node: (
                <>
                  {touchpadWarnings && touchpadWarnings.length > 0 && (
                    <div className={keymapStyles.virtualControllerWarnings}>
                      {touchpadWarnings.map((warning, index) => (
                        <div key={`${warning.code}-${index}`} className={keymapStyles.virtualControllerWarning}>
                          {renderTouchpadWarning(warning)}
                        </div>
                      ))}
                    </div>
                  )}
                  {renderPadSide('left')}
                  {renderPadSide('right')}
                </>
              ),
            },
            {
              key: 'touch-grid',
              shouldRender: !showPerPadTouchpads && isVisible('touch-grid'),
              node: (
                <>
                  <TouchpadSettingsSection
                    touchpadMode={touchpadMode}
                    touchpadDualStageMode={touchpadDualStageMode}
                    gridColumns={gridColumns}
                    gridRows={gridRows}

                    onTouchpadModeChange={onTouchpadModeChange}
                    onTouchpadDualStageModeChange={onTouchpadDualStageModeChange}
                    onGridSizeChange={onGridSizeChange}
                    touchpadSensitivity={touchpadSensitivity}
                    touchpadSensitivityY={touchpadSensitivityY}
                    onTouchpadSensitivityYChange={onTouchpadSensitivityYChange}
                    onTouchpadSensitivityChange={onTouchpadSensitivityChange}
                    touchpadSmoothing={touchpadSmoothing}
                    onTouchpadSmoothingChange={onTouchpadSmoothingChange}
                    touchpadAcceleration={touchpadAcceleration}
                    onTouchpadAccelerationChange={onTouchpadAccelerationChange}
                    warnings={touchpadWarnings?.map(renderTouchpadWarning)}
                    {...actionsProps}
                  />
                  {touchpadGridPads.map(pad => {
                    const selected =
                      pad.buttons.find(
                        button => button.command.toUpperCase() === selectedTouchpadGridCommand?.toUpperCase()
                      ) ?? null
                    return (
                      <TouchpadGridSection
                        key={pad.side}
                        side={pad.side}
                        gridColumns={pad.columns}
                        gridCells={pad.cells}
                        livePad={
                          pad.side === 'left'
                            ? livePadTouches.left
                            : pad.side === 'right'
                              ? livePadTouches.right
                              : livePadTouch
                        }
                        renderButton={renderButtonCard}
                        touchpadButtons={pad.buttons}
                        selectedButton={selected}
                        selectedCommand={selected?.command ?? null}
                        onSelectButton={setSelectedTouchpadGridCommand}
                        isButtonBound={isTouchpadButtonBound}
                        {...actionsProps}
                      />
                    )
                  })}
                </>
              ),
            },
            {
              key: 'touch-sensors',
              shouldRender: isVisible('touch-sensors'),
              node: (
                <TouchpadSensorSection
                  touchpadMinCutoff={touchpadMinCutoff}
                  touchpadSpeedCoeff={touchpadSpeedCoeff}
                  touchpadTrackballDecay={touchpadTrackballDecay}
                  touchpadTrackballMinVelocity={touchpadTrackballMinVelocity}
                  onTouchpadMinCutoffChange={onTouchpadMinCutoffChange}
                  onTouchpadSpeedCoeffChange={onTouchpadSpeedCoeffChange}
                  onTouchpadTrackballDecayChange={onTouchpadTrackballDecayChange}
                  onTouchpadTrackballMinVelocityChange={onTouchpadTrackballMinVelocityChange}
                  {...actionsProps}
                />
              ),
            },
            {
              key: 'touch-accel',
              shouldRender: isVisible('touch-sensors') && Boolean(touchpadAccelValues && onTouchpadAccelCurveChange && onTouchpadAccelParamChange && onAccelCurveLinkChange),
              node: (
                <TouchpadAccelSection
                  values={touchpadAccelValues ?? {}}
                  gyroShape={gyroAccelShape}
                  accelCurveLink={accelCurveLink}
                  onCurveChange={onTouchpadAccelCurveChange ?? (() => {})}
                  onParamChange={onTouchpadAccelParamChange ?? (() => {})}
                  onLinkChange={onAccelCurveLinkChange ?? (() => {})}
                  {...actionsProps}
                />
              ),
            },
            {
              key: 'grip-sensors',
              shouldRender: isVisible('grip-sensors'),
              node: (
                <GripSettingsSection
                  gripSensorRange={gripSensorRange}
                  gripFlickerGuard={gripFlickerGuard}
                  gripHapticIntensity={gripHapticIntensity}
                  gripHapticEffect={gripHapticEffect}
                  gripReleaseHapticIntensity={gripReleaseHapticIntensity}
                  gripReleaseHapticEffect={gripReleaseHapticEffect}
                  onGripSensorRangeChange={onGripSensorRangeChange}
                  onGripFlickerGuardChange={onGripFlickerGuardChange}
                  onGripHapticIntensityChange={onGripHapticIntensityChange}
                  onGripHapticEffectChange={onGripHapticEffectChange}
                  onGripReleaseHapticIntensityChange={onGripReleaseHapticIntensityChange}
                  onGripReleaseHapticEffectChange={onGripReleaseHapticEffectChange}
                  {...actionsProps}
                />
              ),
            },
            {
              key: 'touch-stick',
              shouldRender: !showPerPadTouchpads && isVisible('touch-stick') && touchpadMode === 'GRID_AND_STICK',
              node: (
                <TouchpadStickSection
                  touchStickMode={touchStickMode}
                  touchDeadzoneInner={touchDeadzoneInner}
                  touchRingMode={touchRingMode}
                  touchStickRadius={touchStickRadius}
                  touchStickAxis={touchStickAxis}
                  onTouchStickModeChange={onTouchStickModeChange}
                  onTouchDeadzoneInnerChange={onTouchDeadzoneInnerChange}
                  onTouchRingModeChange={onTouchRingModeChange}
                  onTouchStickRadiusChange={onTouchStickRadiusChange}
                  onTouchStickAxisChange={onTouchStickAxisChange}
                  {...actionsProps}
                />
              ),
            },
            {
              key: 'touch-bind',
              shouldRender: isVisible('touch-bind'),
              node: (
                <ButtonGridSection
                  title={t('keymap.touchButtonsTitle')}
                  description={
                    showPerPadTouchpads
                      ? t('keymap.touchButtonsDescriptionShared')
                      : t('keymap.touchButtonsDescription')
                  }
                  buttons={touchpadButtonSectionButtons}
                  renderButton={renderButtonCard}
                  {...actionsProps}
                />
              ),
            },
          ])}
        </>
      )}

      <MappingRulesHelpModal isOpen={mappingHelpOpen} onClose={() => setMappingHelpOpen(false)} />
    </Card>
  )
}
