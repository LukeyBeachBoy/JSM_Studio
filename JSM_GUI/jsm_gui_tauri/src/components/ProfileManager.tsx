import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './icons/Icon'
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
  onShowInFolder?: () => void
  onEditSource?: () => void
}

// Studio home (Studio Home.dc.html 8a): every profile and template in the
// config folder as rows, the selected one's facts and actions beside them.
// Selecting a row never loads it; Edit does, through the unsaved guard.
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
  onShowInFolder,
  onEditSource,
}: ProfileManagerProps) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string | null>(currentProfileName)
  const [confirming, setConfirming] = useState<string | null>(null)
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const importRef = useRef<HTMLInputElement | null>(null)

  // Follow the editor: switching configuration selects the new one.
  useEffect(() => { setSelected(currentProfileName) }, [currentProfileName])
  useEffect(() => { if (selected && !libraryProfiles.includes(selected)) setSelected(currentProfileName) }, [libraryProfiles, selected, currentProfileName])
  // A destructive confirmation starts on Cancel (System States 17g).
  useEffect(() => { if (confirming) cancelRef.current?.focus() }, [confirming])

  const isTemplate = (name: string) => !!templateNames?.has(name) && name !== currentProfileName
  const profiles = libraryProfiles.filter(name => !isTemplate(name))
  const templates = libraryProfiles.filter(isTemplate)
  const current = selected ?? currentProfileName
  const editingSelected = !!current && current === currentProfileName

  const subtitle = (name: string) => {
    if (isTemplate(name)) return `Imported by ${currentProfileName} · not applied directly`
    if (name !== currentProfileName) return 'Configuration file'
    const parts = [editingDetails?.output, ...(editingDetails?.imports ?? []).map(i => `imports ${i}`)]
    const layers = editingDetails?.layers?.length ?? 0
    if (layers) parts.push(`${layers} layer${layers === 1 ? '' : 's'}`)
    return parts.filter(Boolean).join(' · ') || 'Being edited'
  }

  const row = (name: string) => (
    <li key={name}>
      <button
        type="button"
        className={styles.row}
        aria-pressed={current === name}
        onClick={() => setSelected(name)}
        onDoubleClick={() => onLoadLibraryProfile(name)}
        data-hints="A:Select;B:Back"
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
          {isTemplate(name) && <span className={styles.tag}>Template</span>}
        </span>
      </button>
    </li>
  )

  const renamed = current ? (editedProfileNames[current] ?? current) : ''
  const canRename = !!current && !!renamed.trim() && renamed.trim() !== current

  // First run (System States 17d): nothing in the library yet.
  if (!libraryLoading && libraryProfiles.length === 0) return (
    <div className={styles.welcome}>
      <img className={styles.welcomeMark} src="/app-icon.svg" alt="" />
      <h2>Welcome to JSM Studio</h2>
      <p>Import an existing JoyShockMapper config, or begin with an empty configuration. You can change everything later.</p>
      <input ref={importRef} type="file" accept=".txt,.cfg,.ini,*/*" hidden onChange={async event => {
        const file = event.target.files?.[0]
        if (file && onImportProfile) onImportProfile(file.name, await file.text())
        event.target.value = ''
      }} />
      <div className={styles.welcomeChoices}>
        {onImportProfile && <button type="button" className={styles.choice} onClick={() => importRef.current?.click()}>
          <b>Import a config</b><span>Pick a .txt from your JSM folder</span>
        </button>}
        <button type="button" className={styles.choice} onClick={onAddProfile}>
          <b>Empty</b><span>Every input unbound</span>
        </button>
      </div>
      {onEditSource && <button type="button" className="button button--tertiary" onClick={onEditSource}>{t('app.profileSummary.openSourceConfig', 'Edit source')}</button>}
    </div>
  )

  return (
    <div className={styles.library} aria-busy={libraryLoading || undefined}>
      <div className={styles.lists}>
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
        <aside className={styles.detail} aria-label={`${current} details`}>
          <span className={styles.eyebrow}>Selected</span>
          <h3 className={styles.detailName}>{current}</h3>
          <dl className={styles.facts}>
            <div><dt>File</dt><dd className={styles.mono}>{current}.txt</dd></div>
            <div><dt>Status</dt><dd>{[current === currentProfileName ? (hasPendingChanges ? 'Editing · unsaved' : 'Editing') : null, current === appliedProfileName ? (profileApplied ? 'Applied' : 'Applied (older version)') : null].filter(Boolean).join(' · ') || 'Not open'}</dd></div>
            {editingSelected && editingDetails?.output && <div><dt>Output</dt><dd>{editingDetails.output}</dd></div>}
            {editingSelected && !!editingDetails?.imports?.length && <div><dt>Imports</dt><dd>{editingDetails.imports.join(', ')}</dd></div>}
            {editingSelected && !!editingDetails?.layers?.length && <div><dt>Layers</dt><dd className={styles.layerList}>{editingDetails.layers.map(layer => <span key={layer.name}><span className={styles.swatch} style={{ background: layer.color }} />{layer.name}</span>)}</dd></div>}
            {isTemplate(current) && <div><dt>Imported by</dt><dd>{currentProfileName}</dd></div>}
          </dl>

          <div className={styles.actionGrid}>
            <button type="button" className="button button--primary" disabled={editingSelected || isCalibrating} onClick={() => onLoadLibraryProfile(current)}>
              {editingSelected ? 'Editing' : 'Edit'}
            </button>
            <button type="button" className="button button--secondary" disabled={!editingSelected || !onApply || isCalibrating}
              title={editingSelected ? undefined : 'Open it for editing to apply it'} onClick={() => onApply?.()}>Apply</button>
            <button type="button" className="button button--secondary" disabled={!editingSelected || !onCopyActiveProfile || isCalibrating}
              title={editingSelected ? undefined : 'Open it for editing to duplicate it'} onClick={() => onCopyActiveProfile?.()}>Duplicate</button>
          </div>

          <label className={styles.rename}>
            <span>Name</span>
            <span className={styles.renameRow}>
              <input className="text-field" aria-label="Configuration name" maxLength={80} value={renamed} disabled={isCalibrating}
                onChange={event => onProfileNameChange(current, event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter' && canRename) onRenameProfile(current) }} />
              <button type="button" className="button button--secondary" disabled={!canRename || isCalibrating} onClick={() => onRenameProfile(current)}>Rename</button>
            </span>
          </label>

          <div className={styles.quiet}>
            {onShowInFolder && <button type="button" className="button button--tertiary" onClick={onShowInFolder}>Show in folder</button>}
            {onEditSource && <button type="button" className="button button--tertiary" disabled={!editingSelected}
              title={editingSelected ? undefined : 'Open it for editing to see its source'} onClick={onEditSource}>{t('app.profileSummary.openSourceConfig', 'Edit source')}</button>}
            <button type="button" className="button button--danger" disabled={isCalibrating} onClick={() => setConfirming(current)}>Delete</button>
          </div>
          {isCalibrating && lockMessage && <p className={styles.lock}>{lockMessage}</p>}
        </aside>
      )}

      {confirming && (
        <div className="modal-overlay modal-overlay--over" onKeyDown={event => { if (event.key === 'Escape') setConfirming(null) }}>
          <div className="modal-card confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-config-title" aria-describedby="delete-config-body">
            <h3 id="delete-config-title">Delete {confirming}?</h3>
            <p id="delete-config-body">
              {confirming}.txt is removed from your configuration folder.
              {confirming === currentProfileName ? ' It is open now, so Studio opens another configuration.' : ''}
              {isTemplate(confirming) ? <> <strong>{currentProfileName}</strong> imports it; that import will be missing until you choose another.</> : null}
            </p>
            <div className="confirm-dialog__actions">
              <button ref={cancelRef} type="button" className="button button--secondary" onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
              <button type="button" className="button button--danger-solid" onClick={() => { onDeleteProfile(confirming); setConfirming(null) }}>{t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
