import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ActionPickerProps } from '../ActionPicker'
import { PickerPage, PickerSection, useRefocusOn } from './PickerPage'
import { usePickerWords } from './pickerShared'
import { FlatCover } from './PickerArt'
import { loadConfigBindingValue, loadConfigBindingName } from '../../../utils/loadConfigBinding'
import { useProfileAssociation } from '../../../hooks/useAppIcon'
import { AppIconImage } from '../../AppIconImage'
import { desktopBridge } from '../../../platform/desktopBridge'
import styles from './Pickers.module.css'

// Load a configuration · cover shelf (console v2, PickerFamily). The library as
// covers: the one you are in dimmed ("You're in it"), the others with their
// game's art or a flat cover, bases told apart by their mark. The caption says
// what pressing the button will do.

/** A base is a file with no RESET_MAPPINGS (IMPLEMENTATION D24). */
const isBaseText = (text: string) => !text.split(/\r?\n/).some(line => /^RESET_MAPPINGS\b/i.test(line.trim()))

function useBases(names: string[]) {
  const [bases, setBases] = useState<Set<string>>(new Set())
  const key = names.join('\u0000')
  useEffect(() => {
    let cancelled = false
    Promise.all(names.map(name => desktopBridge.loadLibraryProfile(name).then(file => (file && isBaseText(file.content) ? name : null)).catch(() => null)))
      .then(found => { if (!cancelled) setBases(new Set(found.filter((name): name is string => Boolean(name)))) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return bases
}

function Cover({ name, current, base, picked, onPick, onFocus, hints }: { name: string; current: boolean; base: boolean; picked: boolean; onPick: () => void; onFocus: () => void; hints: string }) {
  const { t } = useTranslation()
  const game = useProfileAssociation(name)
  return (
    <button type="button" className={`${styles.cover} ${base ? styles.coverBase : ''}`} data-config={name}
      data-current={current ? 'true' : undefined} aria-pressed={picked}
      aria-disabled={current ? 'true' : undefined} data-reason={current ? t('pickers.configYoureIn', 'You’re in {{name}}: loading it again changes nothing', { name }) : undefined}
      data-caption={base ? t('pickers.configBaseCaption', '{{name}} · a base: other configurations build on it', { name }) : game?.exePath ? t('pickers.configGameCaption', '{{name}} · launches with its game', { name }) : name}
      data-hints={current ? 'B:Back' : hints}
      onFocus={onFocus} onMouseEnter={() => { if (document.body.dataset.inputSource === 'mouse') onFocus() }} onClick={() => { if (!current) onPick() }}>
      <span className={styles.coverArt}>
        {base
          ? <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>
          : game?.exePath ? <AppIconImage exePath={game.exePath} size={56} alt="" fallback={<FlatCover name={name} />} /> : <FlatCover name={name} />}
      </span>
      <span className={styles.coverText}>
        {current && <span>{t('pickers.configYoureInShort', 'You’re in it')}</span>}
        {base && !current && <span>{t('pickers.configBase', 'Base')}</span>}
        <b>{name}</b>
      </span>
    </button>
  )
}

export function ConfigPicker(props: ActionPickerProps & { onSearch?: () => void }) {
  const { inputLabel, command, onSelect, onClose, onSearch, libraryProfiles = [], currentProfileName } = props
  const { t } = useTranslation()
  const words = usePickerWords(inputLabel, command)
  const bases = useBases(libraryProfiles)
  const picked = command.outputKind === 'loadConfig' ? loadConfigBindingName(command.outputValue) : null
  // The current configuration first, then the others; bases after them.
  const names = [...libraryProfiles].sort((a, b) => Number(b === currentProfileName) - Number(a === currentProfileName) || Number(bases.has(a)) - Number(bases.has(b)))
  const [focused, setFocused] = useState<string | null>(picked ?? names.find(name => name !== currentProfileName) ?? null)
  const shelf = useRef<HTMLDivElement>(null)
  useRefocusOn(shelf, 'config', [picked ? `[data-config="${CSS.escape(picked)}"]` : '[data-config]:not([data-current])', '[data-config]:not([data-current])', 'button'])
  const choose = (name: string) => {
    if (props.allowedOutputKinds && !props.allowedOutputKinds.includes('loadConfig')) return
    onSelect({ outputKind: 'loadConfig', outputValue: loadConfigBindingValue(name) })
    onClose()
  }
  const hints = `A:${t('pickers.use', 'Use')}${onSearch ? `;Y:${t('pickers.search', 'Search')}` : ''}`
  const caption = focused && focused !== currentProfileName
    ? t('pickers.configSwitches', 'Switches to {{name}} when you {{activation}} {{input}}', { name: focused, activation: words.activation.toLowerCase(), input: words.input })
    : focused ? t('pickers.configYoureInShort', 'You’re in it') : ''

  return (
    <PickerPage kind="config" onClose={onClose} input={command.physicalInput} eyebrow={words.eyebrow} title={t('pickers.configTitle', 'Load a configuration')}
      where={words.where(t('pickers.configTitle', 'Load a configuration'))}
      hints={onSearch ? [{ button: 'Y', label: t('pickers.search', 'Search') }] : undefined}
      onPad={button => { if (button === 'Y' && onSearch) { onSearch(); return true } return false }}>
      <div className={styles.main}>
        {libraryProfiles.filter(name => name !== currentProfileName).length === 0 ? (
          <div className={styles.empty} ref={shelf}>
            <h3>{t('pickers.configNoneTitle', 'Nothing else to switch to yet')}</h3>
            <p>{t('pickers.configNoneBody', 'Load a configuration switches {{input}} to another configuration in your library. Yours has only this one so far: make or import another in the Library, then come back.', { input: words.input })}</p>
            <button type="button" className={`${styles.tile} ${styles.plainTile} ${styles.ghostTile}`} data-hints="A:Open the Library"
              onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('jsm:open-page', { detail: 'configurations' })) }}>
              {t('pickers.configOpenLibrary', 'Open the Library')}
            </button>
          </div>
        ) : (
          <PickerSection label={t('pickers.configLibrary', 'Your library')} caption={t('pickers.configCount', '{{count}} configurations', { count: libraryProfiles.length })}>
            <div ref={shelf} className={styles.shelf} role="group" aria-label={t('pickers.configLibrary', 'Your library')}>
              {names.map(name => <Cover key={name} name={name} current={name === currentProfileName} base={bases.has(name)} picked={name === picked}
                onFocus={() => setFocused(name)} onPick={() => choose(name)} hints={hints} />)}
            </div>
            <span className={styles.shelfCaption} aria-live="polite">{caption}</span>
          </PickerSection>
        )}
      </div>
    </PickerPage>
  )
}
