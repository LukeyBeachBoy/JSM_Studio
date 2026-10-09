import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, PickerSection, useRefocusOn } from './PickerPage'
import { KEY_GROUPS, MODIFIERS, MODIFIER_TOKENS, comboExpression, keyCap, keyGroupFor, type KeyGroupId, type KeyTile, type Modifier } from './keyCatalog'
import { usePickerWords, useUsedBy } from './pickerShared'
import { KeyComboArt } from './PickerArt'
import styles from './Pickers.module.css'

// Pick a key (console v2, KeyPicker.dc.html): the keys as big caps with what
// games use them for, in six groups on LT / RT. X listens for a key on a real
// keyboard instead (the old Capture). The last Common tile, "With Ctrl,
// Shift…", opens the key combo picker.

const KEYBOARD_ICON = <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>

type KeyPickerProps = ActionPickerProps & {
  /** Y opens Search every action. */
  onSearch?: () => void
  /** Choosing a key for something else (the combo's key): no combo tile, no capture. */
  chooseOnly?: { title: string; current?: string; onChoose: (token: string) => void }
}

export function KeyPicker(props: KeyPickerProps) {
  const { inputLabel, command, onSelect, onClose, onCapture, onSearch, chooseOnly } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const usedBy = useUsedBy(command)
  const current = chooseOnly ? chooseOnly.current ?? '' : command.outputKind === 'keyboard' ? command.outputValue : ''
  const [group, setGroup] = useState<KeyGroupId>(() => keyGroupFor(current))
  const [combo, setCombo] = useState(false)
  const grid = useRef<HTMLDivElement>(null)
  useRefocusOn(grid, group, ['[data-current="true"]', 'button'])

  const choose = (token: string) => {
    if (chooseOnly) { chooseOnly.onChoose(token); return }
    if (props.allowedOutputKinds && !props.allowedOutputKinds.includes('keyboard')) return
    onSelect({ outputKind: 'keyboard', outputValue: token, virtualControllerLogicalOutput: undefined })
    onClose()
  }
  const listen = !chooseOnly && onCapture ? () => { onClose(); onCapture() } : undefined
  const open = KEY_GROUPS.find(item => item.id === group) ?? KEY_GROUPS[0]
  const groupLabel = (id: KeyGroupId) => { const item = KEY_GROUPS.find(entry => entry.id === id)!; return t(item.labelKey, item.label) }

  const tile = (key: KeyTile, index: number) => {
    const isCurrent = key.token === current
    const by = usedBy(key.token)
    const use = key.use ? t(`pickers.keyUse.${key.token}`, key.use) : ''
    const name = keyCap(key.token)
    return (
      <button key={`${key.token}-${index}`} type="button" className={`${styles.tile} ${styles.key} key-cap`} data-token={key.token}
        data-current={isCurrent ? 'true' : undefined} aria-pressed={isCurrent}
        aria-label={`${name}${use ? ` · ${use}` : ''}`}
        data-caption={`${name}${use ? ` · usually ${use.toLowerCase()}` : ''}${by && by !== '-' ? ` · ${by} uses it too` : ''}`}
        data-hints={`A:${t('pickers.useNamed', 'Use {{name}}', { name: key.cap })}${listen ? `;X:${t('pickers.listen', 'Listen for a key')}` : ''}${onSearch ? `;Y:${t('pickers.search', 'Search')}` : ''}`}
        onClick={() => choose(key.token)}>
        <span className={`${styles.keyCap} ${key.cap.length > 5 ? styles.keyCapLong : ''}`}>{key.cap}</span>
        <span className={styles.keyUse}>{isCurrent ? [use, t('pickers.current', 'current')].filter(Boolean).join(' · ') : use}</span>
        {by && by !== '-' && <span className={styles.tileUsed}>{t('pickers.usedBy', '{{input}} uses it', { input: by })}</span>}
      </button>
    )
  }

  if (combo) {
    return <KeyComboPicker {...props} onBack={() => setCombo(false)} />
  }

  return (
    <PickerPage kind="key" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow}
      title={chooseOnly?.title ?? t('pickers.keyTitle', 'Pick a key')} where={words.where()}
      headerAction={listen ? { label: t('pickers.realKeyboard', 'Or press it on a real keyboard'), hint: t('pickers.listen', 'Listen for a key'), button: 'X', icon: KEYBOARD_ICON, onPress: listen } : undefined}
      groups={KEY_GROUPS.map(item => ({ id: item.id, label: groupLabel(item.id) }))} group={group} onGroup={id => setGroup(id as KeyGroupId)}
      stepLabel={t('pickers.stepGroup', 'Group')}
      hints={onSearch ? [{ button: 'Y', label: t('pickers.search', 'Search') }] : undefined}
      onPad={button => {
        if (button === 'X' && listen) { listen(); return true }
        if (button === 'Y' && onSearch) { onSearch(); return true }
        return false
      }}>
      <div ref={grid} className={styles.main} role="region" aria-label={groupLabel(group)}>
        {open.sections.map((section, at) => {
          const keys = <div className={styles.keyGrid}>
            {section.keys.map(tile)}
            {group === 'common' && !chooseOnly && (
              <button type="button" className={`${styles.tile} ${styles.key} ${styles.keyMore}`} data-combo-tile
                data-caption={t('pickers.comboCaption', 'A key with Ctrl, Shift, Alt or Win held: Ctrl + C, Shift + 1')}
                data-hints={`A:${t('pickers.comboOpen', 'Choose a combo')}${listen ? `;X:${t('pickers.listen', 'Listen for a key')}` : ''}`}
                onClick={() => setCombo(true)}>
                <span className={styles.keyCap}>{t('pickers.comboTile', 'With Ctrl, Shift…')}</span>
                <span className={styles.keyUse}>Ctrl + C, Shift + 1</span>
              </button>
            )}
          </div>
          return section.label
            ? <PickerSection key={at} label={t(`pickers.keySection.${section.label}`, section.label)} caption={section.caption}>{keys}</PickerSection>
            : <div key={at}>{keys}</div>
        })}
      </div>
    </PickerPage>
  )
}

