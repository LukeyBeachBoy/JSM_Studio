import { HelpButton } from './HelpButton'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import type { GyroActivationMode } from '../utils/gyroActivation'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { NumberField } from './NumberField'
import { SettingOrigin, SettingPrefix } from './SettingOrigin'
import { Select, type SelectOption } from './ui/Select'
import { InputGlyph } from './glyphs/InputGlyph'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { controllerLabel, formatVidPid } from '../utils/controllers'
import styles from './Gyro.module.css'

// The Gyro page's building blocks and its General, Calibration, Orientation
// and Connected-controllers sections (Gyro.dc.html, the settings-page
// template). Numeric rows are NumberField; everything else is a GyroSettingRow
// with the same shape: label, origin marker and value on the top line, the
// control under it, the description underneath, hairlines between rows.

type GyroSettingRowProps = {
  /** The JSM setting the row edits, for the origin marker and Y's documentation. */
  setting?: string
  label: string
  help?: ReactNode
  description?: ReactNode
  /** A wide control under the head (segmented control). */
  control?: ReactNode
  /** A value-sized control on the head's right (select pill, value pill). */
  value?: ReactNode
  /** What the pad's buttons do while the row has focus. */
  hints?: string
  className?: string
}

export function GyroSettingRow({ setting, label, help, description, control, value, hints, className = '' }: GyroSettingRowProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  // Y opens the row's help, or the documentation when it has none yet
  // (HANDOFF.md, "Help that degrades"), the same as a NumberField row.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (button !== 'Y') return
      event.preventDefault()
      const helpButton = row.querySelector<HTMLButtonElement>('.help-button')
      if (helpButton) helpButton.click()
      else window.dispatchEvent(new CustomEvent('jsm:open-docs', { detail: { setting } }))
    }
    row.addEventListener(PAD_EVENT, onPad)
    return () => row.removeEventListener(PAD_EVENT, onPad)
  }, [setting])
  return (
    <div ref={rowRef} className={`setting-row ${styles.row} ${className}`.trim()} data-capture-ignore="true"
      data-hints={hints ?? (help || description ? 'A:Select;Y:Help;B:Back' : 'A:Select;Y:Documentation;B:Back')}>
      <div className={styles.head}>
        <span className={styles.labelGroup}>
          <span className={styles.label}>{label}</span>
          {help && <HelpButton title={label}>{help}</HelpButton>}
        </span>
        <SettingOrigin setting={setting} />
        {value}
      </div>
      {control}
      {description
        ? <p className={styles.desc}>{description}</p>
        : <p className={`${styles.desc} ${styles.descMissing}`}>No description yet · {setting ?? label} · Y opens documentation</p>}
    </div>
  )
}

type SegmentedProps<T extends string> = {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (value: T) => void
  disabled?: boolean
  ariaLabel: string
}

