import { VisualPanel } from '../sticks/shared'

// The live trigger (console v2, Triggers / TriggersFineTune): the pull as a
// flat track with the half-press pin, the release margin and the full press,
// and the state line ("Aim is on").

type Props = {
  title: string
  /** Telemetry pull, 0..1; null with nothing connected. */
  pull: number | null
  /** TRIGGER_THRESHOLD: 0 is the lightest touch, -1 a hair trigger. */
  threshold: number
  /** TRIGGER_HYSTERESIS, as a fraction. */
  margin?: number
  /** What the half press does, for the state line: "Aim". */
  halfName?: string
  fullName?: string
  twoStep?: boolean
  gamepad?: boolean
  showMargin?: boolean
  caption?: string
}

export function TriggerBlade({ title, pull, threshold, margin = 0.02, halfName, fullName, twoStep, gamepad, showMargin, caption }: Props) {
  const travel = Math.max(0, Math.min(1, pull ?? 0))
  const hair = threshold < 0
  const half = hair ? 0 : Math.max(0, Math.min(1, threshold))
  const letGo = Math.max(0, half - margin)
  const full = travel >= 0.995
  const halfOn = !gamepad && (hair ? travel > 0.01 : travel > Math.max(half, 0.004))
  const state = pull === null ? 'Connect a controller to see the trigger'
    : gamepad ? `Sends ${Math.round(travel * 100)}% to the game`
    : full && twoStep ? `${fullName || 'Full press'} is on`
    : halfOn ? `${halfName || 'Half press'} is on` : 'Resting'
  const x = (fraction: number) => 24 + fraction * 352
  return (
    <VisualPanel title={title} chip={pull === null ? 'no controller' : `${Math.round(travel * 100)}%`} caption={caption}>
      <svg viewBox="0 0 400 130" role="img" aria-label={`${title}: ${state}`} data-trigger-blade="" data-state={full ? 'full' : halfOn ? 'half' : 'rest'}>
        {!gamepad && <>
          <text x={x(half)} y="16" fill="var(--accent)" fontSize="12" fontWeight="600" textAnchor={half < 0.15 ? 'start' : 'middle'}>{hair ? 'Hair trigger' : 'Half press'}</text>
          <path d={`M${x(half)} 22 V62`} stroke="var(--accent)" strokeWidth="2" />
          <circle cx={x(half)} cy="22" r="4" fill="var(--accent)" />
          {showMargin && !hair && margin > 0 && <path d={`M${x(letGo)} 34 V62`} stroke="#808c99" strokeWidth="1.5" strokeDasharray="3 3" />}
          {twoStep && <text x={x(1)} y="16" fill="#e3eaf1" fontSize="12" fontWeight="600" textAnchor="end">Full press</text>}
        </>}
        <rect x="24" y="38" width="352" height="20" rx="10" fill="#0e1419" stroke="rgba(255,255,255,.08)" />
        <rect x="24" y="38" width={Math.max(0, travel * 352)} height="20" rx="10" fill={gamepad ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'var(--accent)'} />
        {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(tick => <path key={tick} d={`M${x(tick)} 64 v5`} stroke="rgba(255,255,255,.18)" strokeWidth="1.5" />)}
        <path d={`M${x(1)} 30 V66`} stroke="#e3eaf1" strokeWidth="2" />
        <rect x={x(travel) - 5} y="33" width="10" height="30" rx="4" fill="#e3eaf1" />
        <text x="24" y="86" fill="#808c99" fontSize="12">{gamepad ? '0%' : hair ? 'Fires as you squeeze' : half === 0 ? 'Default · first touch' : `${Math.round(half * 100)}%`}</text>
        {showMargin && !hair && margin > 0 && letGo > 0.06 && <text x={x(letGo)} y="100" fill="#808c99" fontSize="11" textAnchor="middle">lets go at {Math.round(letGo * 100)}%</text>}
        <text x={x(0.5)} y="86" fill="#808c99" fontSize="12" textAnchor="middle">50%</text>
        <text x={x(1)} y="86" fill="#808c99" fontSize="12" textAnchor="end">100%</text>
        <text x="200" y="122" fill="#e3eaf1" fontSize="13" fontWeight="600" textAnchor="middle">{state}</text>
      </svg>
    </VisualPanel>
  )
}

/** How a DualSense pushes back, as a profile along the pull (TriggersFineTune's
 *  second panel and TriggersResistance's graph). `profile` maps pull → force 0..1. */
export function PushBackGraph({ title, chip, profile, marks, caption, pull }: { title: string; chip?: string; profile: (pull: number) => number; marks?: { at: number; label: string }[]; caption?: string; pull?: number | null }) {
  const points = Array.from({ length: 81 }, (_, index) => { const p = index / 80; return `${index ? 'L' : 'M'}${24 + p * 352},${120 - Math.max(0, Math.min(1, profile(p))) * 90}` }).join(' ')
  return (
    <VisualPanel title={title} chip={chip} caption={caption}>
      <svg viewBox="0 0 400 150" role="img" aria-label={title}>
        <path d="M24 120 H376 M24 30 V120" stroke="rgba(255,255,255,.1)" strokeWidth="1.5" />
        <path d={`${points} L376,120 L24,120 Z`} fill="color-mix(in srgb, var(--accent) 12%, transparent)" />
        <path d={points} stroke="var(--accent)" strokeWidth="2" fill="none" />
        {marks?.map(mark => <g key={mark.label}><path d={`M${24 + mark.at * 352} 28 V120`} stroke="#808c99" strokeDasharray="3 3" /><text x={24 + mark.at * 352} y="22" fill="#b0bcc8" fontSize="11" textAnchor={mark.at < 0.25 ? 'start' : mark.at > 0.75 ? 'end' : 'middle'}>{mark.label}</text></g>)}
        {typeof pull === 'number' && <circle cx={24 + Math.max(0, Math.min(1, pull)) * 352} cy={120 - Math.max(0, Math.min(1, profile(pull))) * 90} r="5" fill="#a6d65a" stroke="#e3eaf1" strokeWidth="2" />}
        <text x="200" y="142" fill="#808c99" fontSize="11" textAnchor="middle">How far you pull →</text>
      </svg>
    </VisualPanel>
  )
}
