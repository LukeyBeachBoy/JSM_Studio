import { resolveOverlayMenus } from '../utils/overlayLayout'
import { InputModeshifts } from './keymap/InputModeshifts'
import { modeshiftCount, padModeshiftSettings, type ModeshiftTarget } from '../utils/modeshift'
import { getButtonDescription } from '../keymap/schema'
import { ConfigScope } from './ConfigScope'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DEFAULT_STICK_DEADZONE_INNER, DEFAULT_STICK_DEADZONE_OUTER } from '../constants/defaults'
import { stickModeDirectionUse } from '../constants/sticks'
import {
  wasdBindingChangesStickMode,
  type DirectionalSetId,
  type VirtualControllerScheme,
} from '../utils/quickBind'
import { showToast } from '../utils/toast'
import { desktopBridge } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import {
  BindingSlot,
  BindingWriteMode,
  ButtonBindingRow,
  getButtonBindingRows,
  getKeymapValue,
  removeKeymapEntry,
  updateKeymapEntry,
} from '../utils/keymap'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { escapeIsClaimed } from '../hooks/useKeyboardNav'
import { INCLUDE_ROOT, inheritedFrom, type IncludeResolution } from '../utils/configIncludes'
import {
  BUMPER_BUTTONS,
  CENTER_BUTTONS,
  DPAD_BUTTONS,
  FACE_BUTTONS,
  LEFT_STICK_BUTTONS,
  MINI_BUTTONS,
  MISC_BUTTONS,
  PADDLE_BUTTONS,
  PAD_CLICK_BUTTONS,
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
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { useButtonRowState } from '../keymap/useButtonRowState'
import { ButtonBindingsCard } from './keymap/ButtonBindingsCard'
import { ButtonGridSection } from './keymap/ButtonGridSection'
import { Card } from './Card'
import keymapStyles from './Keymap.module.css'
import { KeymapSection } from './KeymapSection'
import { MappingRulesHelpModal } from './keymap/MappingRulesHelpModal'
import stickStyles from './Sticks.module.css'
import { TouchpadGridSection } from './keymap/TouchpadGridSection'
import { PadSection } from './keymap/PadSection'
import { bindingSummary } from '../utils/menuDescriptions'
import { mouseFeelSummary } from '../utils/mouseFeel'
import { gripSensorsSummary } from '../utils/gripCalibration'
import { SummaryRow } from './ui/SummaryRow'
import { Sheet } from './ui/Sheet'
import { LightBarPicker } from './keymap/LightBarPicker'

import { TouchpadSettingsSection, type TouchpadModeCardConfig } from './keymap/TouchpadSettingsSection'
import { SideBlock, SideSplit } from './keymap/SideBlock'

// Inside Left trigger / Right trigger the rows are the two stages (15c).
const TRIGGER_ROW_LABELS: Record<string, string> = { ZL: 'Soft pull', ZR: 'Soft pull', ZLF: 'Full pull', ZRF: 'Full pull' }
import { TriggerMeter } from './keymap/TriggerMeter'
import { StickSection } from './keymap/StickSection'
import { describeBinding } from '../utils/bindingDescription'
import { OPTION_HELP } from '../utils/optionHelp'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../hooks/useTouchpadConfig'
import type { AccelCurveLink, AccelCurveShape } from '../utils/accelCurve'
import type { BindingCommandPreset } from '../utils/bindingCommands'
import { TouchpadStickSection } from './keymap/TouchpadStickSection'
import { controllerHasTwoTrackpads, controllerSupportsInput, controllerVisualFamily } from '../utils/controllerStatus'
import { padAspectFromDevices } from '../utils/padGeometry'
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
import { NumberField } from './NumberField'
import type { VirtualControllerType, VirtualControllerWarning } from '../utils/virtualController'
import { normalizeTouchpadMode, type TouchpadWarning } from '../utils/touchpadConfig'
import { AppSelect } from './ui/AppSelect'
import { IconSelect } from './keymap/IconSelect'
import { Icon } from './icons/Icon'
import type { IconName } from './icons/iconData'
import { SettingOrigin } from './SettingOrigin'
import { TRACKPAD_ANCHORS } from '../constants/trackpadAnchors'


function sectionScope(section: string): RegExp {
  const patterns: Record<string, RegExp> = {
    'touch-sensors': /^TOUCHPAD_(MIN_CUTOFF|SPEED_COEFF|D_CUTOFF|MOVEMENT_|CLICK_DAMPEN|LIFT_|TRACKBALL_)/,
    'touch-haptics': /^TOUCHPAD_(HAPTIC_|CLICK_HAPTIC_|RELEASE_HAPTIC_)/,
    'touch-accel': /^(TOUCHPAD_ACCEL_|ACCEL_CURVE_LINK)/,
    'grip-sensors': /^(LEFT_|RIGHT_)?GRIP_/,
    'touch-bind': /^(MISC2|MISC3|CAPTURE|TOUCH|TUP|TDOWN|TLEFT|TRIGHT|TRING)$/,
    face: /^(N|S|E|W)$/,
    bumpers: /^(L|R)$/,
    center: /^(HOME|CAPTURE|MIC|\+|-)$/,
    dpad: /^(UP|DOWN|LEFT|RIGHT)$/,
    triggers: /^(ZL|ZR|TRIGGER_)/,
    leftStick: /^(L[LRUDSR]|LEFT_(STICK|RING)|STICK_|FLICK_|MOUSE_RING|SCROLL_)/,
    rightStick: /^(R[LRUDSR]|RIGHT_(STICK|RING)|STICK_|FLICK_|MOUSE_RING|SCROLL_)/,
    paddles: /^(LPAD|RPAD|P[1-4]|[LR][1-4])$/,
    extra: /^(MISC|EXTRA)/,
    global: /^(HOLD_PRESS|DOUBLE_PRESS|SIM_PRESS|TRIGGER_|ADAPTIVE_TRIGGER|LIGHT_BAR)/,
  }
  return patterns[section] ?? /^(TOUCH|LEFT_TOUCH|RIGHT_TOUCH|GRID|LEFT_GRID|RIGHT_GRID|LT\d|RT\d|T\d)/
}

type KeymapControlsProps = {
  onConfigTextChange?: React.Dispatch<React.SetStateAction<string>>
  configText: string
  // This profile with its imports resolved in place -- what the runtime would
  // actually execute. Every read here uses it so an inherited binding is shown
  // instead of appearing unbound; writes still go to configText.
  effectiveConfigText?: string
  // Where each effective setting came from, for marking inherited controls.
  configIncludes?: IncludeResolution | null
  /** Configurations a binding can switch to, for a load-config output. */
  libraryProfiles?: string[]
  currentProfileName?: string | null
  // Opens the raw config editor, the only place an import line is visible.
  onOpenConfigEditor?: () => void
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
  touchpadMovementThreshold?: number
  touchpadClickDampen?: number
  touchpadClickDampenThreshold?: number
  touchpadHapticIntensity?: number
  touchpadHapticEffect?: string
  touchpadHapticInterval?: number
  touchpadClickHapticIntensity?: number
  touchpadClickHapticEffect?: string
  touchpadReleaseHapticIntensity?: number
  touchpadReleaseHapticEffect?: string
  onTouchpadMinCutoffChange?: (value: string) => void
  onTouchpadSpeedCoeffChange?: (value: string) => void
  onTouchpadTrackballDecayChange?: (value: string) => void
  onTouchpadTrackballMinVelocityChange?: (value: string) => void
  onTouchpadMovementThresholdChange?: (value: string) => void
  onTouchpadClickDampenChange?: (value: string) => void
  onTouchpadClickDampenThresholdChange?: (value: string) => void
  onTouchpadHapticIntensityChange?: (value: string) => void
  onTouchpadHapticEffectChange?: (value: string) => void
  onTouchpadHapticIntervalChange?: (value: string) => void
  onTouchpadClickHapticIntensityChange?: (value: string) => void
  onTouchpadClickHapticEffectChange?: (value: string) => void
  onTouchpadReleaseHapticIntensityChange?: (value: string) => void
  onTouchpadReleaseHapticEffectChange?: (value: string) => void
  leftGripHaptics?: boolean
  rightGripHaptics?: boolean
  onLeftGripHapticsChange?: (enabled: boolean) => void
  onRightGripHapticsChange?: (enabled: boolean) => void
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
  touchpadGridRequiresClick?: boolean
  onTouchpadModeChange?: (value: string) => void
  onTouchpadDualStageModeChange?: (value: string) => void
  onTouchpadGridRequiresClickChange?: (checked: boolean) => void
  leftTouchpadMode?: string
  rightTouchpadMode?: string
  leftTouchpadDualStageMode?: string
  rightTouchpadDualStageMode?: string
  leftGridRequiresClick?: boolean
  rightGridRequiresClick?: boolean
  onLeftTouchpadModeChange?: (value: string) => void
  onRightTouchpadModeChange?: (value: string) => void
  onLeftTouchpadDualStageModeChange?: (value: string) => void
  onRightTouchpadDualStageModeChange?: (value: string) => void
  onLeftGridRequiresClickChange?: (checked: boolean) => void
  onRightGridRequiresClickChange?: (checked: boolean) => void
  leftGridColumns?: number
  leftGridRows?: number
  rightGridColumns?: number
  rightGridRows?: number
  onLeftGridSizeChange?: (cols: number, rows: number) => void
  onRightGridSizeChange?: (cols: number, rows: number) => void
  gridShape?: string
  leftGridShape?: string
  rightGridShape?: string
  gridDeadzone?: number
  leftGridDeadzone?: number
  rightGridDeadzone?: number
  onGridShapeChange?: (value: string) => void
  onLeftGridShapeChange?: (value: string) => void
  onRightGridShapeChange?: (value: string) => void
  onGridDeadzoneChange?: (value: string) => void
  onLeftGridDeadzoneChange?: (value: string) => void
  onRightGridDeadzoneChange?: (value: string) => void
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
  /** Takes the user to the Trackpad tuning page, for the dials that are not per-pad. */
  onOpenTuning?: () => void
  /** Your own names for what each input does, shown on the Overview diagram. */
  bindingLabels?: Record<string, string>
  bindingIcons?: Record<string, string>
  onBindingIconChange?: (command: string, icon: string) => void
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
  /** Binds every standard input straight through to a virtual pad in one go. */
  onBindGamepadPassthrough?: (scheme: VirtualControllerScheme) => void
  /** Points one four-way directional's Up/Down/Left/Right at W/S/A/D. */
  onBindDirectionsToWasd?: (setId: DirectionalSetId) => void
}

// A stick's mode settings come in two halves. The primary half sits in the card
// body; the advanced half is handed back to the card so it can go inside the
// card's own Advanced disclosure. Rendering a second disclosure here is what
// produced two "Advanced" toggles in a single stick card.
type StickSettingsPart = 'primary' | 'advanced'

type StickAimSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickAimSettings']>
  handlers: NonNullable<KeymapControlsProps['stickAimHandlers']>
  disabled?: boolean
  part: StickSettingsPart
}

