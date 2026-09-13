import { HelpButton } from './HelpButton'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SensitivityValues } from '../utils/keymap'
import type { GyroActivationMode } from '../utils/gyroActivation'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { Card } from './Card'
import { SectionActions } from './SectionActions'
import { NumberField } from './NumberField'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { controllerLabel, formatVidPid } from '../utils/controllers'
import styles from './Gyro.module.css'
import { AppSelect } from './ui/AppSelect'

const GYRO_SPACE_OPTIONS = [
  { value: 'LOCAL', labelKey: 'gyro.spaces.local' },
  { value: 'YAW_PLUS_ROLL', labelKey: 'gyro.spaces.yawPlusRoll' },
  { value: 'PLAYER_TURN', labelKey: 'gyro.spaces.playerTurn' },
  { value: 'WORLD_TURN', labelKey: 'gyro.spaces.worldTurn' },
]

const GYRO_ACTIVATION_MODE_OPTIONS: Array<{ value: GyroActivationMode; labelKey: string }> = [
  { value: 'always_on', labelKey: 'gyro.activationAlwaysOn' },
  { value: 'hold_on', labelKey: 'gyro.activationHoldOn' },
  { value: 'hold_off', labelKey: 'gyro.activationHoldOff' },
  { value: 'always_off', labelKey: 'gyro.activationAlwaysOff' },
]

type GyroBehaviorControlsProps = {
  sensitivity: SensitivityValues
  gyroActivationMode: GyroActivationMode
  gyroActivationButton: string
  touchpadMode: string
  touchpadGridCells: number
  touchpadGridCommands?: string[]
  isCalibrating: boolean
  statusMessage?: string | null
  devices?: {
    handle: number
    type: number
    split?: number
    vid?: number
    pid?: number
  }[]
  ignoredDevices?: string[]
  onToggleIgnoreDevice?: (vid: number, pid: number, ignore: boolean) => void
  onInGameSensChange: (value: string) => void
  onRealWorldCalibrationChange: (value: string) => void
  onTickTimeChange: (value: string) => void
  onGyroSpaceChange: (value: string) => void
  onGyroAxisXChange: (value: string) => void
  onGyroAxisYChange: (value: string) => void
  onGyroOutputChange: (value: string) => void
  onGyroActivationModeChange: (mode: GyroActivationMode, fallbackButton?: string) => void
  onGyroActivationButtonChange: (button: string) => void
  counterOsMouseSpeed: boolean
  onCounterOsMouseSpeedChange: (enabled: boolean) => void
  onOpenCalibration?: () => void
  onOpenRwcGuide?: () => void
  hasPendingChanges: boolean
  onApply: () => void
  onCancel: () => void
  lockMessage?: string
  appliedSampleHz?: string
}

