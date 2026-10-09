import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { desktopBridge, DEFAULT_AI_SETTINGS, type AiConnectionTest, type AiProvider, type AiSettings, type AiSettingsInput, type LocalAiServer } from '../platform/desktopBridge'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { ModeCards, SegmentedRow, type ModeCard } from './ui/console'
import { Sheet } from './ui/Sheet'
import { Icon } from './icons/Icon'
import { showToast } from '../utils/toast'
import styles from './assistant/Assistant.module.css'

// Settings ▸ Assistant (console v2: SettingsAssistant; D18, README §6): how
// the assistant connects, chosen once. Four ways, as cards:
//
//   Continue with ChatGPT   plan-billed sign-in in the browser (PKCE). OpenAI
//                           offers it to approved apps only, so without a
//                           client id it stays here and says why.
//   Claude, with an API key we open Anthropic's key page, the key is pasted
//                           (Y on the pad) and tested; no Claude.ai login,
//                           which Anthropic doesn't allow for other apps.
//   OpenAI or another …     any OpenAI-compatible endpoint: key, model, address.
//   On this PC              Ollama or LM Studio, found by probing, no key.
//
// Keys go straight to Windows Credential Manager; this page only ever sees
// whether one is stored and its last four characters. The conversation itself
// is its own page (components/assistant/AssistantPage).

export const CLAUDE_KEY_PAGE = 'https://console.anthropic.com/settings/keys'

const PROVIDER_LABEL: Record<AiProvider, string> = {
  chatgpt: 'ChatGPT',
  anthropic: 'Claude',
  openai_compatible: 'OpenAI-compatible',
  local: 'On this PC',
}

type AiMappingPageProps = {
  /** The conversation page, for "Try it now" once connected. */
  onOpenAssistant?: () => void
}

const pasteFromClipboard = async () => {
  try { return (await navigator.clipboard.readText()).trim() } catch { return '' }
}

