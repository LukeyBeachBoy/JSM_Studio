import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopBridge, DEFAULT_AI_SETTINGS, type AiConversationMessage, type AiGenerateResponse, type AiSettings } from '../../platform/desktopBridge'
import { SubPage } from '../ui/console'
import { Sheet } from '../ui/Sheet'
import { Icon } from '../icons/Icon'
import { InputGlyph } from '../glyphs/InputGlyph'
import { ButtonGlyph } from '../glyphs/ButtonGlyph'
import { describeBinding } from '../../utils/bindingDescription'
import { inputDefinitions } from '../../utils/layers'
import { ensureHeaderLines } from '../../utils/config'
import { requestTextEntry } from '../../nav/textEntry'
import { PAD_EVENT, type PadEventDetail } from '../../nav/useControllerNavigation'
import { showToast } from '../../utils/toast'
import type { ControllerVisualFamily } from '../../utils/controllerStatus'
import styles from './Assistant.module.css'

// The assistant (console v2: Assistant; README V13, D18): the conversation
// first, the provider set up once in Settings ▸ Assistant. Suggestions to pick
// with A, or say your own (X, where the window offers speech) or type it (Y,
// the on-screen keyboard). Each answer is a proposal: what changes, what
// stays, and two ways on -- Keep it (save and make live) or Try it first
// (Test mode with the proposal, nothing saved; leaving the test puts the live
// configuration back).

type Props = {
  open: boolean
  onClose: () => void
  /** The configuration being edited, and its unsaved text. */
  configText: string
  currentProfileName: string | null
  hasPendingChanges: boolean
  libraryProfiles: string[]
  family: ControllerVisualFamily
  /** Save and make live: into the editor for the one being edited, or the file. */
  onKeep: (name: string | null, text: string) => Promise<void>
  /** Test mode with this text; nothing saved. */
  onTry: (name: string | null, text: string) => Promise<void>
  /** Settings ▸ Assistant. */
  onOpenSettings: () => void
}

type Entry = { id: string; role: 'user' | 'assistant'; content: string; result?: AiGenerateResponse; base?: string }

const HEADER = /^(TELEMETRY_ENABLED|TELEMETRY_PORT|AUTOCONNECT|RESET_MAPPINGS)\b/
const assignments = (text: string) => {
  const map = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || HEADER.test(line)) continue
    const match = /^([^=]+?)\s*=\s*(.*)$/.exec(line)
    if (match) map.set(match[1].replace(/\s+/g, '').toUpperCase(), match[2].trim())
  }
  return map
}
type Change = { key: string; before?: string; after?: string }
export const diffBindings = (before: string, after: string): Change[] => {
  const old = assignments(before), next = assignments(after)
  const changes: Change[] = []
  for (const [key, value] of next) if (old.get(key) !== value) changes.push({ key, before: old.get(key), after: value })
  for (const [key, value] of old) if (!next.has(key)) changes.push({ key, before: value })
  return changes
}
const inputOf = (key: string) => {
  const command = key.split(',').pop()?.trim().toUpperCase() ?? ''
  return inputDefinitions.find(button => button.command === command) ?? null
}

/** Suggestions that fit this controller and library (the design's six chips). */
export function suggestionsFor(family: ControllerVisualFamily, configText: string, others: string[]) {
  const steam = family === 'steam'
  const text = configText.toUpperCase()
  const free = (command: string) => !new RegExp(`^\\s*${command}\\s*=`, 'm').test(text)
  return [
    family === 'xbox' ? 'Make stick aim smoother' : 'Make gyro aim less twitchy',
    steam ? (free('LSR') ? 'Put reload on a back button' : 'Put reload on a bumper') : 'Put reload on a bumper',
    steam ? 'Add a driving mode on L4' : 'Add a driving mode on the D-pad',
    steam ? 'Turn the right pad into a weapon wheel' : 'Turn the right stick into a weapon wheel',
    'Hold A to sprint, tap to jump',
    others[0] ? `Copy movement from ${others[0]}` : 'Make the triggers fire on a light press',
  ]
}

