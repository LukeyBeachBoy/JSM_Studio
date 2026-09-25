// Named wrappers over the design icon set (components/icons), kept so callers
// can say <GyroIcon /> without knowing the set's names. The drawings come from
// design/handoff/designs/icons; see scripts/build-design-icons.mjs.
import { Icon, opticalStroke, type IconName } from './icons/Icon'

type NavIconProps = { size?: number }

const named = (name: IconName) => {
  const NamedIcon = ({ size = 18 }: NavIconProps = {}) => <Icon name={name} size={size} />
  NamedIcon.displayName = `Icon(${name})`
  return NamedIcon
}

export const OverviewIcon = named('overview')
export const ChordIcon = named('chords')
export const ControllerIcon = named('connected')
export const ConsoleIcon = named('debug')
export const ButtonsIcon = named('buttons')
export const DPadIcon = named('dpad')
export const TriggersIcon = named('triggers')
export const JoystickIcon = named('joysticks')
export const TrackpadIcon = named('trackpads')
export const GyroIcon = named('gyro')
export const TuneIcon = named('tuning')
export const GripIcon = named('grips')
export const TimingIcon = named('timing')
export const SparkleIcon = named('ai')
export const EyeIcon = named('visibility')
export const DocumentIcon = named('docs')
export const LibraryIcon = named('library')
export const PreferencesIcon = named('preferences')
export const AssociationsIcon = named('associations')
export const LayersIcon = named('layers')
export const MenuLayoutIcon = named('menuLayout')
export const PadTuningIcon = named('padTuning')

// Button-group headings. The set has no drawing per group, so each borrows the
// nearest page icon; the headings themselves carry the name.
export const BumperIcon = named('triggers')
export const PaddleIcon = named('grips')
export const CenterButtonsIcon = named('more')
export const ExtraButtonsIcon = named('add')

/** The battery drawing from the set, with its cells filled to the level. */
export function BatteryIcon({ fillFraction = 1, charging = false, size = 16 }: { fillFraction?: number; charging?: boolean; size?: number }) {
  const clamped = Math.max(0, Math.min(1, fillFraction))
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={opticalStroke(size)}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="7.5" width="15" height="9" rx="2.5" />
      <path d="M21 10.5v3" />
      {!charging && clamped > 0 && <rect x="6" y="10" width={Math.max(1, 10 * clamped)} height="4" rx="1" fill="currentColor" stroke="none" />}
      {charging && <path d="M12 8.5 9.5 12.5h3L11 15.5" stroke="var(--telemetry)" />}
    </svg>
  )
}
