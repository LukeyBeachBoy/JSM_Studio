import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, useRefocusOn } from './PickerPage'
import { usePickerWords, useUsedBy } from './pickerShared'
import { MouseArt } from './PickerArt'
import styles from './Pickers.module.css'

// Mouse · clicks and wheel (console v2, PickerFamily): the mouse with the
// focused button lit, who else already sends it, and the seven outputs in the
// order a mouse reads: Left, Right, Middle, Back, Forward, Wheel up, Wheel down.

const BUTTONS: { token: string; label: string; wheel?: boolean }[] = [
  { token: 'LMOUSE', label: 'Left click' }, { token: 'RMOUSE', label: 'Right click' }, { token: 'MMOUSE', label: 'Middle' },
  { token: 'BMOUSE', label: 'Back' }, { token: 'FMOUSE', label: 'Forward' },
  { token: 'SCROLLUP', label: 'Wheel up', wheel: true }, { token: 'SCROLLDOWN', label: 'Wheel down', wheel: true },
]

export function MousePicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onSearch, allowedOutputKinds } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const usedBy = useUsedBy(command)
  const current = command.outputKind === 'mouse' || command.outputKind === 'wheel' ? command.outputValue : ''
  const [focused, setFocused] = useState(current || 'LMOUSE')
  const grid = useRef<HTMLDivElement>(null)
  useRefocusOn(grid, 'mouse', ['[data-current="true"]', 'button'])
  const by = usedBy(focused)
  const choose = (token: string, wheel?: boolean) => {
    const kind = wheel ? 'wheel' : 'mouse'
    if (allowedOutputKinds && !allowedOutputKinds.includes(kind)) return
    onSelect({ outputKind: kind, outputValue: token, virtualControllerLogicalOutput: undefined })
    onClose()
  }
  return (
    <PickerPage kind="mouse" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.mouseTitle', 'Mouse')}
      where={words.where(t('pickers.mouseTitle', 'Mouse'))}
      hints={onSearch ? [{ button: 'Y', label: t('pickers.search', 'Search') }] : undefined}
      onPad={button => { if (button === 'Y' && onSearch) { onSearch(); return true } return false }}>
      <div className={styles.split} style={{ ['--split-w' as string]: '240px', maxWidth: 980 }}>
        <div className={styles.splitSide}>
          <div className={styles.artWell} style={{ minHeight: 240 }}><MouseArt focus={focused} /></div>
          <span className={styles.sideNote} aria-live="polite">{by && by !== '-'
            ? t('pickers.usesItToo', '{{input}} uses it too', { input: by })
            : by === '-' ? t('pickers.alreadyInConfig', 'Already used in this configuration') : t('pickers.mouseFree', 'Nothing else sends it')}</span>
        </div>
        <div ref={grid} className={styles.grid} style={{ ['--cols' as string]: 2 }} role="group" aria-label={t('pickers.mouseTitle', 'Mouse')}>
          {BUTTONS.map(button => {
            const label = t(`pickers.mouse.${button.token}`, button.label)
            const isCurrent = button.token === current
            return (
              <button key={button.token} type="button" className={`${styles.tile} ${styles.plainTile}`} data-token={button.token}
                data-current={isCurrent ? 'true' : undefined} aria-pressed={isCurrent}
                data-hints={`A:${t('pickers.use', 'Use')}${onSearch ? `;Y:${t('pickers.search', 'Search')}` : ''}`}
                data-caption={`${label} · ${button.wheel ? t('pickers.wheelCaption', 'one wheel step each time it fires') : t('pickers.clickCaption', 'held for as long as {{input}} is', { input: words.input })}`}
                onFocus={() => setFocused(button.token)} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') setFocused(button.token) }}
                onClick={() => choose(button.token, button.wheel)}>
                {label}{isCurrent && <span className={styles.tileSub}>{t('pickers.current', 'current')}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </PickerPage>
  )
}
