import { useTranslation } from 'react-i18next'
import { ExpandRow, RowGroup, SummaryRow } from '../ui/SummaryRow'
import { HAPTIC_EFFECT_CHOICES } from '../../utils/hapticBindings'
import { previewHaptic } from '../../utils/hapticPreview'
import { hasSeparatePadFeedback, padFeedbackKey, padFeedbackPolicyChanges, padFeedbackValue, type FeedbackRead, type PadFeedbackSide } from '../../utils/padFeedback'

type Props = { side: PadFeedbackSide; read: FeedbackRead; onChange: (values: Record<string, string>) => void; mode: string }
export function PadFeedbackRows({ side, read, onChange, mode }: Props) {
  const { t } = useTranslation()
  const separate = hasSeparatePadFeedback(read, side)
  const key = (field: string) => padFeedbackKey(side, field)
  const raw = (field: string) => padFeedbackValue(read, side, field)
  const number = (field: string) => { const value = Number(raw(field)); return Number.isFinite(value) ? value : 0 }
  const write = (field: string, value: string) => onChange({ [key(field)]: value })
  const preview = (effect: string, strength: number) => previewHaptic(effect, strength, side === 'LEFT' ? 'left' : 'right')
  const effects = (current: string) => {
    const options = HAPTIC_EFFECT_CHOICES.map(value => ({ value, label: t(`keymap.hapticEffect_${value}`) }))
    // Imported firmware effects remain selectable and untouched.
    if (!options.some(option => option.value === current)) options.push({ value: current as typeof options[number]['value'], label: t(`keymap.hapticEffect_${current}`, 'Imported firmware effect') })
    return options
  }
  const pulse = (label: string, intensity: string, effect: string) => {
    const strength = number(intensity)
    return <ExpandRow size="sheet" label={label} value={strength > 0 ? `${strength}%` : 'Off'} setting={key(intensity)}>
      <SummaryRow size="sheet" label="Strength" setting={key(intensity)} value={strength > 0 ? `${strength}%` : 'Off'}
        adjust={{ kind: 'number', value: strength, min: 0, max: 100, step: 5, fineStep: 1, onChange: value => write(intensity, String(value)) }} />
      {strength > 0 && <SummaryRow size="sheet" label="Effect" setting={key(effect)} onX={{ label: 'Preview', run: () => preview(raw(effect), strength) }}
        adjust={{ kind: 'choice', value: raw(effect), options: effects(raw(effect)), onChange: value => write(effect, value) }} />}
    </ExpandRow>
  }
  return <>
    <SummaryRow size="sheet" label="Separate feedback" setting={key('HAPTICS')} hint="Give this pad its own feedback; keep shared settings for the other pad"
      toggle={{ on: separate, onChange: value => onChange(padFeedbackPolicyChanges(read, side, value)) }} />
    {!separate && <p className="sheet-note">Using shared feedback. Turn on Separate feedback to tune this pad independently.</p>}
    {separate && <>
      {mode === 'MOUSE' && <RowGroup title="Movement ticks">
        <SummaryRow size="sheet" label="Strength" setting={key('HAPTIC_INTENSITY')} value={number('HAPTIC_INTENSITY') > 0 ? `${number('HAPTIC_INTENSITY')}%` : 'Off'}
          adjust={{ kind: 'number', value: number('HAPTIC_INTENSITY'), min: 0, max: 100, step: 5, fineStep: 1, onChange: value => write('HAPTIC_INTENSITY', String(value)) }} />
        {number('HAPTIC_INTENSITY') > 0 && <>
          <SummaryRow size="sheet" label="Effect" setting={key('HAPTIC_EFFECT')} onX={{ label: 'Preview', run: () => preview(raw('HAPTIC_EFFECT'), number('HAPTIC_INTENSITY')) }}
            adjust={{ kind: 'choice', value: raw('HAPTIC_EFFECT'), options: effects(raw('HAPTIC_EFFECT')), onChange: value => write('HAPTIC_EFFECT', value) }} />
          <SummaryRow size="sheet" label="Tick spacing" hint="Finger travel between ticks" setting={key('HAPTIC_INTERVAL')} value={`${number('HAPTIC_INTERVAL')} px`}
            adjust={{ kind: 'number', value: number('HAPTIC_INTERVAL'), min: 1, max: 20000, step: 25, fineStep: 1, onChange: value => write('HAPTIC_INTERVAL', String(value)) }} />
        </>}
      </RowGroup>}
      <RowGroup title="Click and release">
        {pulse('On click', 'CLICK_HAPTIC_INTENSITY', 'CLICK_HAPTIC_EFFECT')}
        {pulse('On release', 'RELEASE_HAPTIC_INTENSITY', 'RELEASE_HAPTIC_EFFECT')}
      </RowGroup>
    </>}
  </>
}
