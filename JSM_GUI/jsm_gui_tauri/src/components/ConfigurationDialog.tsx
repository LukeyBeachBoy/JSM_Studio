import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, type AutoloadRule, type RunningProcess } from '../platform/desktopBridge'
import { exeFileName, processStemOf } from '../hooks/useAppIcon'
import { showToast } from '../utils/toast'
import { AppIconImage } from './AppIconImage'
import { Switch } from './AssociationsPage'
import { Dialog } from './ui/Dialog'
import { SubPage } from './ui/console'
import { AppSelect } from './ui/AppSelect'
import { Icon } from './icons/Icon'
import styles from './ConfigurationDialog.module.css'

// New configuration / Associate with a game (TODO-46). A configuration can
// carry a game's icon without that game ever loading it: the association is
// an AutoLoad rule saved paused, and the toggle here -- off by default -- is
// what makes it a live rule. One dialog, two modes: creating asks for a name
// first; associating edits the game of a configuration that already exists.

export type NewConfigurationDraft = {
  name: string
  /** The AutoLoad process stem, "DOOMEternalx64vk", when a game was chosen. */
  processName?: string
  exePath?: string
  autoApply: boolean
  /** The whole file, from the New configuration wizard (header, base, game). */
  text?: string
}

/** A chosen game: the executable's path when known, always its process stem. */
type Game = { processName: string; exePath?: string }

type ConfigurationDialogProps = {
  mode: 'create' | 'associate'
  /** associate: the configuration being associated, and the rule it has now. */
  profileName?: string
  rule?: AutoloadRule | null
  onClose: () => void
  /** create: makes the configuration and, with a game, its rule. */
  onCreate?: (draft: NewConfigurationDraft) => Promise<void> | void
}

const gameFromRule = (rule: AutoloadRule | null | undefined): Game | null =>
  rule ? { processName: rule.processName, exePath: rule.exePath } : null

function ConfigurationSurface({ mode, profileName, title, onClose, onKeyDown, actions, children }: {
  mode: 'create' | 'associate'; profileName?: string; title: string; onClose: () => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void; actions: ReactNode; children: ReactNode
}) {
  if (mode === 'create') return <Dialog onClose={onClose} width={560} title={title} onKeyDown={onKeyDown} actions={actions}>{children}</Dialog>
  return <SubPage open onClose={onClose} crumbRoot="Library" trail={['Games', profileName ?? 'Configuration']} title="Launch with game" backLabel="Back to Library">
    <div style={{ maxWidth: 760, margin: '0 auto' }} onKeyDown={onKeyDown}>{children}<div className="confirm-dialog__actions">{actions}</div></div>
  </SubPage>
}

/** "DOOM Eternal" from "C:\Games\DOOM Eternal\DOOMEternalx64vk.exe": the folder is usually the game's name. */
export const suggestedName = (exePath: string) => {
  const parts = exePath.split(/[\\/]/).filter(Boolean)
  const folder = parts.length >= 2 ? parts[parts.length - 2] : ''
  const generic = /^(bin|binaries|win64|win32|x64|x86|game|games|program files( \(x86\))?|steamapps|common|retail|shipping)$/i
  const base = folder && !generic.test(folder) ? folder : processStemOf(exePath)
  return base.replace(/[_-]+/g, ' ').trim().slice(0, 80)
}