/** A full-width segmented control (Components: 36 high, 3px inset). */
export function Segmented<T extends string>({ value, options, onChange, disabled, ariaLabel }: SegmentedProps<T>) {
  return (
    <div className={`segmented ${styles.segmented}`} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button key={option.value} type="button" aria-pressed={value === option.value} disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Off / On as a two-way segmented control, for the page's boolean settings. */
export function OnOff({ value, onChange, disabled, ariaLabel }: { value: boolean; onChange: (on: boolean) => void; disabled?: boolean; ariaLabel: string }) {
  const { t } = useTranslation()
  return (
    <Segmented ariaLabel={ariaLabel} value={value ? 'ON' : 'OFF'} disabled={disabled} onChange={next => onChange(next === 'ON')}
      options={[{ value: 'OFF', label: t('common.off') }, { value: 'ON', label: t('common.on') }]} />
  )
}

type SelectPillProps = {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
}

/** The select as a 28px pill on the row's value side (Gyro.dc.html, Output). */
export function SelectPill({ value, options, onChange, disabled, ariaLabel }: SelectPillProps) {
  return <Select className={styles.selectPill} value={value} options={options} onValueChange={onChange} disabled={disabled} ariaLabel={ariaLabel} />
}

const GYRO_SPACE_OPTIONS = [
  { value: 'LOCAL', labelKey: 'gyro.spaces.local' },
  { value: 'YAW_PLUS_ROLL', labelKey: 'gyro.spaces.yawPlusRoll' },
  { value: 'PLAYER_TURN', labelKey: 'gyro.spaces.playerTurn' },
  { value: 'WORLD_TURN', labelKey: 'gyro.spaces.worldTurn' },
]

const GRIP_INPUTS = new Set(['MISC5', 'MISC6', 'GRIP_L', 'GRIP_R'])

export type GyroDevice = {
  handle: number
  type: number
  split?: number
  vid?: number
  pid?: number
}

export type GyroGeneralSectionProps = {
  sensitivity: SensitivityValues
  gyroActivationMode: GyroActivationMode
  gyroActivationButton: string
  touchpadMode: string
  touchpadGridCells: number
  touchpadGridCommands?: string[]
  devices?: GyroDevice[]
  disabled?: boolean
  onGyroActivationModeChange: (mode: GyroActivationMode, fallbackButton?: string) => void
  onGyroActivationButtonChange: (button: string) => void
  onGyroOutputChange: (value: string) => void
  counterOsMouseSpeed: boolean
  onCounterOsMouseSpeedChange: (enabled: boolean) => void
}

export function GyroGeneralSection({
  sensitivity,
  gyroActivationMode,
  gyroActivationButton,
  touchpadMode,
  touchpadGridCells,
  touchpadGridCommands,
  devices,
  disabled,
  onGyroActivationModeChange,
  onGyroActivationButtonChange,
  onGyroOutputChange,
  counterOsMouseSpeed,
  onCounterOsMouseSpeedChange,
}: GyroGeneralSectionProps) {
  const { t } = useTranslation()
  const family = controllerVisualFamily(devices?.[0]?.type)
  // A pad in grid mode is what makes its cells bindable, and on a two-pad
  // controller that is decided per pad -- so the caller passes the cells it
  // actually built rather than this page deriving them from the shared mode.
  const isTouchpadGridActive = touchpadMode === 'GRID_AND_STICK' || (touchpadGridCommands?.length ?? 0) > 0
  const activationButtonOptions = useMemo<SelectOption[]>(() => {
    const options: SelectOption[] = buildModifierOptions(
      isTouchpadGridActive,
      isTouchpadGridActive ? touchpadGridCells : 0,
      touchpadGridCommands
    ).map(option => {
      // "Right grip — right grip sensor": the name is the label, the rest is
      // the list's hint, so the pill stays one short name.
      const [label, hint] = resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)
      return { value: option.value, label, hint, disabled: option.disabled, icon: <InputGlyph command={option.value} family={family} size={20} /> }
    })
    if (gyroActivationButton && !options.some(option => option.value === gyroActivationButton)) {
      options.push({ value: gyroActivationButton, label: gyroActivationButton, icon: <InputGlyph command={gyroActivationButton} family={family} size={20} /> })
    }
    return options
  }, [gyroActivationButton, isTouchpadGridActive, t, touchpadGridCells, touchpadGridCommands, family])
  const fallbackActivationButton =
    activationButtonOptions.find(option => option.value === 'R3' && !option.disabled)?.value ??
    activationButtonOptions.find(option => !option.disabled)?.value ??
    'R3'
  const selectedActivationButton = gyroActivationButton || fallbackActivationButton
  const usesActivationButton = gyroActivationMode === 'hold_on' || gyroActivationMode === 'hold_off'
  const activationSetting = gyroActivationMode === 'hold_off' ? 'GYRO_OFF' : 'GYRO_ON'
  const activationDescription = {
    always_on: t('gyroPage.activationDescAlwaysOn'),
    hold_on: t('gyroPage.activationDescHoldOn'),
    hold_off: t('gyroPage.activationDescHoldOff'),
    always_off: t('gyroPage.activationDescAlwaysOff'),
  }[gyroActivationMode]
  const output = sensitivity.gyroOutput ?? ''
  const stickName = output === 'LEFT_STICK' ? t('gyroPage.outputLeftStick') : t('gyroPage.outputRightStick')

  return (
    <>
      <GyroSettingRow setting={activationSetting} label={t('gyroPage.activation')} description={activationDescription}
        hints="A:Choose;Y:Help;B:Back"
        control={
          <Segmented<GyroActivationMode> ariaLabel={t('gyroPage.activation')} value={gyroActivationMode} disabled={disabled}
            onChange={mode => onGyroActivationModeChange(mode, selectedActivationButton)}
            options={[
              { value: 'always_on', label: t('gyroPage.activationAlwaysOn') },
              { value: 'hold_on', label: t('gyroPage.activationHoldOn') },
              { value: 'hold_off', label: t('gyroPage.activationHoldOff') },
              { value: 'always_off', label: t('gyroPage.activationAlwaysOff') },
            ]} />
        } />
      <GyroSettingRow setting={activationSetting} label={t('gyroPage.activationInput')}
        description={!usesActivationButton ? t('gyroPage.activationInputIdle') : GRIP_INPUTS.has(selectedActivationButton) ? t('gyroPage.activationInputGripDesc') : t('gyroPage.activationInputDesc')}
        hints="A:Open;Y:Help;B:Back"
        value={<SelectPill ariaLabel={t('gyroPage.activationInput')} value={selectedActivationButton} options={activationButtonOptions}
          onChange={onGyroActivationButtonChange} disabled={disabled || !usesActivationButton} />} />
      <GyroSettingRow setting="GYRO_OUTPUT" label={t('gyroPage.output')}
        description={output ? t('gyroPage.outputStickDesc', { stick: stickName.toLowerCase() }) : t('gyroPage.outputDesc')}
        hints="A:Open;Y:Help;B:Back"
        value={<SelectPill ariaLabel={t('gyroPage.output')} value={output || 'MOUSE'} disabled={disabled}
          options={[
            { value: 'MOUSE', label: t('gyroPage.outputMouse') },
            { value: 'LEFT_STICK', label: t('gyroPage.outputLeftStick') },
            { value: 'RIGHT_STICK', label: t('gyroPage.outputRightStick') },
          ]}
          onChange={next => onGyroOutputChange(next === 'MOUSE' ? '' : next)} />} />
      {!output && (
        <GyroSettingRow setting="COUNTER_OS_MOUSE_SPEED" label={t('gyroPage.counterOsMouseSpeed')} description={t('gyroPage.counterOsMouseSpeedDesc')}
          hints="A:Choose;Y:Help;B:Back"
          control={<OnOff ariaLabel={t('gyroPage.counterOsMouseSpeed')} value={counterOsMouseSpeed} onChange={onCounterOsMouseSpeedChange} disabled={disabled} />} />
      )}
    </>
  )
}

export type GyroCalibrationSectionProps = {
  sensitivity: SensitivityValues
  disabled?: boolean
  onInGameSensChange: (value: string) => void
  onRealWorldCalibrationChange: (value: string) => void
  onOpenCalibration?: () => void
  onOpenRwcGuide?: () => void
}

export function GyroCalibrationSection({ sensitivity, disabled, onInGameSensChange, onRealWorldCalibrationChange, onOpenCalibration, onOpenRwcGuide }: GyroCalibrationSectionProps) {
  const { t } = useTranslation()
  // Real world calibration and in-game sensitivity scale the *mouse* the gyro
  // produces. When the gyro drives a virtual stick they do nothing, so the
  // section says so instead of inviting a pointless edit.
  if (sensitivity.gyroOutput) return <p className={styles.note}>{t('gyroPage.stickOutputNote')}</p>
  return (
    <>
      <NumberField setting="REAL_WORLD_CALIBRATION"
        label={t('gyroPage.realWorldCalibration')}
        value={sensitivity.realWorldCalibration}
        onChange={onRealWorldCalibrationChange}
        min={0}
        max={10000}
        step={0.1}
        coarseStep={100}
        disabled={disabled}
        hint={
          <>
            {t('gyroPage.realWorldCalibrationDesc')}{' '}
            {onOpenRwcGuide
              ? <button type="button" className={styles.link} onClick={onOpenRwcGuide} disabled={disabled}>{t('gyroPage.easyGuide')}</button>
              : t('gyroPage.easyGuide')}
            {' '}{t('gyroPage.realWorldCalibrationDescTail')}
            {onOpenCalibration && <> · <button type="button" className={styles.link} onClick={onOpenCalibration} disabled={disabled}>{t('gyroPage.calculateManually')}</button></>}
          </>
        }
      />
      <NumberField setting="IN_GAME_SENS"
        label={t('gyroPage.inGameSensitivity')}
        value={sensitivity.inGameSens}
        onChange={onInGameSensChange}
        min={0}
        max={100}
        step={0.1}
        defaultValue={1}
        disabled={disabled}
        hint={t('gyroPage.inGameSensitivityDesc')}
      />
    </>
  )
}

export type GyroOrientationSectionProps = {
  sensitivity: SensitivityValues
  /** "BUTTON," while the shifted sensitivity set is being edited, for the roll row. */
  sensitivityPrefix?: string
  disabled?: boolean
  onGyroSpaceChange: (value: string) => void
  onGyroAxisXChange: (value: string) => void
  onGyroAxisYChange: (value: string) => void
  onRollContributionChange: (value: string) => void
}

export function GyroOrientationSection({ sensitivity, sensitivityPrefix = '', disabled, onGyroSpaceChange, onGyroAxisXChange, onGyroAxisYChange, onRollContributionChange }: GyroOrientationSectionProps) {
  const { t } = useTranslation()
  const axisOptions = [{ value: '', label: t('gyroPage.axisNormal') }, { value: 'INVERTED', label: t('gyroPage.axisInverted') }]
  const showRollContribution = sensitivity.gyroSpace?.trim().toUpperCase() === 'YAW_PLUS_ROLL'
  return (
    <>
      <GyroSettingRow setting="GYRO_SPACE" label={t('gyroPage.gyroSpace')} description={t('gyroPage.gyroSpaceDesc')} hints="A:Open;Y:Help;B:Back"
        value={<SelectPill ariaLabel={t('gyroPage.gyroSpace')} value={sensitivity.gyroSpace || 'DEFAULT'} disabled={disabled}
          options={[{ value: 'DEFAULT', label: t('gyroPage.gyroSpaceDefault') }, ...GYRO_SPACE_OPTIONS.map(option => ({ value: option.value, label: t(option.labelKey) }))]}
          onChange={next => onGyroSpaceChange(next === 'DEFAULT' ? '' : next)} />} />
      <GyroSettingRow setting="GYRO_AXIS_X" label={t('gyroPage.axisHorizontal')} description={t('gyroPage.axisHorizontalDesc')} hints="A:Choose;Y:Help;B:Back"
        control={<Segmented ariaLabel={t('gyroPage.axisHorizontal')} value={sensitivity.gyroAxisX ?? ''} options={axisOptions} onChange={onGyroAxisXChange} disabled={disabled} />} />
      <GyroSettingRow setting="GYRO_AXIS_Y" label={t('gyroPage.axisVertical')} description={t('gyroPage.axisVerticalDesc')} hints="A:Choose;Y:Help;B:Back"
        control={<Segmented ariaLabel={t('gyroPage.axisVertical')} value={sensitivity.gyroAxisY ?? ''} options={axisOptions} onChange={onGyroAxisYChange} disabled={disabled} />} />
      {showRollContribution && (
        <SettingPrefix prefix={sensitivityPrefix}>
          <NumberField setting="ROLL_CONTRIBUTION"
            label={t('gyroPage.rollContribution')}
            value={sensitivity.rollContribution}
            onChange={onRollContributionChange}
            min={-100}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
            hint={t('gyroPage.rollContributionDesc')}
          />
        </SettingPrefix>
      )}
    </>
  )
}

export type GyroDevicesSectionProps = {
  devices?: GyroDevice[]
  ignoredDevices?: string[]
  disabled?: boolean
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
}

/** Every controller the mapper sees, each with its own "ignore gyro" switch. */
export function GyroDevicesSection({ devices, ignoredDevices, disabled, onToggleIgnoreDevice }: GyroDevicesSectionProps) {
  const { t } = useTranslation()
  if (!devices || devices.length === 0) return null
  return (
    <GyroSettingRow label={t('gyroPage.connectedControllers')} description={t('gyroPage.connectedControllersDesc')} hints="A:Toggle;Y:Help;B:Back"
      control={
        <div className={styles.controllerList}>
          {devices.map(dev => {
            const id = formatVidPid(dev.vid, dev.pid)
            const isIgnored = id ? ignoredDevices?.includes(id.toLowerCase()) : false
            const unaddressable = !dev.vid || !dev.pid
            return (
              <div key={dev.handle} className={styles.controllerCard}>
                <span className={styles.controllerEntry}>
                  {controllerLabel(dev.type, t)}
                  {id && <span className={styles.controllerVidpid}>{id}</span>}
                </span>
                {/* A real button, so the pad's spatial navigation can land on
                    it; a hidden checkbox is skipped as invisible. */}
                <button type="button" role="switch" aria-checked={Boolean(isIgnored)} className={styles.toggleSwitch}
                  disabled={disabled || unaddressable}
                  onClick={() => { if (dev.vid && dev.pid) onToggleIgnoreDevice?.(dev.vid, dev.pid, !isIgnored) }}>
                  <span className={styles.toggleLabel}>{t('gyroPage.ignoreGyroOutput')}</span>
                  <span className={styles.toggleSlider} aria-hidden="true" />
                </button>
              </div>
            )
          })}
        </div>
      } />
  )
}
