import { detachStickMenu, stickMenuLinks, isDirectStickMenu } from '../utils/stickMenus'
import { readVirtualMenus, writeVirtualMenus } from '../utils/virtualMenus'
import { ProfileTiming } from './ProfileTiming'
import { resolveOverlayMenus } from '../utils/overlayLayout'
import { InputModeshifts } from './keymap/InputModeshifts'
import { modeshiftsOn, padModeshiftSettings, stickModeshiftSettings, type ModeshiftSummary, type ModeshiftTarget } from '../utils/modeshift'
import { getButtonDescription } from '../keymap/schema'
import { ConfigScope } from './ConfigScope'
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES, stickModeDirectionUse } from '../constants/sticks'
import {
  wasdBindingChangesStickMode,
  type DirectionalSetId,
  type VirtualControllerScheme,
} from '../utils/quickBind'
import { showToast } from '../utils/toast'
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
  MOTION_BUTTONS,
  PADDLE_BUTTONS,
  PAD_CLICK_BUTTONS,
  RIGHT_STICK_BUTTONS,
  TOUCH_STICK_BUTTONS,
  TOUCH_BUTTONS,
  TRIGGER_BUTTONS,
  buildTouchpadGridButton,
  getSpecialOptionList,
  type ButtonDefinition,
} from '../keymap/schema'
import { useBindingCapture } from '../keymap/useBindingCapture'
import { setBindingClipboard, useBindingClipboard } from '../utils/bindingClipboard'
import { useButtonRowState } from '../keymap/useButtonRowState'
import { ButtonBindingsCard } from './keymap/ButtonBindingsCard'
import { publishSectionCounts } from './keymap/binding/sectionCounts'
import { LayerUsageContext } from './LayerBar'
import { BindingList } from './keymap/BindingList'
import { Card } from './Card'
import keymapStyles from './Keymap.module.css'
import { KeymapSection } from './KeymapSection'
import { MappingRulesHelpModal } from './keymap/MappingRulesHelpModal'
import { gripSensorsSummary } from '../utils/gripCalibration'
import { SummaryRow } from './ui/SummaryRow'
import { usePreferences } from '../platform/preferenceStore'

import { type TouchpadModeCardConfig } from './keymap/TouchpadSettingsSection'

// Inside Left trigger / Right trigger the rows are the two stages (15c).
import { TriggersPage } from './triggers/TriggersPage'
import { SticksPage } from './sticks/SticksPage'
import { TrackpadsPage } from './trackpads/TrackpadsPage'
import { describeBinding } from '../utils/bindingDescription'
import type { TouchpadAccelParamKey, TouchpadAccelValues } from '../hooks/useTouchpadConfig'
import type { AccelCurveLink, AccelCurveShape } from '../utils/accelCurve'
import { controllerHasTwoTrackpads, controllerSupportsInput, controllerVisualFamily } from '../utils/controllerStatus'
import { padAspectFromDevices } from '../utils/padGeometry'
import { useMouseAreaConfig } from '../hooks/useMouseAreaConfig'
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
import type { VirtualControllerType, VirtualControllerWarning } from '../utils/virtualController'
import { describeVirtualControllerToken, findVirtualControllerOutputs, fixVirtualControllerOutputs, getVirtualControllerLogicalOutput, toVirtualControllerToken } from '../utils/virtualController'
import { inputDisplayName } from '../keymap/inputNames'
import { normalizeTouchpadMode, type TouchpadWarning } from '../utils/touchpadConfig'
import { Icon } from './icons/Icon'


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
    motion: /^(MUP|MDOWN|MLEFT|MRIGHT|MRING|LEAN_|TILT_|MOTION_|CONTROLLER_ORIENTATION)/,
    global: /^(HOLD_PRESS|DOUBLE_PRESS|SIM_PRESS|TRIGGER_|ADAPTIVE_TRIGGER|LIGHT_BAR|LED_BRIGHTNESS)/,
  }
  return patterns[section] ?? /^(TOUCH|LEFT_TOUCH|RIGHT_TOUCH|GRID|LEFT_GRID|RIGHT_GRID|LT\d|RT\d|T\d)/
}

const ledBrightnessValue = (raw?: string): number | null => {
  if (!raw || !/^\d{1,3}$/.test(raw.trim())) return null
  const value = Number(raw)
  return value <= 100 ? value : null
}

