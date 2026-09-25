import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AdvancedDisclosure } from './AdvancedDisclosure'
import { NumberField } from './NumberField'
import styles from './AiMappingPage.module.css'
import {
  desktopBridge,
  type AiConversationMessage,
  type AiGenerateResponse,
  type AiSettings,
} from '../platform/desktopBridge'
import { ensureHeaderLines } from '../utils/config'
import { showToast } from '../utils/toast'

type AiMappingPageProps = {
  configText: string
  currentProfileName: string | null
  hasPendingChanges: boolean
  onReplaceConfig: (value: string) => void
  onApplyGeneratedConfig: (value: string) => Promise<void>
}

type ChatEntry = {
  id: string
  role: 'user' | 'assistant'
  content: string
  result?: AiGenerateResponse
  /** The configuration the proposal was made against, for its diff. */
  base?: string
}

const DEFAULT_SETTINGS: AiSettings = {
  apiKey: '',
  model: '',
  baseUrl: '',
  temperature: 0.2,
}

// What a proposal changes, as config lines: removed then added. Header lines
// Studio manages itself are left out; the rest is what the model changed.
const HEADER = /^(TELEMETRY_ENABLED|TELEMETRY_PORT|AUTOCONNECT|RESET_MAPPINGS)\b/
const diffLines = (before: string, after: string) => {
  const clean = (text: string) => text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !HEADER.test(line))
  const old = clean(before), next = clean(after)
  const oldSet = new Set(old), nextSet = new Set(next)
  return [
    ...old.filter(line => !nextSet.has(line)).map(line => ({ kind: 'removed' as const, line })),
    ...next.filter(line => !oldSet.has(line)).map(line => ({ kind: 'added' as const, line })),
  ]
}

const createEntryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const formatAssistantHistoryContent = (result: AiGenerateResponse) => {
  const sections = [result.summary.trim()].filter(Boolean)

  if (result.assumptions.length > 0) {
    sections.push(`Assumptions:\n${result.assumptions.map(item => `- ${item}`).join('\n')}`)
  }

  if (result.warnings.length > 0) {
    sections.push(`Warnings:\n${result.warnings.map(item => `- ${item}`).join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

const toConversationHistory = (entries: ChatEntry[]): AiConversationMessage[] =>
  entries.map(entry => ({
    role: entry.role,
    content: entry.role === 'assistant' && entry.result ? formatAssistantHistoryContent(entry.result) : entry.content,
  }))

export function AiMappingPage({
  configText,
  currentProfileName,
  hasPendingChanges,
  onReplaceConfig,
  onApplyGeneratedConfig,
}: AiMappingPageProps) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_SETTINGS)
  const [composer, setComposer] = useState('')
  const [includeCurrentConfig, setIncludeCurrentConfig] = useState(true)
  const [messages, setMessages] = useState<ChatEntry[]>([])
  const [workingConfig, setWorkingConfig] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const chatViewportRef = useRef<HTMLDivElement | null>(null)

  const hasAssistantDraft = messages.some(message => message.role === 'assistant' && message.result)

  useEffect(() => {
    let disposed = false
    void desktopBridge.getAiSettings()
      .then(nextSettings => {
        if (!disposed) {
          setSettings(nextSettings)
          setSettingsLoaded(true)
        }
      })
      .catch(error => {
        if (!disposed) {
          console.error('Failed to load AI settings', error)
          setErrorMessage(error instanceof Error ? error.message : String(error))
          setSettingsLoaded(true)
        }
      })

    return () => {
      disposed = true
    }
  }, [])

  useEffect(() => {
    if (!hasAssistantDraft) {
      setWorkingConfig(configText)
    }
  }, [configText, hasAssistantDraft])

  useEffect(() => {
    const viewport = chatViewportRef.current
    if (!viewport) return
    viewport.scrollTop = viewport.scrollHeight
  }, [messages, generating])

  const previewConfig = useMemo(() => {
    const source = hasAssistantDraft ? workingConfig : configText
    return ensureHeaderLines(source)
  }, [configText, hasAssistantDraft, workingConfig])

  const currentConfigForRequest = useMemo(() => {
    if (hasAssistantDraft) {
      return previewConfig
    }
    return includeCurrentConfig ? configText : undefined
  }, [configText, hasAssistantDraft, includeCurrentConfig, previewConfig])

  const persistSettings = async () => {
    setSavingSettings(true)
    setErrorMessage(null)
    try {
      const persisted = await desktopBridge.saveAiSettings(settings)
      setSettings(persisted)
      showToast(t('messages.aiSettingsSaved'))
    } catch (error) {
      console.error('Failed to save AI settings', error)
      const message = t('messages.aiSettingsFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
      setErrorMessage(message)
      showToast(message, 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  const handleSend = async () => {
    const userPrompt = composer.trim()
    if (!userPrompt) {
      const message = t('ai.requestRequired')
      setErrorMessage(message)
      showToast(message, 'error')
      return
    }
    if (!settings.apiKey.trim()) {
      const message = t('ai.apiKeyRequired')
      setErrorMessage(message)
      showToast(message, 'error')
      return
    }
    if (!settings.model.trim()) {
      const message = t('ai.modelRequired')
      setErrorMessage(message)
      showToast(message, 'error')
      return
    }
    if (!settings.baseUrl.trim()) {
      const message = t('ai.baseUrlRequired')
      setErrorMessage(message)
      showToast(message, 'error')
      return
    }

    const nextUserEntry: ChatEntry = {
      id: createEntryId(),
      role: 'user',
      content: userPrompt,
    }

    const priorMessages = messages
    setMessages(current => [...current, nextUserEntry])
    setComposer('')
    setGenerating(true)
    setErrorMessage(null)

    try {
      const persistedSettings = await desktopBridge.saveAiSettings(settings)
      setSettings(persistedSettings)

      const nextResult = await desktopBridge.generateAiMapping({
        userPrompt,
        currentConfig: currentConfigForRequest,
        currentProfileName,
        includeCurrentConfig,
        conversationHistory: toConversationHistory(priorMessages),
        locale: i18n.language,
      })

      setWorkingConfig(nextResult.configText)
      setMessages(current => [
        ...current,
        {
          id: createEntryId(),
          role: 'assistant',
          content: nextResult.summary || t('ai.emptySummary'),
          result: nextResult,
          base: currentConfigForRequest ?? '',
        },
      ])
    } catch (error) {
      console.error('Failed to generate AI mapping', error)
      const message = t('messages.aiGenerationFailed', {
        error: error instanceof Error ? error.message : String(error),
      })
      setErrorMessage(message)
      showToast(message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleReplaceEditor = () => {
    onReplaceConfig(previewConfig)
    showToast(t('messages.aiEditorReplaced'))
  }

  const handleApplyGeneratedConfig = async () => {
    setApplying(true)
    try {
      await onApplyGeneratedConfig(previewConfig)
    } finally {
      setApplying(false)
    }
  }

  const handleResetConversation = () => {
    setMessages([])
    setWorkingConfig(configText)
    setErrorMessage(null)
  }

  const latestProposal = [...messages].reverse().find(message => message.role === 'assistant' && message.result)
  const settingsReady = Boolean(settings.apiKey.trim() && settings.model.trim() && settings.baseUrl.trim())

  // AI assistant (Tuning and Studio Pages 16e): a conversation. Each answer is
  // a proposal -- the change as config lines -- applied only when you say so.
  return (
    <div className={styles.page}>
      <AdvancedDisclosure label={t('ai.apiSettingsTitle')} summary={settingsReady ? `${settings.model} · ${settings.baseUrl}` : 'Not set up yet'} defaultOpen={settingsLoaded && !settingsReady}>
        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span>{t('ai.apiKeyLabel')}</span>
            <input className="text-field" type="password" placeholder={t('ai.apiKeyPlaceholder')} value={settings.apiKey}
              onChange={event => setSettings(current => ({ ...current, apiKey: event.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>{t('ai.modelLabel')}</span>
            <input className="text-field" type="text" placeholder={t('ai.modelPlaceholder')} value={settings.model}
              onChange={event => setSettings(current => ({ ...current, model: event.target.value }))} />
          </label>
          <label className={styles.field}>
            <span>{t('ai.baseUrlLabel')}</span>
            <input className="text-field" type="url" placeholder={t('ai.baseUrlPlaceholder')} value={settings.baseUrl}
              onChange={event => setSettings(current => ({ ...current, baseUrl: event.target.value }))} />
          </label>
        </div>
        <NumberField label={t('ai.temperatureLabel')} value={settings.temperature} hint={t('ai.temperatureHint')}
          onChange={raw => {
            const nextValue = Number.parseFloat(raw)
            setSettings(current => ({ ...current, temperature: Number.isFinite(nextValue) ? nextValue : current.temperature }))
          }}
          min={0} max={2} step={0.1} coarseStep={0.5} />
        <div className={styles.settingsFooter}>
          <span className={styles.note}>{t('ai.apiSettingsDescription')} {t('ai.providerNote')}</span>
          <button type="button" className="button button--secondary" onClick={() => void persistSettings()} disabled={savingSettings}>
            {savingSettings ? t('ai.savingSettings') : t('ai.saveSettings')}
          </button>
        </div>
      </AdvancedDisclosure>

      {errorMessage && <div className={styles.errorBanner} role="alert">{errorMessage}</div>}

      <div ref={chatViewportRef} className={styles.chat} aria-live="polite">
        {messages.length === 0 && !generating && (
          <div className={styles.empty}>
            <b>{t('ai.emptyConversationTitle')}</b>
            <p>{t('ai.emptyConversationDescription')}</p>
          </div>
        )}
        {messages.map(message => message.role === 'user'
          ? <div key={message.id} className={styles.userBubble}>{message.content}</div>
          : (
            <article key={message.id} className={styles.proposal}>
              <p className={styles.proposalText}>{message.content}</p>
              {message.result && (() => {
                const changes = diffLines(message.base ?? '', message.result.configText)
                const isLatest = message === latestProposal
                return <>
                  {changes.length > 0
                    ? <pre className={styles.diff} aria-label="Proposed change">{changes.slice(0, 14).map((change, index) =>
                        <span key={index} className={change.kind === 'added' ? styles.added : styles.removed}>{change.kind === 'added' ? '+ ' : '− '}{change.line}{'\n'}</span>)}
                        {changes.length > 14 && <span className={styles.more}>…and {changes.length - 14} more lines{'\n'}</span>}
                      </pre>
                    : <p className={styles.note}>No lines changed.</p>}
                  {message.result.assumptions.length > 0 && <div className={styles.block}><b>{t('ai.assumptions')}</b><ul>{message.result.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  {message.result.warnings.length > 0 && <div className={`${styles.block} ${styles.warn}`}><b>{t('ai.warnings')}</b><ul>{message.result.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
                  {isLatest && (
                    <div className={styles.proposalActions}>
                      <button type="button" className="button button--primary" onClick={() => void handleApplyGeneratedConfig()} disabled={applying}>{applying ? t('ai.applyingToJsm') : 'Apply change'}</button>
                      <button type="button" className="button button--secondary" onClick={handleReplaceEditor}>Edit in editor</button>
                      <button type="button" className="button button--tertiary" onClick={handleResetConversation}>Discard</button>
                    </div>
                  )}
                </>
              })()}
            </article>
          ))}
        {generating && <article className={`${styles.proposal} ${styles.pending}`}><p className={styles.proposalText}>{t('ai.generating')}</p></article>}
      </div>

      <label className={styles.baseSwitch}>
        <input type="checkbox" checked={includeCurrentConfig} onChange={event => setIncludeCurrentConfig(event.target.checked)} />
        <span>
          <span>{t('ai.useCurrentProfile')}</span>
          <small>{hasAssistantDraft
            ? t('ai.followupUsesDraft')
            : configText.trim()
              ? t('ai.useCurrentProfileHint', { profileName: currentProfileName ?? t('app.profileSummary.unsavedProfile') })
              : t('ai.useCurrentProfileUnavailable')}
            {!hasAssistantDraft && includeCurrentConfig && hasPendingChanges ? ` ${t('ai.includePendingChanges')}` : ''}</small>
        </span>
      </label>

      <div className={styles.composer}>
        <textarea className={styles.prompt} value={composer} rows={1} aria-label={t('ai.promptLabel')}
          placeholder="Ask for a mapping change"
          onChange={event => setComposer(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!generating) void handleSend()
            }
          }} />
        <button type="button" className="button button--secondary" onClick={() => void handleSend()} disabled={!settingsLoaded || generating}>
          {generating ? t('ai.generating') : t('ai.send')}
        </button>
      </div>

      <AdvancedDisclosure label={t('ai.currentDraftTitle')} summary={hasAssistantDraft ? t('ai.currentDraftDescription') : t('ai.currentEditorDescription')}>
        <textarea className={styles.preview} value={previewConfig} readOnly aria-label={t('ai.currentConfigPreview')} />
      </AdvancedDisclosure>
    </div>
  )
}
