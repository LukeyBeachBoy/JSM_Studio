import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type GlobalChord } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerSupportsInput } from '../utils/controllerStatus'
import { controllerModelKey, controllerVariantLabel } from '../utils/controllerLayouts'
import { showToast } from '../utils/toast'
import { controllerButtonLabel, controllerVisualFamily } from '../utils/controllerStatus'
import { InputGlyph } from './glyphs/InputGlyph'
import {
  BUMPER_BUTTONS,
  CENTER_BUTTONS,
  DPAD_BUTTONS,
  FACE_BUTTONS,
  LEFT_STICK_BUTTONS,
  MISC_BUTTONS,
  PADDLE_BUTTONS,
  RIGHT_STICK_BUTTONS,
  TRIGGER_BUTTONS,
  TOUCH_BUTTONS,
  type ButtonDefinition,
} from '../keymap/schema'
import { AppSelect } from './ui/AppSelect'
import styles from './GlobalChordsPage.module.css'

// A chord is "just a configuration": the button picker below decides when it
// loads, but editing what it *does* happens on the normal config pages, by
// switching the Configuration dropdown to it. No separate editor here.

const BUTTON_GROUPS: Array<{ titleKey: string; buttons: ButtonDefinition[] }> = [
  { titleKey: 'keymap.faceButtonsTitle', buttons: FACE_BUTTONS },
  { titleKey: 'keymap.dpadTitle', buttons: DPAD_BUTTONS },
  { titleKey: 'keymap.bumpersTitle', buttons: BUMPER_BUTTONS },
  { titleKey: 'keymap.triggersTitle', buttons: TRIGGER_BUTTONS },
  { titleKey: 'keymap.centerButtonsTitle', buttons: CENTER_BUTTONS },
  { titleKey: 'keymap.touchpadTitle', buttons: TOUCH_BUTTONS },
  { titleKey: 'keymap.paddlesTitle', buttons: PADDLE_BUTTONS },
  { titleKey: 'keymap.leftStickTitle', buttons: LEFT_STICK_BUTTONS },
  { titleKey: 'keymap.rightStickTitle', buttons: RIGHT_STICK_BUTTONS },
  { titleKey: 'keymap.extraButtonsTitle', buttons: MISC_BUTTONS },
]
const ALL_BUTTONS = BUTTON_GROUPS.flatMap(group => group.buttons)
const buttonLabel = (command: string, family: ReturnType<typeof controllerVisualFamily> = 'generic') => {
  const definition = ALL_BUTTONS.find(button => button.command.toUpperCase() === command)
  return definition ? controllerButtonLabel(definition, family) : command
}

const BUILTIN_NAME = 'Default Global Chords'
const isBuiltin = (chord: GlobalChord) => profileNameFromPath(chord.profilePath) === BUILTIN_NAME

const CREATE_NEW = '__create_new__'
const PROFILE_PREFIX = 'profiles-library/'

const profileNameFromPath = (path: string) => path.replace(PROFILE_PREFIX, '').replace(/\.txt$/, '')
const profilePathFromName = (name: string) => `${PROFILE_PREFIX}${name}.txt`

let idCounter = 0
const nextId = () => `chord-${Date.now().toString(36)}-${(idCounter += 1)}`

type GlobalChordsPageProps = {
  /** The chord watcher (services/global_chords.rs) reads chords.json on its own
   *  short poll; this just lets other panels (the profile picker) refresh in sync. */
  onEditConfiguration?: (name: string) => void
  onChordsChanged?: () => void
  devices?: TelemetryDevice[]
}