export function AiMappingPage({ onOpenAssistant }: AiMappingPageProps) {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [open, setOpen] = useState<AiProvider | null>(null)
  const [test, setTest] = useState<Partial<Record<AiProvider, AiConnectionTest | 'testing'>>>({})
  const [local, setLocal] = useState<LocalAiServer[] | null>(null)
  const [signingIn, setSigningIn] = useState(false)
  const [forgetOpen, setForgetOpen] = useState(false)
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({})
  const pageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    void desktopBridge.getAiSettings().then(next => {
      if (disposed) return
      setSettings(next)
      setOpen(next.provider)
      setLoaded(true)
    })
    return () => { disposed = true }
  }, [])

  const save = useCallback(async (patch: AiSettingsInput) => {
    try { setSettings(await desktopBridge.saveAiSettings(patch)) }
    catch (error) { showToast(`Couldn't save the assistant settings: ${error instanceof Error ? error.message : String(error)}`, 'error') }
  }, [])

  const detect = useCallback(async () => {
    setLocal(null)
    setLocal(await desktopBridge.detectLocalAiModels())
  }, [])
  useEffect(() => { void detect() }, [detect])

  const runTest = async (provider: AiProvider) => {
    setTest(current => ({ ...current, [provider]: 'testing' }))
    const result = await desktopBridge.testAiConnection(provider)
    setTest(current => ({ ...current, [provider]: result }))
    return result
  }

  const storeKey = async (provider: 'anthropic' | 'openai_compatible', key: string) => {
    if (!key) { showToast('The clipboard has no key in it. Copy the key, then paste again.', 'error'); return }
    try {
      setSettings(await desktopBridge.setAiKey(provider, key))
      setKeyDraft(current => ({ ...current, [provider]: '' }))
      showToast('Key saved in Windows Credential Manager')
      const result = await runTest(provider)
      // A tested Claude key fills the picker; keep the default model if it's offered.
      if (provider === 'anthropic' && result.ok && result.models.length && !result.models.includes(settings.anthropic.model)) {
        const pick = result.models.find(model => model.startsWith('claude-opus')) ?? result.models[0]
        await save({ anthropic: { model: pick } })
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  const signIn = async () => {
    if (!settings.chatgpt.available) return
    setSigningIn(true)
    try {
      setSettings(await desktopBridge.chatgptSignIn())
      showToast('Signed in with ChatGPT')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally { setSigningIn(false) }
  }

  const forget = async () => {
    setForgetOpen(false)
    setSettings(await desktopBridge.forgetAiCredentials())
    setTest({})
    showToast('Signed out. Every key is gone from Windows Credential Manager.')
  }

  // Y: Sign out · forget keys, through a confirmation (Y never destroys directly).
  useEffect(() => {
    const host = pageRef.current
    if (!host) return
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      const target = event.target as HTMLElement | null
      if (button !== 'Y' || target?.closest('[data-pastes-key]')) return
      event.preventDefault()
      setForgetOpen(true)
    }
    host.addEventListener(PAD_EVENT, onPad)
    return () => host.removeEventListener(PAD_EVENT, onPad)
  }, [])

  const choose = (value: string) => {
    const provider = value as AiProvider
    setOpen(provider)
    if (provider === 'chatgpt') {
      if (settings.chatgpt.available && !settings.chatgpt.signedIn) void signIn()
      else if (settings.chatgpt.signedIn) void save({ provider })
    } else void save({ provider })
    window.requestAnimationFrame(() => pageRef.current?.querySelector<HTMLElement>('[data-setup] button, [data-setup] input, [data-setup] [tabindex="0"]')?.focus())
  }

  const localFound = local?.flatMap(server => server.models.map(model => `${server.name}: ${model}`)) ?? []
  const card = (badge: string, tone: string | undefined, text: string): ReactNode => (
    <span className={styles.cardHead}><span className={styles.badge} data-tone={tone}>{badge}</span><span>{text}</span></span>
  )
  const cards: ModeCard[] = [
    { value: 'chatgpt', label: 'Continue with ChatGPT', caption: card(settings.chatgpt.available ? 'Uses your ChatGPT plan · preview' : settings.chatgpt.reason ?? 'Needs OpenAI’s approval for this app', undefined, 'Sign in once in your browser. Requests count against your ChatGPT plan; no key to copy.') },
    { value: 'anthropic', label: 'Claude, with an API key', caption: card('Billed to your Claude Console account', undefined, 'We open the key page and test the key for you. Claude doesn’t offer subscription sign-in for other apps.') },
    { value: 'openai_compatible', label: 'OpenAI or another provider, with a key', caption: card('Any OpenAI-compatible service', undefined, 'Key, model and address, with a Test button.') },
    { value: 'local', label: 'On this PC', caption: card('Free · no account', 'free', `Uses Ollama or LM Studio if one is running. Found: ${local === null ? 'looking…' : localFound.length ? localFound.slice(0, 2).join(', ') + (localFound.length > 2 ? ` and ${localFound.length - 2} more` : '') : 'none yet'}.`) },
  ]

  const testLine = (provider: AiProvider) => {
    const result = test[provider]
    if (!result) return null
    if (result === 'testing') return <p className={styles.result} role="status">Testing…</p>
    return <p className={styles.result} data-ok={result.ok} role="status">{result.ok ? `Works${result.models.length ? ` · ${result.models.length} model${result.models.length === 1 ? '' : 's'} available` : ''}` : result.error}</p>
  }

  const keyStep = (provider: 'anthropic' | 'openai_compatible', number: number) => {
    const state = provider === 'anthropic' ? settings.anthropic : settings.openaiCompatible
    return (
      <div className={styles.step}>
        <span className={styles.stepNo} data-done={state.hasKey}>{state.hasKey ? '✓' : number}</span>
        <span className={styles.stepText}>
          <b>{state.hasKey ? `Key ${state.keyHint ?? ''} saved` : 'Paste the key'}</b>
          <small>{state.hasKey ? 'Kept in Windows Credential Manager, never in a file.' : 'Copy it, then Paste. Or type it below.'}</small>
          <input className="text-field" type="password" autoComplete="off" spellCheck={false} aria-label={`${PROVIDER_LABEL[provider]} API key`} placeholder={state.hasKey ? 'Replace the key' : 'Paste or type the key'}
            value={keyDraft[provider] ?? ''} onChange={event => setKeyDraft(current => ({ ...current, [provider]: event.target.value }))}
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void storeKey(provider, (keyDraft[provider] ?? '').trim()) } }} style={{ marginTop: 8 }} />
        </span>
        <span className={styles.buttons}>
          <button type="button" className="button button--primary" data-pastes-key="" data-hints="A:Paste the key;Y:Paste the key;B:Back"
            onClick={async () => void storeKey(provider, (keyDraft[provider] ?? '').trim() || await pasteFromClipboard())}
            ref={node => {
              // Y on this button pastes too (the design's "paste with Y").
              if (!node || node.dataset.padBound) return
              node.dataset.padBound = 'true'
              node.addEventListener(PAD_EVENT, event => {
                if ((event as CustomEvent<PadEventDetail>).detail.button !== 'Y') return
                event.preventDefault()
                node.click()
              })
            }}>Paste</button>
        </span>
      </div>
    )
  }

  const setup = () => {
    switch (open) {
      case 'anthropic': return (
        <section className={styles.setup} data-setup="" aria-label="Claude setup">
          <h3>Claude, with an API key</h3>
          <p>Claude needs a key from your Claude Console account; requests are billed there. JSM Evolved talks to Claude directly from this PC.</p>
          <div className={styles.step}>
            <span className={styles.stepNo}>1</span>
            <span className={styles.stepText}><b>Open the key page</b><small>Sign in at console.anthropic.com and create a key.</small></span>
            <button type="button" className="button button--secondary" data-hints="A:Open the key page;B:Back" onClick={() => void desktopBridge.openExternal(CLAUDE_KEY_PAGE)}>Open key page</button>
          </div>
          {keyStep('anthropic', 2)}
          <div className={styles.step}>
            <span className={styles.stepNo}>3</span>
            <span className={styles.stepText}><b>Test it</b><small>Lists the models your key can use.</small></span>
            <button type="button" className="button button--secondary" aria-disabled={!settings.anthropic.hasKey || undefined} data-reason={settings.anthropic.hasKey ? undefined : 'Paste a key first'}
              onClick={() => { if (settings.anthropic.hasKey) void runTest('anthropic') }}>Test</button>
          </div>
          {testLine('anthropic')}
          <SegmentedRow label="Model" hint="Opus is the most careful; Sonnet and Haiku cost less."
            value={settings.anthropic.model}
            options={[...new Set([...settings.anthropic.suggestedModels, ...(typeof test.anthropic === 'object' ? test.anthropic.models.filter(model => /^claude-(opus|sonnet|haiku)-/.test(model)) : []), settings.anthropic.model])].slice(0, 6).map(model => ({ value: model, label: model.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1'), caption: model }))}
            onChange={model => void save({ anthropic: { model } })} />
        </section>
      )
      case 'openai_compatible': return (
        <section className={styles.setup} data-setup="" aria-label="OpenAI-compatible setup">
          <h3>OpenAI or another provider</h3>
          <p>Any service that speaks the OpenAI chat API: its address, a model and your key.</p>
          <div className={styles.fields}>
            <label className={styles.field}><span>Address</span>
              <input className="text-field" type="url" placeholder="https://api.openai.com/v1" defaultValue={settings.openaiCompatible.baseUrl} key={`url-${loaded}`}
                onBlur={event => { if (event.target.value !== settings.openaiCompatible.baseUrl) void save({ openaiCompatible: { baseUrl: event.target.value } }) }} />
            </label>
            <label className={styles.field}><span>Model</span>
              <input className="text-field" type="text" placeholder="gpt-4.1" defaultValue={settings.openaiCompatible.model} key={`model-${loaded}-${settings.openaiCompatible.model}`}
                onBlur={event => { if (event.target.value !== settings.openaiCompatible.model) void save({ openaiCompatible: { model: event.target.value } }) }} />
            </label>
          </div>
          {keyStep('openai_compatible', 1)}
          <div className={styles.step}>
            <span className={styles.stepNo}>2</span>
            <span className={styles.stepText}><b>Test it</b><small>Asks the address for its models.</small></span>
            <button type="button" className="button button--secondary" onClick={() => void runTest('openai_compatible')}>Test</button>
          </div>
          {testLine('openai_compatible')}
          {typeof test.openai_compatible === 'object' && test.openai_compatible.models.length > 0 && (
            <div className={styles.models} role="group" aria-label="Models">
              {test.openai_compatible.models.slice(0, 24).map(model => (
                <button key={model} type="button" className={styles.model} aria-pressed={model === settings.openaiCompatible.model} onClick={() => void save({ openaiCompatible: { model } })}>{model}</button>
              ))}
            </div>
          )}
        </section>
      )
      case 'local': return (
        <section className={styles.setup} data-setup="" aria-label="On this PC setup">
          <h3>On this PC</h3>
          <p>Ollama or LM Studio, running here. Nothing leaves this PC and there's no key.</p>
          <div className={styles.step}>
            <span className={styles.stepNo} data-done={Boolean(local?.length)}>{local?.length ? '✓' : 1}</span>
            <span className={styles.stepText}><b>{local === null ? 'Looking for Ollama and LM Studio…' : local.length ? `Found ${local.map(server => server.name).join(' and ')}` : 'Neither is running'}</b>
              <small>{local?.length ? 'Pick a model below.' : 'Start Ollama (port 11434) or LM Studio’s server (port 1234), then look again.'}</small></span>
            <button type="button" className="button button--secondary" onClick={() => void detect()}>Look again</button>
          </div>
          {local?.map(server => (
            <div key={server.baseUrl} className={styles.models} role="group" aria-label={`${server.name} models`}>
              {server.models.length === 0 && <span className={styles.result}>{server.name} has no models yet.</span>}
              {server.models.map(model => (
                <button key={model} type="button" className={styles.model} aria-pressed={settings.local.model === model && settings.local.baseUrl === server.baseUrl}
                  onClick={() => void save({ provider: 'local', local: { model, baseUrl: server.baseUrl } })}>{server.name} · {model}</button>
              ))}
            </div>
          ))}
          <div className={styles.fields}>
            <label className={styles.field}><span>Address</span>
              <input className="text-field" type="url" defaultValue={settings.local.baseUrl} key={`local-url-${loaded}-${settings.local.baseUrl}`}
                onBlur={event => { if (event.target.value !== settings.local.baseUrl) void save({ local: { baseUrl: event.target.value } }) }} />
            </label>
            <label className={styles.field}><span>Model</span>
              <input className="text-field" type="text" defaultValue={settings.local.model} key={`local-model-${loaded}-${settings.local.model}`}
                onBlur={event => { if (event.target.value !== settings.local.model) void save({ local: { model: event.target.value } }) }} />
            </label>
          </div>
          <div className={styles.buttons}><button type="button" className="button button--secondary" onClick={() => void runTest('local')}>Test</button></div>
          {testLine('local')}
        </section>
      )
      case 'chatgpt': return (
        <section className={styles.setup} data-setup="" aria-label="ChatGPT setup">
          <h3>Continue with ChatGPT</h3>
          <p className={styles.disclosure}>
            You sign in on OpenAI’s own page in your browser; JSM Evolved never sees your password. What you ask the assistant, and the configuration it works on,
            is sent to OpenAI and counts against your ChatGPT plan’s limits. Nothing is stored by OpenAI for this app (requests ask not to be kept).
            Sign out here at any time.
          </p>
          {!settings.chatgpt.available && <p className={styles.result} data-ok="false">{settings.chatgpt.reason}. OpenAI offers ChatGPT sign-in only to apps it has approved; once it issues this app a client id, enter it below.</p>}
          {settings.chatgpt.signedIn
            ? <div className={styles.step}><span className={styles.stepNo} data-done="true">✓</span><span className={styles.stepText}><b>Signed in{settings.chatgpt.account ? ` as ${settings.chatgpt.account}` : ''}</b><small>Model {settings.chatgpt.model}</small></span>
                <button type="button" className="button button--secondary" onClick={() => setForgetOpen(true)}>Sign out</button></div>
            : <div className={styles.buttons}>
                <button type="button" className="button button--primary" aria-disabled={!settings.chatgpt.available || signingIn || undefined} data-reason={settings.chatgpt.available ? undefined : settings.chatgpt.reason ?? undefined}
                  onClick={() => void signIn()}>{signingIn ? 'Waiting for your browser…' : 'Continue with ChatGPT'}</button>
                {signingIn && <button type="button" className="button button--secondary" onClick={() => void desktopBridge.chatgptCancelSignIn()}>Cancel</button>}
              </div>}
          <div className={styles.fields}>
            <label className={styles.field}><span>Client id (issued by OpenAI)</span>
              <input className="text-field" type="text" defaultValue={settings.chatgpt.clientId} key={`cid-${loaded}-${settings.chatgpt.clientId}`}
                onBlur={event => { if (event.target.value.trim() !== settings.chatgpt.clientId) void save({ chatgpt: { clientId: event.target.value.trim() } }) }} />
            </label>
            <label className={styles.field}><span>Model</span>
              <input className="text-field" type="text" defaultValue={settings.chatgpt.model} key={`cmodel-${loaded}-${settings.chatgpt.model}`}
                onBlur={event => { if (event.target.value.trim() !== settings.chatgpt.model) void save({ chatgpt: { model: event.target.value.trim() } }) }} />
            </label>
            <label className={styles.field}><span>Sign-in port on 127.0.0.1 (0 picks any)</span>
              <input className="text-field" type="number" min={0} max={65535} defaultValue={settings.chatgpt.redirectPort} key={`port-${loaded}-${settings.chatgpt.redirectPort}`}
                onBlur={event => { const port = Number.parseInt(event.target.value, 10); if (Number.isFinite(port) && port !== settings.chatgpt.redirectPort) void save({ chatgpt: { redirectPort: port } }) }} />
            </label>
          </div>
        </section>
      )
      default: return null
    }
  }

  return (
    <div className={styles.settings} ref={pageRef} aria-busy={!loaded || undefined}
      data-hints="Y:Sign out · forget keys">
      <ModeCards variant="compare" columns={2} options={cards} value={settings.provider ?? ''}
        onChange={choose}
        useLabel={option => option.value === 'chatgpt' ? 'Continue with ChatGPT' : option.value === settings.provider ? 'Set it up' : `Use ${option.value === 'anthropic' ? 'Claude' : option.value === 'local' ? 'this PC' : 'this provider'}`} />
      {setup()}
      <div className={styles.extension}>
        <span className={styles.plug} aria-hidden="true"><Icon name="connected" size={22} /></span>
        <span><b>Or use JSM Evolved from Claude Desktop</b><p>Install our extension and ask Claude, signed in with your own plan, to change your mappings. Nothing to set up here.</p></span>
        <button type="button" className={styles.linkButton} aria-disabled="true" data-reason="The Claude Desktop extension is a separate project and isn’t released yet"
          data-caption="Install · The Claude Desktop extension isn’t released yet">Install ▸</button>
      </div>
      <div className={styles.statusLine}>
        <span role="status">Currently: <b>{settings.connected ? settings.status : 'not connected'}</b>
          {settings.connected && onOpenAssistant && <button type="button" className={styles.linkButton} onClick={onOpenAssistant}>Ask the assistant ▸</button>}</span>
        <div style={{ minWidth: 420 }}>
          <SegmentedRow label="How careful the assistant is" value={settings.careful}
            options={[
              { value: 'careful', label: 'Careful', caption: 'Thinks longest before changing anything (Claude: high effort)' },
              { value: 'balanced', label: 'Balanced', caption: 'A middle way (Claude: medium effort)' },
              { value: 'quick', label: 'Quick', caption: 'Answers fastest (Claude: low effort)' },
            ]}
            onChange={careful => void save({ careful: careful as AiSettings['careful'] })} />
        </div>
      </div>
      <Sheet open={forgetOpen} onClose={() => setForgetOpen(false)} eyebrow="Settings · Assistant" title="Sign out and forget keys?"
        description="Every key and ChatGPT sign-in is removed from Windows Credential Manager. Your choices here stay."
        hints={[{ button: 'A', label: 'Choose' }, { button: 'B', label: 'Keep them' }]} width={520}>
        <button type="button" className="unsaved-choice unsaved-choice--recommended" data-autofocus="" data-hints="A:Keep them;B:Keep them" onClick={() => setForgetOpen(false)}>
          <span className="unsaved-choice__text"><span className="unsaved-choice__label">Keep them</span><span className="unsaved-choice__hint">Nothing changes.</span></span>
        </button>
        <button type="button" className="unsaved-choice unsaved-choice--danger" data-hints="A:Sign out · forget keys;B:Keep them" onClick={() => void forget()}>
          <span className="unsaved-choice__text"><span className="unsaved-choice__label">Sign out · forget keys</span><span className="unsaved-choice__hint">The assistant stops until you connect it again.</span></span>
        </button>
      </Sheet>
    </div>
  )
}
