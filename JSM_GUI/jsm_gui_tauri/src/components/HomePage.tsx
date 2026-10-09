import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from './icons/Icon'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { type StudioTab } from '../shell/pages'
import { PAD_EVENT, type PadEventDetail } from '../nav/useControllerNavigation'
import { exeFileName, useProfileAssociation } from '../hooks/useAppIcon'
import { fallbackCover } from '../hooks/useGameArt'
import { useGameArt as useSteamArt } from './library/gameArt'
import { readGameMeta } from '../utils/libraryGraph'
import { desktopBridge } from '../platform/desktopBridge'
import { AppIconImage } from './AppIconImage'
import { useShell } from '../shell/ShellContext'
import { landOn } from '../nav/landing'
import styles from './HomePage.module.css'

// Home (console v2, Home.dc.html): where the app opens and where View returns
// from anywhere. The game comes first: its hero art, Live, what it launches
// with, its name and a summary line; A edits its layout, X tests it, Y
// switches game. Quick tune changes a few things in place, live. On the right,
// Your games as covers (the other configurations, then Desktop gamepad for
// when no game matches), New for a game and the Library, and two doors:
// Settings and the assistant. Tiles are never hidden (D12): one whose feature
// is not in use says so and still opens.

export type HomeTune = 'gyro' | 'mouseFeel' | 'grips'

export type HomeQuickTune = {
  /** Gyro speed: the Gyro page's turn speed, adjusted in place with ◂ ▸.
   *  Null when the configuration sends no gyro speed (motion to the game). */
  gyroSpeed: number | null
  /** "Speed-up is on": the slow end moves, the fast end follows. */
  gyroSpeedNote?: string
  /** "Always", "While holding right grip". */
  gyroOn: string
  /** "Right trackpad" and "Mouse, 4 click zones". */
  pad: { label: string; value: string }
}

type HomePageProps = {
  configName: string | null
  /** The configuration being edited, for its game (the `# @game` line). */
  configText?: string
  /** Saved and the one live. */
  applied: boolean
  /** "Shooter · gyro aim on right grip · trackpad menus · 3 modes". */
  summary: string
  changeCount: number
  onSwitch: () => void
  onContinue: () => void
  onTest: () => void
  /** Why Test cannot run right now, or null. */
  testReason: string | null
  quickTune: HomeQuickTune
  onGyroSpeed: (value: number) => void
  onOpenTune: (tile: 'gyro' | 'trackpads') => void
  /** How many configurations the library has, for "3 configurations". */
  configurationCount: number
  /** The library has answered and holds nothing: Home lands on New for a game. */
  firstRun: boolean
  /** Other configurations, newest first, for the Your games shelf. */
  games: string[]
  /** The configuration loaded when no game matches ("Desktop gamepad"). */
  fallback: string | null
  onOpenStudio: (tab: StudioTab) => void
  onOpenGame: (name: string) => void
  onNewGame: () => void
}

const SPEED = { min: 0.1, max: 10, step: 0.1 }
const formatSpeed = (value: number) => `${Number.isInteger(Math.round(value * 100) / 10) ? value.toFixed(1) : value.toFixed(2)}×`
const clampSpeed = (value: number) => Math.min(SPEED.max, Math.max(SPEED.min, Number(value.toFixed(2))))

/** The Steam app a configuration was made for (its `# @game` line), so a game
 *  added from Steam has its art before any AutoLoad rule names an executable. */
function useSteamAppId(name: string | null | undefined, text?: string) {
  const [fromFile, setFromFile] = useState<string | null>(null)
  useEffect(() => {
    if (text !== undefined || !name) { setFromFile(null); return }
    let alive = true
    void desktopBridge.loadLibraryProfile(name).then(profile => { if (alive) setFromFile(profile ? readGameMeta(profile.content)?.steamAppId ?? null : null) }).catch(() => {})
    return () => { alive = false }
  }, [name, text])
  return text !== undefined ? readGameMeta(text)?.steamAppId ?? null : fromFile
}

/** One configuration on the Your games shelf, with its game's art when Steam has it. */
function GameCover({ name, note, onOpen }: { name: string; note?: string; onOpen: () => void }) {
  const game = useProfileAssociation(name)
  const steamAppId = useSteamAppId(name)
  const art = useSteamArt({ steamAppId, exePath: game?.exePath }, ['capsule', 'header']).url
  const caption = note ?? (game?.exePath ? 'Launches with game' : 'Configuration')
  return (
    <button type="button" className={styles.cover} onClick={onOpen} data-hints="A:Edit;X:Test;Y:Switch game"
      data-caption={`${name} · ${caption}`} style={{ backgroundImage: art ? `url(${art})` : fallbackCover(name) }} data-art={art ? 'steam' : 'flat'}>
      {!art && game?.exePath && <span className={styles.coverIcon} aria-hidden="true"><AppIconImage exePath={game.exePath} size={36} alt="" fallback={null} /></span>}
      <span className={styles.coverText}>
        <b className={styles.coverName}>{name}</b>
        <span className={styles.coverNote}>{caption}</span>
      </span>
    </button>
  )
}

