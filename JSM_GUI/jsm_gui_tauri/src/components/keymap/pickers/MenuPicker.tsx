import { useContext, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, PickerSection, useRefocusOn } from './PickerPage'
import { usePickerWords } from './pickerShared'
import { MenuShapeArt } from './PickerArt'
import { LayerUsageContext } from '../../LayerBar'
import { readVirtualMenus } from '../../../utils/virtualMenus'
import { parseMenuCommand } from '../../../utils/menuCommands'
import styles from './Pickers.module.css'

// Open a menu · which, and how (console v2, PickerFamily). The configuration's
// menus as tiles with their shape and size, and one "How" for all of them --
// Hold, Open, Close, Toggle -- changed with ◂ ▸ on whichever menu is focused.
// No menus yet: say so, and offer the way to the Menus tab.

type Verb = 'HOLD' | 'OPEN' | 'CLOSE' | 'TOGGLE'
const VERBS: { verb: Verb; label: string; caption: string }[] = [
  { verb: 'HOLD', label: 'Hold', caption: 'Hold: open while held, let go to pick.' },
  { verb: 'OPEN', label: 'Open', caption: 'Open: opens it and keeps it open until you pick, close or toggle it.' },
  { verb: 'CLOSE', label: 'Close', caption: 'Close: closes it without picking anything.' },
  { verb: 'TOGGLE', label: 'Toggle', caption: 'Toggle: opens it, or closes it if it is already open.' },
]

export function MenuPicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onSearch } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const { text = '' } = useContext(LayerUsageContext)
  const menus = readVirtualMenus(text).menus
  const current = parseMenuCommand(command.outputValue)
  const [verb, setVerb] = useState<Verb>((current?.verb as Verb | undefined) ?? 'HOLD')
  const list = useRef<HTMLDivElement>(null)
  useRefocusOn(list, 'menus', ['[data-current="true"]', 'button'])
  const at = VERBS.findIndex(item => item.verb === verb)
  const step = (by: 1 | -1) => setVerb(VERBS[Math.min(VERBS.length - 1, Math.max(0, at + by))].verb)
  const verbLabel = (item: typeof VERBS[number]) => t(`pickers.menuVerb.${item.verb}`, item.label)
  const verbCaption = (item: typeof VERBS[number]) => t(`pickers.menuVerbCaption.${item.verb}`, item.caption)

  const choose = (id: string) => {
    if (props.allowedOutputKinds && !props.allowedOutputKinds.includes('command')) return
    onSelect({ outputKind: 'command', outputValue: `MENU_${verb} ${id}`, outputBehavior: 'normal', ...(verb === 'HOLD' && ['release', 'turbo'].includes(command.triggerKind) ? { triggerKind: 'regular' as const } : {}) })
    onClose()
  }
  const makeOne = () => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'virtualMenus' })) }
  const onArrows = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault(); event.stopPropagation()
    step(event.key === 'ArrowRight' ? 1 : -1)
  }
  const size = (type: string, count: number) => type === 'RADIAL'
    ? t('pickers.menuSlices', '{{count}} slices', { count })
    : type === 'HOTBAR' ? t('pickers.menuSlots', '{{count}} slots', { count }) : t('pickers.menuCells', '{{count}} cells', { count })

  return (
    <PickerPage kind="menu" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.menuTitle', 'Open a menu')}
      where={words.where(t('pickers.menuTitle', 'Open a menu'))}
      hints={onSearch ? [{ button: 'Y', label: t('pickers.search', 'Search') }] : undefined}
      onPad={button => { if (button === 'Y' && onSearch) { onSearch(); return true } return false }}>
      <div ref={list} className={styles.main} style={{ maxWidth: 820 }}>
        <PickerSection label={t('pickers.menuWhich', 'Which menu')} caption={menus.length ? t('pickers.menuCount', '{{count}} in this configuration', { count: menus.length }) : undefined}>
          {menus.length === 0 && (
            <div className={styles.empty}>
              <h3>{t('pickers.menuNoneTitle', 'No menus yet')}</h3>
              <p>{t('pickers.menuNoneBody', 'A menu puts many actions on one button: a weapon wheel, a grid, a hotbar. Make one on the Menus tab, then come back to choose how {{input}} opens it.', { input: words.input })}</p>
            </div>
          )}
          {menus.map(menu => {
            const isCurrent = current?.id === menu.id
            const count = menu.actions.length
            return (
              <button key={menu.id} type="button" className={`${styles.tile} ${styles.plainTile}`} data-menu={menu.id} data-arrows="horizontal"
                data-current={isCurrent ? 'true' : undefined} aria-pressed={isCurrent}
                aria-label={`${menu.name} · ${verbLabel(VERBS[at])}`}
                data-caption={verbCaption(VERBS[at])}
                data-hints={`MOVE:${t('pickers.how', 'How')};A:${t('pickers.useNamed', 'Use {{name}}', { name: `${verbLabel(VERBS[at])} ${menu.name}` })}${onSearch ? `;Y:${t('pickers.search', 'Search')}` : ''}`}
                onKeyDown={onArrows} onClick={() => choose(menu.id)}>
                <span className={styles.ghostIcon}><MenuShapeArt type={menu.type} count={count} size={28} /></span>
                {menu.name}
                <span className={styles.tileSub}>{size(menu.type, count)}{isCurrent ? ` · ${t('pickers.current', 'current')}` : ''}</span>
              </button>
            )
          })}
          <button type="button" className={`${styles.tile} ${styles.plainTile} ${styles.ghostTile}`} data-make-menu
            data-hints={`A:${t('pickers.goToMenus', 'Go to Menus')}`}
            data-caption={t('pickers.makeMenuCaption', 'Opens the Menus tab: wheels, grids and hotbars')}
            onClick={makeOne}>
            {t('pickers.makeMenu', '+ Make a menu on the Menus tab')}
          </button>
        </PickerSection>
        {/* No menus: nothing for How to apply to yet (UX review 2026-10-09). */}
        {menus.length > 0 && <PickerSection label={t('pickers.how', 'How')} caption={t('pickers.howCaption', 'How {{input}} opens it', { input: words.input })}>
          <div className={styles.seg} role="radiogroup" aria-label={t('pickers.how', 'How')}>
            {VERBS.map(item => <span key={item.verb} role="radio" aria-checked={item.verb === verb} data-on={item.verb === verb ? 'true' : undefined} onClick={() => setVerb(item.verb)}>{verbLabel(item)}</span>)}
          </div>
          <span className={styles.segCaption} aria-live="polite">{verbCaption(VERBS[at])}</span>
        </PickerSection>}
      </div>
    </PickerPage>
  )
}
