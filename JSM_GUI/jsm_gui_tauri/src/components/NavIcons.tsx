// Small, hand-authored line icons for the sidebar and list-section headers.
// currentColor-themed (no fill baked in) so they follow the nav item's own
// text color -- active/hover states need no icon-specific CSS. Deliberately
// not an icon-library dependency: this is ~13 icons, not worth the bundle
// weight or version-pinning of a whole set for a fixed, small vocabulary.

import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
}

export function OverviewIcon() {
  return (
    <svg {...base}>
      <rect x="1.75" y="1.75" width="5.5" height="5.5" rx="1" />
      <rect x="8.75" y="1.75" width="5.5" height="5.5" rx="1" />
      <rect x="1.75" y="8.75" width="5.5" height="5.5" rx="1" />
      <rect x="8.75" y="8.75" width="5.5" height="5.5" rx="1" />
    </svg>
  )
}

// A held button (filled) plus a pressed one: the "hold Steam, press X" idea.
export function ChordIcon() {
  return (
    <svg {...base}>
      <circle cx="5" cy="8" r="3" fill="currentColor" stroke="none" opacity="0.9" />
      <circle cx="11" cy="8" r="3" />
      <path d="M8 6.2v3.6" strokeWidth="1.2" />
    </svg>
  )
}

export function ControllerIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 5.5h7a3 3 0 0 1 3 3.3l-.4 3.2a1.6 1.6 0 0 1-2.9.8L10 11H6l-1.2 1.8a1.6 1.6 0 0 1-2.9-.8l-.4-3.2a3 3 0 0 1 3-3.3Z" />
      <path d="M4.6 7.9h1.8M5.5 7v1.8" />
      <circle cx="11.1" cy="7.6" r="0.55" fill="currentColor" stroke="none" />
      <circle cx="12.3" cy="8.8" r="0.55" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ConsoleIcon() {
  return (
    <svg {...base}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.4" />
      <path d="M4 6.2 6.2 8 4 9.8" />
      <path d="M7.6 9.8h3.4" />
    </svg>
  )
}

// The four-button diamond, not a single button: one ringed dot was very nearly
// the joystick icon, and at rail size, with the label hidden, the two were hard
// to tell apart. The cluster is also what the page is actually about.
export function ButtonsIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="2.9" r="2.05" />
      <circle cx="13.1" cy="8" r="2.05" />
      <circle cx="8" cy="13.1" r="2.05" />
      <circle cx="2.9" cy="8" r="2.05" />
    </svg>
  )
}

export function DPadIcon() {
  return (
    <svg {...base}>
      <path d="M6.4 1.9h3.2v3.6h3.5v3.2H9.6V12.1H6.4V8.7H2.9V5.5h3.5Z" />
    </svg>
  )
}

export function TriggersIcon() {
  return (
    <svg {...base}>
      <path d="M2.4 6.4c0-2 1.5-3.6 3.4-3.6h4.4c1.9 0 3.4 1.6 3.4 3.6" />
      <rect x="2.2" y="6.4" width="11.6" height="4.2" rx="1.4" />
    </svg>
  )
}

export function BumperIcon() {
  return (
    <svg {...base}>
      <path d="M2.4 9.4V7.2c0-2.6 2.1-4.7 4.7-4.7h1.8c2.6 0 4.7 2.1 4.7 4.7v2.2" />
      <path d="M2.4 9.4h11.2" />
    </svg>
  )
}

export function PaddleIcon() {
  return (
    <svg {...base}>
      <path d="M4.8 2.4h4.8a2.4 2.4 0 0 1 2.4 2.4v6.4a2.4 2.4 0 0 1-2.4 2.4H6.4L4 11.4V4.8a2.4 2.4 0 0 1 .8-2.4Z" />
    </svg>
  )
}

export function CenterButtonsIcon() {
  return (
    <svg {...base}>
      <rect x="3.2" y="6.6" width="3.6" height="2.8" rx="0.7" />
      <rect x="9.2" y="6.6" width="3.6" height="2.8" rx="0.7" />
      <path d="M8 6.6V5c0-.6.4-1.1 1-1.3" />
    </svg>
  )
}