/**
 * Key + modifier combo (PickerFamily: "Key combo"): Ctrl, Shift, Alt and Win as
 * toggles, the key under them, Y for the right-hand modifiers. B is Done: the
 * combo is written as JoyShockMapper spells one, every key on the same event.
 */
function KeyComboPicker(props: KeyPickerProps & { onBack: () => void }) {
  const { inputLabel, command, onSelect, onClose, onBack } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const startKey = command.outputKind === 'keyboard' && command.outputValue && !MODIFIER_TOKENS.has(command.outputValue) ? command.outputValue : 'C'
  const [mods, setMods] = useState<Set<Modifier>>(() => new Set(['ctrl']))
  const [right, setRight] = useState(false)
  const [key, setKey] = useState(startKey)
  const [choosing, setChoosing] = useState(false)
  const scope = useRef<HTMLDivElement>(null)
  useRefocusOn(scope, choosing, ['[data-mod="ctrl"]', '[data-mod="ctrl"]'])

  const tokens = [...MODIFIERS.filter(modifier => mods.has(modifier.id)).map(modifier => right ? modifier.right : modifier.left), key]
  const caps = [...MODIFIERS.filter(modifier => mods.has(modifier.id)).map(modifier => right ? `Right ${modifier.label}` : modifier.label), keyCap(key)]
  const done = () => {
    if (tokens.length > 1) {
      if (props.onSelectCombo) props.onSelectCombo(tokens)
      else onSelect({ outputKind: 'raw', outputValue: comboExpression(tokens, command.triggerKind), virtualControllerLogicalOutput: undefined })
    } else {
      onSelect({ outputKind: 'keyboard', outputValue: key, virtualControllerLogicalOutput: undefined })
    }
    onClose()
  }
  const toggle = (id: Modifier) => setMods(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })

  if (choosing) {
    return <KeyPicker {...props} chooseOnly={{ title: t('pickers.comboKeyTitle', 'Key for the combo'), current: key, onChoose: token => { setKey(token); setChoosing(false) } }} onClose={() => setChoosing(false)} />
  }
  return (
    <PickerPage kind="combo" onClose={done} backLabel={t('pickers.done', 'Done')} input={command.physicalInput} eyebrow={words.eyebrow}
      title={t('pickers.comboTitle', 'Key combo')} where={words.where(t('pickers.comboTitle', 'Key combo'))}
      hints={[{ button: 'Y', label: right ? t('pickers.leftHand', 'Left-hand keys') : t('pickers.rightHand', 'Right-hand keys') }]}
      onPad={button => {
        if (button === 'Y') { setRight(value => !value); return true }
        if (button === 'X') { onBack(); return true }
        return false
      }}>
      <div ref={scope} className={styles.main} style={{ maxWidth: 760 }}>
        <PickerSection label={t('pickers.comboHeld', 'Held with the key')} caption={right ? t('pickers.comboRight', 'The right-hand Ctrl, Shift, Alt and Win') : t('pickers.comboLeft', 'The left-hand Ctrl, Shift, Alt and Win')}>
          <div className={styles.modRow} role="group" aria-label={t('pickers.comboHeld', 'Held with the key')}>
            {MODIFIERS.map(modifier => (
              <button key={modifier.id} type="button" className={styles.mod} data-mod={modifier.id} aria-pressed={mods.has(modifier.id)}
                data-hints={`A:${t('pickers.toggle', 'Toggle')};Y:${right ? t('pickers.leftHand', 'Left-hand keys') : t('pickers.rightHand', 'Right-hand keys')};B:${t('pickers.done', 'Done')}`}
                data-caption={`${right ? 'Right' : 'Left'} ${modifier.label} · held while ${keyCap(key)} is pressed`}
                onClick={() => toggle(modifier.id)}>{right ? `R ${modifier.label}` : modifier.label}</button>
            ))}
          </div>
        </PickerSection>
        <button type="button" className={styles.keyRow} data-combo-key onClick={() => setChoosing(true)}
          data-hints={`A:${t('pickers.change', 'Change')};Y:${right ? t('pickers.leftHand', 'Left-hand keys') : t('pickers.rightHand', 'Right-hand keys')};B:${t('pickers.done', 'Done')}`}>
          <span>{t('pickers.comboKey', 'Key')}</span><b>{keyCap(key)}</b><i>{t('pickers.changeArrow', 'Change ▸')}</i>
        </button>
        <KeyComboArt keys={caps} />
        <p className={styles.searchNote}>{tokens.length > 1
          ? t('pickers.comboNote', '{{input}} sends {{combo}} together.', { input: words.input, combo: caps.join(' + ') })
          : t('pickers.comboNoMods', 'Nothing held: {{input}} sends {{key}} alone.', { input: words.input, key: keyCap(key) })}</p>
      </div>
    </PickerPage>
  )
}