const StickAimSettings = ({ values, handlers, disabled, part }: StickAimSettingsProps) => {
  const { t } = useTranslation()
  const sensXValue = values.displaySensX
  const sensYValue = values.displaySensY
  const powerValue = values.power ?? ''
  const accelRateValue = values.accelerationRate ?? ''
  const accelCapValue = values.accelerationCap ?? ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  if (part === 'primary') {
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
      </div>
    )
  }

  return (
    <div className={stickStyles.stickAimSettings} data-capture-ignore="true">
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
    </div>
  )
}

type StickFlickSettingsProps = {
  values: NonNullable<KeymapControlsProps['stickFlickSettings']>
  handlers: NonNullable<KeymapControlsProps['stickFlickHandlers']>
  disabled?: boolean
  part: StickSettingsPart
}

const StickFlickSettings = ({ values, handlers, disabled, part }: StickFlickSettingsProps) => {
  const { t } = useTranslation()
  const snapMode = values.snapMode || ''
  const formatDefault = (value: string) => t('common.defaultValue', { value })

  if (part === 'primary') {
    return (
      <div className="stick-flick-settings" data-capture-ignore="true">
        <small>{t('keymap.stickFlickNote')}</small>
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="FLICK_TIME"
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
            <AppSelect className="app-select" value={snapMode} onChange={(event) => handlers.onSnapModeChange(event.target.value)} disabled={disabled}>
              <option value="">{t('common.defaultValue', { value: 'NONE' })}</option>
              <option value="4">{t('keymap.snapToFour')}</option>
              <option value="8">{t('keymap.snapToEight')}</option>
            </AppSelect>
          </label>
        </div>
      </div>
    )
  }

  return (
    <div className="stick-flick-settings" data-capture-ignore="true">
        <div className={stickStyles.stickAimGrid}>
          <NumberField setting="FLICK_TIME_EXPONENT"
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
    </div>
  )
}

// Most stick modes have a handful of settings and nothing worth hiding.
const withoutAdvanced = (primary: JSX.Element) => ({ primary, advanced: null })

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

// Directions a stick in a whole-stick mode never sends are just noise in the
// list -- Steam Input folds them away the same way once a stick has a "mode"
// applied. stickModeDirectionUse is what says which modes still send them, and
// SCROLL_WHEEL is why it isn't a plain yes/no: rotating the stick pulses its
// left and right bindings, so those two stay while up/down go.
// Click/Ring/Touch stay visible in every mode: those fire independently of
// which mode the stick's continuous output is in.
const STICK_DIRECTION_COMMANDS: Record<'leftStick' | 'rightStick', Set<string>> = {
  leftStick: new Set(['LUP', 'LDOWN', 'LLEFT', 'LRIGHT']),
  rightStick: new Set(['RUP', 'RDOWN', 'RLEFT', 'RRIGHT']),
}

const STICK_ROTATION_COMMANDS: Record<'leftStick' | 'rightStick', Set<string>> = {
  leftStick: new Set(['LLEFT', 'LRIGHT']),
  rightStick: new Set(['RLEFT', 'RRIGHT']),
}

// LMINI/RMINI exist on a handful of pads (an Xbox Elite's L4/R4, a Razer
// Wolverine's L5/R5) and on nothing else, so listing them for every controller
// offered two inputs most people do not have. Anything already bound still
// shows, so an existing config never hides a binding you cannot then find.

function visibleButtonsForGroup(
  groupKey: string,
  buttons: ButtonDefinition[],
  leftStickMode: string,
  rightStickMode: string
) {
  const side = groupKey === 'leftStick' || groupKey === 'rightStick' ? groupKey : null
  if (!side) return buttons
  const directionCommands = STICK_DIRECTION_COMMANDS[side]
  const mode = side === 'leftStick' ? leftStickMode : rightStickMode
  const use = stickModeDirectionUse(mode)
  if (use === 'all') return buttons
  const kept = use === 'leftRight' ? STICK_ROTATION_COMMANDS[side] : null
  return buttons.filter(button => {
    const command = button.command.toUpperCase()
    if (!directionCommands.has(command)) return true
    return kept ? kept.has(command) : false
  })
}

// Which hand an input belongs to, for the left-then-right layout. Anything not
// obviously one-sided (face buttons, Steam/QAM, d-pad) stays unsplit.
const LEFT_SIDE_COMMANDS = new Set(['L', 'ZL', 'ZLF', 'LSL', 'LSR', 'LMINI', 'MISC3', 'MISC6', 'L3', 'LTOUCH', 'LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING'])
const RIGHT_SIDE_COMMANDS = new Set(['R', 'ZR', 'ZRF', 'RSR', 'RSL', 'RMINI', 'MISC2', 'MISC5', 'R3', 'RTOUCH', 'RUP', 'RDOWN', 'RLEFT', 'RRIGHT', 'RRING'])
// Only the triggers read per hand (15a); every other group is one column of
// rows (Buttons Content), so an open editor has the page's full width.
const SIDE_SPLIT_GROUPS = new Set(['triggers'])

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

// The button groups that are a four-way directional, and the set of inputs each
// one covers. Face buttons are laid out as a diamond too, but nothing sends them
// as a direction, so they are not offered the WASD quick bind.
const DIRECTIONAL_GROUP_SETS: Record<string, DirectionalSetId> = {
  dpad: 'dpad',
  leftStick: 'leftStick',
  rightStick: 'rightStick',
}

// Telemetry re-renders this whole panel every frame (`devices` is a fresh
// array per sample), and the binding cards are the bulk of it. They are
// memoised, which only holds if what they are handed keeps its identity:
// App's handlers are plain closures remade on every render, so each is
// wrapped in a function that never changes and calls the latest one.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useStable<T extends (...args: any[]) => any>(fn: T | undefined): T {
  const latest = useRef(fn)
  latest.current = fn
  return useRef(((...args: Parameters<T>) => latest.current?.(...args)) as T).current
}