type SpeechRecognitionLike = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
const speechConstructor = () => {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

let entryId = 0
const nextId = () => `e${++entryId}`

export function AssistantPage({ open, onClose, configText: editingText, currentProfileName: editingName, hasPendingChanges, libraryProfiles, family, onKeep, onTry, onOpenSettings }: Props) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS)
  const [picked, setPicked] = useState<{ name: string; text: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [entries, setEntries] = useState<Entry[]>([])
  const [composer, setComposer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)

  const configText = picked?.text ?? editingText
  const workingName = picked?.name ?? editingName
  useEffect(() => { if (open) void desktopBridge.getAiSettings().then(setSettings) }, [open])

  const latest = [...entries].reverse().find(entry => entry.result)
  const draft = latest?.result ? ensureHeaderLines(latest.result.configText) : null
  const others = libraryProfiles.filter(name => name !== workingName && name !== 'Default Global Chords')
  const chips = useMemo(() => suggestionsFor(family, configText, others), [family, configText, others.join('\n')])
  const SpeechCtor = speechConstructor()
  const speechReason = SpeechCtor ? undefined : 'Speech isn’t available in this window. Type instead (Y).'

  const ask = async (prompt: string) => {
    const text = prompt.trim()
    if (!text || busy) return
    if (!settings.connected) { setError('The assistant isn’t set up yet.'); return }
    const base = draft ?? configText
    const history: AiConversationMessage[] = entries.map(entry => ({ role: entry.role, content: entry.result ? [entry.result.summary, ...entry.result.warnings].join('\n') : entry.content }))
    setEntries(current => [...current, { id: nextId(), role: 'user', content: text }])
    setComposer('')
    setBusy(true)
    setError(null)
    try {
      const result = await desktopBridge.generateAiMapping({ userPrompt: text, currentConfig: base, currentProfileName: workingName, includeCurrentConfig: true, conversationHistory: history, locale: i18n.language })
      setEntries(current => [...current, { id: nextId(), role: 'assistant', content: result.summary, result, base }])
      window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[data-keep]')?.focus())
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure)
      setError(message)
      showToast(message, 'error')
    } finally { setBusy(false) }
  }

  const speak = () => {
    if (!SpeechCtor) { showToast(speechReason!, 'error'); return }
    if (listening) { recognition.current?.stop(); return }
    const recognizer = new SpeechCtor()
    recognizer.lang = i18n.language || 'en'
    recognizer.interimResults = false
    recognizer.onresult = event => {
      const said = Array.from(event.results).map(result => result[0]?.transcript ?? '').join(' ').trim()
      if (said) setComposer(said)
    }
    recognizer.onend = () => setListening(false)
    recognizer.onerror = () => { setListening(false); showToast('Didn’t catch that. Try again, or type it.', 'error') }
    recognition.current = recognizer
    setListening(true)
    recognizer.start()
  }
  const type = () => {
    const field = composerRef.current
    if (!field) return
    field.focus()
    requestTextEntry(field)
  }

  const keep = async () => {
    if (!draft) return
    try {
      await onKeep(picked?.name ?? null, draft)
      if (picked) setPicked({ name: picked.name, text: draft })
      setEntries([])
      showToast(`Kept in ${workingName ?? 'the configuration'}`)
    } catch (failure) { showToast(failure instanceof Error ? failure.message : String(failure), 'error') }
  }
  const tryIt = () => { if (draft) void onTry(picked?.name ?? editingName, draft) }

  // X speaks and Y types anywhere on the page; in the proposal Y is Try it first.
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const host = document.querySelector<HTMLElement>('[data-assistant-page]')
    if (!host) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const inPanel = Boolean((event.target as HTMLElement | null)?.closest('[data-proposal]'))
      if (button === 'X') { event.preventDefault(); speak() }
      else if (button === 'Y') { event.preventDefault(); if (inPanel && draft) tryIt(); else type() }
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  })

  const pick = async (name: string) => {
    setPickerOpen(false)
    setEntries([])
    if (name === editingName) { setPicked(null); return }
    const profile = await desktopBridge.loadLibraryProfile(name)
    if (!profile) { showToast(`Couldn’t read ${name}.`, 'error'); return }
    setPicked({ name, text: profile.content })
  }

  const lastUser = [...entries].reverse().find(entry => entry.role === 'user')
  const changes = latest?.result ? diffBindings(latest.base ?? '', latest.result.configText) : []
  const current = assignments(latest?.base ?? configText)
  const unchanged = (latest?.result?.unchanged ?? []).map(key => key.replace(/\s+/g, '').toUpperCase()).filter(key => current.has(key) && !changes.some(change => change.key === key))
  const glyph = (key: string) => {
    const input = inputOf(key)
    return input ? <InputGlyph command={input.command} family={family} size={24} /> : <span className={styles.changeKey}>{key.length > 14 ? `${key.slice(0, 13)}…` : key}</span>
  }

  return (
    <SubPage open={open} onClose={onClose} trail={[]} title="Assistant" bare backLabel="Home"
      where={`Assistant · ${workingName ?? 'Unsaved'}`}
      hints={[{ button: 'A', label: 'Ask this' }, { button: 'X', label: 'Speak' }, { button: 'Y', label: 'Type' }]}>
      <div className={styles.page} data-assistant-page="" ref={rootRef}>
        <section className={styles.ask} aria-label="What should change?">
          <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Icon name="ai" size={22} />
            <b style={{ fontSize: 22 }}>Assistant</b>
            <button type="button" className={styles.working} style={{ marginLeft: 'auto' }} onClick={() => setPickerOpen(true)} data-hints="A:Choose configuration;B:Home"
              data-caption="Working on · the configuration the assistant changes">
              <span className={styles.swatch} style={{ background: 'var(--layer-1)' }} aria-hidden="true" />Working on <b>{workingName ?? 'Unsaved'}</b>
            </button>
          </header>
          <h1>What should change?</h1>
          <p>Pick one or say your own. You’ll see the change and try it before anything is saved.</p>
          <div className={styles.chips} role="list">
            {chips.map((chip, index) => (
              <button key={chip} type="button" role="listitem" className={styles.chip} data-autofocus={index === 0 ? '' : undefined}
                aria-disabled={busy || undefined} data-hints="A:Ask this;X:Speak;Y:Type;B:Home" onClick={() => void ask(chip)}>{chip}</button>
            ))}
          </div>
          <div className={styles.composer}>
            <Icon name="command" size={20} />
            <textarea ref={composerRef} rows={1} aria-label="Say or type your own" placeholder="Say or type your own…" value={composer}
              data-hints="A:Type;X:Speak;B:Home"
              onChange={event => setComposer(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask(composer) } }} />
            <button type="button" className={styles.speak} aria-disabled={speechReason ? 'true' : undefined} data-reason={speechReason} data-listening={listening || undefined}
              data-caption={speechReason ? `Speak · ${speechReason}` : 'Speak · say what should change'} onClick={speak}>
              <ButtonGlyph button="X" size={22} family={family} pad />{listening ? 'Listening…' : 'Speak'}
            </button>
            <button type="button" className="button button--primary" aria-disabled={!composer.trim() || busy || undefined} onClick={() => void ask(composer)}>Ask</button>
          </div>
          {hasPendingChanges && !picked && <p className={styles.footnote}>Your unsaved changes to {editingName} are included.</p>}
        </section>

        <aside className={styles.panel} ref={panelRef} aria-label="The proposal" aria-live="polite">
          {!settings.connected ? (
            <div className={styles.notSet}>
              <b style={{ fontSize: 20 }}>Set up the assistant first</b>
              <p className={styles.thinking}>Choose how it connects: ChatGPT, Claude with a key, another provider, or a model on this PC. You only do this once.</p>
              <button type="button" className={`${styles.big} `} data-primary="true" style={{ padding: '0 20px' }} onClick={onOpenSettings}>Set up the assistant ▸</button>
            </div>
          ) : (
            <>
              {lastUser && <div className={styles.bubble}>{lastUser.content}</div>}
              {busy && <p className={styles.thinking} role="status">{t('ai.generating', 'Thinking…')}</p>}
              {error && <p className={styles.error} role="alert">{error}</p>}
              {latest?.result && !busy && (
                <div className={styles.proposal} data-proposal="">
                  <p>{latest.result.summary || 'Here’s the change.'}</p>
                  <div className={styles.diff} aria-label="What changes">
                    {changes.length === 0 && <span className={styles.same}>No lines change.</span>}
                    {changes.slice(0, 10).map(change => (
                      <div key={change.key} className={styles.change}>
                        {glyph(change.key)}
                        <span className={styles.changeText}>
                          <span className={styles.old}>{change.before !== undefined ? describeBinding(change.before, t) : 'Not set'}</span>
                          <span aria-hidden="true">→</span>
                          <span className={styles.new}>{change.after !== undefined ? describeBinding(change.after, t) : 'Not set'}</span>
                        </span>
                      </div>
                    ))}
                    {changes.length > 10 && <span className={styles.same}>…and {changes.length - 10} more</span>}
                    {unchanged.slice(0, 4).map(key => (
                      <div key={`same-${key}`} className={styles.change}>
                        {glyph(key)}
                        <span className={`${styles.changeText} ${styles.same}`}>{describeBinding(current.get(key) ?? '', t)} <em>unchanged</em></span>
                      </div>
                    ))}
                  </div>
                  {latest.result.warnings.length > 0 && <ul className={`${styles.list} ${styles.warn}`}>{latest.result.warnings.map(item => <li key={item}>{item}</li>)}</ul>}
                  {latest.result.assumptions.length > 0 && <ul className={styles.list}>{latest.result.assumptions.map(item => <li key={item}>{item}</li>)}</ul>}
                  <div className={styles.proposalActions}>
                    <button type="button" className={styles.big} data-primary="true" data-keep="" data-hints="A:Keep it;Y:Try it first;B:Home" onClick={() => void keep()}>
                      <ButtonGlyph button="A" size={24} family={family} pad />Keep it
                    </button>
                    <button type="button" className={styles.big} data-hints="A:Try it first;Y:Try it first;B:Home" onClick={tryIt}>
                      <ButtonGlyph button="Y" size={24} family={family} pad />Try it first
                    </button>
                  </div>
                </div>
              )}
              {!lastUser && !busy && <p className={styles.thinking}>Pick a suggestion, or say what should change. Nothing is saved until you keep it.</p>}
              <p className={styles.footnote}>Uses your own AI provider ({settings.status}). Change it in <button type="button" className="link-button" style={{ background: 'none', border: 0, color: 'var(--accent)', padding: 0, font: 'inherit', cursor: 'pointer' }} onClick={onOpenSettings}>Settings ▸ Assistant</button>.</p>
            </>
          )}
        </aside>
      </div>
      <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} eyebrow="Assistant" title="Working on" description="The configuration the assistant changes." hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Back' }]} width={520}>
        {libraryProfiles.filter(name => name !== 'Default Global Chords').map(name => (
          <button key={name} type="button" role="menuitemradio" aria-checked={name === workingName} className="unsaved-choice" data-hints="A:Choose;B:Back" onClick={() => void pick(name)}>
            <span className="unsaved-choice__text"><span className="unsaved-choice__label">{name}</span>{name === editingName && <span className="unsaved-choice__hint">Being edited</span>}</span>
          </button>
        ))}
      </Sheet>
    </SubPage>
  )
}
