import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './icons/Icon'
import { ButtonGlyph } from './glyphs/ButtonGlyph'
import { ControllerStatusSvg } from './ControllerStatusSvg'
import { STUDIO_PAGES, type StudioTab } from '../shell/pages'
import { layerColor } from '../shell/TitleBar'
import { layerHue, layerSlotOf } from '../utils/layers'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import controllerFront from '../assets/steam-controller-front.svg'
import styles from './HomePage.module.css'

// Home (console refinement 2a): where the app opens and where View returns
// from anywhere. Two bounded areas: THIS CONFIGURATION -- the card holding
// everything saved in the configuration being edited, including its tuning
// shortcuts, each saying where it opens -- and STUDIO, the tools that apply
// to every configuration. Tiles are never hidden (D12): one whose feature is
// not in use says so on its status line and still opens.

export type HomeTune = 'gyro' | 'mouseFeel' | 'grips'

type HomePageProps = {
  configName: string | null
  /** "Wardogs.txt", for "Saved in …". */
  fileName: string | null
  applied: boolean
  /** The editing layer, when it is not Default. */
  layer: { name: string; colorIndex: number } | null
  changeCount: number
  device?: TelemetryDevice
  onSwitch: () => void
  onContinue: () => void
  onTest: () => void
  /** Why Test cannot run right now, or null. */
  testReason: string | null
  /** The status line under each tuning tile. */
  tune: Record<HomeTune, string>
  onTune: (tile: HomeTune) => void
  /** The live line under each Studio tile. */
  studio: Partial<Record<StudioTab, string>>
  onOpenStudio: (tab: StudioTab) => void
}

const TUNE_TILES: { key: HomeTune; icon: IconName; label: string }[] = [
  { key: 'gyro', icon: 'gyro', label: 'Gyro' },
  { key: 'mouseFeel', icon: 'padTuning', label: 'Mouse feel' },
  { key: 'grips', icon: 'grips', label: 'Grip sensors' },
]

// The Studio column's fallback lines, when nothing live is known yet.
const STUDIO_NOTES: Record<StudioTab, string> = {
  configurations: 'Profiles and templates',
  associations: 'Load by app',
  globalChords: 'Swap from any configuration',
  timing: 'Hold time and polling',
  ai: 'Describe a change in words',
  deviceVisibility: 'Hide the real controller',
  settings: 'Appearance, startup, controller',
  help: 'Offline reference',
  debugConsole: 'Mapper log and commands',
}

export function HomePage(props: HomePageProps) {
  const { t } = useTranslation()
  const name = props.configName ?? 'No configuration'
  const unsaved = props.changeCount > 0
    ? `${props.changeCount} unsaved ${props.changeCount === 1 ? 'change' : 'changes'}`
    : 'Saved'

  return (
    <div className={styles.home}>
      <section className={styles.column} aria-labelledby="home-config-title" data-nav-region="config">
        <div className={styles.caption}>
          <span className="eyebrow">This configuration</span>
          {props.fileName && <span className={styles.captionNote}>Saved in {props.fileName}</span>}
        </div>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitle}>
              <div className={styles.nameLine}>
                <h1 id="home-config-title" className={styles.name}>{name}</h1>
                {props.applied && <span className={styles.appliedPill}>Applied</span>}
              </div>
              <span className={styles.subLine}>
                {props.layer && (
                  <span className={styles.layerPill} style={{ background: layerHue(layerSlotOf(props.layer.colorIndex), '-soft') }}>
                    <span className={styles.layerDot} style={{ background: layerColor(props.layer.colorIndex) }} aria-hidden="true" />
                    Editing {props.layer.name} layer
                  </span>
                )}
                {unsaved}
              </span>
            </div>
            <button type="button" className={styles.switchButton} onClick={props.onSwitch} data-nav-entry-skip="" data-hints="A:Switch configuration;B:Resume editing">
              <Icon name="library" size={20} />Switch
            </button>
          </div>

          <div className={styles.art} aria-hidden={props.device ? undefined : true}>
            {props.device
              ? <ControllerStatusSvg device={props.device} />
              : <div className={styles.artOffline}><img src={controllerFront} alt="" /><span>Controller not connected</span></div>}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.continueButton} data-autofocus data-home-continue onClick={props.onContinue}
              data-hints="A:Continue editing;B:Resume editing">
              <ButtonGlyph button="A" size={26} className={styles.continueGlyph} />Continue editing
            </button>
            <button type="button" className={styles.testButton} onClick={() => { if (!props.testReason) props.onTest() }}
              aria-disabled={props.testReason ? true : undefined} data-reason={props.testReason ?? undefined} title={props.testReason ?? 'Run the configuration while Studio is focused'}
              data-hints="A:Test;B:Resume editing">
              <Icon name="test" size={20} />Test
            </button>
          </div>

          <div className={styles.tune}>
            <span className="eyebrow">Tune {name}</span>
            <div className={styles.tuneGrid}>
              {TUNE_TILES.map(tile => (
                <button key={tile.key} type="button" className={styles.tuneTile} onClick={() => props.onTune(tile.key)}
                  data-hints="A:Open;B:Resume editing">
                  <b className={styles.tileLabel}><Icon name={tile.icon} size={20} />{tile.label}</b>
                  <span className={styles.tileNote}>{props.tune[tile.key]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.column} aria-labelledby="home-studio-title" data-nav-region="studio">
        <div className={styles.caption}>
          <span id="home-studio-title" className="eyebrow">Studio</span>
          <span className={styles.captionNote}>Applies to every configuration</span>
        </div>
        <div className={styles.studioGrid}>
          {STUDIO_PAGES.map(page => {
            const tab = page.tab as StudioTab
            return (
              <button key={tab} type="button" className={styles.studioTile} onClick={() => props.onOpenStudio(tab)}
                data-hints="A:Open;B:Resume editing">
                <span className={styles.studioIcon} aria-hidden="true"><Icon name={page.icon} size={22} /></span>
                <span className={styles.studioText}>
                  <b className={styles.tileLabel}>{t(page.labelKey, page.label)}</b>
                  <span className={styles.tileNote}>{props.studio[tab] ?? STUDIO_NOTES[tab]}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