const EMPTY_ROWS: ButtonBindingRow[] = []

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
  effectiveConfigText,
  configIncludes,
  libraryProfiles,
  currentProfileName,
  onOpenConfigEditor,
  onConfigTextChange,
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
  onModifierChange,
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
  touchpadHapticIntensity,
  gripSensorRange,
  touchpadDualStageMode = '',
  touchpadGridRequiresClick,
  onTouchpadModeChange,
  onTouchpadDualStageModeChange,
  onTouchpadGridRequiresClickChange,
  leftTouchpadMode,
  rightTouchpadMode,
  leftTouchpadDualStageMode,
  rightTouchpadDualStageMode,
  leftGridRequiresClick,
  rightGridRequiresClick,
  onLeftTouchpadModeChange,
  onRightTouchpadModeChange,
  onLeftTouchpadDualStageModeChange,
  onRightTouchpadDualStageModeChange,
  onLeftGridRequiresClickChange,
  onRightGridRequiresClickChange,
  leftGridColumns,
  leftGridRows,
  rightGridColumns,
  rightGridRows,
  onLeftGridSizeChange,
  onRightGridSizeChange,
  gridShape,
  leftGridShape,
  rightGridShape,
  gridDeadzone,
  leftGridDeadzone,
  rightGridDeadzone,
  onGridShapeChange,
  onLeftGridShapeChange,
  onRightGridShapeChange,
  onGridDeadzoneChange,
  onLeftGridDeadzoneChange,
  onRightGridDeadzoneChange,
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
  onOpenTuning,
    bindingLabels,
    bindingIcons,
    onBindingIconChange,
    onBindingLabelChange,
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
  onBindDirectionsToWasd,
}: KeymapControlsProps) {
  // Identical to configText for a profile that imports nothing, so the common
  // case is untouched.
  const readText = effectiveConfigText ?? configText
  const { t } = useTranslation()
  const [mappingHelpOpen, setMappingHelpOpen] = useState(false)
  // Bindings copied from one button, waiting to be pasted onto another. It
  // survives pasting, so one binding can go to several inputs; Escape and the
  // clipboard bar's Clear are how you put it down.
  const [bindingClipboard, setBindingClipboard] = useState<BindingCommandPreset[]>([])
  useEffect(() => {
    if (bindingClipboard.length === 0) return
    // Captured, and ahead of the controller-navigation handler: holding a
    // binding is a mode, and Escape ends the mode before it closes the row the
    // binding was copied from. A dialog or an open dropdown owns Escape first.
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || escapeIsClaimed()) return
      event.preventDefault()
      setBindingClipboard([])
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [bindingClipboard.length])
  const [selectedStickMenuCommand, setSelectedStickMenuCommand] = useState<string | null>(null)
  const [selectedTouchpadGridCommand, setSelectedTouchpadGridCommand] = useState<string | null>(null)
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
  const stableBindingChange = useStable(onBindingChange)
  const stableModifierChange = useStable(onModifierChange)
  const stableAssignSpecial = useStable(onAssignSpecialAction)
  const stableClearSpecial = useStable(onClearSpecialAction)
  const stableTrackballDecayChange = useStable(onTrackballDecayChange)
  const stableStickModeShiftChange = useStable(onStickModeShiftChange)
  const stableBindingIconChange = useStable(onBindingIconChange)
  const stableBindingLabelChange = useStable(onBindingLabelChange)
  const stableOpenConfigEditor = useStable(onOpenConfigEditor)
  const stableVirtualControllerTypeChange = useStable(onVirtualControllerTypeChange)
  // With no virtual controller chosen yet, binding the pad through has to pick
  // one; Xbox is the scheme nearly every game reads without extra setup.
  const enableVirtualController = useCallback(() => stableVirtualControllerTypeChange('XBOX'), [stableVirtualControllerTypeChange])
  const onEnableVirtualController = onVirtualControllerTypeChange ? enableVirtualController : undefined

  const { captureLabel, beginCapture, beginValueCapture, cancelCapture, isCapturing, isCapturingValue } = useBindingCapture(useCallback((button, slot, rowId, value, options) => {
    stableBindingChange(button, slot, rowId, value, options)
    const isComboSlot = slot === 'chord' || slot === 'simultaneous' || slot === 'diagonal'
    if (value && isComboSlot && manualRows[button]?.[slot]?.some(entry => entry.id === rowId)) {
      removeManualRow(button, slot, rowId)
    }
  }, [manualRows, removeManualRow, stableBindingChange]))

  // The connected controller decides which inputs are listed. Only its kind
  // matters for that, so the lists are keyed on it rather than on the
  // telemetry array, which is a new object every frame.
  const primaryDevice = devices?.[0]
  const inputDevice = useMemo<TelemetryDevice | undefined>(
    () => primaryDevice ? { handle: primaryDevice.handle, type: primaryDevice.type, supportedButtons: primaryDevice.supportedButtons } : undefined,
    [primaryDevice?.handle, primaryDevice?.type, primaryDevice?.supportedButtons] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const deviceTypes = devices?.map(device => device.type).join(',') ?? ''

  const isVisible = (section: string) => {
    const device = devices?.[0]
    if (device && section === 'grip-sensors' && device.type !== 24) return false
    if (device && section.startsWith('touch') && ![4, 5, 24].includes(device.type)) return false
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
      shape: gridShape,
      leftShape: leftGridShape,
      rightShape: rightGridShape,
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
    gridShape,
    leftGridShape,
    rightGridShape,
    rightGridRows,
    rightTouchpadMode,
    touchpadModeProp,
  ])

  // Segments of a stick radial menu are bindable exactly like pad regions, so
  // they join the same list rather than getting a parallel one. A stick that is
  // not in RADIAL_MENU mode contributes nothing, the way a pad in MOUSE mode
  // contributes no grid cells.
  const stickMenuButtons = useMemo<ButtonDefinition[]>(() => {
    const out: ButtonDefinition[] = []
    ;(['LEFT', 'RIGHT'] as const).forEach(side => {
      const mode = (getKeymapValue(readText, `${side}_STICK_MODE`) ?? '').trim().toUpperCase()
      if (mode !== 'RADIAL_MENU') return
      const segments = Math.floor(Number.parseFloat(getKeymapValue(readText, `${side}_STICK_MENU_SIZE`) ?? ''))
      if (!Number.isFinite(segments) || segments < 2) return
      const prefix = side === 'LEFT' ? 'LM' : 'RM'
      for (let i = 1; i <= Math.min(25, segments); i++) {
        out.push(buildTouchpadGridButton(i, 1, i, prefix))
      }
    })
    return out
  }, [readText])

  const touchpadGridButtons = useMemo<ButtonDefinition[]>(
    () => [...touchpadGridPads.flatMap(pad => pad.buttons), ...stickMenuButtons],
    [touchpadGridPads, stickMenuButtons]
  )

  const touchpadGridCommands = useMemo(
    () => touchpadGridButtons.map(button => button.command),
    [touchpadGridButtons]
  )

  // Glyphs follow whatever is plugged in; with nothing connected the generic
  // set keeps every input readable rather than falling back to raw tokens.
  const controllerFamily = controllerVisualFamily(devices?.[0]?.type)

  const modifierOptions = useMemo(() => {
    return buildModifierOptions(gridActive, configuredGridButtons, touchpadGridCommands).map(option => ({
      value: option.value,
      label: resolveModifierOptionLabel(option, t, controllerFamily),
      disabled: option.disabled,
    }))
  }, [configuredGridButtons, controllerFamily, gridActive, t, touchpadGridCommands])

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
      record[command] = getButtonBindingRows(readText, command, manualRows[command] ?? {})
    })
    return record
  }, [readText, manualRows, touchpadGridButtons])

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
  const hasConnectedController = (devices?.length ?? 0) > 0
  const isCommandBound = useCallback(
    (command: string) => {
      const rows = bindingRowsByButton[command.toUpperCase()] ?? bindingRowsByButton[command] ?? []
      return rows.some(row => Boolean(row.binding) || Boolean(row.expression))
    },
    [bindingRowsByButton]
  )

  // The list layout walks the same set, so the jump bar and the page agree.
  const listMappingGroups = useMemo(() => {
    const entries = focusedMappingGroups.length === 0
      ? Object.entries(MAPPING_BUTTON_GROUPS)
      : Object.entries(MAPPING_BUTTON_GROUPS).filter(([key]) => focusedMappingGroups.includes(key))
    return entries.map(([key, group]) => [key, {
      ...group,
      buttons: visibleButtonsForGroup(key, group.buttons.filter(button => controllerSupportsInput(inputDevice, button.command) || isCommandBound(button.command)), leftStickModeForVisibility, rightStickModeForVisibility),
    }] as const)
  }, [focusedMappingGroups, leftStickModeForVisibility, rightStickModeForVisibility, isCommandBound, inputDevice])

  const visualMappingButtons = useMemo(
    () => listMappingGroups.flatMap(([, group]) => group.buttons),
    [listMappingGroups]
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
      const assignment = getKeymapValue(readText, binding.value)
      if (!assignment) return
      assignment
        .split(/\s+/)
        .filter(Boolean)
        .forEach(token => {
          assignments[token.toUpperCase()] = binding.value
        })
    })
    return assignments
  }, [readText, t])

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
    () => /^\s*(LEFT|RIGHT)_(TOUCHPAD_MODE|GRID_SIZE|TOUCHPAD_SENS|TOUCH_STICK_MODE)\b/im.test(readText ?? ''),
    [readText]
  )
  const confirmedTwoPadTouchpads = useMemo(
    () => deviceTypes.split(',').some(type => type !== '' && controllerHasTwoTrackpads(Number(type))),
    [deviceTypes]
  )
  const showPerPadTouchpads = hasPerPadSettings || !devices || devices.length === 0 || confirmedTwoPadTouchpads

  const livePadTouches = useMemo(() => {
    const status = devices?.find(device => device.status)?.status
    const read = (pad?: { x: number; y: number; touched?: boolean } | null) =>
      pad?.touched ? { x: pad.x, y: pad.y, touched: true } : null
    return { left: read(status?.leftPad), right: read(status?.rightPad) }
  }, [devices])

  // The shared grid belongs to a single-pad controller, where either reported
  // point is that pad's.
  const livePadTouch = livePadTouches.left ?? livePadTouches.right

  // The preview is a picture of the physical pad, so it must be that pad's
  // shape. Reported by the driver through telemetry rather than keyed on a
  // controller model, so any pad -- Steam, DualShock, DualSense -- is right.
  const livePadAspect = padAspectFromDevices(devices)

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


  useEffect(() => {
    const command = selectedMappingCommand?.toUpperCase()
    if (command && /^(LT|RT|T)\d+$/.test(command)) setSelectedTouchpadGridCommand(command)
  }, [selectedMappingCommand])

  const previewMenus = useMemo(() => resolveOverlayMenus(readText ?? ''), [readText])
  // The rows a card shows once chords are taken out, computed once per
  // config change rather than filtered afresh (a new array, so a new parse
  // in the card) on every telemetry frame.
  const chordFreeRowsByButton = useMemo(() => {
    const record: Record<string, ButtonBindingRow[]> = {}
    for (const [command, rows] of Object.entries(bindingRowsByButton)) {
      record[command] = rows.some(row => row.slot === 'chord') ? rows.filter(row => row.slot !== 'chord') : rows
    }
    return record
  }, [bindingRowsByButton])
  // How many shifts touch an input is a scan of the whole config; cached per
  // config text so the cards do not each rescan it per frame.
  const modeshiftCountFor = useMemo(() => {
    const counts = new Map<string, number>()
    return (command: string) => {
      let count = counts.get(command)
      if (count === undefined) { count = modeshiftCount(readText, command); counts.set(command, count) }
      return count
    }
  }, [readText])
  const actionsProps = useMemo(() => ({
    hasPendingChanges,
    statusMessage,
    onApply,
    onCancel,
    applyDisabled: isCalibrating,
  }), [hasPendingChanges, statusMessage, onApply, onCancel, isCalibrating])

  // What an input's own MODESHIFTS panel (Binding Editor 7a) needs to edit
  // `TRIGGER,INPUT` lines with the ordinary card. One object, remade only when
  // the config or the capture state changes, so the memoised cards stay put
  // across telemetry frames.
  const inheritedFromKey = useCallback((key: string) => inheritedFrom(configIncludes ?? null, INCLUDE_ROOT, key), [configIncludes])
  const modeshiftPanelProps = useMemo(() => onConfigTextChange ? {
    controllerFamily,
    text: readText,
    onChange: onConfigTextChange,
    modifiers: modifierOptions,
    virtualControllerType: virtualControllerType ?? 'NONE' as VirtualControllerType,
    onEnableVirtualController,
    beginValueCapture,
    isCapturingValue,
    captureLabel,
    libraryProfiles,
    currentProfileName,
    inheritedFrom: inheritedFromKey,
    onOpenConfigEditor: onOpenConfigEditor ? stableOpenConfigEditor : undefined,
    actions: actionsProps,
  } : undefined, [onConfigTextChange, controllerFamily, readText, modifierOptions, virtualControllerType, onEnableVirtualController, beginValueCapture, isCapturingValue, captureLabel, libraryProfiles, currentProfileName, inheritedFromKey, onOpenConfigEditor, stableOpenConfigEditor, actionsProps])

  const renderButtonCard = (button: ButtonDefinition, options?: { defaultOpen?: boolean; label?: string; subtitle?: string; emptyLabel?: string; modeshifts?: boolean; xAction?: { label: string; run: () => void } }) => {
    // Chord bindings belong to the input's own modeshift panel rather than
    // its commands. Where they are filtered out here, the card must not offer
    // to make one either -- it would be written, hidden, and lost.
    const chordsLiveInModeshifts = !!onConfigTextChange && (showMappedLayout || /^(LT|RT)\d+$/.test(button.command))
    const rows = (chordsLiveInModeshifts ? chordFreeRowsByButton[button.command] : bindingRowsByButton[button.command]) ?? EMPTY_ROWS
    return (
      <ButtonBindingsCard
        button={button}
        inheritedFrom={inheritedFrom(configIncludes ?? null, INCLUDE_ROOT, button.command)}
        onOpenConfigEditor={onOpenConfigEditor ? stableOpenConfigEditor : undefined}
        subtitle={options?.subtitle}
        emptyLabel={options?.emptyLabel}
        modeshiftPanel={options?.modeshifts ? modeshiftPanelProps : undefined}
        xAction={options?.xAction}
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
        onBindingChange={stableBindingChange}
        onModifierChange={stableModifierChange}
        onAssignSpecialAction={stableAssignSpecial}
        onClearSpecialAction={stableClearSpecial}
        onStickModeShiftChange={onStickModeShiftChange ? stableStickModeShiftChange : undefined}
        trackballDecay={trackballDecay}
        onTrackballDecayChange={stableTrackballDecayChange}
        virtualControllerType={virtualControllerType ?? 'NONE'}
        libraryProfiles={libraryProfiles}
        currentProfileName={currentProfileName}
        controllerFamily={controllerFamily}
        onEnableVirtualController={onEnableVirtualController}
        bindingLabel={bindingLabels?.[button.command.toUpperCase()]}
        bindingIcon={bindingIcons?.[button.command.toUpperCase()]}
        onBindingIconChange={onBindingIconChange && /^(?:[LR]?T|[LR]M)\d+$/.test(button.command) ? stableBindingIconChange : undefined}
        onBindingLabelChange={onBindingLabelChange ? stableBindingLabelChange : undefined}
        chordsLiveInModeshifts={chordsLiveInModeshifts}
        defaultOpen={options?.defaultOpen}
        label={options?.label}
        modeshiftCount={modeshiftCountFor(button.command)}
        bindingClipboard={bindingClipboard}
        onCopyBindings={setBindingClipboard}
      />
    )
  }

  const renderModeshifts =(target: ModeshiftTarget, side?: 'left' | 'right') => onConfigTextChange && (
    <InputModeshifts controllerFamily={controllerFamily} target={target} text={readText} onChange={onConfigTextChange} modifiers={modifierOptions}
      virtualControllerType={virtualControllerType ?? 'NONE'}
      onEnableVirtualController={onEnableVirtualController}
      beginValueCapture={beginValueCapture} isCapturingValue={isCapturingValue} captureLabel={captureLabel}
      inheritedFrom={key => inheritedFrom(configIncludes ?? null, INCLUDE_ROOT, key)} onOpenConfigEditor={onOpenConfigEditor ? stableOpenConfigEditor : undefined}
      libraryProfiles={libraryProfiles} currentProfileName={currentProfileName}
      livePad={side === 'left' ? livePadTouches.left : side === 'right' ? livePadTouches.right : livePadTouch}
      padAspect={livePadAspect}
      actions={actionsProps} />
  )

  const padModeshiftTarget = (side: 'left' | 'right'): ModeshiftTarget => {
    const prefix = side === 'left' ? 'LEFT' : 'RIGHT'
    const buttonPrefix = side === 'left' ? 'LT' : 'RT'
    return {
      id: `${side}-pad`, title: side === 'left' ? 'Left trackpad' : 'Right trackpad',
      buttons: Array.from({ length: 25 }, (_, i) => ({ command: `${buttonPrefix}${i + 1}`, label: `${buttonPrefix}${i + 1}` })),
      // Everything the shifted pad editor can write, so removing or renaming a
      // shift takes all of its lines with it.
      settings: padModeshiftSettings(prefix),
      // The pad's real modes under JoyShockMapper's own names. The options are
      // only a fallback for targets without their own mode UI; a pad renders
      // TouchpadModeCard, which owns this list.
      mode: {
        key: `${prefix}_TOUCHPAD_MODE`,
        defaultValue: 'GRID_AND_STICK',
        options: [
          { value: 'GRID_AND_STICK', label: t('keymap.gridAndStick') },
          { value: 'MOUSE', label: t('keymap.mouse') },
          { value: 'PS_TOUCHPAD', label: t('keymap.psTouchpad') },
        ],
      },
      grid: { sizeKey: `${prefix}_GRID_SIZE`, clickKey: `${prefix}_GRID_REQUIRES_CLICK`, stickKey: `${prefix}_TOUCH_STICK_MODE`, clickButton: side === 'left' ? 'MISC3' : 'MISC2', prefix: buttonPrefix },
      pad: { side, keyPrefix: prefix },
    }
  }

  // One click to point a four-way directional at WASD. Diagonals need nothing of
  // their own: holding two directions sends both keys, which is the eight-way
  // movement a game reads off WASD.
  const renderWasdAction = (setId: DirectionalSetId) => {
    if (!onBindDirectionsToWasd) return null
    return (
      <button
        type="button"
        className="ghost-btn"
        data-capture-ignore="true"
        // A section shortcut, not a row: the pad does not land here on
        // entering the page (the focus model's "first row of the section").
        data-nav-entry-skip=""
        data-hints="A:Bind to WASD;B:Back"
        disabled={isCalibrating}
        title={t('keymap.bindWasdHint')}
        onClick={() => {
          // Read before the write: afterwards the stick is always digital.
          const switchedStickMode = wasdBindingChangesStickMode(readText, setId)
          onBindDirectionsToWasd(setId)
          showToast(switchedStickMode ? t('messages.bindWasdWithStickMode') : t('messages.bindWasdDone'))
        }}
      >
        {t('keymap.bindWasd')}
      </button>
    )
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

  const isTouchpadButtonBound = (command: string) => {
    const key = command.toUpperCase()
    const rows = bindingRowsByButton[key] ?? bindingRowsByButton[command] ?? []
    // A row exists for every editable slot whether or not anything is in it, so
    // counting rows made every touch button look bound -- which is why the touch
    // stick directions showed up on a pad that was not acting as a stick.
    const hasBinding = rows.some(row => Boolean(row.binding) || Boolean(row.expression))
    return hasBinding || Boolean(specialsByButton[key] || specialsByButton[command])
  }

  // What a grid region actually does, for the preview tiles. A diagram that says
  // only "LT1" describes the geometry and nothing else, so reading your own
  // layout means clicking every region in turn. Show the binding and the label
  // the way the rest of the app does: the label is the human name for the
  // action, the binding is what JoyShockMapper was actually told.
  const describeTouchpadRegion = (command: string) => {
    const key = command.toUpperCase()
    const rows = bindingRowsByButton[key] ?? bindingRowsByButton[command] ?? []
    const filled = rows.filter(row => row.binding || row.expression)
    const text = (row: (typeof filled)[number]) => row.binding || row.expression?.raw || ''
    // The plain press is what the tile should name; a hold or double-tap is
    // extra and is counted rather than crammed in beside it.
    const primary = filled.find(row => row.slot === 'tap') ?? filled[0]
    const special = specialsByButton[key] ?? specialsByButton[command]
    return {
      label: bindingLabels?.[key],
      binding: primary ? text(primary) : special ?? '',
      extra: Math.max(0, filled.length - 1),
      icon: bindingIcons?.[key],
    }
  }

  // Touch-stick directions only mean something when a pad is actually acting as a
  // stick. Showing them beside Touch and Click regardless is what made this page
  // read as a wall of settings for a mode you are not in. Anything already bound
  // still shows, so an existing config never hides bindings you cannot then find.
  const showTouchStickButtons =
    gridActive || TOUCH_STICK_BUTTONS.some(button => isTouchpadButtonBound(button.command))
  // TOUCH and CAPTURE are legacy single-pad signals: JoyShockMapper never feeds
  // them for a two-pad controller (see touchCallback's isSteam branch and the
  // JS_TYPE_STEAM_CONTROLLER_2026 button switch in main.cpp -- neither ever
  // calls handleButtonChange for ButtonID::TOUCH or ButtonID::CAPTURE there),
  // so binding either one on a Steam Controller does nothing. Its equivalents
  // are per-pad -- MISC3/MISC2, labelled Left/Right pad click -- so those stand
  // in for them here instead of living only on the Extra buttons page, which is
  // what left this page with no way to bind a trackpad click at all.
  // Only hide once a two-pad controller is actually confirmed connected --
  // unlike showPerPadTouchpads, we deliberately do NOT default this true while
  // disconnected, since that would hide a working control for anyone whose
  // single-pad controller just isn't plugged in yet. Anything already bound
  // still shows, so an existing config never hides a binding you cannot then find.
  const legacyTouchButtons = confirmedTwoPadTouchpads
    ? []
    : TOUCH_BUTTONS.filter(button => controllerSupportsInput(inputDevice, button.command))
  const padClickButtons = confirmedTwoPadTouchpads
    ? PAD_CLICK_BUTTONS.filter(button => controllerSupportsInput(inputDevice, button.command) || isCommandBound(button.command))
    : []
  const touchpadButtonSectionButtons = [
    ...legacyTouchButtons,
    ...(!confirmedTwoPadTouchpads ? padClickButtons : []),
    ...(showTouchStickButtons ? TOUCH_STICK_BUTTONS : []),
  ]

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
        onModeChange: onLeftTouchpadModeChange,
        onGridSizeChange: onLeftGridSizeChange,
        gridShape: leftGridShape ?? gridShape,
        gridDeadzone: leftGridDeadzone ?? gridDeadzone,
        onGridShapeChange: onLeftGridShapeChange,
        onGridDeadzoneChange: onLeftGridDeadzoneChange,
        onSensitivityChange: onLeftTouchpadSensitivityChange,
        onSensitivityYChange: onLeftTouchpadSensitivityYChange,
        onDualStageModeChange: onLeftTouchpadDualStageModeChange,
        gridRequiresClick: leftGridRequiresClick,
        onGridRequiresClickChange: onLeftGridRequiresClickChange,
        onOpenTuning,
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
        onModeChange: onRightTouchpadModeChange,
        onGridSizeChange: onRightGridSizeChange,
        gridShape: rightGridShape ?? gridShape,
        gridDeadzone: rightGridDeadzone ?? gridDeadzone,
        onGridShapeChange: onRightGridShapeChange,
        onGridDeadzoneChange: onRightGridDeadzoneChange,
        onSensitivityChange: onRightTouchpadSensitivityChange,
        onSensitivityYChange: onRightTouchpadSensitivityYChange,
        onDualStageModeChange: onRightTouchpadDualStageModeChange,
        gridRequiresClick: rightGridRequiresClick,
        onGridRequiresClickChange: onRightGridRequiresClickChange,
        onOpenTuning,
      }
    : undefined
  // The controller the live meters read from.
  const liveDevice = devices?.find(device => device.status)
  const padModeFor = (side: 'left' | 'right') =>
    normalizeTouchpadMode((side === 'left' ? leftTouchpadMode : rightTouchpadMode) ?? touchpadModeProp ?? '')

  // Trigger behaviour in the reader's words (Configuration Pages 15a): a
  // setting row with the mode's icon on the select and a one-line account of
  // it underneath; the raw name stays in each option's help.
  const TRIGGER_MODE_LABELS: Record<string, string> = {
    NO_FULL: 'No full pull', NO_SKIP: 'No skip', NO_SKIP_EXCLUSIVE: 'No skip, exclusive',
    MUST_SKIP: 'Must skip', MAY_SKIP: 'May skip', MUST_SKIP_R: 'Must skip, responsive', MAY_SKIP_R: 'May skip, responsive',
  }
  const TRIGGER_MODE_ICONS: Record<string, IconName> = {
    NO_FULL: 'trNoFull', NO_SKIP: 'trNoSkip', NO_SKIP_EXCLUSIVE: 'trNoSkip', MUST_SKIP: 'trMustSkip', MAY_SKIP: 'trMaySkip',
    MUST_SKIP_R: 'trMustSkip', MAY_SKIP_R: 'trMaySkip', X_LT: 'trAnalog', X_RT: 'trAnalog', PS_L2: 'trAnalog', PS_R2: 'trAnalog',
  }
  const TRIGGER_MODE_DESCRIPTIONS: Record<string, string> = {
    NO_FULL: 'Soft pull only; there is no separate full pull.',
    NO_SKIP: 'Soft pull fires first, full pull adds on top.',
    NO_SKIP_EXCLUSIVE: 'Soft pull fires first, then lets go while the full pull is held.',
    MUST_SKIP: 'A quick full pull skips the soft binding; a slow pull fires only the soft one.',
    MAY_SKIP: 'A fast full pull skips the soft binding.',
    MUST_SKIP_R: 'Must skip, and the full pull releases the moment you ease off.',
    MAY_SKIP_R: 'May skip, and the full pull releases the moment you ease off.',
  }
  const flickerGuard = getKeymapValue(readText, 'TRIGGER_HYSTERESIS') ?? '0.02'
  const triggerModeFor = (side: 'left' | 'right') => (side === 'left' ? zlModeValue : zrModeValue) || 'NO_FULL'
  const passthroughToken = (side: 'left' | 'right') => side === 'left' ? 'X_LT' : 'X_RT'
  const isPassthrough = (side: 'left' | 'right') => /^(X_LT|X_RT|PS_L2|PS_R2)$/.test(triggerModeFor(side))
  // With a virtual pad on, a passthrough trigger's rows read what the pad
  // receives instead of Unbound (15a, the Cyberpunk note).
  const passthroughLabel = (side: 'left' | 'right') => {
    if (!isPassthrough(side)) return undefined
    const scheme = virtualControllerType === 'DS4' ? 'DualShock' : 'Xbox'
    const trigger = virtualControllerType === 'DS4' ? (side === 'left' ? 'L2' : 'R2') : (side === 'left' ? 'LT' : 'RT')
    return `Analog passthrough · ${scheme} ${trigger}`
  }
  const anyPassthrough = isPassthrough('left') || isPassthrough('right')
  const renderTriggerMode = (side: 'left' | 'right') => {
    const mode = triggerModeFor(side)
    const passthrough = isPassthrough(side)
    return (
      <div className={`setting-row setting-row--compact ${keymapStyles.triggerBehaviourRow}`} data-capture-ignore="true" data-hints="A:Choose behaviour;B:Back">
        <div className={keymapStyles.triggerBehaviourText}>
          <span className={keymapStyles.triggerBehaviourTitle}>{t('keymap.triggerBehaviour', 'Behaviour')}</span>
          <span className={keymapStyles.triggerBehaviourHint}>
            {passthrough ? t('keymap.triggerVirtualPassthroughHint') : TRIGGER_MODE_DESCRIPTIONS[mode] ?? OPTION_HELP[mode] ?? ''}
          </span>
          {passthrough && virtualControllerType === 'NONE' && (
            <span className={keymapStyles.triggerBehaviourWarning}>{t('stickModes.virtualStickDisabledWarning')}</span>
          )}
        </div>
        <IconSelect
          icon={TRIGGER_MODE_ICONS[mode] ?? 'trNoFull'}
          className={keymapStyles.triggerBehaviourSelect}
          ariaLabel={side === 'left' ? t('keymap.l2FullPullMode') : t('keymap.r2FullPullMode')}
          value={mode}
          disabled={isCalibrating}
          onValueChange={value => (side === 'left' ? onZlModeChange : onZrModeChange)(value)}
          groups={[
            { options: ['NO_FULL', 'NO_SKIP', 'NO_SKIP_EXCLUSIVE', 'MUST_SKIP', 'MAY_SKIP', 'MUST_SKIP_R', 'MAY_SKIP_R'].map(value => ({
              value, label: value === 'NO_FULL' ? `${TRIGGER_MODE_LABELS[value]} (default)` : TRIGGER_MODE_LABELS[value],
            })) },
            { options: [{ value: passthroughToken(side), label: t('keymap.triggerVirtualPassthrough') }] },
          ]}
        />
        <SettingOrigin setting={side === 'left' ? 'ZL_MODE' : 'ZR_MODE'} />
      </div>
    )
  }

  // The tuning disclosure comes last in each trigger's block (15a: behaviour,
  // soft pull, full pull, live bar, then Threshold & release), so the rows and
  // the bar it is read against sit above it. Analog passthrough has no soft
  // point to tune.
  const renderTriggerThreshold = (side: 'left' | 'right') =>
    (side === 'left' ? zlModeValue : zrModeValue) === (side === 'left' ? 'X_LT' : 'X_RT') ? null : (
      <div className={keymapStyles.triggerModeInline} data-capture-ignore="true">
        <AdvancedDisclosure label="Threshold & release" summary={`Soft press ${triggerThreshold > 0 ? triggerThreshold.toFixed(2) : 'default'} · flicker guard ${flickerGuard}`}>
          <NumberField setting="TRIGGER_THRESHOLD" label="Soft press point" value={triggerThreshold} onChange={onTriggerThresholdChange} min={0} max={1} step={0.01} hint="Digital bindings press when trigger travel crosses this point. 0 is fully released and 1 is fully pulled. Raise it slightly if resting your finger activates ADS. Applies to both digital triggers; analog passthrough is unchanged." />
          {onConfigTextChange && <NumberField label="Flicker guard" value={getKeymapValue(readText, 'TRIGGER_HYSTERESIS') ?? 0.02} onChange={v => onConfigTextChange(prev => updateKeymapEntry(prev, 'TRIGGER_HYSTERESIS', [v]))} min={0} max={0.25} step={0.005} hint="Release margin below the soft press point. For example, a 0.10 press point and 0.02 guard release at 0.08. Prevents rapid on/off toggling without adding a timer. 0 disables; analog and hair triggers are unaffected." />}
        </AdvancedDisclosure>
      </div>
    )

  // Trigger calibration (15a). JoyShockMapper's CALIBRATE_TRIGGERS finds
  // where a DualSense's adaptive trigger starts to resist; a controller
  // without adaptive triggers has nothing to calibrate, and says so.
  const [triggerCalibrating, setTriggerCalibrating] = useState(false)
  const adaptiveTriggers = liveDevice?.type === 5
  const runTriggerCalibration = async () => {
    setTriggerCalibrating(true)
    try {
      const result = await desktopBridge.runCalibrationCommand('CALIBRATE_TRIGGERS')
      if (!result.success) showToast('Trigger calibration could not start. Is the mapper running?', 'error')
    } finally { setTriggerCalibrating(false) }
  }
  // The page header's "Calibrate triggers" (App) only announces the intent;
  // this page owns the flow. Without adaptive triggers there is nothing to
  // run, so it shows the Calibration section, which says why.
  const calibrationRequest = useRef({ adaptive: adaptiveTriggers, run: runTriggerCalibration, connected: Boolean(liveDevice) })
  calibrationRequest.current = { adaptive: adaptiveTriggers, run: runTriggerCalibration, connected: Boolean(liveDevice) }
  useEffect(() => {
    const handler = () => {
      const { adaptive, run, connected } = calibrationRequest.current
      if (adaptive) { void run(); return }
      document.getElementById('trigger-calibration')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      showToast(connected ? 'Nothing to calibrate: this controller’s triggers report their full travel. Set the soft pull under Threshold & release.' : 'Connect a controller with adaptive triggers to calibrate them.')
    }
    window.addEventListener('jsm:calibrate-triggers', handler)
    return () => window.removeEventListener('jsm:calibrate-triggers', handler)
  }, [])
  const renderTriggerCalibration = () => (
    <section id="trigger-calibration" className={keymapStyles.triggerCalibration} aria-label="Trigger calibration">
      <span className={keymapStyles.eyebrowHeading}>Calibration</span>
      {/* Resistance is this configuration's, so it sits with the triggers
          rather than on the (now global) timing page it used to share. */}
      {onAdaptiveTriggerChange && (
        <SummaryRow label={t('keymap.adaptiveTriggers')} hint="DualSense trigger resistance" setting="ADAPTIVE_TRIGGER"
          toggle={{ on: (adaptiveTriggerValue || 'ON').toUpperCase() !== 'OFF', onChange: on => onAdaptiveTriggerChange(on ? '' : 'OFF') }} />
      )}
      {adaptiveTriggers ? <>
        <p className={keymapStyles.calibrationNote}>Finds where each adaptive trigger starts to resist, so the soft press lines up with the feel. Press the right trigger softly until you feel resistance, then D-pad down; then the left trigger, then Cross. Home abandons.</p>
        <button type="button" className="button button--secondary" disabled={isCalibrating || triggerCalibrating} onClick={() => { void runTriggerCalibration() }}>{triggerCalibrating ? 'Calibrating…' : 'Calibrate triggers'}</button>
      </> : (
        <p className={keymapStyles.calibrationNote}>{liveDevice
          ? 'Calibration measures where a DualSense’s adaptive trigger starts to resist. This controller’s triggers report their full travel, so there is nothing to calibrate; set where a soft pull fires under Threshold & release.'
          : 'Connect a controller with adaptive triggers (DualSense) to calibrate them. Soft pull and full pull points are set under Threshold & release.'}</p>
      )}
    </section>
  )

  const gripCapable = Boolean(liveDevice) && controllerSupportsInput(liveDevice, 'MISC5')
  const [lightBarOpen, setLightBarOpen] = useState(false)
  const groupFor = <G extends { titleKey: string; descriptionKey?: string; buttons: ButtonDefinition[] }>(key: string, group: G): G => {
    if (key !== 'extra') return group
    const buttons = confirmedTwoPadTouchpads ? group.buttons.filter(button => button.command !== 'MISC2' && button.command !== 'MISC3') : group.buttons
    const grips = buttons.some(button => button.command === 'MISC5' || button.command === 'MISC6')
    return { ...group, buttons, ...(grips && gripCapable ? { titleKey: 'keymap.gripsTitle', descriptionKey: 'keymap.gripsDescription' } : {}) }
  }

  const renderPadSide = (side: 'left' | 'right') => {
    const card = side === 'left' ? leftPadCard : rightPadCard
    if (!card) return null
    const pad = touchpadGridPads.find(candidate => candidate.side === side)
    const padClick = PAD_CLICK_BUTTONS.find(button => button.command === (side === 'left' ? 'MISC3' : 'MISC2'))
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
    const otherBound = side === 'right' && confirmedTwoPadTouchpads ? TOUCH_BUTTONS.filter(button => isTouchpadButtonBound(button.command)) : []
    return (
      <ConfigScope match={side === 'left' ? /^(LEFT_(TOUCH|GRID)|LT\d+)/ : /^(RIGHT_(TOUCH|GRID)|RT\d+)/}><SideBlock
        key={side}
        side={side}
        id={side === 'left' ? TRACKPAD_ANCHORS.left : TRACKPAD_ANCHORS.right}
        title={side === 'left' ? t('keymap.leftTrackpadSection', 'Left trackpad') : t('keymap.rightTrackpadSection', 'Right trackpad')}
        header={false}
      >
        <PadSection
          keyPrefix={side === 'left' ? 'LEFT_' : 'RIGHT_'}
          title={side === 'left' ? t('keymap.leftPad', 'Left pad') : t('keymap.rightPad', 'Right pad')}
          command={side === 'left' ? 'LEFT_PAD' : 'RIGHT_PAD'}
          config={{ ...card, keyPrefix: side.toUpperCase() + '_' }}
          menu={previewMenus[side === 'left' ? 'LEFT' : 'RIGHT']}
          appearance={onConfigTextChange ? { menuKey: side === 'left' ? 'LEFT' : 'RIGHT', onChange: onConfigTextChange } : undefined}
          livePad={side === 'left' ? livePadTouches.left : livePadTouches.right}
          padAspect={livePadAspect}
          regions={gridMode && pad ? pad.buttons : []}
          selected={gridMode && pad ? pad.buttons.find(button => button.command.toUpperCase() === selectedTouchpadGridCommand?.toUpperCase()) ?? pad.buttons[0] ?? null : null}
          onSelect={setSelectedTouchpadGridCommand}
          describeRegion={describeTouchpadRegion}
          renderButton={renderButtonCard}
          mouseFeel={mouseFeelSummary({ cutoff: touchpadMinCutoff, speed: touchpadSpeedCoeff, trackballDecay: touchpadTrackballDecay, hapticIntensity: touchpadHapticIntensity })}
          click={confirmedTwoPadTouchpads && padClick ? {
            value: bindingSummary(describeTouchpadRegion(padClick.command)),
            editor: renderButtonCard(padClick, { modeshifts: true, defaultOpen: true }),
          } : undefined}
          otherControllers={otherBound.length ? {
            id: TRACKPAD_ANCHORS.other,
            count: otherBound.length,
            children: <>
              <p className={keymapStyles.calibrationNote}>{t('keymap.otherControllerTypesNote', 'Shared Touch and Click signals belong to single-pad controllers. They are kept in this configuration but do not fire on the connected Steam Controller.')}</p>
              {otherBound.map(button => <div key={button.command}>{renderButtonCard(button, { modeshifts: true })}</div>)}
            </>,
          } : undefined}
        >
          {gridMode && isVisible('touch-stick') && (
            <TouchpadStickSection
              title={side === 'left' ? t('keymap.touchStickTitleLeft', 'Left touch stick') : t('keymap.touchStickTitleRight', 'Right touch stick')}
              {...stickProps}
              {...actionsProps}
            />
          )}
        </PadSection>
        {/* The pad's modeshifts sit under the whole pad, full width: each is
            this same pad section in another mode, and squeezed into the
            settings column it had a quarter of the room. */}
        {renderModeshifts(padModeshiftTarget(side), side)}
      </SideBlock></ConfigScope>
    )
  }

  // Returns the mode's settings split in two: what belongs in the card body,
  // and what the card should tuck inside its own single Advanced disclosure.
  const stickModeExtras = (side: 'LEFT' | 'RIGHT'): { primary: JSX.Element | null; advanced: JSX.Element | null } => {
    const mode = side === 'LEFT' ? stickModeSettings?.left.mode ?? '' : stickModeSettings?.right.mode ?? ''
    if ((mode === 'AIM' || (side === 'LEFT' && mode === 'HYBRID_AIM')) && stickAimSettings && stickAimHandlers) {
      return {
        primary: <StickAimSettings values={stickAimSettings} handlers={stickAimHandlers} disabled={isCalibrating} part="primary" />,
        advanced: <StickAimSettings values={stickAimSettings} handlers={stickAimHandlers} disabled={isCalibrating} part="advanced" />,
      }
    }
    if ((mode === 'FLICK' || mode === 'FLICK_ONLY' || mode === 'ROTATE_ONLY') && stickFlickSettings && stickFlickHandlers) {
      return {
        primary: <StickFlickSettings values={stickFlickSettings} handlers={stickFlickHandlers} disabled={isCalibrating} part="primary" />,
        advanced: <StickFlickSettings values={stickFlickSettings} handlers={stickFlickHandlers} disabled={isCalibrating} part="advanced" />,
      }
    }
    // A radial menu's wheel, segments and select-past deadzone are the
    // stick's own rows (StickSection, 15b), not mode extras.
    if (mode === 'MOUSE_AREA' && mouseRingRadius !== undefined && onMouseRingRadiusChange) {
      return withoutAdvanced(
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.mouseAreaRadiusNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField setting="MOUSE_RING_RADIUS"
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
      return withoutAdvanced(
        <div className={stickStyles.stickFlickSettings} data-capture-ignore="true">
          <small>{t('keymap.scrollBindingsNote')}</small>
          <small>{t('keymap.scrollSensitivityNote')}</small>
          <div className={stickStyles.stickAimGrid}>
            <NumberField setting="SCROLL_SENS"
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
      return withoutAdvanced(
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
    return { primary: null, advanced: null }
  }

  const renderSections = (sections: { key: string; shouldRender: boolean; node: JSX.Element }[]) =>
    sections.filter(section => section.shouldRender).map(section => <ConfigScope key={section.key} match={sectionScope(section.key)}><div id={section.key} className="tuning-anchor">{section.node}</div></ConfigScope>)

  return (
    <Card
      className="control-panel"
      lockable
      locked={isCalibrating}
      lockMessage={lockMessage ?? t('messages.lockMessage')}
    >
      {/* A filled Paste button on every input was the only sign the clipboard
          held anything, and the only way to act on it -- so it shouted from
          every row and could never be put away. One bar says what is held and
          clears it; the per-input buttons are quiet now. */}
      {bindingClipboard.length > 0 && (
        <div className={keymapStyles.clipboardBar} data-capture-ignore="true" role="status">
          <span>{t('keymap.bindingsClipboardActive', { count: bindingClipboard.length })}</span>
          <button type="button" className="ghost-btn" onClick={() => setBindingClipboard([])}>
            {t('keymap.bindingsClipboardClear')}
          </button>
        </div>
      )}
      {!showMappedLayout && !visibleSections?.includes('grip-sensors') && (
        <div className={keymapStyles.keymapCardHeader}>
          <div className={keymapStyles.keymapTitleRow}>
            <h2>
              {/* The touchpad view backs three pages -- the pads' bindings, the
                  mouse tuning and the grip sensors -- and each needs its own
                  name rather than inheriting the bindings page's. */}
              {/* Keyed off what the page asked for, not off isVisible: with an
                  unsupported controller plugged in the section is hidden but the
                  page still has to say which page it is. */}
              {view === 'touchpad'
                ? (visibleSections?.includes('touch-sensors')
                    ? t('keymap.sensorControlsTitle', 'Trackpad tuning')
                    : visibleSections?.includes('grip-sensors')
                      ? t('keymap.gripControlsTitle', 'Grip sensors')
                      : t('keymap.touchpadControlsTitle'))
                : t('keymap.controlsTitle')}
            </h2>
          </div>
        </div>
      )}

      {virtualControllerWarnings?.length ? <details><summary className="binding-summary">Output Needs Attention</summary>
        {virtualControllerWarnings.map((warning, index) => <p key={index}>{renderVirtualControllerWarning(warning)}</p>)}
      </details> : null}
      {showMappedLayout && (
        <>
          {(
            <section className={keymapStyles.mappingListShell}>
              {/* Jumping between these groups is now the sidebar's job (see
                  App.tsx's per-tab sub-navigation) -- these anchors just need a
                  stable id for it to scroll to, not a second nav surface here. */}
              {/* Joysticks: one stick per row, like the trackpads. Side by side,
                  each stick was two columns inside half the page -- four
                  dense columns across it. */}
              <div className={keymapStyles.mappingListContent}>
                {listMappingGroups.map(([groupKey, fullGroup]) => { const group = groupFor(groupKey, fullGroup); return (
                  <ConfigScope key={groupKey} match={sectionScope(groupKey)}><div
                    key={groupKey}
                    id={`mapping-section-${groupKey}`}
                    className={keymapStyles.mappingListSectionAnchor}
                  >
                    <KeymapSection
                      className={groupKey === 'dpad' ? keymapStyles.groupEyebrow : groupKey === 'triggers' || groupKey === 'leftStick' || groupKey === 'rightStick' ? keymapStyles.groupNoHeader : undefined}
                      title={groupKey === 'dpad' ? t('keymap.directionsHeading', 'Directions') : t(group.titleKey)}
                      description={group.descriptionKey && groupKey !== 'dpad' ? t(group.descriptionKey) : undefined}
                      icon={group.icon}
                      count={group.buttons.length}
                      action={DIRECTIONAL_GROUP_SETS[groupKey] && groupKey !== 'leftStick' && groupKey !== 'rightStick' ? renderWasdAction(DIRECTIONAL_GROUP_SETS[groupKey]) : undefined}
                    >
                      {(groupKey === 'leftStick' || groupKey === 'rightStick') && stickModeSettings && onStickModeChange && onRingModeChange && onStickDeadzoneChange && (() => {
                        const side = groupKey === 'leftStick' ? 'left' : 'right'
                        const SIDE = side === 'left' ? 'LEFT' : 'RIGHT'
                        const modes = side === 'left' ? leftStickModes : rightStickModes
                        const zones = side === 'left' ? leftDeadzoneValues : rightDeadzoneValues
                        const stick = liveDevice?.status ? (side === 'left' ? liveDevice.status.leftStick : liveDevice.status.rightStick) : null
                        const find = (command: string) => group.buttons.find(button => button.command.toUpperCase() === command)
                        // WASD reading order: up, left, down, right.
                        const directionButtons = ['UP', 'LEFT', 'DOWN', 'RIGHT'].map(direction => find(`${SIDE[0]}${direction}`)).filter((button): button is ButtonDefinition => Boolean(button))
                        const directionBindings = directionButtons.map(button => { const info = describeTouchpadRegion(button.command); return info.binding ? describeBinding(info.binding, t) : '' })
                        // "W · A · S · D"; a gap for a missing direction, and plain "Unbound"
                        // rather than four dashes when the stick sends nothing yet.
                        const directionSummary = directionBindings.some(Boolean) ? directionBindings.map(binding => binding || '—').join(' · ') : t('keymap.unbound', 'Unbound')
                        const extras = stickModeExtras(SIDE)
                        const prefix = side === 'left' ? 'LM' : 'RM'
                        const writeStick = (key: string, value: string) =>
                          onConfigTextChange?.(previous => value === '' ? removeKeymapEntry(previous, key) : updateKeymapEntry(previous, key, [value]))
                        const radial = modes.mode === 'RADIAL_MENU' ? {
                          menu: previewMenus[side === 'left' ? 'LSTICK' : 'RSTICK'],
                          segments: getKeymapValue(readText, `${SIDE}_STICK_MENU_SIZE`) ?? '',
                          deadzone: getKeymapValue(readText, `${SIDE}_STICK_MENU_DEADZONE`) ?? '',
                          buttons: stickMenuButtons.filter(button => button.command.startsWith(prefix)),
                          selected: selectedStickMenuCommand,
                          onSelect: setSelectedStickMenuCommand,
                          onSegmentsChange: (value: string) => writeStick(`${SIDE}_STICK_MENU_SIZE`, value),
                          onDeadzoneChange: (value: string) => writeStick(`${SIDE}_STICK_MENU_DEADZONE`, value),
                          describe: (command: string) => { const info = describeTouchpadRegion(command); return { label: info.label, binding: info.binding ? describeBinding(info.binding, t) : '', icon: info.icon } },
                          appearance: onConfigTextChange ? { menuKey: side === 'left' ? 'LSTICK' : 'RSTICK', onChange: onConfigTextChange } : undefined,
                        } : undefined
                        return (
                          <StickSection
                            side={side}
                            keyPrefix={side === 'left' ? 'LEFT_' : 'RIGHT_'}
                            title={side === 'left' ? t('keymap.leftStickTitle') : t('keymap.rightStickTitle')}
                            action={DIRECTIONAL_GROUP_SETS[groupKey] ? renderWasdAction(DIRECTIONAL_GROUP_SETS[groupKey]) : undefined}
                            live={stick}
                            mode={modes.mode}
                            ring={modes.ring}
                            inner={zones.inner}
                            outer={zones.outer}
                            defaultInner={deadzoneDefaults.inner}
                            defaultOuter={deadzoneDefaults.outer}
                            onModeChange={value => onStickModeChange(SIDE, value)}
                            onRingChange={value => onRingModeChange(SIDE, value)}
                            onInnerChange={value => onStickDeadzoneChange(SIDE, 'INNER', value)}
                            onOuterChange={value => onStickDeadzoneChange(SIDE, 'OUTER', value)}
                            disabled={isCalibrating}
                            directionButtons={directionButtons}
                            directionSummary={directionSummary}
                            clickButton={find(side === 'left' ? 'L3' : 'R3')}
                            ringButton={find(`${SIDE[0]}RING`)}
                            touchButton={find(`${SIDE[0]}TOUCH`)}
                            renderButton={renderButtonCard}
                            extras={extras.primary}
                            extrasAdvanced={extras.advanced}
                            radial={radial}
                            modeshifts={renderModeshifts({
                              id: groupKey, title: t(group.titleKey),
                              buttons: group.buttons.map(button => ({ command: button.command, label: getButtonDescription(button, t), definition: button })),
                              mode: {
                                key: `${SIDE}_STICK_MODE`, defaultValue: 'NO_MOUSE',
                                options: ['NO_MOUSE', 'AIM', 'FLICK', 'FLICK_ONLY', 'ROTATE_ONLY', 'MOUSE_AREA', 'SCROLL_WHEEL', 'LEFT_STICK', 'RIGHT_STICK'].map(value => ({ value, label: value === 'NO_MOUSE' ? 'Directional buttons' : value.replace(/_/g, ' ').toLowerCase() })),
                              },
                            })}
                          />
                        )
                      })()}
                      {groupKey !== 'leftStick' && groupKey !== 'rightStick' && (() => {
                        const split = splitButtonsBySide(group.buttons)
                        const sided = SIDE_SPLIT_GROUPS.has(groupKey) && split.left.length > 0 && split.right.length > 0
                        if (!sided) {
                          return (
                            <div className={keymapStyles.keymapGrid}>
                              {group.buttons.map(button => (
                                <div key={button.command}>{renderButtonCard(button, { modeshifts: true })}</div>
                              ))}
                            </div>
                          )
                        }
                        return (
                          <>
                            <SideSplit>
                            {(['left', 'right'] as const).map(side => (
                              <SideBlock key={side} side={side} id={groupKey === 'triggers' ? `trigger-${side}` : undefined} title={groupKey === 'triggers' ? (side === 'left' ? t('keymap.leftTriggerTitle', 'Left trigger') : t('keymap.rightTriggerTitle', 'Right trigger')) : undefined}>
                                {groupKey === 'triggers' && renderTriggerMode(side)}
                                <div className={keymapStyles.keymapGrid}>
                                  {(side === 'left' ? split.left : split.right).map(button => (
                                    <div key={button.command}>{renderButtonCard(button, groupKey === 'triggers' ? { label: TRIGGER_ROW_LABELS[button.command], emptyLabel: passthroughLabel(side), modeshifts: true } : { modeshifts: true })}</div>
                                  ))}
                                </div>
                                {groupKey === 'triggers' && liveDevice?.status && (
                                  <TriggerMeter pull={side === 'left' ? liveDevice.status.triggers.left : liveDevice.status.triggers.right} threshold={triggerThreshold ?? 0} />
                                )}
                                {groupKey === 'triggers' && renderTriggerThreshold(side)}
                              </SideBlock>
                            ))}
                            </SideSplit>
                            {groupKey === 'triggers' && anyPassthrough && (
                              <div className={keymapStyles.triggerNote} role="note">
                                <Icon name="trAnalog" size={20} />
                                <span><b>{currentProfileName ?? t('app.profileSummary.unsavedProfile', 'This configuration')}</b> sends {isPassthrough('left') && isPassthrough('right') ? 'both triggers' : isPassthrough('left') ? 'the left trigger' : 'the right trigger'} as analog {virtualControllerType === 'DS4' ? 'DualShock L2/R2' : 'Xbox LT/RT'}; its rows read <b>{passthroughLabel(isPassthrough('left') ? 'left' : 'right')}</b> instead of Unbound.</span>
                              </div>
                            )}
                            {groupKey === 'triggers' && renderTriggerCalibration()}
                            {split.rest.length > 0 && (
                              <div className={keymapStyles.keymapGrid}>
                                {split.rest.map(button => (
                                  <div key={button.command}>{renderButtonCard(button, { modeshifts: true })}</div>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      })()}
                      {/* A button's modeshifts live in its own editor now (7a). A
                          stick is one input with a mode, so its shift stays
                          group-level, where the shifted mode can be chosen. */}
                      {groupKey === 'extra' && group.buttons.some(button => button.command === 'MISC5' || button.command === 'MISC6') && (
                        <SummaryRow label={t('keymap.gripSensors', 'Grip sensors')} icon={<Icon name="grips" size={20} />}
                          hint={gripSensorsSummary(gripSensorRange, getKeymapValue(readText, 'LEFT_GRIP_RELEASE_DELAY') ?? '', getKeymapValue(readText, 'RIGHT_GRIP_RELEASE_DELAY') ?? '')}
                          onActivate={() => window.dispatchEvent(new CustomEvent('jsm:open-sheet', { detail: 'gripSensors' }))} />
                      )}
                    </KeymapSection>
                  </div></ConfigScope>
                )})}
              </div>
            </section>
          )}
        </>
      )}

      {view === 'touchpad' && (
        // Trackpad tuning reads in two columns (16b): motion, press and glide on
        // the left; the acceleration curve and haptics on the right.
        <div className={keymapStyles.sectionStack}>
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
                  {/* The two pads side by side, a column each (2b). */}
                  <SideSplit>
                    {renderPadSide('left')}
                    {renderPadSide('right')}
                  </SideSplit>
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
                    touchpadGridRequiresClick={touchpadGridRequiresClick}
                    gridColumns={gridColumns}
                    gridRows={gridRows}

                    onTouchpadModeChange={onTouchpadModeChange}
                    onTouchpadDualStageModeChange={onTouchpadDualStageModeChange}
                    onTouchpadGridRequiresClickChange={onTouchpadGridRequiresClickChange}
                    onGridSizeChange={onGridSizeChange}
                    gridShape={gridShape}
                    gridDeadzone={gridDeadzone}
                    onGridShapeChange={onGridShapeChange}
                    onGridDeadzoneChange={onGridDeadzoneChange}
                    touchpadSensitivity={touchpadSensitivity}
                    touchpadSensitivityY={touchpadSensitivityY}
                    onTouchpadSensitivityYChange={onTouchpadSensitivityYChange}
                    onTouchpadSensitivityChange={onTouchpadSensitivityChange}
                    onOpenTuning={onOpenTuning}
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
                        describeRegion={describeTouchpadRegion}
                        shape={pad.shape}
                        deadzone={pad.side === 'left' ? (leftGridDeadzone ?? gridDeadzone) : pad.side === 'right' ? (rightGridDeadzone ?? gridDeadzone) : gridDeadzone}
                        padAspect={livePadAspect}
                        {...actionsProps}
                      />
                    )
                  })}
                </>
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
              key: 'light-bar',
              shouldRender: Boolean(onLightBarChange) && isVisible('touch-bind'),
              node: (
                <>
                  <SummaryRow label={t('keymap.lightBarColor')} hint="The LED colour on controllers that have one" setting="LIGHT_BAR"
                    value={lightBarColor ? <span className="light-bar-value"><span style={{ background: lightBarColor }} aria-hidden="true" />{lightBarColor.toLowerCase()}</span> : 'Controller default'}
                    onActivate={() => setLightBarOpen(true)} />
                  <Sheet open={lightBarOpen} onClose={() => setLightBarOpen(false)} eyebrow={`Trackpads · ${currentProfileName ?? 'Configuration'}`} title={t('keymap.lightBarColor')}
                    description="The colour the controller's LED shows while this configuration is applied." hints={[{ button: 'A', label: 'Select' }, { button: 'B', label: 'Close' }]}>
                    <div className="sheet-embed"><LightBarPicker value={lightBarColor ?? null} onChange={value => onLightBarChange?.(value)} /></div>
                  </Sheet>
                </>
              ),
            },
            {
              key: 'touch-bind',
              shouldRender: isVisible('touch-bind') && touchpadButtonSectionButtons.length > 0,
              node: (
                <div id={TRACKPAD_ANCHORS.buttons}>
                <ButtonGridSection
                  title={confirmedTwoPadTouchpads ? 'Shared Touch-Stick Directions' : t('keymap.touchButtonsTitle')}
                  description={
                    confirmedTwoPadTouchpads
                      ? 'These legacy touch-stick directions are shared by both pads in JoyShockMapper. A direction binding here can be activated by either pad when configured as a touch stick.'
                      : hasConnectedController
                        ? t('keymap.touchButtonsDescriptionShared')
                        : t('keymap.touchButtonsDescription')
                  }
                  buttons={touchpadButtonSectionButtons}
                  renderButton={renderButtonCard}
                  action={showTouchStickButtons ? renderWasdAction('touchStick') : undefined}
                  {...actionsProps}
                />
                </div>
              ),
            },
          ])}
        </div>
      )}

      <MappingRulesHelpModal isOpen={mappingHelpOpen} onClose={() => setMappingHelpOpen(false)} />
    </Card>
  )
}