export function HomePage(props: HomePageProps) {
  const { t } = useTranslation()
  const { family } = useShell()
  const name = props.configName ?? 'No configuration'
  const game = useProfileAssociation(props.configName)
  const steamAppId = useSteamAppId(props.configName, props.configText)
  const hero = useSteamArt({ steamAppId, exePath: game?.exePath }, ['hero', 'header']).url
  // X tests and Y switches game from anywhere on Home (console v2, 01), unless
  // the focused element claims the button itself.
  const { onTest, onSwitch, testReason } = props
  useEffect(() => {
    const onPad = (event: Event) => {
      const { button } = (event as CustomEvent<PadEventDetail>).detail
      if (event.defaultPrevented) return
      if (button === 'X') { event.preventDefault(); if (!testReason) onTest() }
      if (button === 'Y') { event.preventDefault(); onSwitch() }
    }
    document.addEventListener(PAD_EVENT, onPad)
    return () => document.removeEventListener(PAD_EVENT, onPad)
  }, [onTest, onSwitch, testReason])

  // Home opens with its primary action focused, in every input mode, so the
  // first A or Enter acts (UX review, B5): Edit layout, or New for a game on
  // a first run with nothing to edit. Only when nothing else has focus: a
  // dialog that opened over Home, or a control the person already reached,
  // keeps it.
  const root = useRef<HTMLDivElement>(null)
  const hasConfig = Boolean(props.configName)
  // Nothing is the landing until the library has answered: a first run lands
  // on New for a game, a library still loading on nothing (or the pad would
  // be left on New for a game once the configuration arrived).
  const landing = hasConfig ? 'edit' : props.firstRun ? 'new' : 'none'
  // Also when the hero changes under the pad (A on a game card makes that
  // game the hero and takes its card off the shelf): the result is the new
  // hero's Edit layout (UX review, B3).
  const heroName = props.configName
  useEffect(() => {
    if (landing === 'none') return
    return landOn(root.current, () => root.current?.querySelector<HTMLElement>('[data-autofocus]'))
  }, [landing, heroName])

  const speed = props.quickTune.gyroSpeed
  const adjustSpeed = (direction: 1 | -1, fine: boolean) => {
    if (speed === null) return
    props.onGyroSpeed(clampSpeed(speed + direction * (fine ? 0.01 : SPEED.step)))
  }
  const onSpeedKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    adjustSpeed(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey)
  }
  const unsaved = props.changeCount > 0 ? `${props.changeCount} unsaved ${props.changeCount === 1 ? 'change' : 'changes'}` : null
  const homeHints = 'A:Edit layout;X:Test;Y:Switch game'

  return (
    <div ref={root} className={styles.home}>
      <section className={styles.main} aria-labelledby="home-config-title" data-nav-region="config">
        <div className={styles.hero} style={{ backgroundImage: hero ? `url(${hero})` : fallbackCover(name) }} data-art={hero ? 'steam' : 'flat'}>
          <span className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroText}>
            <div className={styles.heroMeta}>
              {props.applied
                ? <span className={styles.livePill}><span className={styles.liveDot} aria-hidden="true" />Live</span>
                : <span className={styles.pausedPill}>{unsaved ?? 'Not live'}</span>}
              {game?.exePath && <span className={styles.launches}>Launches with {exeFileName(game.exePath)}</span>}
            </div>
            <h1 id="home-config-title" className={styles.name}>{name}</h1>
            {props.summary && <p className={styles.summary}>{props.summary}</p>}
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primary} data-autofocus={hasConfig ? '' : undefined} data-home-continue onClick={props.onContinue}
            aria-disabled={hasConfig ? undefined : true} data-reason={hasConfig ? undefined : 'Make a configuration first: New for a game'}
            data-hints={homeHints} data-caption={hasConfig ? `Edit layout · change what ${name} does, input by input` : undefined}>
            <ButtonGlyph button="A" size={30} family={family} className={styles.primaryGlyph} />Edit layout
          </button>
          <button type="button" className={styles.secondary} onClick={() => { if (!props.testReason) props.onTest() }}
            aria-disabled={props.testReason ? true : undefined} data-reason={props.testReason ?? undefined}
            data-caption={props.testReason ? undefined : `Test it · play with ${name} while the app stays open; B stops`}
            data-hints={props.testReason ? 'Y:Switch game' : 'A:Test it;Y:Switch game'}>
            <ButtonGlyph button="X" size={26} family={family} className={styles.actionGlyph} />Test it
          </button>
          <button type="button" className={styles.secondary} onClick={props.onSwitch} data-hints="A:Switch game;X:Test"
            data-caption="Switch game · pick another configuration from your library">
            <ButtonGlyph button="Y" size={26} family={family} className={styles.actionGlyph} />Switch game
          </button>
        </div>

        <div className={styles.tune}>
          <span className="eyebrow">Quick tune · changes apply live</span>
          <div className={styles.tuneGrid}>
            <button type="button" className={styles.tuneTile} data-arrows={speed === null ? undefined : 'horizontal'}
              onKeyDown={onSpeedKey} onClick={() => props.onOpenTune('gyro')}
              aria-disabled={speed === null ? true : undefined} data-reason={speed === null ? 'The game sets the gyro speed here. A opens Gyro.' : undefined}
              data-hints={speed === null ? 'A:Open Gyro' : 'MOVE:Adjust;A:Open Gyro'}
              data-caption={speed === null ? undefined : 'Gyro speed · how far your aim turns for each turn of the controller. ◂ ▸ change it now'}
              role={speed === null ? undefined : 'slider'} aria-valuemin={SPEED.min} aria-valuemax={SPEED.max} aria-valuenow={speed ?? undefined}
              aria-label="Gyro speed">
              <span className={styles.tuneLabel}>Gyro speed</span>
              <span className={styles.tuneValueLine}>
                <b className={styles.tuneValue}>{speed === null ? 'Varies' : formatSpeed(speed)}</b>
                <span className={styles.tuneHint}>{speed === null ? 'Open Gyro' : props.quickTune.gyroSpeedNote ?? '◂ ▸ to adjust'}</span>
              </span>
              {speed !== null && <span className={styles.bar} aria-hidden="true"><span style={{ width: `${Math.min(100, (speed / 6) * 100)}%` }} /></span>}
            </button>
            <button type="button" className={styles.tuneTile} onClick={() => props.onOpenTune('gyro')} data-hints="A:Open Gyro"
              data-caption={`Gyro is on · ${props.quickTune.gyroOn}`}>
              <span className={styles.tuneLabel}>Gyro is on</span>
              <b className={styles.tuneWords}>{props.quickTune.gyroOn}</b>
            </button>
            <button type="button" className={styles.tuneTile} onClick={() => props.onOpenTune('trackpads')} data-hints="A:Open Trackpads"
              data-caption={`${props.quickTune.pad.label} · ${props.quickTune.pad.value}`}>
              <span className={styles.tuneLabel}>{props.quickTune.pad.label}</span>
              <b className={styles.tuneWords}>{props.quickTune.pad.value}</b>
            </button>
          </div>
        </div>
      </section>

      <section className={styles.side} aria-labelledby="home-studio-title" data-nav-region="studio">
        <div className={styles.sideHead}>
          <h2 id="home-studio-title" className={styles.sideTitle}>Your games</h2>
          <span className={styles.sideNote}>{props.configurationCount} {props.configurationCount === 1 ? 'configuration' : 'configurations'}</span>
        </div>
        <div className={styles.shelf}>
          {props.games.slice(0, 1).map(item => <GameCover key={item} name={item} onOpen={() => props.onOpenGame(item)} />)}
          {props.fallback
            ? <GameCover name={props.fallback} note="When no game matches" onOpen={() => props.onOpenGame(props.fallback!)} />
            : props.games.slice(1, 2).map(item => <GameCover key={item} name={item} onOpen={() => props.onOpenGame(item)} />)}
          <button type="button" className={`${styles.tile} ${styles.tileNew}`} onClick={props.onNewGame} data-hints="A:New for a game" data-autofocus={landing === 'new' ? '' : undefined}
            data-caption="New for a game · start from a game and a play style, or import from Steam or a file">
            <Icon name="add" size={30} />
            <b>New for a game</b>
          </button>
          <button type="button" className={styles.tile} onClick={() => props.onOpenStudio('configurations')} data-hints="A:Open"
            data-caption="Library · every game, the bases they're built on, and which game launches which">
            <Icon name="library" size={30} />
            <b>{t('app.nav.library', 'Library')}</b>
          </button>
        </div>
        <div className={styles.doors}>
          <button type="button" className={styles.door} onClick={() => props.onOpenStudio('settings')} data-hints="A:Open">
            <Icon name="preferences" size={26} />
            <span className={styles.doorText}><b>{t('app.nav.settingsGroup', 'Settings')}</b><span>Hold to swap, timing, devices, help</span></span>
          </button>
          <button type="button" className={styles.door} onClick={() => props.onOpenStudio('ai')} data-hints="A:Open">
            <Icon name="ai" size={26} />
            <span className={styles.doorText}><b>Ask the assistant</b><span>“Make jumping easier”</span></span>
          </button>
        </div>
      </section>
    </div>
  )
}