export function GyroBehaviorControls({
  sensitivity,
  gyroActivationMode,
  gyroActivationButton,
  touchpadMode,
  touchpadGridCells,
  touchpadGridCommands,
  isCalibrating,
  statusMessage,
  devices,
  ignoredDevices,
  onToggleIgnoreDevice,
  onInGameSensChange,
  onRealWorldCalibrationChange,
  onGyroSpaceChange,
  onGyroAxisXChange,
  onGyroAxisYChange,
  onGyroOutputChange,
  onGyroActivationModeChange,
  onGyroActivationButtonChange,
  counterOsMouseSpeed,
  onCounterOsMouseSpeedChange,
  onOpenCalibration,
  onOpenRwcGuide,
  hasPendingChanges,
  onApply,
  onCancel,
  lockMessage,
}: GyroBehaviorControlsProps) {
  const { t } = useTranslation()
  // A pad in grid mode is what makes its cells bindable, and on a two-pad
  // controller that is decided per pad -- so the caller passes the cells it
  // actually built rather than this page deriving them from the shared mode.
  const isTouchpadGridActive = touchpadMode === 'GRID_AND_STICK' || (touchpadGridCommands?.length ?? 0) > 0
  const activationButtonOptions = useMemo(() => {
    const options = buildModifierOptions(
      isTouchpadGridActive,
      isTouchpadGridActive ? touchpadGridCells : 0,
      touchpadGridCommands
    ).map(option => ({
      value: option.value,
      label: resolveModifierOptionLabel(option, t, controllerVisualFamily(devices?.[0]?.type)),
      disabled: option.disabled,
    }))
    if (gyroActivationButton && !options.some(option => option.value === gyroActivationButton)) {
      options.push({ value: gyroActivationButton, label: gyroActivationButton, disabled: false })
    }
    return options
  }, [gyroActivationButton, isTouchpadGridActive, t, touchpadGridCells, touchpadGridCommands])
  const fallbackActivationButton =
    activationButtonOptions.find(option => option.value === 'R3' && !option.disabled)?.value ??
    activationButtonOptions.find(option => !option.disabled)?.value ??
    'R3'
  const selectedActivationButton = gyroActivationButton || fallbackActivationButton
  const usesActivationButton = gyroActivationMode === 'hold_on' || gyroActivationMode === 'hold_off'
  const gyroDrivesMouse = !sensitivity.gyroOutput

  return (
    <Card className="control-panel" lockable locked={isCalibrating} lockMessage={lockMessage ?? t('messages.lockMessage')}>
      <h2>{t('gyro.title')}</h2>
      {(onOpenCalibration || onOpenRwcGuide) && (
        <div className="flex-inputs">
          {onOpenRwcGuide && (
            <button type="button" className="primary-btn full-width-btn" onClick={onOpenRwcGuide} disabled={isCalibrating}>
              {t('gyro.easyCalibrationMethod')}
            </button>
          )}
          {onOpenCalibration && (
            <button type="button" className="secondary-btn full-width-btn" onClick={onOpenCalibration} disabled={isCalibrating}>
              {t('gyro.manualCalibration')}
            </button>
          )}
        </div>
      )}
      <div className="flex-inputs">
        <label>
          <span className="field-caption">{t('gyro.activationMode')}
          <HelpButton title="Gyro Activation">{t('gyro.activationHint')}</HelpButton></span>
          <AppSelect
            className="app-select"
            value={gyroActivationMode}
            onChange={(event) =>
              onGyroActivationModeChange(event.target.value as GyroActivationMode, selectedActivationButton)
            }
            disabled={isCalibrating}
          >
            {GYRO_ACTIVATION_MODE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.labelKey)}
              </option>
            ))}
          </AppSelect>
        </label>
        <label>
          <span className="field-caption">{t('gyro.activationButton')}
          <HelpButton title="Activation Button">{t('gyro.activationButtonHint')}</HelpButton></span>
          <AppSelect
            className="app-select"
            value={selectedActivationButton}
            onChange={(event) => onGyroActivationButtonChange(event.target.value)}
            disabled={isCalibrating || !usesActivationButton}
          >
            {activationButtonOptions.map(option => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </AppSelect>
        </label>
      </div>
      <div className="flex-inputs">
        <label>
          <span className="field-caption">{t('gyro.gyroOutput')}
          <HelpButton title="Gyro Output">{t('gyro.gyroOutputHint')}</HelpButton></span>
          <AppSelect className="app-select" value={sensitivity.gyroOutput ?? ''} onChange={(e) => onGyroOutputChange(e.target.value)}>
            <option value="">{t('gyro.gyroOutputMouse')} ({t('common.default')})</option>
            <option value="LEFT_STICK">{t('gyro.gyroOutputLeftStick')}</option>
            <option value="RIGHT_STICK">{t('gyro.gyroOutputRightStick')}</option>
          </AppSelect>
        </label>
      </div>
      {/* Real-world calibration and in-game sensitivity scale the *mouse* the
          gyro produces. When the gyro is driving a virtual stick instead they
          do nothing, so they fold away rather than inviting a pointless edit. */}
      {gyroDrivesMouse ? (
        <div className="flex-inputs">
          <NumberField
            label={t('gyro.realWorldCalibration')}
            value={sensitivity.realWorldCalibration}
            onChange={onRealWorldCalibrationChange}
            min={0}
            max={10000}
            step={0.1}
            coarseStep={100}
          />
          <NumberField
            label={t('gyro.inGameSensitivity')}
            value={sensitivity.inGameSens}
            onChange={onInGameSensChange}
            min={0}
            max={100}
            step={0.1}
            defaultValue={1}
          />
        </div>
      ) : (
        <p className="field-description">{t('gyro.stickOutputNote', 'Calibration and in-game sensitivity apply when the gyro drives the mouse. With a stick output, tune the stick’s own settings instead.')}</p>
      )}
      <AdvancedDisclosure>
        <div className="flex-inputs">
          <label>
            {t('gyro.gyroSpace')} <HelpButton title="Gyro Space">Local uses the controller’s own axes. Player Turn combines yaw and roll relative to your grip; World Turn turns around gravity’s vertical axis. Choose a space that keeps turning natural as you tilt the controller.</HelpButton>
            <AppSelect className="app-select" value={sensitivity.gyroSpace ?? ''} onChange={(e) => onGyroSpaceChange(e.target.value)}>
              <option value="">{t('common.useDefault')}</option>
              {GYRO_SPACE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </AppSelect>
          </label>
        </div>
        <div className="flex-inputs">
          <label>
            {t('gyro.gyroAxisX')}
            <AppSelect className="app-select" value={sensitivity.gyroAxisX ?? ''} onChange={(e) => onGyroAxisXChange(e.target.value)}>
              <option value="">{t('common.default')}</option>
              <option value="INVERTED">{t('gyro.inverted')}</option>
            </AppSelect>
          </label>
          <label>
            {t('gyro.gyroAxisY')}
            <AppSelect className="app-select" value={sensitivity.gyroAxisY ?? ''} onChange={(e) => onGyroAxisYChange(e.target.value)}>
              <option value="">{t('common.default')}</option>
              <option value="INVERTED">{t('gyro.inverted')}</option>
            </AppSelect>
          </label>
        </div>
        {gyroDrivesMouse && (
          <div className="flex-inputs">
            <label>
              {t('gyro.counterOsMouseSpeed')}
              <p className="field-description">{t('gyro.counterOsMouseSpeedHint')}</p>
              <AppSelect
                className="app-select"
                value={counterOsMouseSpeed ? 'ON' : 'OFF'}
                onChange={(event) => onCounterOsMouseSpeedChange(event.target.value === 'ON')}
                disabled={isCalibrating}
              >
                <option value="OFF">{t('common.offDefault')}</option>
                <option value="ON">{t('common.on')}</option>
              </AppSelect>
            </label>
          </div>
        )}
      </AdvancedDisclosure>
      {devices && devices.length > 0 && (
        <div className="flex-inputs">
          <label>
            {t('gyro.connectedControllers')}
            <p className="field-description">{t('gyro.connectedControllersHint')}</p>
            <div className={styles.controllerList}>
              {devices.map(dev => {
                const id = formatVidPid(dev.vid, dev.pid)
                const isIgnored = id ? ignoredDevices?.includes(id.toLowerCase()) : false
                const disabled = !dev.vid || !dev.pid
                return (
                  <div key={dev.handle} className={styles.controllerCard}>
                    <div className={styles.controllerEntry}>
                      {controllerLabel(dev.type, t)}
                      {id && <span className={styles.controllerVidpid}>: {id}</span>}
                    </div>
                    <label className={styles.toggleSwitch}>
                      <span className={styles.toggleLabel}>{t('gyro.ignoreGyroOutput')}</span>
                      <div className={styles.toggleWrapper}>
                        <input
                          type="checkbox"
                          disabled={disabled}
                          checked={Boolean(isIgnored)}
                          onChange={(event) => {
                            if (!dev.vid || !dev.pid) return
                            onToggleIgnoreDevice?.(dev.vid, dev.pid, event.target.checked)
                          }}
                        />
                        <span className={styles.toggleSlider} />
                      </div>
                    </label>
                  </div>
                )
              })}
            </div>
          </label>
        </div>
      )}
      <SectionActions
        hasPendingChanges={hasPendingChanges}
        statusMessage={statusMessage}
        onApply={onApply}
        onCancel={onCancel}
        applyDisabled={isCalibrating}
        className="control-actions"
      />
    </Card>
  )
}
