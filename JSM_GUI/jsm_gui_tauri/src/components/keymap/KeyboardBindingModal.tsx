import { useEffect, useId } from 'react'
import { useTranslation } from 'react-i18next'
import styles from './KeyboardBindingModal.module.css'

type KeyboardBindingModalProps = {
  isOpen: boolean
  value: string
  onSelect: (token: string) => void
  onClose: () => void
}

// A key on the drawn keyboard: the JSM token it writes, the face label the user
// reads, and how many units wide it is (1u = one letter key).
type KeyDef = { token: string; label?: string; width?: number }

const row = (...keys: Array<KeyDef | string>): KeyDef[] =>
  keys.map(key => (typeof key === 'string' ? { token: key } : key))

const letters = (source: string) => source.split('').map(letter => ({ token: letter }))

// US layout. Tokens are the names JoyShockMapper's key parser accepts -- that is
// the whole point of this picker: the face label is what you look for, the token
// is what gets written.
const MAIN_ROWS: KeyDef[][] = [
  row(
    { token: 'ESC', label: 'Esc' },
    ...Array.from({ length: 12 }, (_, index) => ({ token: `F${index + 1}` })),
    { token: 'SCREENSHOT', label: 'PrtSc', width: 1.25 },
    { token: 'SCROLL_LOCK', label: 'ScrLk', width: 1.25 }
  ),
  row(
    { token: '`' },
    ...letters('1234567890'),
    { token: '-' },
    { token: '=' },
    { token: 'BACKSPACE', label: 'Backspace', width: 2 }
  ),
  row(
    { token: 'TAB', label: 'Tab', width: 1.5 },
    ...letters('QWERTYUIOP'),
    { token: '[' },
    { token: ']' },
    { token: '\\', width: 1.5 }
  ),
  row(
    { token: 'CAPS_LOCK', label: 'Caps', width: 1.75 },
    ...letters('ASDFGHJKL'),
    { token: ';' },
    { token: "'" },
    { token: 'ENTER', label: 'Enter', width: 2.25 }
  ),
  row(
    { token: 'LSHIFT', label: 'Shift', width: 2.25 },
    ...letters('ZXCVBNM'),
    { token: ',' },
    { token: '.' },
    { token: '/' },
    { token: 'RSHIFT', label: 'Shift', width: 2.75 }
  ),
  row(
    { token: 'LCONTROL', label: 'Ctrl', width: 1.25 },
    { token: 'LWINDOWS', label: 'Win', width: 1.25 },
    { token: 'LALT', label: 'Alt', width: 1.25 },
    { token: 'SPACE', label: 'Space', width: 6.25 },
    { token: 'RALT', label: 'Alt', width: 1.25 },
    { token: 'RWINDOWS', label: 'Win', width: 1.25 },
    { token: 'CONTEXT', label: 'Menu', width: 1.25 },
    { token: 'RCONTROL', label: 'Ctrl', width: 1.25 }
  ),
]

const NAV_ROWS: KeyDef[][] = [
  row({ token: 'INSERT', label: 'Ins' }, { token: 'HOME', label: 'Home' }, { token: 'PAGEUP', label: 'PgUp' }),
  row({ token: 'DELETE', label: 'Del' }, { token: 'END', label: 'End' }, { token: 'PAGEDOWN', label: 'PgDn' }),
  [],
  row({ token: 'SPACER' }, { token: 'UP', label: '↑' }, { token: 'SPACER' }),
  row({ token: 'LEFT', label: '←' }, { token: 'DOWN', label: '↓' }, { token: 'RIGHT', label: '→' }),
]

const NUMPAD_ROWS: KeyDef[][] = [
  row({ token: 'NUM_LOCK', label: 'Num' }, { token: 'DIVIDE', label: '/' }, { token: 'MULTIPLY', label: '*' }, { token: 'SUBTRACT', label: '-' }),
  row({ token: 'N7', label: '7' }, { token: 'N8', label: '8' }, { token: 'N9', label: '9' }, { token: 'ADD', label: '+' }),
  // The trailing spacers stand in for the double-height + and Enter keys, so
  // every numpad row still lines up in the same four columns.
  row({ token: 'N4', label: '4' }, { token: 'N5', label: '5' }, { token: 'N6', label: '6' }, { token: 'SPACER' }),
  row({ token: 'N1', label: '1' }, { token: 'N2', label: '2' }, { token: 'N3', label: '3' }, { token: 'SPACER' }),
  row({ token: 'N0', label: '0', width: 2 }, { token: 'DECIMAL', label: '.' }, { token: 'SPACER' }),
]

// Media and volume keys have no place on the drawn keyboard but are still
// keyboard output, so they get their own strip rather than needing the token
// typed by hand.
const MEDIA_KEYS: KeyDef[] = row(
  { token: 'MUTE', label: 'Mute', width: 2 },
  { token: 'VOLUME_DOWN', label: 'Vol -', width: 2 },
  { token: 'VOLUME_UP', label: 'Vol +', width: 2 },
  { token: 'PREV_TRACK', label: 'Prev', width: 2 },
  { token: 'PLAY_PAUSE', label: 'Play', width: 2 },
  { token: 'NEXT_TRACK', label: 'Next', width: 2 },
  { token: 'STOP_TRACK', label: 'Stop', width: 2 }
)

export function KeyboardBindingModal({ isOpen, value, onSelect, onClose }: KeyboardBindingModalProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const selected = value.trim().toUpperCase()

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const renderKey = (key: KeyDef, index: number) => {
    if (key.token === 'SPACER') {
      return <span key={`spacer-${index}`} className={styles.key} style={{ flexGrow: key.width ?? 1 }} aria-hidden="true" />
    }
    const isSelected = selected === key.token.toUpperCase()
    return (
      <button
        key={key.token}
        type="button"
        className={`${styles.key} ${isSelected ? styles.keySelected : ''}`}
        style={{ flexGrow: key.width ?? 1 }}
        title={key.token}
        aria-pressed={isSelected}
        onClick={() => {
          onSelect(key.token)
          onClose()
        }}
      >
        <span className={styles.keyLabel}>{key.label ?? key.token}</span>
      </button>
    )
  }

  const renderRows = (rows: KeyDef[][], keyPrefix: string) =>
    rows.map((keys, index) => (
      <div key={`${keyPrefix}-${index}`} className={keys.length === 0 ? styles.rowGap : styles.keyRow}>
        {keys.map(renderKey)}
      </div>
    ))

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose} data-capture-ignore="true">
      <div
        className={`modal-card ${styles.modal}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={event => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 id={titleId}>{t('keymap.keyboardPickerTitle')}</h3>
            <p className={styles.intro}>{t('keymap.keyboardPickerIntro')}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div className={styles.keyboard}>
          <div className={styles.mainBlock}>{renderRows(MAIN_ROWS, 'main')}</div>
          <div className={styles.sideBlocks}>
            <div className={styles.navBlock}>{renderRows(NAV_ROWS, 'nav')}</div>
            <div className={styles.numpadBlock}>{renderRows(NUMPAD_ROWS, 'num')}</div>
          </div>
        </div>

        <div className={styles.mediaSection}>
          <span className={styles.sectionLabel}>{t('keymap.keyboardPickerMedia')}</span>
          <div className={styles.keyRow}>{MEDIA_KEYS.map(renderKey)}</div>
        </div>
      </div>
    </div>
  )
}