export function GlobalChordsPage({ onEditConfiguration, onChordsChanged, devices }: GlobalChordsPageProps) {
  const { t } = useTranslation()
  const [chords, setChords] = useState<GlobalChord[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [protectedChord, setProtectedChord] = useState<GlobalChord | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)
  // A destructive confirmation starts on Cancel (System States 17g): it is the
  // dialog's first control, which useKeyboardNav focuses when the overlay
  // appears. Focusing it here instead would run before that hook records the
  // Remove button as where to return, and B would leave focus nowhere.
  const [confirming, setConfirming] = useState<GlobalChord | null>(null)
  // Disabling the fieldset while a save is in flight drops focus; the pad
  // would otherwise restart from the top of the page after every chip.
  const focusReturn = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (busy || !focusReturn.current) return
    if (focusReturn.current.isConnected) focusReturn.current.focus()
    focusReturn.current = null
  }, [busy])
  // The header's "+ Add chord" asks for a new one.
  useEffect(() => {
    const add = () => void addNewChord()
    window.addEventListener('jsm:add-chord', add)
    return () => window.removeEventListener('jsm:add-chord', add)
  })
  const family = controllerVisualFamily(devices?.[0]?.type)
  const labelButton = (command: string) => buttonLabel(command, family)

  useEffect(() => {
    let disposed = false
    void Promise.all([desktopBridge.listGlobalChords(), desktopBridge.listLibraryProfiles()]).then(([chordList, profileList]) => {
      if (disposed) return
      setChords(chordList.map(chord => ({...chord, triggerGroups: chord.triggerGroups?.length ? chord.triggerGroups : [chord.buttons]})))
      setProfiles(profileList)
      setLoaded(true)
    }).catch(() => {
      if (disposed) return
      setLoaded(true)
      showToast(t('globalChords.saveFailed'), 'error')
    })
    return () => {
      disposed = true
    }
  }, [])

  const persist = async (chord: GlobalChord) => {
    focusReturn.current = document.activeElement as HTMLElement | null
    setBusy(true)
    try { const next = await desktopBridge.saveGlobalChord(chord); setChords(next); onChordsChanged?.() }
    catch { showToast(t('globalChords.saveFailed'), 'error') }
    finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try { const next = await desktopBridge.deleteGlobalChord(id); setChords(next); onChordsChanged?.() }
    catch { showToast(t('globalChords.removeFailed'), 'error') }
    finally { setBusy(false) }
  }

  const groups = (chord: GlobalChord) => chord.triggerGroups?.length ? chord.triggerGroups : [chord.buttons]
  const toggleButton = (chord: GlobalChord, index: number, command: string) => {
    const next = groups(chord).map((buttons, i) => i !== index ? buttons : buttons.includes(command) ? buttons.filter(b => b !== command) : [...buttons, command])
    void persist({ ...chord, buttons: [], triggerGroups: next })
  }

  const rememberProfile = (name: string) => setProfiles(prev => (prev.includes(name) ? prev : [...prev, name].sort((a, b) => a.localeCompare(b))))

  const changeChordProfile = async (chord: GlobalChord, value: string) => {
    if (!value) return
    if (value === CREATE_NEW) {
      const created = await desktopBridge.createLibraryProfile()
      if (!created) {
        showToast(t('globalChords.createFailed'), 'error')
        return
      }
      rememberProfile(created.name)
      void persist({ ...chord, profilePath: created.path })
      return
    }
    void persist({ ...chord, profilePath: profilePathFromName(value) })
  }

  const addNewChord = async () => {
    const created = await desktopBridge.createLibraryProfile()
    if (!created) {
      showToast(t('globalChords.createFailed'), 'error')
      return
    }
    rememberProfile(created.name)
    await persist({ id: nextId(), buttons: [], controllerModel: controllerModelKey(devices?.[0]) || null, profilePath: created.path })
  }

  const addExistingChord = async (name: string) => {
    await persist({ id: nextId(), buttons: [], controllerModel: controllerModelKey(devices?.[0]) || null, profilePath: profilePathFromName(name) })
  }

  const cloneBuiltin = async () => {
    setBusy(true)
    try {
      const source = await desktopBridge.loadLibraryProfile(BUILTIN_NAME)
      if (!source) throw new Error('Could not load the built-in configuration.')
      const created = await desktopBridge.createLibraryProfile('Personal Default Global Chords')
      if (!created || !await desktopBridge.saveLibraryProfile(created.name, source.content)) throw new Error('Could not clone the built-in configuration.')
      let next = chords
      for (const chord of chords.filter(isBuiltin)) next = await desktopBridge.saveGlobalChord({ ...chord, id: nextId(), profilePath: created.path })
      setChords(next); rememberProfile(created.name); onChordsChanged?.(); setProtectedChord(null)
      onEditConfiguration?.(created.name)
    } catch (e) { showToast(String(e), 'error') }
    finally { setBusy(false) }
  }

  const keys = (buttons: string[]) => (
    <span className={styles.keys} aria-label={buttons.map(labelButton).join(' + ')}>
      {buttons.length ? buttons.map((button, index) => <span key={button} className={styles.key}>
        {index > 0 && <span className={styles.plus} aria-hidden="true">+</span>}
        <InputGlyph command={button} family={family} size={22} />
      </span>) : <span className={styles.unset}>No buttons yet</span>}
    </span>
  )

  // Global chords (Tuning and Studio Pages 16g): each chord swaps to a whole
  // configuration while it is held. The row says which buttons and which
  // configuration; opening it picks the buttons.
  return (
    <fieldset className={styles.page} disabled={busy} aria-busy={!loaded || undefined} style={{ border: 0, minWidth: 0, padding: 0 }}>
      <span className={styles.eyebrow}>Swap while held</span>
      {loaded && chords.length === 0 ? (
        <div className={styles.empty}>{t('globalChords.noChords')}</div>
      ) : (
        <div className={styles.rows}>
          {chords.map(chord => {
            const name = profileNameFromPath(chord.profilePath)
            const expanded = open === chord.id
            return (
              <div className={styles.row} key={chord.id} data-open={expanded || undefined} data-nav-disclosure>
                <div className={styles.rowHead}>
                  <button type="button" className={styles.rowMain} data-nav-disclosure-trigger aria-expanded={expanded} onClick={() => setOpen(expanded ? null : chord.id)} data-hints="A:Edit;B:Back">
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{name} {isBuiltin(chord) && <span className={styles.builtinTag}>Built-in</span>}</span>
                      <span className={styles.rowSub}>{groups(chord).some(g => g.length) ? 'Swaps in while held; release to return' : t('globalChords.pickButtonHint')}</span>
                    </span>
                    <span className={styles.triggerAlternatives}>
                      {groups(chord).map((group, i) => <span key={i} className={styles.triggerAlternative}>{i > 0 && <small>or</small>}<span className={styles.keys}>{keys(group)}</span></span>)}
                    </span>
                  </button>
                  <button type="button" className="button button--secondary button--sm" onClick={() => isBuiltin(chord) ? setProtectedChord(chord) : onEditConfiguration?.(name)}>Edit</button>
                  <button type="button" className="button button--secondary button--sm" onClick={() => setConfirming(chord)}>Remove</button>
                  <AppSelect aria-label={`Configuration for ${chord.buttons.map(labelButton).join(' + ') || 'this chord'}`}
                    value={name}
                    onChange={event => void changeChordProfile(chord, event.target.value)}>
                    {!profiles.includes(name) && <option value={name}>{name}</option>}
                    {profiles.map(profile => <option key={profile} value={profile}>{profile}</option>)}
                    <option value={CREATE_NEW}>{t('globalChords.createNew')}</option>
                  </AppSelect>
                </div>
                {expanded && (
                  <div className={styles.picker}>
                    <label>Controller <AppSelect aria-label={`Controller for ${name}`} value={chord.controllerModel ?? ''} onChange={event => void persist({ ...chord, controllerModel: event.target.value || null })}>
                      <option value="">Any controller</option>
                      {[...new Map((devices ?? []).map(device => [controllerModelKey(device), device])).values()].map(device => <option key={controllerModelKey(device)} value={controllerModelKey(device)}>{controllerVariantLabel(device)}</option>)}
                      {chord.controllerModel && !devices?.some(device => controllerModelKey(device) === chord.controllerModel) && <option value={chord.controllerModel}>{chord.controllerModel} (disconnected)</option>}
                    </AppSelect></label>
                    {groups(chord).map((buttons, index) => <div key={index} className={styles.triggerGroup}>
                      <div className={styles.pickerFooter}><span className={styles.pickerLabel}>{index ? 'OR hold these buttons together' : 'Hold these buttons together'}</span>{groups(chord).length > 1 && <button type="button" className="button button--tertiary button--sm" onClick={() => void persist({ ...chord, buttons: [], triggerGroups: groups(chord).filter((_, i) => i !== index) })}>Remove alternative</button>}</div>
                      <div className={styles.chips}>
                        {ALL_BUTTONS.filter(button => !/^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$/.test(button.command) && (controllerSupportsInput(devices?.[0], button.command) || buttons.includes(button.command))).map(button => {
                          const command = button.command.toUpperCase()
                          return <button type="button" key={command} className={styles.chip} aria-pressed={buttons.includes(command)} onClick={() => toggleButton(chord, index, command)}><InputGlyph command={command} family={family} size={16} />{labelButton(command)}</button>
                        })}
                      </div>
                    </div>)}
                    <button type="button" className="button button--secondary button--sm" onClick={() => void persist({ ...chord, buttons: [], triggerGroups: [...groups(chord), []] })}>Add OR alternative</button>
                    <div className={styles.pickerFooter}>
                      <span className={styles.note}>{t('globalChords.editHint')}</span>
                      <button type="button" className="button button--danger button--sm" onClick={() => setConfirming(chord)}>{t('globalChords.remove')}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.addBar}>
        <span className={styles.note}>{t('globalChords.chooseExisting')}</span>
        <AppSelect aria-label={t('globalChords.chooseExisting')} value="" onChange={event => { if (event.target.value) void addExistingChord(event.target.value) }}>
          <option value="">{t('globalChords.chooseExistingPlaceholder')}</option>
          {profiles.filter(name => !chords.some(chord => profileNameFromPath(chord.profilePath) === name)).map(name => <option key={name} value={name}>{name}</option>)}
        </AppSelect>
      </div>

      {protectedChord && <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setProtectedChord(null) } }}>
        <div className="modal-card confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="builtin-chord-title">
          <h3 id="builtin-chord-title">Built-in configuration</h3>
          <p>Built-in configurations cannot be edited or deleted. Clone this layout to create a Personal configuration with your own bindings. Activation buttons can be changed in the chord row.</p>
          <div className="confirm-dialog__actions"><button type="button" className="button button--secondary" data-modal-close onClick={() => setProtectedChord(null)}>Cancel</button><button type="button" className="button" onClick={() => void cloneBuiltin()}>Clone as Personal</button></div>
        </div>
      </div>}

      {/* Escape must preventDefault, or the same press also reaches the
          page's own handler once the overlay is gone and backs out of Studio. */}
      {confirming && (
        <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(null) } }}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-chord-title" aria-describedby="delete-chord-body">
            <h3 id="delete-chord-title">Remove the {profileNameFromPath(confirming.profilePath)} chord?</h3>
            <p id="delete-chord-body">
              {groups(confirming).some(g => g.length) ? `${groups(confirming).map(g => g.map(labelButton).join(' + ')).join(' or ')} stops swapping to it.` : 'It has no buttons yet.'} <strong>{profileNameFromPath(confirming.profilePath)}</strong> stays in your library.
            </p>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" data-modal-close onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger-solid" onClick={() => { const id = confirming.id; setConfirming(null); void remove(id) }}>{t('globalChords.remove')}</button>
            </div>
          </div>
        </div>
      )}
    </fieldset>
  )
}