export function ExtraButtonsIcon() {
  return (
    <svg {...base}>
      <circle cx="5.4" cy="5.4" r="1.5" />
      <circle cx="10.6" cy="5.4" r="1.5" />
      <circle cx="5.4" cy="10.6" r="1.5" />
      <circle cx="10.6" cy="10.6" r="1.5" />
    </svg>
  )
}

export function JoystickIcon() {
 return <svg {...base}><ellipse cx="8" cy="4" rx="3.5" ry="2" /><path d="M6.5 5.8v4.4h3V5.8M3 10l-1 3h12l-1-3M4 10h2M10 10h2" /></svg>
}

export function TrackpadIcon() {
  return (
    <svg {...base}>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.6" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GyroIcon() {
  return (
    <svg {...base}>
      <ellipse cx="8" cy="8" rx="6" ry="2.6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6" transform="rotate(35 8 8)" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function TuneIcon() {
  return (
    <svg {...base}>
      <path d="M2.3 4.6h11.4M2.3 8h11.4M2.3 11.4h11.4" />
      <circle cx="5.6" cy="4.6" r="1.15" fill="var(--bg-1)" />
      <circle cx="10.2" cy="8" r="1.15" fill="var(--bg-1)" />
      <circle cx="6.8" cy="11.4" r="1.15" fill="var(--bg-1)" />
    </svg>
  )
}

// The controller's silhouette narrowed to its two handles, which is what the
// grip sensors actually are: a capacitive strip down the inside of each grip.
export function GripIcon() {
  return (
    <svg {...base}>
      <path d="M4.4 2.4v5.1c0 2.6-.7 4-1.5 5.1" />
      <path d="M11.6 2.4v5.1c0 2.6.7 4 1.5 5.1" />
      <path d="M4.4 5.2h7.2" />
      <circle cx="8" cy="9.6" r="1.1" />
    </svg>
  )
}

export function TimingIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="8.6" r="5.3" />
      <path d="M8 5.6V8.6l2.2 1.3" />
      <path d="M6.3 1.9h3.4" />
    </svg>
  )
}

export function SparkleIcon() {
  return (
    <svg {...base}>
      <path d="M8 2.2c.35 2.1 1 3.35 3.3 3.8-2.3.45-2.95 1.7-3.3 3.8-.35-2.1-1-3.35-3.3-3.8 2.3-.45 2.95-1.7 3.3-3.8Z" />
      <path d="M12.6 9.6c.2 1.05.5 1.65 1.5 1.9-1 .25-1.3.85-1.5 1.9-.2-1.05-.5-1.65-1.5-1.9 1-.25 1.3-.85 1.5-1.9Z" />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg {...base}>
      <path d="M1.6 8S3.8 3.4 8 3.4 14.4 8 14.4 8 12.2 12.6 8 12.6 1.6 8 1.6 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  )
}

// fillFraction: 0-1, how much of the cell to fill. Distinct from the other
// icons here in that it's parameterized -- used for a live battery level, not
// a fixed nav glyph.
export function BatteryIcon({ fillFraction = 1, charging = false }: { fillFraction?: number; charging?: boolean }) {
  const clamped = Math.max(0, Math.min(1, fillFraction))
  const cellX = 2.2
  const cellWidth = 10.3
  const fillWidth = cellWidth * clamped
  return (
    <svg {...base}>
      <rect x={cellX} y="4.8" width={cellWidth} height="6.4" rx="1.2" />
      <rect x="12.9" y="6.6" width="1.3" height="2.8" rx="0.5" fill="currentColor" stroke="none" />
      {clamped > 0 && !charging && (
        <rect x={cellX + 1} y="5.8" width={Math.max(0, fillWidth - 2)} height="4.4" rx="0.6" fill="currentColor" stroke="none" />
      )}
      {charging && (
        <path d="M8.6 4.4 6.4 8.6h1.7L7.5 12.6l3.3-5.1H9.1L10.3 4.4Z" fill="var(--telemetry-green)" stroke="none" />
      )}
    </svg>
  )
}

export function DocumentIcon() {
  return (
    <svg {...base}>
      <path d="M4.2 1.9h5.1l2.5 2.5v9.7H4.2Z" />
      <path d="M9.1 1.9v2.7h2.7" />
      <path d="M6 8.2h4M6 10.4h4" />
    </svg>
  )
}
