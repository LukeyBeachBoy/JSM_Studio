import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import styles from './TrayMenu.module.css'
import { BrandMark } from '../components/BrandMark'

// The tray icon's right-click menu: Studio's actions and the mapper's, in one
// place, since the mapper no longer has an icon of its own
// (src-tauri/src/services/tray_menu.rs).
//
// Anything the main window keeps state for (the running configuration, mapping
// on/off, Load by app) goes to it as a `tray-action`, so it takes the same path
// as the button in the window and the window never shows a stale value. The
// rest calls the backend directly.

type Profile = { name: string; modifiedAtMs: number }
type RuntimeState = { activeProfilePath: string; mappingEnabled: boolean; autoloadEnabled: boolean }
type MapperStatus = { running: boolean }
export type TrayAction =
  | { type: 'apply-profile'; name: string }
  | { type: 'set-mapping'; enabled: boolean }
  | { type: 'set-autoload'; enabled: boolean }

const RECENT = 5
// Room around the card for its shadow; the window itself is transparent.
const MARGIN = 12

const baseName = (path: string) => path.split(/[\\/]/).pop()?.replace(/\.txt$/i, '') ?? ''

type State = { profiles: Profile[]; runtime: RuntimeState | null; running: boolean }

export function TrayMenu() {
  const [state, setState] = useState<State>({ profiles: [], runtime: null, running: false })
  const [generation, setGeneration] = useState(0)
  const card = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    const [profiles, runtime, status] = await Promise.all([
      invoke<Profile[]>('library_list_profile_meta').catch(() => []),
      invoke<RuntimeState>('get_runtime_mapping_state').catch(() => null),
      invoke<MapperStatus>('get_mapper_status').catch(() => ({ running: false })),
    ])
    const recent = [...profiles].sort((a, b) => b.modifiedAtMs - a.modifiedAtMs).slice(0, RECENT)
    setState({ profiles: recent, runtime, running: status.running })
    // A new generation re-runs the layout effect below even when nothing
    // changed, and that is what shows the window.
    setGeneration(value => value + 1)
  }, [])

  useEffect(() => {
    // Opened in a plain browser (npm run dev:web, /traymenu.html): sample
    // data, so the menu can be looked at without the app.
    if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
      setState({
        profiles: ['Wardogs', 'Cyberpunk 2077', 'No Mans Sky', 'Desktop'].map((name, index) => ({ name, modifiedAtMs: -index })),
        runtime: { activeProfilePath: 'profiles-library/Wardogs.txt', mappingEnabled: true, autoloadEnabled: false },
        running: true,
      })
      return
    }
    const unlisten = listen('tray-menu-open', () => { void refresh() })
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') void invoke('tray_menu_hide') }
    window.addEventListener('keydown', onKey)
    return () => {
      void unlisten.then(stop => stop())
      window.removeEventListener('keydown', onKey)
    }
  }, [refresh])

  useLayoutEffect(() => {
    if (generation === 0 || !card.current) return
    const { width, height } = card.current.getBoundingClientRect()
    void invoke('tray_menu_place', { width: Math.ceil(width) + MARGIN * 2, height: Math.ceil(height) + MARGIN * 2 })
  }, [generation])

  const close = () => invoke('tray_menu_hide')
  const run = (action: () => Promise<unknown>) => () => { void close(); void action().catch(() => {}) }
  const toMain = (action: TrayAction) => run(() => emitTo('main', 'tray-action', action))

  const { runtime, running } = state
  const active = runtime ? baseName(runtime.activeProfilePath) : ''
  const mapping = runtime?.mappingEnabled ?? true
  const autoload = runtime?.autoloadEnabled ?? true
  const status = !running ? 'Mapper stopped' : !mapping ? 'Mapping paused' : active ? active : 'Running'

  return (
    <div className={styles.frame} style={{ padding: MARGIN }}>
      <div ref={card} className={styles.card} role="menu" aria-label="JSM Evolved">
        <button className={styles.header} role="menuitem" onClick={run(() => invoke('tray_show_studio'))}>
          <span className={styles.logo} aria-hidden>
            <BrandMark size={28} />
          </span>
          <span className={styles.headerText}>
            <span className={styles.title}>JSM Evolved</span>
            <span className={styles.status}>
              <span className={styles.dot} data-state={!running ? 'off' : !mapping ? 'paused' : 'on'} />
              {status}
            </span>
          </span>
        </button>

        {state.profiles.length > 0 && (
          <Section>
            {state.profiles.map(profile => (
              <Item key={profile.name} onClick={toMain({ type: 'apply-profile', name: profile.name })}
                icon={profile.name === active ? <Glyph d="m5 12.5 4.5 4.5L19 7.5" /> : <Glyph d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20Z M14 3.5V8h4" />}
                current={profile.name === active}>
                {profile.name}
              </Item>
            ))}
          </Section>
        )}

        <Section>
          <Item onClick={toMain({ type: 'set-mapping', enabled: !mapping })} icon={<Glyph d="M12 3v8 M6.3 6.8a8 8 0 1 0 11.4 0" />}
            trailing={<Switch on={mapping} />}>
            Mapping
          </Item>
          <Item onClick={toMain({ type: 'set-autoload', enabled: !autoload })} icon={<Glyph d="M4 5h16v11H4Z M9 20h6 M12 16v4" />}
            trailing={<Switch on={autoload} />}>
            Load by app
          </Item>
        </Section>

        <Section>
          <Item onClick={run(() => invoke('reconnect_jsm_controllers'))} icon={<Glyph d="M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5" />}>
            Reconnect controllers
          </Item>
          <Item onClick={run(() => invoke('recalibrate_gyro'))} icon={<Glyph d="M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l7-7" />}>
            Calibrate gyro
          </Item>
          <Item onClick={run(() => invoke('open_config_directory'))} icon={<Glyph d="M3.5 6.5a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1Z" />}>
            Open configuration folder
          </Item>
        </Section>

        <Section>
          <Item onClick={run(() => invoke('tray_show_studio'))}>Open JSM Evolved</Item>
          <Item onClick={run(() => invoke('tray_quit'))}>Quit</Item>
        </Section>
      </div>
    </div>
  )
}

function Section({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>
}

function Item({ children, icon, trailing, current, onClick }: {
  children: ReactNode; icon?: ReactNode; trailing?: ReactNode; current?: boolean; onClick: () => void
}) {
  return (
    <button className={styles.item} role="menuitem" data-current={current || undefined} onClick={onClick}>
      <span className={styles.icon} aria-hidden>{icon}</span>
      <span className={styles.label}>{children}</span>
      {trailing}
    </button>
  )
}

function Switch({ on }: { on: boolean }) {
  return <span className={styles.switch} data-on={on || undefined} aria-hidden><span /></span>
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
