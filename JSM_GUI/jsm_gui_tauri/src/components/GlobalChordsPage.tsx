import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type GlobalChord } from '../platform/desktopBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerSupportsInput } from '../utils/controllerStatus'
import { ChordIcon } from './NavIcons'
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

type GlobalChordsPageProps = {
  /** The chord watcher (services/global_chords.rs) reads chords.json on its own
   *  short poll; this just lets other panels (the profile picker) refresh in sync. */
  onChordsChanged?: () => void
  devices?: TelemetryDevice[]
}

export function GlobalChordsPage({ onChordsChanged, devices }: GlobalChordsPageProps) {
  const { t } = useTranslation()
  const [chords, setChords] = useState<GlobalChord[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const family = controllerVisualFamily(devices?.[0]?.type)

  useEffect(() => {
    let disposed = false
    void Promise.all([desktopBridge.listGlobalChords(), desktopBridge.listLibraryProfiles()]).then(([chordList, profileList]) => {
      if (disposed) return
      setChords(chordList)
      setProfiles(profileList)
      setLoaded(true)
    })
    return () => {
      disposed = true
    }
  }, [])

  const persist = async (chord: GlobalChord) => {
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

  return (
    <fieldset className={styles.page} disabled={busy} style={{ border: 0, minWidth: 0, padding: 0 }}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}>
            <ChordIcon />
          </span>
          <div>
            <h2>{t('globalChords.title')}</h2>
            <p>{t('globalChords.description')}</p>
          </div>
        </div>
      </div>

      {loaded && chords.length === 0 ? (
        <div className={styles.empty}>{t('globalChords.noChords')}</div>
      ) : (
        <div className={styles.chordList}>
          {chords.map(chord => (
            <div className={styles.chordRow} key={chord.id}>
              <div className={styles.chordRowHead}>
                <label>
                  {t('globalChords.configuration')}
                  <AppSelect
                    className="app-select"
                    value={profileNameFromPath(chord.profilePath)}
                    onChange={event => void changeChordProfile(chord, event.target.value)}
                  >
                    {!profiles.includes(profileNameFromPath(chord.profilePath)) && (
                      <option value={profileNameFromPath(chord.profilePath)}>{profileNameFromPath(chord.profilePath)}</option>
                    )}
                    {profiles.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={CREATE_NEW}>{t('globalChords.createNew')}</option>
                  </AppSelect>
                </label>
                <button type="button" className="ghost-btn" onClick={() => void remove(chord.id)}>
                  {t('globalChords.remove')}
                </button>
              </div>
              <div className={styles.chordButtonPicker}>
                <span className={styles.chordButtonPickerLabel}>{t('globalChords.triggerButtons')}</span>
                <div className={styles.chordChips}>
                  {ALL_BUTTONS.filter(button => !/^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$/.test(button.command) && (controllerSupportsInput(devices?.[0], button.command) || chord.buttons.includes(button.command))).map(button => {
                    const command = button.command.toUpperCase()
                    const selected = chord.buttons.includes(command)
                    return (
                      <button
                        type="button"
                        key={command}
                        className={`${styles.chordChip} ${selected ? styles.chordChipSelected : ''}`}
                        aria-pressed={selected}
                        onClick={() => toggleButton(chord, command)}
                      >
                        <InputGlyph command={command} family={family} size={16} />
                        {buttonLabel(command)}
                      </button>
                    )
                  })}
                </div>
                {chord.buttons.length === 0 && <p className={styles.chordHint}>{t('globalChords.pickButtonHint')}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.addBar}>
        <button type="button" className="secondary-btn" onClick={() => void addNewChord()}>
          {t('globalChords.createNewEntry')}
        </button>
        <label>
          {t('globalChords.chooseExisting')}
          <AppSelect
            className="app-select"
            value=""
            onChange={event => {
              if (event.target.value) void addExistingChord(event.target.value)
            }}
          >
            <option value="">{t('globalChords.chooseExistingPlaceholder')}</option>
            {profiles.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </AppSelect>
        </label>
      </div>

      <p className={styles.chordFooterHint}>{t('globalChords.editHint')}</p>
    </fieldset>
  )
}
