import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type GlobalChord } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerSupportsInput } from '../utils/controllerStatus'
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
  { titleKey: 'keymap.paddlesTitle', buttons: PADDLE_BUTTONS },
  { titleKey: 'keymap.leftStickTitle', buttons: LEFT_STICK_BUTTONS },
  { titleKey: 'keymap.rightStickTitle', buttons: RIGHT_STICK_BUTTONS },
  { titleKey: 'keymap.extraButtonsTitle', buttons: MISC_BUTTONS },
]
const ALL_BUTTONS = BUTTON_GROUPS.flatMap(group => group.buttons)
const buttonLabel = (command: string) => {
  const definition = ALL_BUTTONS.find(button => button.command.toUpperCase() === command)
  return definition ? controllerButtonLabel(definition) : command
}

const CREATE_NEW = '__create_new__'
const PROFILE_PREFIX = 'profiles-library/'

const profileNameFromPath = (path: string) => path.replace(PROFILE_PREFIX, '').replace(/\.txt$/, '')
const profilePathFromName = (name: string) => `${PROFILE_PREFIX}${name}.txt`

let idCounter = 0
const nextId = () => `chord-${Date.now().toString(36)}-${(idCounter += 1)}`

// Studio's own chords, from any configuration (services/global_chords.rs
// RESERVED_CHORDS: Quick Access + R5, Quick Access + R4). The frame's "Quick
// Access alone opens the Studio quick menu" row is left out: nothing in the
// runtime opens a menu on Quick Access alone; a fresh install binds it to the
// "Quick Access Chord" configuration, which is an ordinary chord listed above.
const RESERVED = [
  { name: 'Pause mapping', description: 'Toggles mapping on and off from anywhere', buttons: ['MISC1', 'RSL'] },
  { name: 'Calibrate gyro', description: 'Starts the calibration HUD', buttons: ['MISC1', 'RSR'] },
]

type GlobalChordsPageProps = {
  /** The chord watcher (services/global_chords.rs) reads chords.json on its own
   *  short poll; this just lets other panels (the profile picker) refresh in sync. */
  onChordsChanged?: () => void
  devices?: TelemetryDevice[]
  reservedChords?: boolean
  onReservedChordsChange?: (enabled: boolean) => void
}

export function GlobalChordsPage({ onChordsChanged, devices, reservedChords = false, onReservedChordsChange }: GlobalChordsPageProps) {
  const { t } = useTranslation()
  const [chords, setChords] = useState<GlobalChord[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
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

  useEffect(() => {
    let disposed = false
    void Promise.all([desktopBridge.listGlobalChords(), desktopBridge.listLibraryProfiles()]).then(([chordList, profileList]) => {
      if (disposed) return
      setChords(chordList)
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

  const toggleButton = (chord: GlobalChord, command: string) => {
    const buttons = chord.buttons.includes(command)
      ? chord.buttons.filter(existing => existing !== command)
      : [...chord.buttons, command]
    void persist({ ...chord, buttons })
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
    await persist({ id: nextId(), buttons: [], profilePath: created.path })
  }

  const addExistingChord = async (name: string) => {
    await persist({ id: nextId(), buttons: [], profilePath: profilePathFromName(name) })
  }

  const keys = (buttons: string[]) => (
    <span className={styles.keys} aria-label={buttons.map(buttonLabel).join(' + ')}>
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
              <div className={styles.row} key={chord.id} data-open={expanded || undefined}>
                <div className={styles.rowHead}>
                  <button type="button" className={styles.rowMain} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : chord.id)} data-hints="A:Edit;B:Back">
                    <span className={styles.rowText}>
                      <span className={styles.rowName}>{name}</span>
                      <span className={styles.rowSub}>{chord.buttons.length ? 'Swaps in while held; release to return' : t('globalChords.pickButtonHint')}</span>
                    </span>
                    {keys(chord.buttons)}
                  </button>
                  <AppSelect aria-label={`Configuration for ${chord.buttons.map(buttonLabel).join(' + ') || 'this chord'}`}
                    value={name}
                    onChange={event => void changeChordProfile(chord, event.target.value)}>
                    {!profiles.includes(name) && <option value={name}>{name}</option>}
                    {profiles.map(profile => <option key={profile} value={profile}>{profile}</option>)}
                    <option value={CREATE_NEW}>{t('globalChords.createNew')}</option>
                  </AppSelect>
                </div>
                {expanded && (
                  <div className={styles.picker}>
                    <span className={styles.pickerLabel}>{t('globalChords.triggerButtons')}</span>
                    <div className={styles.chips}>
                      {ALL_BUTTONS.filter(button => !/^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$/.test(button.command) && (controllerSupportsInput(devices?.[0], button.command) || chord.buttons.includes(button.command))).map(button => {
                        const command = button.command.toUpperCase()
                        const selected = chord.buttons.includes(command)
                        return (
                          <button type="button" key={command} className={styles.chip} aria-pressed={selected} onClick={() => toggleButton(chord, command)}>
                            <InputGlyph command={command} family={family} size={16} />
                            {buttonLabel(command)}
                          </button>
                        )
                      })}
                    </div>
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
          {profiles.map(name => <option key={name} value={name}>{name}</option>)}
        </AppSelect>
      </div>

      <span className={styles.eyebrow}>Reserved</span>
      {onReservedChordsChange && (
        <label className={styles.switchRow}>
          <input type="checkbox" checked={reservedChords} onChange={event => onReservedChordsChange(event.target.checked)} />
          <span>
            <span>Use Studio’s reserved chords</span>
            <small>Quick Access with a back button works in every configuration. Off until you turn it on, so it cannot take over a binding you already use.</small>
          </span>
        </label>
      )}
      <div className={styles.rows}>
        {RESERVED.map(chord => (
          <div className={styles.row} key={chord.name} data-off={!reservedChords || undefined}>
            <div className={styles.rowHead}>
              <span className={styles.rowMain}>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{chord.name}</span>
                  <span className={styles.rowSub}>{chord.description}</span>
                </span>
                {keys(chord.buttons)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Escape must preventDefault, or the same press also reaches the
          page's own handler once the overlay is gone and backs out of Studio. */}
      {confirming && (
        <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(null) } }}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-chord-title" aria-describedby="delete-chord-body">
            <h3 id="delete-chord-title">Remove the {profileNameFromPath(confirming.profilePath)} chord?</h3>
            <p id="delete-chord-body">
              {confirming.buttons.length ? `${confirming.buttons.map(buttonLabel).join(' + ')} stops swapping to it.` : 'It has no buttons yet.'} <strong>{profileNameFromPath(confirming.profilePath)}</strong> stays in your library.
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