export function ConfigurationDialog({ mode, profileName, rule, onClose, onCreate }: ConfigurationDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [typedName, setTypedName] = useState(false)
  const [game, setGame] = useState<Game | null>(() => gameFromRule(rule))
  const [autoApply, setAutoApply] = useState(() => !!rule && !rule.paused)
  const [running, setRunning] = useState<RunningProcess[]>([])
  const [runningLoading, setRunningLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (mode === 'create') nameRef.current?.focus() }, [mode])
  useEffect(() => {
    let disposed = false
    void desktopBridge.listRunningProcesses().catch(() => [] as RunningProcess[]).then(list => {
      if (disposed) return
      const seen = new Map<string, RunningProcess>()
      for (const process of list) {
        const key = exeFileName(process.processName).toLowerCase()
        if (!seen.has(key)) seen.set(key, process)
      }
      setRunning([...seen.values()].sort((left, right) => left.processName.localeCompare(right.processName)))
      setRunningLoading(false)
    })
    return () => { disposed = true }
  }, [])

  const chooseGame = (next: Game | null) => {
    setGame(next)
    // A game picked before a name was typed names the configuration after it.
    if (mode === 'create' && next?.exePath && !typedName) setName(suggestedName(next.exePath))
  }
  const browse = async () => {
    const picked = await desktopBridge.pickExecutable().catch(() => null)
    if (picked) chooseGame({ processName: processStemOf(picked), exePath: picked })
  }
  const chooseRunning = (value: string) => {
    if (!value) return
    const process = running.find(candidate => exeFileName(candidate.processName) === value)
    if (process) chooseGame({ processName: processStemOf(process.processName), exePath: process.exePath })
  }

  const trimmedName = name.trim()
  const canSubmit = !busy && (mode === 'create' ? trimmedName.length > 0 : true)
  const unchanged = mode === 'associate' && !!rule && game?.processName === rule.processName && (game?.exePath ?? '') === (rule.exePath ?? '') && autoApply === !rule.paused

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    try {
      if (mode === 'create') {
        await onCreate?.({ name: trimmedName, processName: game?.processName, exePath: game?.exePath, autoApply: !!game && autoApply })
        onClose()
        return
      }
      if (!profileName) return
      // The previous game's rule goes when the game changes; with no game
      // left, the association is removed.
      if (rule && (!game || game.processName.toLowerCase() !== rule.processName.toLowerCase())) {
        const removed = await desktopBridge.deleteAutoloadRule(rule.processName)
        if (!removed.success) { showToast(t('newConfiguration.removeFailed', 'Could not remove the association.'), 'error'); return }
      }
      if (game) {
        const saved = await desktopBridge.saveAutoloadRule(game.processName, profileName, { exePath: game.exePath, autoApply })
        if (!saved) { showToast(t('newConfiguration.associateFailed', 'Could not associate {{name}} with {{game}}.', { name: profileName, game: exeFileName(game.processName) }), 'error'); return }
      }
      window.dispatchEvent(new Event('jsm:associations-changed'))
      onClose()
    } finally { setBusy(false) }
  }

  const gameLabel = game ? exeFileName(game.processName) : ''
  // Selected only when the chosen game is that running app, path included: a
  // rule that knows the name but not the path must still be pickable here,
  // since picking it is how the path (and the icon) arrives.
  const runningValue = game && running.some(process => exeFileName(process.processName) === gameLabel && (process.exePath ?? '') === (game.exePath ?? '')) ? gameLabel : ''
  const title = mode === 'create' ? t('newConfiguration.title', 'New configuration') : t('newConfiguration.associateTitle', 'Game for {{name}}', { name: profileName })

  return (
    <ConfigurationSurface mode={mode} profileName={profileName} onClose={onClose}
      title={title}
      onKeyDown={event => { if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') { event.preventDefault(); void submit() } }}
      actions={<>
        <button type="button" className="button button--secondary" disabled={busy} onClick={onClose} data-hints="A:Cancel;B:Cancel">{t('common.cancel', 'Cancel')}</button>
        <button type="button" className="button button--primary" disabled={!canSubmit || unchanged} onClick={() => void submit()} data-hints={mode === 'create' ? 'A:Create;B:Cancel' : 'A:Save;B:Cancel'}>
          {mode === 'create' ? t('newConfiguration.create', 'Create') : t('common.save', 'Save')}
        </button>
      </>}>
      <div className={styles.body}>
        {mode === 'create' && (
          <label className={styles.field}>
            <span className={styles.label}>{t('newConfiguration.name', 'Name')}</span>
            <input ref={nameRef} className="text-field" maxLength={80} value={name} placeholder={t('newConfiguration.namePlaceholder', 'e.g. Doom Eternal')} disabled={busy}
              onChange={event => { setName(event.target.value); setTypedName(event.target.value.trim().length > 0) }} />
          </label>
        )}

        <section className={styles.game} aria-label={t('newConfiguration.game', 'Game or app')}>
          <span className={styles.label}>{t('newConfiguration.game', 'Game or app')} <span className={styles.optional}>{t('newConfiguration.optional', '(optional)')}</span></span>
          <div className={styles.chosen} data-empty={game ? undefined : ''}>
            <span className={styles.chosenIcon} aria-hidden="true">
              <AppIconImage exePath={game?.exePath} size={32} fallback={<Icon name="associations" size={20} />} />
            </span>
            <span className={styles.chosenText}>
              {game ? <>
                <span className={styles.chosenName}>{gameLabel}</span>
                <span className={styles.chosenPath}>{game.exePath ?? t('newConfiguration.noPath', 'Process name only · Browse to add its icon')}</span>
              </> : <span className={styles.chosenNone}>{t('newConfiguration.none', 'No game chosen. The configuration gets a plain icon.')}</span>}
            </span>
            {game && <button type="button" tabIndex={-1} data-nav-skip className={`icon-button ${styles.clear}`} aria-label={t('newConfiguration.clear', 'Remove game')} data-caption={t('newConfiguration.clear', 'Remove game')} disabled={busy} onClick={() => chooseGame(null)}><Icon name="remove" size={18} /></button>}
          </div>
          <div className={styles.pickers}>
            <button type="button" data-autofocus={mode === 'associate' ? '' : undefined} className="button button--secondary" disabled={busy} onClick={() => void browse()} data-hints="A:Choose game">{t('newConfiguration.browse', 'Browse…')}</button>
            <label className={styles.runningField}>
              <span className={styles.runningLabel}>{t('newConfiguration.runningNow', 'Running now')}</span>
              <AppSelect className="app-select" aria-label={t('newConfiguration.runningNow', 'Running now')} value={runningValue} disabled={busy || (!runningLoading && running.length === 0)}
                onChange={event => chooseRunning(event.target.value)}>
                <option value="">{runningLoading ? t('newConfiguration.runningLooking', 'Looking for windows…') : running.length === 0 ? t('newConfiguration.runningNone', 'No windowed apps found') : t('newConfiguration.runningChoose', 'Choose a running app…')}</option>
                {running.map(process => {
                  const exe = exeFileName(process.processName)
                  return <option key={`${exe}-${process.pid}`} value={exe}>{process.windowTitle ? `${exe} · ${process.windowTitle}` : exe}</option>
                })}
              </AppSelect>
            </label>
          </div>
        </section>

        <div className={`setting-row setting-row--compact ${styles.autoApplyRow}`} data-disabled={game ? undefined : ''}>
          <span className={styles.autoApplyText}>
            <span>Launch with game</span>
            <small>{autoApply ? 'Goes live when the game is in front' : 'Uses the game’s art; launched manually'}</small>
          </span>
          <Switch on={!!game && autoApply} label="Launch with game" disabled={busy || !game} onChange={setAutoApply} />
        </div>
      </div>
    </ConfigurationSurface>
  )
}
