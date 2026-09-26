import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type AutoloadRule, type LibraryProfileMeta } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { FPS_TEMPLATE_NAME, FPS_TEMPLATE_TEXT } from '../constants/fpsTemplate'
import { extractIncludePaths, includeDisplayName } from '../utils/configIncludes'
import { loadConfigBindingName } from '../utils/loadConfigBinding'
import { inputDefinitions, readLayers } from '../utils/layers'
import { getVirtualControllerType } from '../utils/virtualController'
import { controllerButtonLabel, type ControllerVisualFamily } from '../utils/controllerStatus'
import { layerColor } from '../shell/TitleBar'
import { Icon } from './icons/Icon'
import { Menu } from './ui/Menu'
import { relativeTime, useClock, useLastSeenController } from '../hooks/useLastSeenController'
import styles from './ProfileManager.module.css'

type ProfileManagerProps = {
  currentProfileName: string | null
  appliedProfileName?: string | null
  hasPendingChanges: boolean
  isCalibrating: boolean
  profileApplied: boolean
  onImportProfile?: (fileName: string, content: string) => void
  libraryProfiles: string[]
  libraryLoading?: boolean
  editedProfileNames: Record<string, string>
  onProfileNameChange: (originalName: string, value: string) => void
  onRenameProfile: (originalName: string) => void
  onDeleteProfile: (name: string) => void
  onAddProfile: () => void
  onLoadLibraryProfile: (name: string) => void
  lockMessage?: string
  onCopyActiveProfile?: () => void
  /** Configurations the one being edited imports; listed as templates. */
  templateNames?: Set<string>
  /** Facts about the configuration being edited, for the detail panel. */
  editingDetails?: { output?: string; imports?: string[]; layers?: { name: string; color: string }[] }
  onApply?: () => void
  /** Apply a configuration that is not the one being edited (X on its row):
      open it through the unsaved guard, then apply. Without it, X opens it. */
  onApplyLibraryProfile?: (name: string) => void
  onShowInFolder?: () => void
  onEditSource?: () => void
  /** Glyph family for "L4 + Menu"; defaults to the controller last seen. */
  family?: ControllerVisualFamily
}

const OUTPUT_LABEL = { XBOX: 'Virtual Xbox', DS4: 'Virtual DualShock 4', NONE: 'Keyboard and mouse only' } as const

/** A binding that loads another configuration: which keys, which target. */
type LoadLink = { keys: string; target: string }

// What a configuration's own text says about it (Studio Home 8a row
// subtitles and detail facts): output, imports, layers, what it loads.
const describeText = (text: string) => {
  const loads: LoadLink[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([^=]+?)\s*=\s*(.+)$/.exec(line)
    if (!match) continue
    const value = match[2].trim().replace(/^"(.*)"$/, '$1')
    const target = loadConfigBindingName(value)
    if (target) loads.push({ keys: match[1].trim(), target })
  }
  return {
    output: OUTPUT_LABEL[getVirtualControllerType(text)] as string,
    imports: extractIncludePaths(text).map(includeDisplayName),
    layers: readLayers(text).map((layer, index) => ({ name: layer.name, color: layerColor(index) })),
    loads,
  }
}
type TextFacts = ReturnType<typeof describeText>

const exeName = (processName: string) => (/\.exe$/i.test(processName) ? processName : `${processName}.exe`)

