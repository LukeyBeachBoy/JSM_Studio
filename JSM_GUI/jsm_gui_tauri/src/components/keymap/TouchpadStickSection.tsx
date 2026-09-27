import { useTranslation } from 'react-i18next'
import { formatStickModeLabel, STICK_MODE_VALUES } from '../../constants/sticks'
import { TOUCH_STICK_AXIS_VALUES } from '../../utils/touchpadConfig'
import { RowGroup, SummaryRow } from '../ui/SummaryRow'

type TouchpadStickSectionProps = {
  /** Overrides the generic "Touch stick" heading, e.g. "Left touch stick". */
  keyPrefix?: string
  title?: string
  touchStickMode: string
  touchDeadzoneInner: string
  touchRingMode: string
  touchStickRadius: string
  touchStickAxis: string
  onTouchStickModeChange?: (value: string) => void
  onTouchDeadzoneInnerChange?: (value: string) => void
  onTouchRingModeChange?: (value: string) => void
  onTouchStickRadiusChange?: (value: string) => void
  onTouchStickAxisChange?: (value: string) => void
  // Kept for callers that still pass the section's Save / Cancel; the title
  // bar's state button owns saving now.
  hasPendingChanges?: boolean
  statusMessage?: string | null
  onApply?: () => void
  onCancel?: () => void
  applyDisabled?: boolean
}

/**
 * A grid pad's touch stick (console refinement §5): one summary row per
 * setting, adjusted in place. Deadzone, ring, radius and axis only appear once
 * the touch stick has a mode -- conditional rows rather than an Advanced
 * disclosure.
 */
export function TouchpadStickSection({
  title,
  keyPrefix = '',
  touchStickMode,
  touchDeadzoneInner,
  touchRingMode,
  touchStickRadius,
  touchStickAxis,
  onTouchStickModeChange,
  onTouchDeadzoneInnerChange,
  onTouchRingModeChange,
  onTouchStickRadiusChange,
  onTouchStickAxisChange,
}: TouchpadStickSectionProps) {
  const { t } = useTranslation()
  // A hand-written value the lists do not know stays choosable as itself.
  const withCurrent = (options: { value: string; label: string }[], current: string) =>
    current && !options.some(option => option.value === current) ? [...options, { value: current, label: t('keymap.currentRawValue', { value: current }) }] : options
  const modeOptions = withCurrent([{ value: '', label: t('common.noneSelected') }, ...STICK_MODE_VALUES.map(mode => ({ value: mode, label: formatStickModeLabel(mode, t) }))], touchStickMode)
  const ringOptions = withCurrent([{ value: '', label: t('common.defaultPlaceholder') }, { value: 'INNER', label: t('stickModes.inner') }, { value: 'OUTER', label: t('stickModes.outer') }], touchRingMode)
  const axisOptions = withCurrent([{ value: '', label: t('common.defaultValue', { value: 'STANDARD' }) }, ...TOUCH_STICK_AXIS_VALUES.map(mode => ({ value: mode, label: mode }))], touchStickAxis)
  const number = (value: string, fallback: number) => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : fallback }

  return (
    <RowGroup title={title ?? t('keymap.touchStickTitle')}>
      <SummaryRow label={t('keymap.touchStickMode')} hint={t('keymap.touchStickDescription')} setting={keyPrefix + 'TOUCH_STICK_MODE'} help={t('keymap.touchStickHint')}
        adjust={{ kind: 'choice', value: touchStickMode, options: modeOptions, onChange: value => onTouchStickModeChange?.(value) }} />
      {touchStickMode && <>
        <SummaryRow label={t('keymap.touchDeadzoneInner')} setting={keyPrefix + 'TOUCH_DEADZONE_INNER'} mono
          value={touchDeadzoneInner || t('common.defaultPlaceholder')}
          adjust={{ kind: 'number', value: number(touchDeadzoneInner, 0), min: 0, max: 500, step: 5, onChange: value => onTouchDeadzoneInnerChange?.(String(value)) }} />
        <SummaryRow label={t('stickModes.ringMode')} setting={keyPrefix + 'TOUCH_RING_MODE'}
          adjust={{ kind: 'choice', value: touchRingMode, options: ringOptions, onChange: value => onTouchRingModeChange?.(value) }} />
        <SummaryRow label={t('keymap.touchStickRadius')} setting={keyPrefix + 'TOUCH_STICK_RADIUS'} mono
          value={touchStickRadius || t('common.defaultPlaceholder')}
          adjust={{ kind: 'number', value: number(touchStickRadius, 0), min: 0, max: 2000, step: 10, onChange: value => onTouchStickRadiusChange?.(String(value)) }} />
        <SummaryRow label={t('keymap.touchStickAxis')} setting={keyPrefix + 'TOUCH_STICK_AXIS'}
          adjust={{ kind: 'choice', value: touchStickAxis, options: axisOptions, onChange: value => onTouchStickAxisChange?.(value) }} />
      </>}
    </RowGroup>
  )
}
