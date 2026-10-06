import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { GyroSettingRow, Segmented, SelectPill } from './GyroBehaviorControls'
import { GyroActivationConditions } from './GyroActivationConditions'
import { parseTiltActivation, writeTiltActivation, type GyroActivationMode } from '../utils/gyroActivation'
import { buildModifierOptions, resolveModifierOptionLabel } from '../utils/modifierOptions'
import { controllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from './glyphs/InputGlyph'

export function TiltActivationControls({ text, setText, prefix = '', disabled, deviceType, gridCommands = [] }: {
  text: string; setText: Dispatch<SetStateAction<string>>; prefix?: string; disabled?: boolean; deviceType?: number; gridCommands?: string[]
}) {
  const { t } = useTranslation()
  const current = parseTiltActivation(text, prefix)
  const family = controllerVisualFamily(deviceType)
  const inputs = buildModifierOptions(gridCommands.length > 0, gridCommands.length, gridCommands).map(option => {
    const [label, hint] = resolveModifierOptionLabel(option, t, family).split(/\s+—\s+/)
    return { value: option.value, label, hint, disabled: option.disabled, icon: <InputGlyph command={option.value} family={family} size={20} /> }
  })
  if (current.button && !inputs.some(option => option.value === current.button)) inputs.push({ value: current.button, label: current.button, hint: '', disabled: false, icon: <InputGlyph command={current.button} family={family} size={20} /> })
  const selected = current.button || 'R3'
  const held = current.mode === 'hold_on' || current.mode === 'hold_off'
  const setting = current.mode === 'hold_off' ? 'TILT_OFF' : 'TILT_ON'
  const descriptions = {
    always_on: 'Tilt output is always enabled, independently of gyro activation.',
    hold_on: 'Tilt output runs only while the selected input or conditions match. Release to stop tilt output.',
    hold_off: 'Tilt output is enabled until the selected input or conditions match. Hold to pause tilt output.',
    always_off: 'Tilt output is disabled. Tilt settings and bindings are kept for later; gyro remains independently configured.',
  }
  const save = (mode: GyroActivationMode, button = selected) => setText(previous => writeTiltActivation(previous, mode, button, prefix))
  return <>
    <GyroSettingRow setting={setting} label="Tilt activation" description={descriptions[current.mode]}
      control={<Segmented<GyroActivationMode> ariaLabel="Tilt activation" value={current.mode} disabled={disabled} onChange={mode => save(mode)}
        options={[
          { value: 'always_on', label: t('gyroPage.activationAlwaysOn') },
          { value: 'hold_on', label: t('gyroPage.activationHoldOn') },
          { value: 'hold_off', label: t('gyroPage.activationHoldOff') },
          { value: 'always_off', label: t('gyroPage.activationAlwaysOff') },
        ]} />} />
    {!/^(ANY|ALL)\s/.test(current.button) && <GyroSettingRow setting={setting} label="Tilt activation input"
      description={held ? 'Choose a button, touch sensor, Grip Sense input or stick. This input only enables or pauses tilt.' : 'Choose Hold to enable or Hold to disable to use an activation input.'}
      value={<SelectPill ariaLabel="Tilt activation input" value={selected} options={inputs} disabled={disabled || !held} onChange={button => save(current.mode, button)} />} />}
    <GyroActivationConditions source="tilt" text={text} setText={setText} prefix={prefix} disabled={disabled} deviceType={deviceType} gridCommands={gridCommands} />
  </>
}