// Studio home (Studio Home.dc.html 8a): every profile and template in the
// config folder as rows, the selected one's facts and actions beside them.
// Selecting a row never loads it; Edit (A) does, through the unsaved guard.
export function ProfileManager({
  currentProfileName,
  appliedProfileName,
  hasPendingChanges,
  isCalibrating,
  profileApplied,
  libraryProfiles,
  libraryLoading = false,
  editedProfileNames,
  onProfileNameChange,
  onRenameProfile,
  onDeleteProfile,
  onAddProfile,
  onImportProfile,
  onLoadLibraryProfile,
  lockMessage,
  onCopyActiveProfile,
  templateNames,
  editingDetails,
  onApply,
  onApplyLibraryProfile,
  onShowInFolder,
  onEditSource,
  family,
}: ProfileManagerProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(currentProfileName)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  const [texts, setTexts] = useState<Record<string, TextFacts>>({})
  const [meta, setMeta] = useState<Record<string, LibraryProfileMeta>>({})
  const [rules, setRules] = useState<AutoloadRule[]>([])
  const importRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const renameRef = useRef<HTMLInputElement | null>(null)
  const seen = useLastSeenController()
  const glyphFamily = family ?? seen.family
  const now = useClock()

  // Follow the editor: switching configuration selects the new one.
  useEffect(() => { setSelected(currentProfileName); setRenaming(false) }, [currentProfileName])
  useEffect(() => { if (selected && !libraryProfiles.includes(selected)) setSelected(currentProfileName) }, [libraryProfiles, selected, currentProfileName])
  // A destructive confirmation starts on Cancel (System States 17g): it is the
  // dialog's first control, which useKeyboardNav focuses when the overlay
  // appears. Focusing it here instead would run before that hook records the
  // Delete button as where to return, and B would leave focus nowhere.

  // Each row's subtitle comes from its own file: output, imports, layers and
  // the configurations it loads. Read once per name, again after a save
  // changes the file's modified time.
  const listKey = libraryProfiles.join('\n')
  const refreshMeta = useCallback(async () => {
    const list = await desktopBridge.listLibraryProfileMeta().catch(() => [] as LibraryProfileMeta[])
    setMeta(Object.fromEntries(list.map(entry => [entry.name, entry])))
  }, [])
  useEffect(() => { void refreshMeta() }, [refreshMeta, listKey, hasPendingChanges])
  useEffect(() => {
    let disposed = false
    const stamp = (name: string) => meta[name]?.modifiedAtMs ?? 0
    void Promise.all(libraryProfiles.map(async name => {
      const profile = await desktopBridge.loadLibraryProfile(name).catch(() => null)
      return [name, profile ? describeText(profile.content) : null, stamp(name)] as const
    })).then(entries => {
      if (disposed) return
      setTexts(Object.fromEntries(entries.filter(([, facts]) => facts).map(([name, facts]) => [name, facts as TextFacts])))
    })
    return () => { disposed = true }
    // The file list and each file's modified time decide when to re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, Object.values(meta).map(entry => entry.modifiedAtMs).join(',')])
  useEffect(() => {
    let disposed = false
    const read = () => void desktopBridge.listAutoloadRules().then(list => { if (!disposed) setRules(list) }).catch(() => {})
    read()
    window.addEventListener('jsm:associations-changed', read)
    return () => { disposed = true; window.removeEventListener('jsm:associations-changed', read) }
  }, [])

  const isTemplate = (name: string) => !!templateNames?.has(name) && name !== currentProfileName
  const profiles = libraryProfiles.filter(name => !isTemplate(name))
  const templates = libraryProfiles.filter(isTemplate)
  const current = selected ?? currentProfileName
  const editingSelected = !!current && current === currentProfileName

  const keyLabel = useCallback((keys: string) => keys.split(',').map(command => {
    const definition = inputDefinitions.find(button => button.command === command.trim().toUpperCase())
    return definition ? controllerButtonLabel(definition, glyphFamily) : command.trim()
  }).join(' + '), [glyphFamily])

  // Who loads whom: a binding in one configuration that opens another.
  const loadedBy = useMemo(() => {
    const map = new Map<string, { by: string; keys: string }[]>()
    for (const [name, facts] of Object.entries(texts)) {
      for (const link of facts.loads) {
        const list = map.get(link.target) ?? []
        list.push({ by: name, keys: link.keys })
        map.set(link.target, list)
      }
    }
    return map
  }, [texts])
  const importedBy = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const [name, facts] of Object.entries(texts)) for (const imported of facts.imports) map.set(imported, [...(map.get(imported) ?? []), name])
    return map
  }, [texts])
  const autoloadFor = (name: string) => rules.filter(rule => rule.kind === 'profile' && !rule.builtIn && !rule.paused && rule.profileName === name).map(rule => exeName(rule.processName))

  const factsFor = (name: string): TextFacts | undefined => {
    if (name === currentProfileName && editingDetails) {
      return {
        output: editingDetails.output ?? texts[name]?.output ?? OUTPUT_LABEL.NONE,
        imports: editingDetails.imports ?? texts[name]?.imports ?? [],
        layers: editingDetails.layers ?? texts[name]?.layers ?? [],
        loads: texts[name]?.loads ?? [],
      }
    }
    return texts[name]
  }

  const subtitle = (name: string) => {
    const importers = importedBy.get(name) ?? []
    if (isTemplate(name)) return `Imported by ${importers.length ? importers.join(', ') : currentProfileName} · not applied directly`
    const loaders = loadedBy.get(name)
    if (loaders?.length) return `Loaded by ${loaders[0].by} · ${keyLabel(loaders[0].keys)}`
    const facts = factsFor(name)
    if (!facts) return 'Configuration file'
    const parts = [facts.output, ...facts.imports.map(imported => `imports ${imported}`)]
    if (facts.layers.length) parts.push(`${facts.layers.length} layer${facts.layers.length === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }

  const edit = (name: string) => {
    if (name === currentProfileName) { window.dispatchEvent(new CustomEvent('jsm:navigate-page', { detail: 'overview' })); return }
    onLoadLibraryProfile(name)
  }
  const apply = (name: string) => {
    if (isCalibrating) return
    if (name === currentProfileName) { onApply?.(); return }
    if (onApplyLibraryProfile) onApplyLibraryProfile(name)
    else onLoadLibraryProfile(name)
  }

  // X applies the focused row's configuration, Y opens its options.
  useEffect(() => {
    const host = listRef.current
    if (!host) return
    const onPad = (event: Event) => {
      const detail = (event as CustomEvent<PadEventDetail>).detail
      const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-profile]')
      const name = row?.dataset.profile
      if (!name) return
      if (detail.button === 'X') { event.preventDefault(); apply(name) }
      else if (detail.button === 'Y') { event.preventDefault(); setSelected(name); setOptionsFor(name) }
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const renamed = current ? (editedProfileNames[current] ?? current) : ''
  const canRename = !!current && !!renamed.trim() && renamed.trim() !== current
  const startRename = (name: string) => { setSelected(name); setRenaming(true) }
  const cancelRename = () => { if (current) onProfileNameChange(current, current); setRenaming(false) }
  const commitRename = () => { if (current && canRename) { onRenameProfile(current); setRenaming(false) } }
  useEffect(() => { if (renaming) { renameRef.current?.focus(); renameRef.current?.select() } }, [renaming])

  const row = (name: string) => {
    const importers = importedBy.get(name) ?? []
    const autoload = autoloadFor(name)
    return (
      <li key={name} className={styles.item} data-profile={name}>
        <button
          type="button"
          className={styles.row}
          aria-pressed={current === name}
          onClick={() => setSelected(name)}
          onFocus={() => setSelected(name)}
          onDoubleClick={() => edit(name)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); edit(name) } }}
          data-hints="A:Edit;X:Apply;Y:Options;B:Back"
        >
          <span className={styles.rowIcon} aria-hidden="true"><Icon name="library" size={24} /></span>
          <span className={styles.rowText}>
            <span className={styles.rowName}>{name}</span>
            <span className={styles.rowSub}>{subtitle(name)}</span>
          </span>
          <span className={styles.tags}>
            {name === currentProfileName && <span className={`${styles.tag} ${styles.tagAccent}`}>{t('profiles.editing')}</span>}
            {name === appliedProfileName && <span className={`${styles.tag} ${styles.tagOk}`}><span className={styles.tagDot} />{t('profiles.applied')}</span>}
            {name === currentProfileName && hasPendingChanges && <span className={`${styles.tag} ${styles.tagWarn}`}>Unsaved</span>}
            {autoload.length > 0 && <span className={styles.tag}>Autoload: {autoload.join(', ')}</span>}
            {isTemplate(name) && <span className={styles.tag}>Template</span>}
            {isTemplate(name) && importers.length > 0 && <span className={styles.tag}>Imported by {importers.length}</span>}
          </span>
        </button>
        <Menu
          open={optionsFor === name}
          // Closing lands back on the row, not on the hidden trigger: Radix
          // refocuses the trigger as its content unmounts, so this waits it out.
          onOpenChange={open => {
            setOptionsFor(open ? name : null)
            if (!open) window.setTimeout(() => listRef.current?.querySelector<HTMLElement>(`[data-profile="${CSS.escape(name)}"] > button`)?.focus(), 80)
          }}
          align="end"
          ariaLabel={`Options for ${name}`}
          trigger={<button type="button" className={`icon-button ${styles.options}`} aria-label={`Options for ${name}`} tabIndex={-1} data-nav-skip onClick={() => setSelected(name)}><Icon name="more" size={18} /></button>}
          items={[
            { label: 'Duplicate', description: name === currentProfileName ? 'A copy beside it, opened for editing' : 'Open it for editing to duplicate it', disabled: name !== currentProfileName || !onCopyActiveProfile || isCalibrating, onSelect: () => onCopyActiveProfile?.() },
            { label: 'Rename', disabled: isCalibrating, onSelect: () => startRename(name) },
            { kind: 'separator' },
            { label: 'Delete', description: 'Moves the file to the recycle bin', disabled: isCalibrating, onSelect: () => { setSelected(name); setConfirming(name) } },
          ]}
        />
      </li>
    )
  }

  // First run (System States 17d): nothing in the library yet.
  if (!libraryLoading && libraryProfiles.length === 0) return (
    <div className={styles.welcome} data-hints="A:Choose;B:Skip">
      <img className={styles.welcomeMark} src="/app-icon.svg" alt="" />
      <h2>Welcome to JSM Studio</h2>
      <p>Start from a template, import an existing JoyShockMapper config, or begin with an empty configuration. You can change everything later.</p>
      <input ref={importRef} type="file" accept=".txt,.cfg,.ini,*/*" hidden onChange={async event => {
        const file = event.target.files?.[0]
        if (file && onImportProfile) onImportProfile(file.name, await file.text())
        event.target.value = ''
      }} />
      <div className={styles.welcomeChoices}>
        {onImportProfile && <button type="button" className={styles.choice} onClick={() => onImportProfile(`${FPS_TEMPLATE_NAME}.txt`, FPS_TEMPLATE_TEXT)}>
          <b>FPS Template</b><span>Gyro aim on grip, pads as mouse and menu</span>
        </button>}
        {onImportProfile && <button type="button" className={styles.choice} onClick={() => importRef.current?.click()}>
          <b>Import a config</b><span>Pick a .txt from your JSM folder</span>
        </button>}
        <button type="button" className={styles.choice} onClick={onAddProfile}>
          <b>Empty</b><span>Every input unbound</span>
        </button>
      </div>
    </div>
  )

  const facts = current ? factsFor(current) : undefined
  const currentMeta = current ? meta[current] : undefined
  const loaders = current ? loadedBy.get(current) ?? [] : []
  const currentAutoload = current ? autoloadFor(current) : []

  return (
    <div className={styles.library} aria-busy={libraryLoading || undefined}>
      {/* Two regions for the pad: Up/Down walk the list or the panel, never
          across, so going down the list does not jump into the panel when
          one of its buttons sits nearer than the next row. Left/Right cross. */}
      <div className={styles.lists} ref={listRef} data-nav-region="list">
        <h3 className={styles.eyebrow}>Profiles · {profiles.length}</h3>
        {libraryProfiles.length === 0
          ? <p className={styles.empty}>{t('profiles.empty')}</p>
          : <ul className={styles.rows}>{profiles.map(row)}</ul>}
        {templates.length > 0 && <>
          <h3 className={styles.eyebrow}>Templates · {templates.length}</h3>
          <ul className={styles.rows}>{templates.map(row)}</ul>
        </>}
      </div>

      {current && (
        <aside className={styles.detail} aria-label={`${current} details`} data-nav-region="detail">
          <span className={styles.eyebrow}>Selected</span>
          {renaming ? (
            <div className={styles.rename}>
              <input ref={renameRef} className="text-field" aria-label="Configuration name" maxLength={80} value={renamed} disabled={isCalibrating}
                onChange={event => onProfileNameChange(current, event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelRename() }
                }} />
              <button type="button" className="button button--primary button--sm" disabled={!canRename || isCalibrating} onClick={commitRename}>Rename</button>
              <button type="button" className="button button--tertiary button--sm" onClick={cancelRename}>{t('common.cancel')}</button>
            </div>
          ) : <h3 className={styles.detailName}>{current}</h3>}
          <dl className={styles.facts}>
            {seen.name && editingSelected && <div><dt>Controller</dt><dd>{seen.name}</dd></div>}
            <div><dt>Output</dt><dd>{facts?.output ?? '—'}</dd></div>
            <div><dt>Imports</dt><dd>{facts?.imports.length ? facts.imports.join(', ') : 'none'}</dd></div>
            <div><dt>Layers</dt><dd className={styles.layerList}>{facts?.layers.length ? facts.layers.map(layer => <span key={layer.name}><span className={styles.swatch} style={{ background: layer.color }} />{layer.name}</span>) : 'none'}</dd></div>
            {!!facts?.loads.length && <div><dt>Loads</dt><dd>{facts.loads.map(link => `${link.target} (${keyLabel(link.keys)})`).join(', ')}</dd></div>}
            {loaders.length > 0 && <div><dt>Loaded by</dt><dd>{loaders.map(link => `${link.by} (${keyLabel(link.keys)})`).join(', ')}</dd></div>}
            {isTemplate(current) && <div><dt>Imported by</dt><dd>{(importedBy.get(current) ?? [currentProfileName]).join(', ')}</dd></div>}
            <div><dt>Autoload</dt><dd>{currentAutoload.length ? currentAutoload.join(', ') : 'none'}</dd></div>
            <div><dt>File</dt><dd className={styles.mono}>{current}.txt{currentMeta ? ` · saved ${relativeTime(currentMeta.modifiedAtMs, now)}` : ''}</dd></div>
            {(editingSelected && hasPendingChanges) || (current === appliedProfileName && !profileApplied) ? <div><dt>Status</dt><dd>{[editingSelected && hasPendingChanges ? 'Unsaved changes' : null, current === appliedProfileName && !profileApplied ? 'Applied (older version)' : null].filter(Boolean).join(' · ')}</dd></div> : null}
          </dl>

          <div className={styles.actionGrid}>
            <button type="button" className={`button ${editingSelected ? 'button--secondary' : 'button--primary'}`} disabled={isCalibrating} onClick={() => edit(current)} data-hints="A:Edit;B:Back">
              <span className={styles.faceKey} aria-hidden="true">A</span>Edit
            </button>
            <button type="button" className={`button ${editingSelected ? 'button--primary' : 'button--secondary'}`} disabled={isCalibrating || (editingSelected ? !onApply : !onApplyLibraryProfile)}
              title={editingSelected || onApplyLibraryProfile ? undefined : 'Open it for editing to apply it'} onClick={() => apply(current)}>Apply</button>
            <button type="button" className="button button--secondary" disabled={!editingSelected || !onCopyActiveProfile || isCalibrating}
              title={editingSelected ? undefined : 'Open it for editing to duplicate it'} onClick={() => onCopyActiveProfile?.()}>Duplicate</button>
            <button type="button" className="button button--secondary" disabled={isCalibrating || renaming} onClick={() => startRename(current)}>Rename</button>
          </div>

          <div className={styles.quiet}>
            {onShowInFolder && <button type="button" className="button button--tertiary" onClick={onShowInFolder}>Show in folder</button>}
            {onEditSource && <button type="button" className="button button--tertiary" disabled={!editingSelected}
              title={editingSelected ? undefined : 'Open it for editing to see its source'} onClick={onEditSource}>{t('app.profileSummary.openSourceConfig', 'Edit source')}</button>}
            <button type="button" className="button button--danger" disabled={isCalibrating} onClick={() => setConfirming(current)}>Delete</button>
          </div>
          {isCalibrating && lockMessage && <p className={styles.lock}>{lockMessage}</p>}
        </aside>
      )}

      {/* Escape must preventDefault, or the same press also reaches the
          page's own handler once the overlay is gone and backs out of Studio. */}
      {confirming && (() => {
        const loadedFrom = loadedBy.get(confirming) ?? []
        const importers = importedBy.get(confirming) ?? []
        return (
          <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setConfirming(null) } }}>
            <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-config-title" aria-describedby="delete-config-body">
              <h3 id="delete-config-title">Delete {confirming}?</h3>
              <p id="delete-config-body">
                The file moves to the recycle bin.
                {loadedFrom.length > 0 ? <> <strong>{loadedFrom[0].by}</strong> loads it from {keyLabel(loadedFrom[0].keys)}; that binding will show as missing until you choose another configuration.</> : null}
                {importers.length > 0 ? <> <strong>{importers.join(', ')}</strong> import{importers.length === 1 ? 's' : ''} it; that import will be missing until you choose another.</> : null}
                {confirming === currentProfileName ? ' It is open now, so Studio opens another configuration.' : ''}
              </p>
              <div className="confirm-dialog__actions">
                <button type="button" className="button button--secondary" data-modal-close onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
                <button type="button" className="button button--danger-solid" onClick={() => { onDeleteProfile(confirming); setConfirming(null) }}>{t('common.delete')}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
