import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { desktopBridge, type AutoloadRule } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { requestValueEntry } from '../nav/textEntry'
import { useLibraryGraph, duplicateConfiguration, libraryChanged } from '../hooks/useLibraryGraph'
import { baseFromGame, baseLabel, BUILTIN_CHORD_NAME, libraryPath, meantToImport, type ConfigFacts } from '../utils/libraryGraph'
import { includeDisplayName } from '../utils/configIncludes'
import { ensureHeaderLines } from '../utils/config'
import { parseConfigText, serializeConfig } from '../utils/configSerializer'
import { layerSlotOf, layerHue } from '../utils/layers'
import type { ControllerVisualFamily } from '../utils/controllerStatus'
import { relativeTime, useClock } from '../hooks/useLastSeenController'
import { associationFor, exeFileName } from '../hooks/useAppIcon'
import { showToast } from '../utils/toast'
import { InputGlyph } from './glyphs/InputGlyph'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { Icon } from './icons/Icon'
import { BrandMark } from './BrandMark'
import { Sheet } from './ui/Sheet'
import { ConfigurationDialog } from './ConfigurationDialog'
import { LibraryCover } from './library/LibraryCover'
import { MoreSheet, BasePickerSheet, type MoreItem } from './library/LibrarySheets'
import styles from './library/Library.module.css'
import { landOn } from '../nav/landing'

// The Library (console v2: Library, LibraryActions, LibraryDetail,
// LibraryBases). Games: a shelf of covers -- each game's configuration, the
// Desktop gamepad one used when no game matches, and New for a game -- with
// the focused one's detail below. A edits, X makes live, Y opens the rest
// (duplicate, rename, change base, launch with game, show in folder, edit the
// file directly, delete). Bases: the files games are built on, yours and the
// ones JSM Evolved ships, and what uses each.
//
// Selecting never loads: Edit does, through the unsaved-changes guard.

type ProfileManagerProps = {
  view?: 'games' | 'bases'
  libraryProfiles: string[]
  libraryLoading?: boolean
  currentProfileName: string | null
  /** The configuration the mapper runs, when mapping is on. */
  appliedProfileName?: string | null
  /** The text the mapper was given, to tell "Live (older version)". */
  runtimeConfig?: string | null
  hasPendingChanges: boolean
  isCalibrating: boolean
  /** Changes when a save may have changed a file (the shelf re-reads). */
  refreshKey?: unknown
  family: ControllerVisualFamily
  controllerName?: string | null
  onEdit: (name: string) => void
  onMakeLive: (name: string) => void
  onRename: (name: string, next: string) => Promise<void> | void
  onDelete: (name: string) => void
  /** Open it for editing, then the source window. */
  onEditSource: (name: string) => void
  onShowInFolder: () => void
  onNewConfiguration: () => void
  onImportFromSteam: () => void
  onImportFile: (fileName: string, content: string) => void
  onChangeBase: (name: string, path: string | null) => Promise<void> | void
  /** The built-in Hold to swap configuration's dialog (Copy to make your own). */
  onOpenBuiltin: () => void
  /** The footer's "where" after "Library · Games". */
  onWhere?: (where: string | null) => void
  /** The header's count: "4 configurations", "1 base · 5 built in". */
  onCount?: (count: string | null) => void
}

const normalized = (text: string) => serializeConfig(parseConfigText(ensureHeaderLines(text)))

