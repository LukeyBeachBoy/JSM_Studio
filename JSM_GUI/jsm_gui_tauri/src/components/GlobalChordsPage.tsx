import { useEffect, useRef, useState } from 'react'
import { desktopBridge, type GlobalChord } from '../platform/desktopBridge'
import { shellBridge } from '../platform/shellBridge'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { controllerSupportsInput, controllerButtonLabel, controllerVisualFamily } from '../utils/controllerStatus'
import { controllerModelKey, controllerVariantLabel } from '../utils/controllerLayouts'
import { showToast } from '../utils/toast'
import { InputGlyph } from './glyphs/InputGlyph'
import {
  BUMPER_BUTTONS, CENTER_BUTTONS, DPAD_BUTTONS, FACE_BUTTONS, LEFT_STICK_BUTTONS, MISC_BUTTONS, PADDLE_BUTTONS,
  RIGHT_STICK_BUTTONS, TRIGGER_BUTTONS, TOUCH_BUTTONS, type ButtonDefinition,
} from '../keymap/schema'
import { OpenRow, SubPage } from './ui/console'
import { SettingsNote, SettingsSection } from './settings/SettingsKit'
import { usePressCapture } from './settings/usePressCapture'
import { useShell } from '../shell/ShellContext'
import settingsStyles from './settings/Settings.module.css'
import styles from './GlobalChordsPage.module.css'

// Settings ▸ Hold to swap (console v2, SettingsHoldToSwap.dc.html and
// SettingsHoldToSwapCopy): hold a button, or a few together, to swap in a
// whole other configuration; let go to come back. Each entry is a card with a
// Holding / Let go picture. A changes the buttons by pressing them, X opens
// the configuration to edit what it does, Y the rest (order, controller,
// configuration, remove). When two match, the higher card wins.

const ALL_BUTTONS: ButtonDefinition[] = [FACE_BUTTONS, DPAD_BUTTONS, BUMPER_BUTTONS, TRIGGER_BUTTONS, CENTER_BUTTONS, TOUCH_BUTTONS, PADDLE_BUTTONS, LEFT_STICK_BUTTONS, RIGHT_STICK_BUTTONS, MISC_BUTTONS].flat()

export const BUILTIN_NAME = 'Default Global Chords'
/** The built-in entry's name on screen (console v2: "Quick tools"). */
export const BUILTIN_DISPLAY = 'Quick tools'
const COPY_NAME = 'My Quick tools'
const PROFILE_PREFIX = 'profiles-library/'
const profileNameFromPath = (path: string) => path.replace(PROFILE_PREFIX, '').replace(/\.txt$/, '')
const profilePathFromName = (name: string) => `${PROFILE_PREFIX}${name}.txt`
const isBuiltin = (chord: GlobalChord) => profileNameFromPath(chord.profilePath) === BUILTIN_NAME
const displayName = (chord: GlobalChord) => isBuiltin(chord) ? BUILTIN_DISPLAY : profileNameFromPath(chord.profilePath)
const groupsOf = (chord: GlobalChord) => chord.triggerGroups?.length ? chord.triggerGroups : [chord.buttons]

let idCounter = 0
const nextId = () => `chord-${Date.now().toString(36)}-${(idCounter += 1)}`

type GlobalChordsPageProps = {
  /** Open a configuration to edit what it does. */
  onEditConfiguration?: (name: string) => void
  onChordsChanged?: () => void
  devices?: TelemetryDevice[]
  /** The configuration live under the swap ("Let go · Wardogs"). */
  currentName?: string | null
}

/** Holding / Let go: the swapped-in configuration over the one you come back to. */
function SwapPicture({ holding, letGo }: { holding: string; letGo: string }) {
  return (
    <span className={styles.picture} aria-hidden="true">
      <span className={styles.paneHolding}><small>Holding</small><b>{holding}</b></span>
      <span className={styles.paneLetGo}><small>Let go</small><b>{letGo}</b></span>
    </span>
  )
}