export type KeymapControlsProps = {
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
  motion: { titleKey: 'keymap.tiltGesturesTitle', descriptionKey: 'keymap.tiltGesturesDescription', buttons: MOTION_BUTTONS, icon: <JoystickIcon /> },
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
  triggerThreshold,
  onTriggerThresholdChange,
  view = 'full',
  lockMessage,
  visibleSections,
  touchpadMode: touchpadModeProp = '',
  gripSensorRange,
  touchpadDualStageMode = '',
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
  onLeftGridShapeChange,
  onRightGridShapeChange,
  onLeftGridDeadzoneChange,
  onRightGridDeadzoneChange,
  leftTouchpadSensitivity,
  leftTouchpadSensitivityY,
  rightTouchpadSensitivityY,
  touchpadSensitivityY,
  onLeftTouchpadSensitivityYChange,
  onRightTouchpadSensitivityYChange,
  rightTouchpadSensitivity,
  onLeftTouchpadSensitivityChange,
  onRightTouchpadSensitivityChange,
  gridColumns = 2,
  gridRows = 2,
  touchpadSensitivity,
  onOpenTuning,
    bindingLabels,
    bindingIcons,
    onBindingIconChange,
    onBindingLabelChange,
  touchpadWarnings,
  stickModeSettings,
  onStickModeChange,
  stickModeShiftAssignments,
  onStickModeShiftChange,
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
  touchpadAccelValues,
  accelCurveLink,
}: KeymapControlsProps) {
  // Identical to configText for a profile that imports nothing, so the common
  // case is untouched.
  const readText = effectiveConfigText ?? configText
  const { runtime: appDefaults } = usePreferences()
  const profileBrightness = ledBrightnessValue(getKeymapValue(readText, 'LED_BRIGHTNESS'))
  const appLedColor = appDefaults?.ledColor ?? '#ffffff'
  const appLedBrightness = appDefaults?.ledBrightness ?? 100
  const { t } = useTranslation()
  const [mappingHelpOpen, setMappingHelpOpen] = useState(false)
  // Bindings copied from one button, waiting to be pasted onto another. It
  // survives pasting, so one binding can go to several inputs; Escape and the
  // clipboard bar's Clear are how you put it down.
  // One clipboard for every page (utils/bindingClipboard): Layout's quick menu
  // copies and pastes through it too.
  const { presets: bindingClipboard } = useBindingClipboard()
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
  const deviceTypes = devices?.[0]?.type?.toString() ?? ''

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
      ...MOTION_BUTTONS,
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
  const isCommandBound = useCallback(
    (command: string) => {
      const rows = bindingRowsByButton[command.toUpperCase()] ?? bindingRowsByButton[command] ?? []
      return rows.some(row => Boolean(row.binding) || Boolean(row.expression))
    },
    [bindingRowsByButton]
  )

  // The list layout walks the same set, so the jump bar and the page agree.
  const listMappingGroups = useMemo(() => {
    // In the order the page names them (console v2, ButtonList: Face, Bumpers,
    // Menu buttons, D-pad, Back buttons, Grips, Tilt gestures).
    const entries = focusedMappingGroups.length === 0
      ? Object.entries(MAPPING_BUTTON_GROUPS)
      : focusedMappingGroups.map(key => [key, MAPPING_BUTTON_GROUPS[key]] as const)
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
  // The Buttons rail's counts ("Menu buttons · 1 of 4"), read by the shell: an
  // input counts as set when it sends something, switches a mode or turns gyro
  // on or off.
  const { actions: buttonLayerActions } = useContext(LayerUsageContext)
  useEffect(() => {
    if (!focusedMappingGroups.includes('face')) return
    const set = (command: string) => isCommandBound(command) || Boolean(specialsByButton[command.toUpperCase()]) || buttonLayerActions.some(action => action.input.replace(/^!/, '') === command)
    publishSectionCounts(Object.fromEntries(listMappingGroups.map(([key, group]) => [key, { bound: group.buttons.filter(button => set(button.command)).length, total: group.buttons.length }])))
  }, [focusedMappingGroups, listMappingGroups, isCommandBound, specialsByButton, buttonLayerActions])

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
    () => deviceTypes !== '' && controllerHasTwoTrackpads(Number(deviceTypes)),
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
  // TOUCHPAD_AREA / _FIT for each pad, and the on-screen picker that draws
  // them. Read and written here rather than threaded down from App: nothing
  // above this component needs them.
  const mouseAreas = useMouseAreaConfig({ readText: readText ?? '', setConfigText: onConfigTextChange })

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
  // Console v2 (P4): Sticks, Triggers and Trackpads are their own pages, one
  // input at a time (components/sticks|triggers|trackpads).
  const p4Page = visibleSections?.join(',') === 'triggers' ? 'triggers' as const
    : visibleSections?.join(',') === 'leftStick,rightStick' ? 'sticks' as const
    : view === 'touchpad' && visibleSections?.includes('touch-grid') ? 'trackpads' as const : null
  const showMappedLayout = showFullLayout && !showGlobalOnlyLayout && !p4Page

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
  // Which shifts touch an input is a scan of the whole config; cached per
  // config text so the cards do not each rescan it per frame, and so each
  // card gets the same array back and its memo holds.
  const modeshiftsFor = useMemo(() => {
    const found = new Map<string, ModeshiftSummary[]>()
    return (command: string) => {
      let shifts = found.get(command)
      if (shifts === undefined) { shifts = modeshiftsOn(readText, command); found.set(command, shifts) }
      return shifts
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
        heldLedColor={(() => { const value = getKeymapValue(readText, `${button.command},LIGHT_BAR`); return /^x[0-9a-f]{6}$/i.test(value ?? '') ? `#${value!.slice(1)}` : null })()}
        heldLedBrightness={ledBrightnessValue(getKeymapValue(readText, `${button.command},LED_BRIGHTNESS`))}
        baseLedBrightness={profileBrightness ?? appLedBrightness}
        defaultLedColor={lightBarColor ?? appLedColor}
        onHeldLedColorChange={onConfigTextChange ? value => onConfigTextChange(previous => value ? updateKeymapEntry(previous, `${button.command},LIGHT_BAR`, [`x${value.slice(1)}`]) : removeKeymapEntry(previous, `${button.command},LIGHT_BAR`)) : undefined}
        onHeldLedBrightnessChange={onConfigTextChange ? value => onConfigTextChange(previous => value === null ? removeKeymapEntry(previous, `${button.command},LED_BRIGHTNESS`) : updateKeymapEntry(previous, `${button.command},LED_BRIGHTNESS`, [value])) : undefined}
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
        commandLabels={bindingLabels}
        bindingLabel={bindingLabels?.[button.command.toUpperCase()]}
        bindingIcon={bindingIcons?.[button.command.toUpperCase()]}
        onBindingIconChange={onBindingIconChange && /^(?:[LR]?T|[LR]M)\d+$/.test(button.command) ? stableBindingIconChange : undefined}
        onBindingLabelChange={onBindingLabelChange ? stableBindingLabelChange : undefined}
        chordsLiveInModeshifts={chordsLiveInModeshifts}
        defaultOpen={options?.defaultOpen}
        label={options?.label}
        modeshifts={modeshiftsFor(button.command)}
        bindingClipboard={bindingClipboard}
        onCopyBindings={presets => setBindingClipboard(presets, button.command)}
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
    gridActive || TOUCH_STICK_BUTTONS.some(button => isTouchpadButtonBound(button.command))
  // On Steam Controller, MISC4 is left-pad contact and TOUCH is right-pad
  // contact. CAPTURE remains the single-pad controller's click signal.

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
        mouseArea: mouseAreas.LEFT.area,
        mouseAreaFit: mouseAreas.LEFT.fit,
        onMouseAreaFitChange: mouseAreas.LEFT.setFit,
        onPickMouseArea: () => mouseAreas.LEFT.pick(livePadAspect),
        padAspect: livePadAspect,
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
        mouseArea: mouseAreas.RIGHT.area,
        mouseAreaFit: mouseAreas.RIGHT.fit,
        onMouseAreaFitChange: mouseAreas.RIGHT.setFit,
        onPickMouseArea: () => mouseAreas.RIGHT.pick(livePadAspect),
        padAspect: livePadAspect,
      }
    : undefined
  // The controller the live meters read from.
  const liveDevice = devices?.find(device => device.status)

  const gripCapable = Boolean(liveDevice) && controllerSupportsInput(liveDevice, 'MISC5')
  const groupFor = <G extends { titleKey: string; descriptionKey?: string; buttons: ButtonDefinition[] }>(key: string, group: G): G => {
    // Face buttons read A, B, X, Y (UX review 2026-10-09), not the schema's N, E, S, W.
    if (key === 'face') return { ...group, buttons: ['S', 'E', 'W', 'N'].flatMap(command => group.buttons.filter(button => button.command === command)) }
    if (key !== 'extra') return group
    // A two-pad controller edits each pad's click and touch on the Trackpads tab, not under Grips.
    const buttons = confirmedTwoPadTouchpads ? group.buttons.filter(button => button.command !== 'MISC2' && button.command !== 'MISC3' && button.command !== 'MISC4') : group.buttons
    const grips = buttons.some(button => button.command === 'MISC5' || button.command === 'MISC6')
    return { ...group, buttons, ...(grips && gripCapable ? { titleKey: 'keymap.gripsTitle', descriptionKey: 'keymap.gripsDescription' } : {}) }
  }


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
      {!showMappedLayout && !p4Page && !visibleSections?.includes('grip-sensors') && (
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

      {virtualControllerWarnings?.length ? <details open className={keymapStyles.outputAttention}><summary className="binding-summary">Output Needs Attention</summary>
        {virtualControllerWarnings.map((warning, index) => <p key={index}>{renderVirtualControllerWarning(warning)}</p>)}
        <ul className={keymapStyles.outputAttentionList}>
          {findVirtualControllerOutputs(readText).filter(output => virtualControllerType === 'NONE' || output.type !== virtualControllerType).map(output => {
            const logical = getVirtualControllerLogicalOutput(output.token)
            const replacement = logical ? toVirtualControllerToken(logical, virtualControllerType) : null
            return <li key={`${output.command}:${output.token}`}>
              <strong>{output.command.startsWith('Menu: ') ? output.command : inputDisplayName(output.command, controllerFamily)}</strong>
              {' → '}{output.type === 'DS4' ? 'PS4' : 'Xbox 360'} {describeVirtualControllerToken(output.token)} <code>({output.token})</code>
              {virtualControllerType !== 'NONE' && <span className={keymapStyles.outputAttentionResolution}>
                {replacement ? `Converts to ${describeVirtualControllerToken(replacement)}` : 'No equivalent output — choose another binding manually.'}
              </span>}
            </li>
          })}
        </ul>
        {onConfigTextChange && virtualControllerType !== 'NONE' && findVirtualControllerOutputs(readText).some(output => {
          const logical = getVirtualControllerLogicalOutput(output.token)
          return output.type !== virtualControllerType && logical && toVirtualControllerToken(logical, virtualControllerType)
        }) && <button type="button" className="button button--secondary" onClick={() => onConfigTextChange(previous => fixVirtualControllerOutputs(previous, readText, virtualControllerType))}>
          Convert outputs to {virtualControllerType === 'DS4' ? 'PlayStation 4' : 'Xbox 360'}
        </button>}
        {virtualControllerType === 'NONE' && onVirtualControllerTypeChange && <div className={keymapStyles.outputAttentionActions}>
          <button type="button" className="button button--secondary" onClick={() => onVirtualControllerTypeChange('XBOX')}>Enable Xbox 360 output</button>
          <button type="button" className="button button--secondary" onClick={() => onVirtualControllerTypeChange('DS4')}>Enable PlayStation 4 output</button>
        </div>}
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
                      className={['face', 'bumpers', 'center', 'dpad', 'paddles', 'extra', 'motion'].includes(groupKey) ? keymapStyles.groupEyebrow : groupKey === 'triggers' || groupKey === 'leftStick' || groupKey === 'rightStick' ? keymapStyles.groupNoHeader : undefined}
                      title={t(group.titleKey)}
                      description={group.descriptionKey && groupKey !== 'dpad' ? t(group.descriptionKey) : undefined}
                      icon={group.icon}
                      count={group.buttons.length}
                      action={DIRECTIONAL_GROUP_SETS[groupKey] && groupKey !== 'leftStick' && groupKey !== 'rightStick' ? renderWasdAction(DIRECTIONAL_GROUP_SETS[groupKey]) : undefined}
                    >
                      {(
                        <BindingList>
                          {group.buttons.map(button => (
                            <div key={button.command}>{renderButtonCard(button, { modeshifts: true })}</div>
                          ))}
                        </BindingList>
                      )}
                      {/* A button's modeshifts live in its own editor now (7a). A
                          stick is one input with a mode, so its shift stays
                          group-level, where the shifted mode can be chosen. */}
                      {/* Console v2 (D6): how far a tilt goes before it counts lives
                          with the gyro, under Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt. */}
                      {groupKey === 'motion' && (
                        <SummaryRow label={t('keymap.tiltSettings', 'Tilt settings')} icon={<Icon name="gyro" size={20} />}
                          hint={t('keymap.tiltSettingsHint', 'How far to tilt or lean · on Gyro ▸ Fine-tune ▸ Direction ▸ Advanced ▸ Tilt')}
                          onActivate={() => { window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'gyro' })); window.setTimeout(() => window.dispatchEvent(new CustomEvent('jsm:gyro-tilt')), 120) }} />
                      )}
                      {groupKey === 'extra' && group.buttons.some(button => button.command === 'MISC5' || button.command === 'MISC6') && (
                        <SummaryRow label={t('keymap.gripSensors', 'Grip sensors')} icon={<Icon name="grips" size={20} />}
                          hint={gripSensorsSummary(gripSensorRange, getKeymapValue(readText, 'LEFT_GRIP_RELEASE_DELAY') ?? '', getKeymapValue(readText, 'RIGHT_GRIP_RELEASE_DELAY') ?? '')}
                          onActivate={() => window.dispatchEvent(new CustomEvent('jsm:open-sheet', { detail: 'gripSensors' }))} />
                      )}
                    </KeymapSection>
                  </div></ConfigScope>
                )})}
                {onConfigTextChange && isVisible('face') && <ConfigScope match={/^(HOLD_PRESS_TIME|DBL_PRESS_WINDOW|SIM_PRESS_WINDOW|TURBO_PERIOD|TICK_TIME)$/}>
                  <ProfileTiming text={readText} setText={onConfigTextChange} modifiers={modifierOptions} disabled={isCalibrating} />
                </ConfigScope>}
              </div>
            </section>
          )}
        </>
      )}

      {p4Page === 'triggers' && (
        <ConfigScope match={/^(ZL|ZR|TRIGGER_|ADAPTIVE_TRIGGER|LEFT_TRIGGER_|RIGHT_TRIGGER_)/}>
          <TriggersPage readText={readText} setText={onConfigTextChange} disabled={isCalibrating}
            zlMode={zlModeValue} zrMode={zrModeValue} onModeChange={(side, value) => (side === 'left' ? onZlModeChange : onZrModeChange)(value)}
            threshold={triggerThreshold} onThresholdChange={onTriggerThresholdChange}
            adaptiveValue={adaptiveTriggerValue} onAdaptiveChange={onAdaptiveTriggerChange}
            liveDevice={liveDevice}
            buttons={{ left: TRIGGER_BUTTONS.filter(button => /^ZLF?$/.test(button.command)), right: TRIGGER_BUTTONS.filter(button => /^ZRF?$/.test(button.command)) }}
            renderButton={renderButtonCard} renderModeshifts={target => renderModeshifts(target)}
            describe={command => { const info = describeTouchpadRegion(command); return { binding: info.binding ? describeBinding(info.binding, t) : '', label: info.label } }}
            virtualControllerType={virtualControllerType ?? 'NONE'} onVirtualControllerTypeChange={onVirtualControllerTypeChange} />
        </ConfigScope>
      )}

      {p4Page === 'sticks' && stickModeSettings && (
        <ConfigScope match={/^(L[LRUDSR]|R[LRUDSR]|L3|R3|LEFT_(STICK|RING)|RIGHT_(STICK|RING)|STICK_|FLICK_|MOUSE_RING|SCROLL_|SCREEN_|MOUSELIKE|RETURN_DEADZONE|EDGE_PUSH|ANGLE_TO_AXIS|WIND_|UNWIND|ROTATE_SMOOTH|VIRTUAL_STICK|REAL_WORLD|IN_GAME_SENS|[LR]M\d)/}>
          <SticksPage readText={readText} setText={onConfigTextChange} disabled={isCalibrating} liveDevice={liveDevice}
            onModeChange={(SIDE, value) => {
              const side = SIDE === 'LEFT' ? 'left' : 'right'
              if (onConfigTextChange && stickMenuLinks(readText, side).some(link => isDirectStickMenu(link.attachment))) {
                onConfigTextChange(previous => updateKeymapEntry(writeVirtualMenus(previous, readVirtualMenus(detachStickMenu(readText, side)).menus), `${SIDE}_STICK_MODE`, [value || 'NO_MOUSE']))
              } else onStickModeChange?.(SIDE, value)
            }}
            inputs={Object.fromEntries((['left', 'right'] as const).map(side => {
              const buttons = side === 'left' ? LEFT_STICK_BUTTONS : RIGHT_STICK_BUTTONS
              const find = (command: string) => buttons.find(button => button.command === command)
              const S = side === 'left' ? 'L' : 'R'
              const supported = (button?: ButtonDefinition) => button && (controllerSupportsInput(inputDevice, button.command) || isCommandBound(button.command)) ? button : undefined
              return [side, {
                directions: ['UP', 'LEFT', 'DOWN', 'RIGHT'].map(direction => find(`${S}${direction}`)).filter((button): button is ButtonDefinition => Boolean(button)),
                rotation: [find(`${S}LEFT`), find(`${S}RIGHT`)].filter((button): button is ButtonDefinition => Boolean(button)),
                click: find(`${S}3`), ring: find(`${S}RING`), touch: supported(find(`${S}TOUCH`)),
              }]
            })) as Record<'left' | 'right', { directions: ButtonDefinition[]; rotation: ButtonDefinition[]; click?: ButtonDefinition; ring?: ButtonDefinition; touch?: ButtonDefinition }>}
            renderButton={renderButtonCard} renderModeshifts={target => renderModeshifts(target)}
            modeshiftTarget={side => {
              const groupKey = side === 'left' ? 'leftStick' : 'rightStick'
              const SIDE = side === 'left' ? 'LEFT' : 'RIGHT'
              return {
                id: groupKey, title: t(MAPPING_BUTTON_GROUPS[groupKey].titleKey),
                settings: stickModeshiftSettings(SIDE),
                buttons: MAPPING_BUTTON_GROUPS[groupKey].buttons
                  .filter(button => controllerSupportsInput(inputDevice, button.command) || isCommandBound(button.command))
                  .map(button => ({ command: button.command, label: getButtonDescription(button, t), definition: button })),
                mode: { key: `${SIDE}_STICK_MODE`, defaultValue: 'NO_MOUSE', options: STICK_MODE_VALUES.map(value => ({ value, label: formatStickModeLabel(value, t) })) },
              }
            }}
            describe={command => { const info = describeTouchpadRegion(command); return { binding: info.binding ? describeBinding(info.binding, t) : '', label: info.label } }}
            wheelMenus={{ left: previewMenus.LSTICK, right: previewMenus.RSTICK }}
            wheelSegments={{ left: stickMenuButtons.filter(button => button.command.startsWith('LM')), right: stickMenuButtons.filter(button => button.command.startsWith('RM')) }}
            virtualControllerType={virtualControllerType ?? 'NONE'} onVirtualControllerTypeChange={onVirtualControllerTypeChange}
            onBindWasd={onBindDirectionsToWasd ? side => {
              const setId = side === 'left' ? 'leftStick' : 'rightStick'
              const switchedStickMode = wasdBindingChangesStickMode(readText, setId)
              onBindDirectionsToWasd(setId)
              showToast(switchedStickMode ? t('messages.bindWasdWithStickMode') : t('messages.bindWasdDone'))
            } : undefined} />
        </ConfigScope>
      )}

      {p4Page === 'trackpads' && (
        <ConfigScope match={/^(LEFT_|RIGHT_)?(TOUCH|GRID|TOUCHPAD)|^(LT|RT|T)\d|^(MISC[2-4]|CAPTURE|TUP|TDOWN|TLEFT|TRIGHT|TRING|ACCEL_CURVE_LINK|TRIGGER_SKIP_DELAY)$/}>
          <TrackpadsPage readText={readText} setText={onConfigTextChange} disabled={isCalibrating} liveDevice={liveDevice}
            pads={showPerPadTouchpads
              ? (['left', 'right'] as const).map(side => {
                  const status = liveDevice?.status?.[side === 'left' ? 'leftPad' : 'rightPad']
                  return {
                    side, card: (side === 'left' ? leftPadCard : rightPadCard)!,
                    regions: touchpadGridPads.find(candidate => candidate.side === side)?.buttons ?? [],
                    menu: previewMenus[side === 'left' ? 'LEFT' : 'RIGHT'], menuKey: side === 'left' ? 'LEFT' : 'RIGHT',
                    live: side === 'left' ? livePadTouches.left : livePadTouches.right,
                    touch: side === 'left' ? MISC_BUTTONS.find(button => button.command === 'MISC4') : TOUCH_BUTTONS.find(button => button.command === 'TOUCH'),
                    click: PAD_CLICK_BUTTONS.find(button => button.command === (side === 'left' ? 'MISC3' : 'MISC2')),
                    modeshiftTarget: padModeshiftTarget(side),
                    other: side === 'right' && confirmedTwoPadTouchpads ? TOUCH_BUTTONS.filter(button => button.command === 'CAPTURE' && isTouchpadButtonBound(button.command)) : undefined,
                    pressure: status?.pressure, speed: status?.speed,
                  }
                })
              : [{
                  side: 'single' as const,
                  card: { mode: touchpadMode, dualStageMode: touchpadDualStageMode, gridColumns, gridRows, gridShape, gridDeadzone, sensitivity: touchpadSensitivity, sensitivityY: touchpadSensitivityY,
                    mouseArea: mouseAreas[''].area, mouseAreaFit: mouseAreas[''].fit, onMouseAreaFitChange: mouseAreas[''].setFit, onPickMouseArea: () => mouseAreas[''].pick(livePadAspect), padAspect: livePadAspect },
                  regions: touchpadGridPads.find(candidate => candidate.side === 'shared')?.buttons ?? [],
                  menuKey: 'TOUCHPAD', live: livePadTouch,
                  touch: TOUCH_BUTTONS.find(button => button.command === 'TOUCH'), click: TOUCH_BUTTONS.find(button => button.command === 'CAPTURE'),
                  modeshiftTarget: {
                    id: 'touchpad', title: 'Trackpad', pad: { side: 'shared', keyPrefix: '' },
                    buttons: Array.from({ length: 25 }, (_, i) => ({ command: `T${i + 1}`, label: `Region ${i + 1}` })),
                    settings: padModeshiftSettings(''),
                    mode: { key: 'TOUCHPAD_MODE', defaultValue: 'GRID_AND_STICK', options: [
                      { value: 'GRID_AND_STICK', label: 'Zones you bind' }, { value: 'MOUSE', label: 'Mouse' },
                      { value: 'MOUSE_AREA', label: 'Mouse area' }, { value: 'PS_TOUCHPAD', label: 'PlayStation touchpad' },
                    ] },
                    grid: { sizeKey: 'GRID_SIZE', clickKey: 'GRID_REQUIRES_CLICK', stickKey: 'TOUCH_STICK_MODE', clickButton: 'MISC2', prefix: 'T' },
                  } satisfies ModeshiftTarget,
                  pressure: liveDevice?.status?.leftPad?.pressure, speed: liveDevice?.status?.leftPad?.speed,
                }]}
            padAspect={livePadAspect} selectedRegion={selectedTouchpadGridCommand} onSelectRegion={setSelectedTouchpadGridCommand}
            renderButton={renderButtonCard} renderModeshifts={target => renderModeshifts(target, target.pad?.side === 'left' ? 'left' : target.pad?.side === 'right' ? 'right' : undefined)}
            describe={command => { const info = describeTouchpadRegion(command); return { binding: info.binding ? describeBinding(info.binding, t) : '', label: info.label } }}
            stickButtons={TOUCH_STICK_BUTTONS}
            onBindTouchStickWasd={onBindDirectionsToWasd ? () => { onBindDirectionsToWasd('touchStick'); showToast(t('messages.bindWasdDone')) } : undefined}
            warnings={(touchpadWarnings ?? []).map(renderTouchpadWarning)}
            accel={touchpadAccelValues ? { values: touchpadAccelValues, link: accelCurveLink } : undefined}
            virtualControllerType={virtualControllerType ?? 'NONE'} />
        </ConfigScope>
      )}

      <MappingRulesHelpModal isOpen={mappingHelpOpen} onClose={() => setMappingHelpOpen(false)} />
    </Card>
  )
}