export function ProfileManager(props: ProfileManagerProps) {
  const { view = 'games', libraryProfiles, libraryLoading, currentProfileName, appliedProfileName, runtimeConfig, hasPendingChanges, isCalibrating, refreshKey, family, controllerName,
    onEdit, onMakeLive, onRename, onDelete, onEditSource, onShowInFolder, onNewConfiguration, onImportFromSteam, onImportFile, onChangeBase, onOpenBuiltin, onWhere, onCount } = props
  const data = useLibraryGraph(libraryProfiles, refreshKey)
  const { graph, texts, rules, fallback, chords, meta, builtinBases } = data
  const now = useClock()
  const [selected, setSelected] = useState<string | null>(null)
  const [moreFor, setMoreFor] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [baseFor, setBaseFor] = useState<string | null>(null)
  const [gameFor, setGameFor] = useState<string | null>(null)
  const [newBaseOpen, setNewBaseOpen] = useState(false)
  const [subWhere, setSubWhere] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  // ---- What each configuration is, for covers and the detail.
  const liveState = useCallback((name: string): 'live' | 'older' | null => {
    if (!appliedProfileName || appliedProfileName !== name) return null
    const text = texts[name]
    if (runtimeConfig && text && normalized(runtimeConfig) !== normalized(text)) return 'older'
    return 'live'
  }, [appliedProfileName, runtimeConfig, texts])
  const ruleFor = (name: string): AutoloadRule | null => associationFor(rules, name)
  const desktopName = fallback?.enabled && fallback.profileName && libraryProfiles.includes(fallback.profileName) ? fallback.profileName : null
  const baseText = (facts: ConfigFacts | undefined) => {
    if (!facts?.base) return null
    const builtin = builtinBases.find(base => base.relativePath.toLowerCase() === facts.base!.toLowerCase())
    return builtin ? (builtin.short || builtin.title) : includeDisplayName(facts.base)
  }
  const coverSub = (name: string) => {
    if (name === desktopName) return 'When no game matches'
    const facts = graph.configs[name]
    const rule = ruleFor(name)
    return baseText(facts) ?? (rule && !rule.paused ? 'Launches with game' : rule ? 'Art only' : facts?.sends ?? 'Configuration')
  }

  const games = useMemo(() => {
    const list = graph.games.filter(name => name !== desktopName)
    const stamp = (name: string) => meta[name]?.modifiedAtMs ?? 0
    list.sort((a, b) => Number(b === appliedProfileName) - Number(a === appliedProfileName) || Number(b === currentProfileName) - Number(a === currentProfileName) || stamp(b) - stamp(a))
    return desktopName ? [...list, desktopName] : list
  }, [graph.games, desktopName, meta, appliedProfileName, currentProfileName])
  const userBases = graph.bases.filter(name => name !== BUILTIN_CHORD_NAME)
  const presets = useMemo(() => {
    const seen = new Map<string, typeof builtinBases>()
    for (const base of builtinBases) seen.set(base.preset, [...(seen.get(base.preset) ?? []), base])
    // The variant for the controller in hand first: its blurb is the one shown.
    return [...seen.values()].map(variants => [...variants].sort((a, b) => Number(b.families.includes(family)) - Number(a.families.includes(family))))
  }, [builtinBases, family])

  // The focused item; follows the editor the first time round.
  const items = view === 'games' ? games : [...userBases, ...(libraryProfiles.includes(BUILTIN_CHORD_NAME) ? [BUILTIN_CHORD_NAME] : []), ...presets.map(variants => `builtin:${variants[0].preset}`)]
  const current = selected && items.includes(selected) ? selected : (currentProfileName && items.includes(currentProfileName) ? currentProfileName : items[0] ?? null)
  useEffect(() => {
    const label = current?.startsWith('builtin:') ? presets.find(variants => `builtin:${variants[0].preset}` === current)?.[0].title ?? null : current
    onWhere?.([label, subWhere].filter(Boolean).join(' · ') || null)
  }, [current, subWhere, onWhere, presets])
  useEffect(() => () => onWhere?.(null), [onWhere])

  useEffect(() => {
    const builtinCount = presets.length + (libraryProfiles.includes(BUILTIN_CHORD_NAME) ? 1 : 0)
    onCount?.(view === 'games' ? `${games.length} ${games.length === 1 ? 'configuration' : 'configurations'}` : `${userBases.length} ${userBases.length === 1 ? 'base' : 'bases'} · ${builtinCount} built in`)
  }, [view, games.length, userBases.length, presets.length, libraryProfiles, onCount])
  useEffect(() => () => onCount?.(null), [onCount])

  // ---- Actions.
  const duplicate = async (name: string) => {
    setMoreFor(null)
    const created = await duplicateConfiguration(name)
    if (!created) { showToast(`Couldn’t duplicate ${name}.`, 'error'); return }
    showToast(`${created} is a copy of ${name}`)
    libraryChanged()
    onEdit(created)
  }
  const rename = (name: string) => {
    setMoreFor(null)
    requestValueEntry({
      title: 'Rename', eyebrow: `Library · ${name}`, value: name, hint: 'The file is renamed too; Launch with game and Hold to swap follow it.',
      onDone: next => { const trimmed = next.trim(); if (trimmed && trimmed !== name) void Promise.resolve(onRename(name, trimmed)).then(libraryChanged) },
    })
  }
  const makeLive = (name: string) => {
    if (graph.isBase(name) && name !== BUILTIN_CHORD_NAME) { showToast('A base goes live only through a game built on it.'); return }
    if (isCalibrating) return
    onMakeLive(name)
  }
  const edit = (name: string) => {
    if (name === BUILTIN_CHORD_NAME) { onOpenBuiltin(); return }
    onEdit(name)
  }
  const deleteBody = (name: string): ReactNode => {
    const rule = ruleFor(name)
    const loaders = graph.swappedFrom[name] ?? []
    const users = graph.usedBy[name] ?? []
    return <>
      The file goes to the recycle bin.
      {rule ? <> <b>{exeFileName(rule.processName)}</b> will have nothing to load.</> : null}
      {users.length ? <> {users.join(', ')} {users.length === 1 ? 'is' : 'are'} built on it and will say the base is missing.</> : null}
      {loaders.length ? <> {loaders[0].by} swaps to it; that button will show as missing.</> : null}
      {name === currentProfileName ? ' Because it’s open now, another configuration opens.' : ''}
    </>
  }
  const moreItems = (name: string): MoreItem[] => {
    if (name === BUILTIN_CHORD_NAME) return [{ key: 'copy', icon: 'copy', label: 'Copy to make your own', note: 'Built-in configurations can’t be changed', run: () => { setMoreFor(null); onOpenBuiltin() } }]
    const facts = graph.configs[name]
    const rule = ruleFor(name)
    const isBase = graph.isBase(name)
    return [
      { key: 'duplicate', icon: 'copy', label: 'Duplicate', note: 'A copy, opened to edit', run: () => void duplicate(name) },
      { key: 'rename', icon: 'details', label: 'Rename', run: () => rename(name) },
      { key: 'base', icon: 'inherited', label: 'Change base', note: facts?.base ? baseLabel(facts.base, builtinBases) : 'Nothing', run: () => { setMoreFor(null); setBaseFor(name) } },
      ...(isBase ? [] : [{ key: 'game', icon: 'associations' as const, label: 'Launch with game', note: rule ? exeFileName(rule.processName) : 'None', run: () => { setMoreFor(null); setGameFor(name) } }]),
      { key: 'folder', icon: 'folder', label: 'Show in folder', run: () => { setMoreFor(null); onShowInFolder() } },
      { key: 'source', icon: 'source', label: 'Edit the file directly', note: 'For experts', run: () => { setMoreFor(null); onEditSource(name) } },
    ]
  }
  const loopsWith = (name: string) => (path: string) => {
    // A base that already builds on this configuration, directly or not.
    const seen = new Set<string>()
    const walk = (candidate: string): boolean => {
      const key = candidate.toLowerCase()
      if (key === libraryPath(name).toLowerCase()) return true
      if (seen.has(key)) return false
      seen.add(key)
      const target = Object.values(graph.configs).find(facts => facts.path.toLowerCase() === key)
      return Boolean(target?.imports.some(walk))
    }
    return walk(path)
  }

  // ---- Pad: X makes live, Y opens More, on the focused cover or card.
  useEffect(() => {
    const host = pageRef.current
    if (!host) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, .sheet-layer, .modal-overlay')) return
      const name = target?.closest<HTMLElement>('[data-profile]')?.dataset.profile ?? (target?.closest('[data-library-detail]') ? current ?? undefined : undefined)
      if (!name) return
      if (button === 'X' && view === 'games') { event.preventDefault(); makeLive(name) }
      else if (button === 'Y' && !name.startsWith('builtin:')) { event.preventDefault(); setConfirmDelete(false); setMoreFor(name) }
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const glyphs = (keys: string) => (
    <span className={styles.keys}>{keys.split(',').map((key, index) => <InputGlyph key={index} command={key.trim()} family={family} size={22} />)}</span>
  )
  const chordsFor = (name: string) => chords.filter(chord => chord.profilePath.replace(/\\/g, '/').toLowerCase() === libraryPath(name).toLowerCase())

  // ---- Games.
  // An empty library (first run): a welcome instead of an empty shelf.
  const firstRun = !libraryLoading && !data.loading && libraryProfiles.length === 0
  // The welcome arrives after the page did (the library answered first, then
  // this panel loaded), so the pad lands on New for a game here, when nothing
  // on the page has focus yet (UX review, B5).
  useEffect(() => {
    if (!firstRun) return
    return landOn(pageRef.current, () => pageRef.current?.querySelector<HTMLElement>('[data-autofocus]'))
  }, [firstRun])
  // The shelf changed under the pad (a delete, a copy, a rename): when that
  // took the focused control away, land on the selected cover, else the
  // first one, never on <body> (UX review, B3).
  const shelfKey = items.join('\n')
  useEffect(() => {
    if (firstRun) return
    return landOn(pageRef.current, () => {
      const root = pageRef.current
      if (!root) return null
      const wanted = current ? root.querySelector<HTMLElement>(`[data-profile="${CSS.escape(current)}"] button, button[data-profile="${CSS.escape(current)}"]`) : null
      return wanted ?? root.querySelector<HTMLElement>('[data-profile] button, button[data-profile], [data-builtin-base]')
    })
  // Only when the shelf itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfKey, firstRun])
  const compact = view === 'games' && (Object.values(graph.configs).some(facts => facts.swaps.length > 0) || Object.keys(graph.problems).length > 0)
  const renderGames = () => {
    const name = current
    const facts = name ? graph.configs[name] : undefined
    const live = name ? liveState(name) : null
    const rule = name ? ruleFor(name) : null
    const problem = name ? graph.problems[name] : undefined
    const swaps = facts?.swaps ?? []
    const swappedFrom = name ? graph.swappedFrom[name] ?? [] : []
    const builtIn = name ? chordsFor(name) : []
    const baseName = facts?.base ? baseLabel(facts.base, builtinBases) : null
    return <>
      <input ref={importRef} type="file" accept=".txt,.cfg,.ini,*/*" hidden onChange={async event => {
        const file = event.target.files?.[0]
        if (file) onImportFile(file.name, await file.text())
        event.target.value = ''
      }} />
      {!firstRun && <div className={styles.shelf} data-compact={compact ? 'true' : undefined} role="list" aria-label="Your games">
        {games.map(game => {
          const gameRule = ruleFor(game)
          return (
            <div key={game} role="listitem" className={styles.coverWrap} data-profile={game} data-editing={game === currentProfileName ? 'true' : undefined}>
              <LibraryCover name={game} sub={coverSub(game)} live={liveState(game)} compact={compact} current={game === current}
                steamAppId={graph.configs[game]?.game?.steamAppId} exePath={gameRule?.exePath} desktop={game === desktopName}
                hints="A:Edit;X:Make live;Y:More;B:Home"
                onFocus={() => setSelected(game)} onClick={() => { setSelected(game); edit(game) }} />
            </div>
          )
        })}
        <div className={styles.newCover} role="listitem">
          <button type="button" className={styles.newMain} data-hints="A:New for a game;B:Home" onClick={onNewConfiguration} onFocus={() => setSelected(null)}>
            <span className={styles.newPlus} aria-hidden="true">+</span><b>New for a game</b>{!compact && <span>Or import from Steam or a file</span>}
          </button>
          <button type="button" className={styles.newSub} data-hints="A:Import from Steam;B:Home" onClick={onImportFromSteam}><Icon name="library" size={16} />Import from Steam</button>
          <button type="button" className={styles.newSub} data-hints="A:Import a file;B:Home" onClick={() => importRef.current?.click()}><Icon name="source" size={16} />Import a file</button>
        </div>
      </div>}

      {firstRun && (
        <section className={styles.welcome} aria-label="Welcome to JSM Evolved" data-hints="A:Choose;B:Home">
          <BrandMark size={56} />
          <h2>Welcome to JSM Evolved</h2>
          <p>Start from how you play, import a layout from Steam, or bring in a JoyShockMapper file. You can change everything later.</p>
          <div className={styles.buttonsRow}>
            <button type="button" className={styles.act} data-primary="true" data-autofocus="" data-hints="A:New for a game;B:Home" onClick={onNewConfiguration}><ButtonGlyph button="A" size={26} family={family} pad />New for a game</button>
            <button type="button" className={styles.act} data-hints="A:Import from Steam;B:Home" onClick={onImportFromSteam}>Import from Steam</button>
            <button type="button" className={styles.act} data-hints="A:Import a file;B:Home" onClick={() => importRef.current?.click()}>Import a file</button>
          </div>
        </section>
      )}

      {name && facts && (
        <aside className={styles.detail} aria-label={`${name} details`} data-library-detail="" data-profile-detail={name}>
          <div className={styles.detailMain}>
            <div className={styles.detailHead}>
              <h2 className={styles.detailName}>{name}</h2>
              {live === 'live' && <span className={styles.livePill}>Live</span>}
              {live === 'older' && <span className={styles.olderPill}>Live (older version)</span>}
              {name === currentProfileName && hasPendingChanges && <span className={styles.olderPill}>Unsaved changes</span>}
              <span className={styles.detailFile}>{name}.txt{meta[name] ? ` · saved ${relativeTime(meta[name].modifiedAtMs, now)}` : ''}</span>
            </div>
            <dl className={styles.facts}>
              <div><dt>Controller</dt><dd>{controllerName ?? 'Any'}</dd></div>
              <div><dt>Sends</dt><dd>{facts.sends}</dd></div>
              <div><dt>Built on</dt><dd data-warn={problem ? 'true' : undefined}>{baseName ?? 'Nothing'}{problem?.cyclic.length ? ' · loop' : problem?.missing.length ? ' · missing' : ''}</dd></div>
              <div><dt>Layers</dt><dd><span className={styles.modeDots}>{facts.modes.map((mode, index) => <i key={mode.name} style={{ background: layerHue(layerSlotOf(index)) }} />)}{facts.modes.length}</span></dd></div>
              {rule && <div><dt>Launches with</dt><dd className={styles.mono}>{exeFileName(rule.processName)}{rule.paused ? ' · art only' : ''}</dd></div>}
            </dl>
            {name === desktopName
              ? <p className={styles.sentence}>Goes live when no game with its own configuration is in front.</p>
              : rule && !rule.paused
                ? <p className={styles.sentence}>Goes live automatically when <b>{exeFileName(rule.processName)}</b> comes to the front.</p>
                : rule ? <p className={styles.sentence}>Wears <b>{exeFileName(rule.processName)}</b>’s art; it doesn’t go live by itself.</p> : null}
            {(swaps.length > 0 || swappedFrom.length > 0 || builtIn.length > 0) && (
              <div className={styles.links}>
                <div className={styles.linkCol}>
                  {swaps.length > 0 && <p className={styles.eyebrow}>Hold to swap · goes to</p>}
                  {swaps.map(swap => <div key={`${swap.keys}-${swap.target}`} className={styles.linkRow}>{glyphs(swap.keys)}<span className={styles.arrowText}>→</span><b>{swap.target}</b></div>)}
                </div>
                <div className={styles.linkCol}>
                  {(swappedFrom.length > 0 || builtIn.length > 0) && <p className={styles.eyebrow}>Swapped to from</p>}
                  {swappedFrom.map(link => <div key={`${link.by}-${link.keys}`} className={styles.linkRow}><b>{link.by}</b><span className={styles.arrowText}>·</span>{glyphs(link.keys)}</div>)}
                  {builtIn.map(chord => <div key={chord.id} className={styles.linkRow}><b>Hold to swap</b><span className={styles.muted}>built in</span><span className={styles.arrowText}>·</span>{glyphs((chord.triggerGroups?.[0] ?? chord.buttons).join(','))}</div>)}
                </div>
              </div>
            )}
            {problem && facts.base && (
              <div className={styles.warnCard} role="alert">
                <Icon name="warning" size={28} />
                <div>
                  <h4>{problem.cyclic.length ? `${baseName} and ${name} build on each other` : `${baseName} is missing`}</h4>
                  <p>{problem.cyclic.length
                    ? 'Each was read once and the loop was skipped, so some settings may not be what you expect. Change one of the two bases to fix it.'
                    : 'Nothing from it is being used. Pick another base, or none.'}</p>
                </div>
                <button type="button" className={styles.warnButton} data-hints="A:Change base;B:Home" onClick={() => setBaseFor(name)}>Change base ▸</button>
              </div>
            )}
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.act} data-primary="true" data-hints="A:Edit;X:Make live;Y:More;B:Home" onClick={() => edit(name)}>
              <ButtonGlyph button="A" size={26} family={family} pad />Edit
            </button>
            <button type="button" className={styles.act} data-hints="A:Make live;Y:More;B:Home" aria-disabled={live === 'live' || isCalibrating || undefined}
              data-reason={live === 'live' ? 'It’s live now' : isCalibrating ? 'Calibrating' : undefined} onClick={() => { if (live !== 'live') makeLive(name) }}>
              <ButtonGlyph button="X" size={26} family={family} pad />{live === 'older' ? 'Make this version live' : live === 'live' ? 'Live now' : 'Make live'}
              {live === 'older' && <small>The live copy is from before your last save.</small>}
            </button>
            <button type="button" className={styles.act} data-hints="A:More;B:Home" onClick={() => { setConfirmDelete(false); setMoreFor(name) }}>
              <ButtonGlyph button="Y" size={26} family={family} pad />Duplicate, rename, file…
            </button>
            {(swaps.length > 0 || swappedFrom.length > 0 || builtIn.length > 0) && (
              <p className={styles.note}>Hold to swap links are set on the buttons themselves and in Settings ▸ Hold to swap.</p>
            )}
          </div>
        </aside>
      )}
    </>
  }

  // ---- Bases.
  const [newBaseGame, setNewBaseGame] = useState<string | null>(null)
  const makeBaseFrom = async (game: string) => {
    setNewBaseOpen(false)
    const text = texts[game]
    if (text === undefined) return
    const taken = new Set(libraryProfiles.map(entry => entry.toLowerCase()))
    let name = `${game} base`
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${game} base ${n}`
    const saved = await desktopBridge.saveLibraryProfile(name, baseFromGame(text) + (text.endsWith('\n') ? '' : '\n'))
    if (!saved) { showToast('Couldn’t make the base.', 'error'); return }
    setNewBaseGame(null)
    setSelected(saved.name)
    libraryChanged()
    showToast(`${saved.name} has ${game}’s settings. Change a game’s base to build on it.`)
  }
  const copyBuiltin = async (relativePath: string, title: string) => {
    const base = builtinBases.find(entry => entry.relativePath === relativePath)
    if (!base) return
    const taken = new Set(libraryProfiles.map(entry => entry.toLowerCase()))
    let name = `My ${title.replace(/[,&]/g, '').replace(/\s+/g, ' ')}`
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `My ${title} ${n}`
    const text = base.text.split(/\r?\n/).filter(line => !/^\s*#\s*@base\b/.test(line)).join('\n')
    const saved = await desktopBridge.saveLibraryProfile(name, text)
    if (!saved) { showToast('Couldn’t copy the base.', 'error'); return }
    libraryChanged()
    showToast(`${saved.name} is yours to change`)
    onEdit(saved.name)
  }
  const renderBases = () => {
    const isPreset = current?.startsWith('builtin:')
    const variants = isPreset ? presets.find(entry => `builtin:${entry[0].preset}` === current) ?? [] : []
    const name = isPreset ? variants[0]?.title ?? '' : current
    const userFacts = !isPreset && current ? graph.configs[current] : undefined
    const usedBy = isPreset ? variants.flatMap(base => graph.builtinUsedBy[base.relativePath] ?? []) : current ? graph.usedBy[current] ?? [] : []
    const firstUser = usedBy[0]
    const blurb = (text: string | undefined) => text?.split(/\r?\n/).find(line => /^\s*#\s*[^@\s]/.test(line))?.replace(/^\s*#\s*/, '') ?? 'Shared settings'
    return (
      <div className={styles.basesLayout}>
        <div className={styles.page}>
          <div className={styles.baseGrid} role="list" aria-label="Bases">
            {userBases.map(base => (
              <button key={base} type="button" role="listitem" className={styles.baseCard} data-profile={base} aria-current={base === current ? 'true' : undefined}
                data-hints="A:Edit base;Y:More;B:Home" onFocus={() => setSelected(base)} onClick={() => edit(base)}>
                <span className={styles.baseArt} aria-hidden="true"><span className={styles.stack}><i style={{ background: 'var(--layer-2)' }} /><i style={{ background: 'var(--accent)', width: 110 }} /></span></span>
                <b>{base}</b>
                <p>{blurb(texts[base])}</p>
                <p className={styles.used}>{(graph.usedBy[base] ?? []).length ? `Used by ${(graph.usedBy[base] ?? []).join(', ')}` : 'Not used yet'}</p>
                <p className={styles.hint}>A edits it. Every game on it follows.</p>
              </button>
            ))}
            {libraryProfiles.includes(BUILTIN_CHORD_NAME) && (
              <button type="button" role="listitem" className={styles.baseCard} data-profile={BUILTIN_CHORD_NAME} aria-current={current === BUILTIN_CHORD_NAME ? 'true' : undefined}
                data-hints="A:Copy to make your own;B:Home" onFocus={() => setSelected(BUILTIN_CHORD_NAME)} onClick={onOpenBuiltin}>
                <span className={styles.baseArt} aria-hidden="true"><InputGlyph command="LSL" family={family} size={36} /><span className={styles.arrowText}>→</span><Icon name="library" size={30} /></span>
                <b>Hold to swap<span className={styles.builtTag}>BUILT IN</span></b>
                <p>Hold buttons to swap to another whole configuration until you let go</p>
                <p className={styles.hint}>Can’t be changed · copy it to make your own</p>
              </button>
            )}
            {presets.map(entry => {
              const id = `builtin:${entry[0].preset}`
              const users = entry.flatMap(base => graph.builtinUsedBy[base.relativePath] ?? [])
              return (
                <button key={id} type="button" role="listitem" className={styles.baseCard} data-builtin-base={entry[0].preset} aria-current={id === current ? 'true' : undefined}
                  data-hints="A:Copy to make your own;B:Home" onFocus={() => setSelected(id)} onClick={() => void copyBuiltin(entry[0].relativePath, entry[0].title)}>
                  <span className={styles.baseArt} aria-hidden="true"><span className={styles.stack}><i style={{ background: 'var(--text-3)' }} /><i style={{ background: 'var(--accent)', width: 110 }} /></span></span>
                  <b>{entry[0].title}<span className={styles.builtTag}>BUILT IN</span></b>
                  <p>{entry[0].blurb}</p>
                  {users.length > 0 && <p className={styles.used}>Used by {users.join(', ')}</p>}
                  <p className={styles.hint}>Can’t be changed · copy it to make your own{entry.length > 1 ? ` · ${entry.length} versions, by controller` : ''}</p>
                </button>
              )
            })}
            <button type="button" role="listitem" className={styles.newCard} data-hints="A:New base;B:Home" onClick={() => setNewBaseOpen(true)}>
              <span className={styles.newPlus} aria-hidden="true">+</span><b>New base</b><p>Start from a game you already set up</p>
            </button>
          </div>
          {current && name && (
            <aside className={styles.detail} aria-label={`${current === BUILTIN_CHORD_NAME ? BUILTIN_CHORD_NAME : name} details`} data-library-detail="" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <div className={styles.detailHead}>
                <h2 className={styles.detailName}>{current === BUILTIN_CHORD_NAME ? 'Hold to swap' : name}</h2>
                <span className={styles.mono} style={{ color: 'var(--text-3)' }}>{isPreset ? variants.map(base => base.fileName).join(' · ') : `${current}.txt`}</span>
              </div>
              <dl className={styles.facts}>
                <div><dt>Used by</dt><dd>{usedBy.length ? usedBy.join(', ') : 'Nothing yet'}</dd></div>
                <div><dt>Built on</dt><dd>{userFacts?.base ? baseLabel(userFacts.base, builtinBases) : 'Nothing'}</dd></div>
                <div><dt>Sends</dt><dd>{isPreset ? (variants[0].text.match(/VIRTUAL_CONTROLLER\s*=\s*XBOX/) ? 'Xbox controller' : 'Keyboard & mouse') : userFacts?.sends ?? '—'}</dd></div>
                <div><dt>Goes live</dt><dd>{current === BUILTIN_CHORD_NAME ? 'While its buttons are held' : 'Only through a game'}</dd></div>
              </dl>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {isPreset
                  ? <button type="button" className={styles.act} data-primary="true" onClick={() => void copyBuiltin(variants[0].relativePath, variants[0].title)}><ButtonGlyph button="A" size={26} family={family} pad />Copy to make your own</button>
                  : current === BUILTIN_CHORD_NAME
                    ? <button type="button" className={styles.act} data-primary="true" onClick={onOpenBuiltin}><ButtonGlyph button="A" size={26} family={family} pad />Copy to make your own</button>
                    : <>
                      <button type="button" className={styles.act} data-primary="true" data-hints="A:Edit base;Y:More;B:Home" onClick={() => edit(current)}><ButtonGlyph button="A" size={26} family={family} pad />Edit base</button>
                      <button type="button" className={styles.act} data-hints="A:More;B:Home" onClick={() => { setConfirmDelete(false); setMoreFor(current) }}><ButtonGlyph button="Y" size={26} family={family} pad />Duplicate, rename, file…</button>
                    </>}
              </div>
            </aside>
          )}
        </div>
        <aside className={styles.aside} aria-label="How a game is built">
          <p className={styles.eyebrow}>{firstUser ? `How ${firstUser} is built` : 'How a game is built'}</p>
          <div className={styles.diagram} aria-hidden="true">
            <small>What {firstUser ?? 'the game'} sets wins</small>
            <span className={styles.diagramLine} style={{ borderLeftStyle: 'solid', borderColor: 'var(--text-3)', height: 18 }} />
            <span className={styles.diagramBox} style={{ boxShadow: 'inset 0 0 0 2px var(--layer-2)' }}>{firstUser ?? 'Your game'}</span>
            <span className={styles.diagramLine} />
            <span className={styles.diagramBox} style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)', boxShadow: 'inset 0 0 0 2px var(--accent)' }}>{current === BUILTIN_CHORD_NAME ? 'Hold to swap' : name || 'A base'}</span>
          </div>
          <p className={styles.sentence}>Anything {firstUser ?? 'a game'} leaves alone comes from {name || 'its base'}. On Layout those rows say <b>From {name || 'the base'}</b>.</p>
          <p className={styles.note}>If a base goes missing, the games on it say so and ask you to pick another.</p>
        </aside>
      </div>
    )
  }

  const moreName = moreFor
  const deletable = moreName && moreName !== BUILTIN_CHORD_NAME
  return (
    <div className={styles.page} ref={pageRef} aria-busy={libraryLoading || data.loading || undefined} data-library-view={view}>
      {view === 'games' ? renderGames() : renderBases()}
      {moreName && (
        <MoreSheet open onClose={() => setMoreFor(null)} eyebrow={`Library · ${view === 'games' ? 'Games' : 'Bases'}`} title={moreName} file={`${moreName}.txt`}
          items={moreItems(moreName)} confirming={confirmDelete} onWhere={setSubWhere}
          remove={deletable ? { label: `Delete ${moreName}`, body: deleteBody(moreName), run: () => { setMoreFor(null); onDelete(moreName); libraryChanged() } } : undefined} />
      )}
      {baseFor && (
        <BasePickerSheet open onClose={() => setBaseFor(null)} name={baseFor} current={graph.configs[baseFor]?.base ?? null}
          builtin={builtinBases} userBases={userBases.filter(base => base !== baseFor)} loops={loopsWith(baseFor)}
          onPick={path => { const name = baseFor; setBaseFor(null); void Promise.resolve(onChangeBase(name, path)).then(() => { libraryChanged(); showToast(path ? `${name} is built on ${baseLabel(path, builtinBases)}` : `${name} isn’t built on anything now`) }) }} />
      )}
      {gameFor && (
        <ConfigurationDialog mode="associate" profileName={gameFor} rule={ruleFor(gameFor)} onClose={() => setGameFor(null)} />
      )}
      <Sheet open={newBaseOpen} onClose={() => setNewBaseOpen(false)} eyebrow="Library · Bases" title="New base"
        description="Start from a game you already set up: its settings become a base other games can build on. The game itself doesn’t change."
        hints={[{ button: 'A', label: 'Start from this' }, { button: 'B', label: 'Back' }]} width={520}>
        {graph.games.length === 0 && <p className={styles.sentence}>Set up a game first.</p>}
        {graph.games.map(game => (
          <button key={game} type="button" className={styles.menuRow} data-hints="A:Start from this;B:Back" aria-busy={newBaseGame === game || undefined}
            onClick={() => { setNewBaseGame(game); void makeBaseFrom(game) }}>
            <Icon name="library" size={20} /><span>{game}</span><span>{meantToImport(texts[game] ?? '') ? '' : graph.configs[game]?.sends}</span>
          </button>
        ))}
      </Sheet>
    </div>
  )
}