export function GlobalChordsPage({ onEditConfiguration, onChordsChanged, devices, currentName }: GlobalChordsPageProps) {
  const shell = useShell()
  const family = devices?.[0] ? controllerVisualFamily(devices[0].type) : shell.family
  const [chords, setChords] = useState<GlobalChord[]>([])
  const [profiles, setProfiles] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  // The entry whose Y page is open, the one its buttons are being pressed for,
  // the "Add one" page, and a removal waiting for its answer.
  const [entry, setEntry] = useState<string | null>(null)
  const [capturingFor, setCapturingFor] = useState<{ id: string; group: number } | null>(null)
  const [adding, setAdding] = useState(false)
  const [listFor, setListFor] = useState<{ id: string; group: number } | null>(null)
  const [confirming, setConfirming] = useState<GlobalChord | null>(null)
  const [copying, setCopying] = useState<GlobalChord | null>(null)
  const focusAfter = useRef<string | null>(null)

  useEffect(() => {
    let disposed = false
    void Promise.all([desktopBridge.listGlobalChords(), desktopBridge.listLibraryProfiles()]).then(([chordList, profileList]) => {
      if (disposed) return
      setChords(chordList.map(chord => ({ ...chord, triggerGroups: groupsOf(chord) })))
      setProfiles(profileList)
      setLoaded(true)
    }).catch(() => { if (!disposed) { setLoaded(true); showToast('Could not read Hold to swap.', 'error') } })
    return () => { disposed = true }
  }, [])
  useEffect(() => {
    if (!focusAfter.current) return
    document.querySelector<HTMLElement>(`[data-chord-card="${CSS.escape(focusAfter.current)}"]`)?.focus()
    focusAfter.current = null
  }, [chords])

  const persist = async (chord: GlobalChord) => {
    setBusy(true)
    try { const next = await desktopBridge.saveGlobalChord(chord); if (next.length || !chords.length) setChords(next.map(item => ({ ...item, triggerGroups: groupsOf(item) }))); onChordsChanged?.() }
    catch { showToast('Could not save Hold to swap.', 'error') }
    finally { setBusy(false) }
  }
  const remove = async (id: string) => {
    setBusy(true)
    try { const next = await desktopBridge.deleteGlobalChord(id); setChords(next.map(item => ({ ...item, triggerGroups: groupsOf(item) }))); onChordsChanged?.() }
    catch { showToast('Could not remove it.', 'error') }
    finally { setBusy(false) }
  }
  const move = async (id: string, direction: -1 | 1) => {
    const index = chords.findIndex(chord => chord.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= chords.length) return
    const next = [...chords]
    ;[next[index], next[target]] = [next[target], next[index]]
    setChords(next)
    const saved = await shellBridge.reorderGlobalChords(next.map(chord => chord.id)).catch(() => null)
    if (saved) setChords(saved.map(item => ({ ...item, triggerGroups: groupsOf(item) })))
    onChordsChanged?.()
  }

  // A on a card, or "X then press the buttons": the press sets that way to hold it.
  const capture = usePressCapture(buttons => {
    const target = capturingFor && chords.find(chord => chord.id === capturingFor.id)
    if (!target) return
    const groups = [...groupsOf(target)]
    groups[capturingFor.group] = buttons
    focusAfter.current = target.id
    void persist({ ...target, buttons: [], triggerGroups: groups.filter(group => group.length) })
    setCapturingFor(null)
  })
  const pressFor = (id: string, group: number) => { setCapturingFor({ id, group }); capture.start() }
  useEffect(() => { if (!capture.capturing && capturingFor) setCapturingFor(null) }, [capture.capturing])

  const addWith = async (name: string | null) => {
    setAdding(false)
    let path: string
    if (name === null) {
      const created = await desktopBridge.createLibraryProfile()
      if (!created) { showToast('Could not make a new configuration.', 'error'); return }
      setProfiles(previous => [...previous, created.name])
      path = created.path
    } else path = profilePathFromName(name)
    const id = nextId()
    await persist({ id, buttons: [], triggerGroups: [[]], controllerModel: null, profilePath: path })
    // It works as soon as you pick: press the buttons for it now.
    pressFor(id, 0)
  }

  const makeCopy = async (chord: GlobalChord) => {
    setBusy(true)
    try {
      const source = await desktopBridge.loadLibraryProfile(BUILTIN_NAME)
      if (!source) throw new Error('Could not read Quick tools.')
      const created = await desktopBridge.createLibraryProfile(COPY_NAME)
      if (!created || !await desktopBridge.saveLibraryProfile(created.name, source.content)) throw new Error('Could not make the copy.')
      const next = await desktopBridge.saveGlobalChord({ ...chord, profilePath: created.path })
      setChords(next.map(item => ({ ...item, triggerGroups: groupsOf(item) })))
      setProfiles(previous => [...previous, created.name])
      onChordsChanged?.()
      setCopying(null)
      setEntry(null)
      onEditConfiguration?.(created.name)
    } catch (error) { showToast(String(error instanceof Error ? error.message : error), 'error') }
    finally { setBusy(false) }
  }

  const keys = (buttons: string[]) => buttons.length
    ? <span className={styles.keys} aria-label={buttons.map(command => { const known = ALL_BUTTONS.find(button => button.command.toUpperCase() === command); return known ? controllerButtonLabel(known, family) : command }).join(' + ')}>
        {buttons.map((button, index) => <span key={button} className={styles.key}>{index > 0 && <span className={styles.plus} aria-hidden="true">+</span>}<InputGlyph command={button} family={family} size={24} /></span>)}
      </span>
    : <span className={styles.unset}>No buttons yet</span>
  const holdLine = (chord: GlobalChord) => {
    const groups = groupsOf(chord).filter(group => group.length)
    return groups.length ? <>Hold {groups.map((group, index) => <span key={index}>{index > 0 && <span className={styles.or}> or </span>}{keys(group)}</span>)}</> : <span className={styles.unset}>No buttons yet · A presses them</span>
  }
  const controllerText = (chord: GlobalChord) => {
    if (!chord.controllerModel) return 'Any controller'
    const device = devices?.find(item => controllerModelKey(item) === chord.controllerModel)
    return device ? `${controllerVariantLabel(device)} only` : `${chord.controllerModel} only · not connected`
  }
  const letGo = currentName ?? 'This game'
  const open = chords.find(chord => chord.id === entry) ?? null
  const usedNames = new Set(chords.map(chord => profileNameFromPath(chord.profilePath)))

  return (
    <div className={styles.page} aria-busy={!loaded || busy || undefined}>
      <div className={styles.explainer}>
        <SwapPicture holding="Another configuration" letGo={letGo} />
        <p>Hold a button to use another whole configuration. Let go to return to the one you were using.</p>
      </div>

      <div className={styles.cards} role="list" aria-label="Hold to swap · the higher card wins">
        {chords.map((chord, index) => (
          <div key={chord.id} role="listitem" className={styles.cardWrap}>
            <button type="button" className={styles.card} data-chord-card={chord.id} data-builtin={isBuiltin(chord) ? 'true' : undefined}
              data-hints={`A:Change buttons;X:${isBuiltin(chord) ? 'Make your own copy' : 'Edit configuration'};Y:Move, controller, remove…;B:Home`} data-pad-keys="XY"
              data-caption={`${displayName(chord)} · ${index === 0 ? 'Wins when two match' : `Number ${index + 1} in the order`} · ${controllerText(chord)}`}
              onKeyDown={event => {
                if (event.key === 'x' || event.key === 'X') { event.preventDefault(); if (isBuiltin(chord)) setCopying(chord); else onEditConfiguration?.(profileNameFromPath(chord.profilePath)) }
                if (event.key === 'y' || event.key === 'Y') { event.preventDefault(); setEntry(chord.id) }
              }}
              onClick={() => pressFor(chord.id, 0)}>
              <SwapPicture holding={displayName(chord)} letGo={letGo} />
              <span className={styles.cardText}>
                <span className={styles.cardName}>{displayName(chord)}{isBuiltin(chord) && <span className={settingsStyles.tag}>Built-in</span>}</span>
                <span className={styles.cardHold}>{holdLine(chord)}</span>
                <span className={styles.cardSub}>{isBuiltin(chord) ? 'On-screen keyboard, pause mapping, calibrate gyro · ' : ''}{controllerText(chord)}</span>
              </span>
              <span className={styles.rank} aria-hidden="true">{index + 1}</span>
            </button>
          </div>
        ))}
        <div role="listitem" className={styles.cardWrap}>
          <button type="button" className={`${styles.card} ${styles.add}`} data-hints="A:Add one;B:Home" onClick={() => setAdding(true)}
            data-caption="Add one · from your library, or start a new one. It works as soon as you pick">
            <span className={styles.addMark} aria-hidden="true">+</span>
            <span className={styles.cardText}><span className={styles.cardName}>Add one</span><span className={styles.cardSub}>From your library, or start a new one. It works as soon as you pick.</span></span>
          </button>
        </div>
      </div>
      {loaded && <SettingsNote>When two match, the higher card wins.</SettingsNote>}

      {/* Pressing the buttons: a sheet over the page while the pad is read raw. */}
      {capture.capturing && (
        <SubPage open onClose={capture.cancel} crumbRoot="Settings" trail={['Hold to swap']} title="Press the buttons together" backLabel="Cancel">
          <div className={settingsStyles.mainColumn}>
            <p>Hold them all, then let go. {capture.held.length ? keys(capture.held) : 'Waiting for a press…'}</p>
            <button type="button" className="button button--secondary" onClick={capture.cancel} data-hints="A:Cancel;B:Cancel">Cancel</button>
          </div>
        </SubPage>
      )}

      <SubPage open={adding} onClose={() => setAdding(false)} crumbRoot="Settings" trail={['Hold to swap']} title="Add one" backLabel="Back to Hold to swap">
        <div className={settingsStyles.mainColumn} style={{ maxWidth: 760 }}>
          <OpenRow label="Start a new one" hint="An empty configuration, swapped in while you hold" onOpen={() => void addWith(null)} hints="A:Start a new one;B:Back" />
          <SettingsSection title="From your library">
            {profiles.filter(name => !usedNames.has(name) && name !== BUILTIN_NAME).map(name => (
              <OpenRow key={name} label={name} onOpen={() => void addWith(name)} hints="A:Use this;B:Back" />
            ))}
          </SettingsSection>
        </div>
      </SubPage>

      <SubPage open={open !== null} onClose={() => setEntry(null)} crumbRoot="Settings" trail={['Hold to swap']} title={open ? displayName(open) : ''} backLabel="Back to Hold to swap">
        {open && (() => {
          const index = chords.findIndex(chord => chord.id === open.id)
          const groups = groupsOf(open)
          const models = [...new Map((devices ?? []).map(device => [controllerModelKey(device), device])).values()]
          return (
            <div className={styles.entry}>
              <div className={settingsStyles.mainColumn}>
                <span className={settingsStyles.sectionNote}>Hold to swap · {index === 0 ? 'first' : index === 1 ? 'second' : `number ${index + 1}`} in the list</span>
                {isBuiltin(open) ? (
                  <div className={settingsStyles.panel}>
                    <h2 className={settingsStyles.sectionTitle}>Make your own copy</h2>
                    <p className={settingsStyles.panelNote}>Built-in configurations can’t be changed. Copy it, and this entry swaps in your copy instead.</p>
                    <OpenRow label="Make my own copy" hint={`It goes in your library as “${COPY_NAME}” and opens so you can change it.`} onOpen={() => void makeCopy(open)} hints="A:Make my own copy;X:Press new buttons;B:Not now" />
                  </div>
                ) : (
                  <OpenRow label="Edit configuration" hint={`What ${displayName(open)} does while you hold`} value={displayName(open)} onOpen={() => { setEntry(null); onEditConfiguration?.(profileNameFromPath(open.profilePath)) }} />
                )}
                <SettingsSection title="Hold these" note="X then press the buttons">
                  {groups.map((group, groupIndex) => (
                    <div key={groupIndex} className={styles.wayRow}>
                      <OpenRow label={groupIndex === 0 ? 'One way' : 'Or'} value={keys(group)} onOpen={() => pressFor(open.id, groupIndex)}
                        hints={`A:Press new buttons;X:Press new buttons;Y:Choose from a list;B:Back`} />
                      <button type="button" className="button button--ghost button--sm" tabIndex={-1} onClick={() => setListFor({ id: open.id, group: groupIndex })}>Choose from a list</button>
                      {groups.length > 1 && <button type="button" className="button button--ghost button--sm" onClick={() => void persist({ ...open, buttons: [], triggerGroups: groups.filter((_, i) => i !== groupIndex) })} data-hints="A:Remove this way;B:Back">Remove this way</button>}
                    </div>
                  ))}
                  <OpenRow label="Another way to hold it" hint="Either one swaps it in" onOpen={() => pressFor(open.id, groups.length)} hints="A:Press the buttons;B:Back" />
                </SettingsSection>
                <SettingsSection title="Configuration" note="What swaps in">
                  <div role="radiogroup" aria-label="Configuration">
                    {[...new Set([profileNameFromPath(open.profilePath), ...profiles])].map(name => (
                      <button key={name} type="button" role="radio" aria-checked={name === profileNameFromPath(open.profilePath)} className={settingsStyles.switchRow} data-hints="A:Use this;B:Back"
                        onClick={() => void persist({ ...open, profilePath: profilePathFromName(name) })}>
                        <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>{name === BUILTIN_NAME ? BUILTIN_DISPLAY : name}</span></span>
                        {name === profileNameFromPath(open.profilePath) && <span className={settingsStyles.tag} data-tone="accent">Swaps in</span>}
                      </button>
                    ))}
                  </div>
                </SettingsSection>
                <OpenRow label="Remove from Hold to swap" hint={`${displayName(open)} stays in your library`} onOpen={() => setConfirming(open)} hints="A:Remove…;B:Back" />
              </div>
              <aside className={settingsStyles.mainColumn}>
                <SettingsSection title="Which controller">
                  <div role="radiogroup" aria-label="Which controller">
                    {[{ key: '', label: 'Any controller', note: '' },
                      ...models.map(device => ({ key: controllerModelKey(device), label: `${controllerVariantLabel(device)} only`, note: '' })),
                      ...(open.controllerModel && !models.some(device => controllerModelKey(device) === open.controllerModel) ? [{ key: open.controllerModel, label: `${open.controllerModel} only`, note: 'not connected' }] : []),
                    ].map(option => (
                      <button key={option.key || 'any'} type="button" role="radio" aria-checked={(open.controllerModel ?? '') === option.key} className={settingsStyles.switchRow} data-hints="A:Choose;B:Back"
                        onClick={() => void persist({ ...open, controllerModel: option.key || null })}>
                        <span className={settingsStyles.rowText}><span className={settingsStyles.rowLabel}>{option.label}</span>{option.note && <span className={settingsStyles.rowHint}>{option.note}</span>}</span>
                      </button>
                    ))}
                  </div>
                </SettingsSection>
                <SettingsSection title="Order · higher wins">
                  {chords.map((chord, position) => (
                    <div key={chord.id} className={styles.orderRow} data-current={chord.id === open.id ? 'true' : undefined}>
                      <span className={styles.rankSmall}>{position + 1}</span>
                      <span className={styles.orderName}>{displayName(chord)}</span>
                      {chord.id === open.id && <>
                        <button type="button" className="button button--ghost button--sm" aria-label={`Move ${displayName(chord)} up`} disabled={position === 0} data-hints="A:Move up;B:Back" onClick={() => void move(chord.id, -1)}>▴ Up</button>
                        <button type="button" className="button button--ghost button--sm" aria-label={`Move ${displayName(chord)} down`} disabled={position === chords.length - 1} data-hints="A:Move down;B:Back" onClick={() => void move(chord.id, 1)}>▾ Down</button>
                      </>}
                    </div>
                  ))}
                </SettingsSection>
              </aside>
            </div>
          )
        })()}
      </SubPage>

      {/* The buttons from a list, for when no controller is at hand. */}
      <SubPage open={listFor !== null} onClose={() => setListFor(null)} crumbRoot="Settings" trail={['Hold to swap']} title="Choose from a list" backLabel="Back">
        {listFor && (() => {
          const chord = chords.find(item => item.id === listFor.id)
          if (!chord) return null
          const groups = groupsOf(chord)
          const selected = groups[listFor.group] ?? []
          const toggle = (command: string) => {
            const next = [...groups]
            next[listFor.group] = selected.includes(command) ? selected.filter(item => item !== command) : [...selected, command]
            void persist({ ...chord, buttons: [], triggerGroups: next })
          }
          return (
            <div className={styles.chips} role="group" aria-label="Buttons to hold together">
              {ALL_BUTTONS.filter(button => !/^(L|R)(UP|DOWN|LEFT|RIGHT|RING)$/.test(button.command) && (controllerSupportsInput(devices?.[0], button.command) || selected.includes(button.command.toUpperCase()))).map(button => {
                const command = button.command.toUpperCase()
                return <button type="button" key={command} className={styles.chip} aria-pressed={selected.includes(command)} data-hints="A:Add or take away;B:Back" onClick={() => toggle(command)}>
                  <InputGlyph command={command} family={family} size={18} />{controllerButtonLabel(button, family)}
                </button>
              })}
            </div>
          )
        })()}
      </SubPage>

      {copying && (
        <SubPage open onClose={() => setCopying(null)} crumbRoot="Settings" trail={['Hold to swap']} title={BUILTIN_DISPLAY} backLabel="Not now">
          <div className={settingsStyles.mainColumn} style={{ maxWidth: 720 }}>
            <span className={settingsStyles.tag}>Built-in</span>
            <h2 className={settingsStyles.sectionTitle}>Make your own copy</h2>
            <p className={settingsStyles.panelNote}>Built-in configurations can’t be changed. Copy it, and this entry swaps in your copy instead.</p>
            <OpenRow label="Make my own copy" hint={`It goes in your library as “${COPY_NAME}” and opens so you can change it.`} onOpen={() => void makeCopy(copying)} hints="A:Make my own copy;B:Not now" />
          </div>
        </SubPage>
      )}

      {confirming && (
        <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(null) } }}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-chord-title" aria-describedby="delete-chord-body">
            <h3 id="delete-chord-title">Remove {displayName(confirming)} from Hold to swap?</h3>
            <p id="delete-chord-body">Holding its buttons stops swapping it in. <strong>{displayName(confirming)}</strong> stays in your library.</p>
            <div className="confirm-dialog__actions">
              <button type="button" className="button button--secondary" data-modal-close onClick={() => setConfirming(null)}>Keep it</button>
              <button type="button" className="button button--danger-solid" onClick={() => { const id = confirming.id; setConfirming(null); setEntry(null); void remove(id) }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
