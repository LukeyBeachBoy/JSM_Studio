import { useEffect, useRef, type CSSProperties } from 'react'
import { ModelControllerSvg, modelBackInput } from './ModelControllerSvg'
import { controllerArtworkModel } from '../utils/controllerArtwork'
import { STEAM_BACK_ART, STEAM_FRONT_ART } from './controllerArt'
import type { TelemetryDevice } from '../hooks/useTelemetry'
import { usePreferences } from '../platform/preferenceStore'
import { InputMark } from './glyphs/inputMarks'
import {
  controllerBackInputMode,
  controllerButtonGlyph,
  controllerVisualFamily,
  getPressedControllerCommandSet,
  type ControllerVisualFamily,
} from '../utils/controllerStatus'
import styles from './ControllerStatusSvg.module.css'

type ControllerStatusSvgProps = {
  bindingLabels?: Record<string, string>
  boundCommands?: Set<string>
  device: TelemetryDevice
  selectedCommand?: string | null
  onSelectCommand?: (command: string) => void
  /**
   * Draw the raw sensor numbers on the diagram. Off by default: the diagram
   * is for reading your bindings, and a pad labelled `p=0.0000` reads as a
   * debugging instrument rather than a picture of your controller. The live
   * feedback that shows where your thumb is stays on either way.
   */
  showRawTelemetry?: boolean
  /**
   * 'always' (default): the back view sits beside the front all the time, with
   * its legend. 'focus' (console v2 Layout): the front is captioned "Front" and
   * the back appears beside it only while an input that lives there is the
   * selected one, captioned with its name ("Back · right grip").
   */
  backView?: 'always' | 'focus'
  /** The back view's caption in 'focus' mode. */
  backCaption?: string
}

// What a Steam Controller shows only on its back: the paddles, the grips, and
// the triggers (the front art has no triggers; they are drawn on the back).
const STEAM_BACK_INPUTS = new Set(['LSL', 'LSR', 'RSR', 'RSL', 'MISC5', 'MISC6', 'GRIP_L', 'GRIP_R', 'ZL', 'ZR', 'ZLF', 'ZRF'])

/** Whether an input is drawn on the controller's back view (Layout's "Back · …"). */
export function isBackInput(device: TelemetryDevice | undefined, command: string | null | undefined) {
  if (!device || !command) return false
  if (controllerArtworkModel(device)) return modelBackInput(device, command)
  return controllerVisualFamily(device.type) === 'steam' && STEAM_BACK_INPUTS.has(command)
}

type SharedControlProps = {
  bound?: boolean
  muted?: boolean
  onSelect?: () => void
  pressed?: boolean
  selected?: boolean
  title?: string
}

type ButtonBubbleProps = SharedControlProps & {
  /** The input this bubble is, when its marking is drawn rather than typed. */
  command?: string
  family?: ControllerVisualFamily
  cx: number
  cy: number
  label: string
  radius?: number
}

type PathButtonProps = SharedControlProps & {
  compact?: boolean
  d: string
  label: string
  labelX: number
  labelY: number
  /** Applied to the shape only, for paths lifted straight out of the artwork. */
  transform?: string
}

type StickProps = SharedControlProps & {
  cx: number
  cy: number
  x: number
  y: number
  // Radius of the stick's outer well in overlay units. The legacy DualSense
  // layout is drawn in its own 1117x892 space where 87 is right; the Steam
  // artwork's well measures ~135 units across, so it needs a smaller one or the
  // overlay spills past the drawn ring.
  baseRadius?: number
  // Capacitive contact, the same family of signal as a pad touch or a grip. Shown
  // with the same treatment so all three read as one kind of input.
  touched?: boolean
}

type TriggerPathProps = SharedControlProps & {
  compact?: boolean
  d: string
  fillX: number
  fillY: number
  fillWidth: number
  label: string
  labelX: number
  labelY: number
  value: number
}

type PaddleButtonProps = SharedControlProps & {
  height: number
  label: string
  width: number
  x: number
  y: number
}

const LEFT_STICK_COMMANDS = ['L3', 'LUP', 'LDOWN', 'LLEFT', 'LRIGHT', 'LRING', 'LTOUCH']
const RIGHT_STICK_COMMANDS = ['R3', 'RUP', 'RDOWN', 'RLEFT', 'RRIGHT', 'RRING', 'RTOUCH']
const LEFT_TRIGGER_COMMANDS = ['ZL', 'ZLF']
const RIGHT_TRIGGER_COMMANDS = ['ZR', 'ZRF']
const PADDLE_COMMANDS = ['LSL', 'LSR', 'RSR', 'RSL'] as const

type PaddleCommand = (typeof PADDLE_COMMANDS)[number]

type PaddleLayoutEntry = {
  command: PaddleCommand
  height: number
  side: 'left' | 'right'
  width: number
  x: number
  y: number
}

const PADDLE_LAYOUT: PaddleLayoutEntry[] = [
  { command: 'LSL', side: 'left', x: 162, y: 656, width: 132, height: 38 },
  { command: 'LSR', side: 'left', x: 196, y: 710, width: 132, height: 38 },
  { command: 'RSR', side: 'right', x: 823, y: 656, width: 132, height: 38 },
  { command: 'RSL', side: 'right', x: 789, y: 710, width: 132, height: 38 },
]

const BACK_INPUT_TITLES: Record<PaddleCommand, string> = {
  LSL: 'Primary left back paddle / Joy-Con L SL',
  LSR: 'Secondary left back paddle / Joy-Con L SR',
  RSR: 'Primary right back paddle / Joy-Con R SR',
  RSL: 'Secondary right back paddle / Joy-Con R SL',
}

const DUALSENSE_PATHS = {
  borderLower:
    'M100.97,881.749c8.551,1.607 62.356,4.094 68.38,-3.153c33.93,-40.827 69.521,-154.237 85.416,-196.14c9.791,-25.813 35.4,-37.881 67.491,-40.687c30.597,13.569 45.149,13.982 96.708,3.594l280.228,-0c51.559,10.388 66.111,9.975 96.708,-3.594c32.091,2.806 57.701,14.874 67.492,40.687c15.894,41.903 51.486,155.313 85.416,196.14c6.023,7.247 59.828,4.76 68.38,3.153',
  borderLeftUpper: 'M282.527,168.559c13.841,1.794 27.682,-1.16 41.522,-6.511',
  borderRightUpper: 'M835.33,168.559c-13.84,1.794 -27.681,-1.16 -41.522,-6.511',
  leftHandle:
    'M296.668,193.129c-5.479,-25.983 -25.743,-37.755 -62.282,-33.901c-40.742,4.297 -79.814,11.918 -115.424,22.309c-11.905,3.474 -23.487,8.273 -28.39,18.67c-91.01,192.963 -106.846,408.796 -55.913,643.084c2.947,13.555 9.046,24.221 21.05,32.104c5.843,3.836 12.587,7.06 21.886,9.445c21.562,5.529 31.041,-9.866 33.636,-23.758c33.416,-178.821 88.679,-342.348 191.663,-450.233c9.318,-9.761 18.181,-31.681 20.635,-51.733c0.969,-7.926 0.451,-15.333 -0.463,-22.036c-6.051,-44.414 -16.477,-96.901 -26.398,-143.951Z',
  rightHandle:
    'M820.718,193.129c5.479,-25.983 25.744,-37.755 62.283,-33.901c40.742,4.297 79.814,11.918 115.424,22.309c11.905,3.474 23.486,8.273 28.39,18.67c91.01,192.963 106.846,408.796 55.912,643.084c-2.947,13.555 -9.046,24.221 -21.05,32.104c-5.842,3.836 -12.586,7.06 -21.885,9.445c-21.563,5.529 -31.041,-9.866 -33.637,-23.758c-33.415,-178.821 -88.678,-342.348 -191.662,-450.233c-9.318,-9.761 -18.181,-31.681 -20.635,-51.733c-0.97,-7.926 -0.451,-15.333 0.462,-22.036c6.052,-44.414 16.477,-96.901 26.398,-143.951Z',
  touchpad:
    'M559.079,143.015c0,0 158.534,-0.805 226.555,15.497c12.437,2.981 21.237,14.507 19.467,24.644c-8.942,51.221 -20.354,109.033 -30.53,160.023c-8.029,40.224 -40.893,53.816 -68.431,53.692c-27.538,-0.124 -147.061,-0.559 -147.061,-0.559c0,0 -119.522,0.435 -147.06,0.559c-27.538,0.124 -60.403,-13.468 -68.431,-53.692c-10.177,-50.99 -21.589,-108.802 -30.531,-160.023c-1.77,-10.137 7.031,-21.663 19.467,-24.644c68.021,-16.302 226.555,-15.497 226.555,-15.497Z',
  l2:
    'M252.212,116.785l-114.214,0c-12.312,0 1.248,-110.916 78.919,-110.916c37.32,-0 51.81,110.916 35.295,110.916Z',
  r2:
    'M866.471,116.785l114.214,0c12.312,0 -1.248,-110.916 -78.919,-110.916c-37.32,-0 -51.81,110.916 -35.295,110.916Z',
  l1:
    'M122.514,180.513c0.736,-29.244 151.654,-71.59 148.099,-18.465c-9.518,-3.397 -21.562,-4.367 -36.227,-2.82c-39.392,4.154 -77.223,11.417 -111.872,21.285Z',
  r1:
    'M995.675,180.421c-0.736,-29.244 -151.654,-71.59 -148.099,-18.465c9.518,-3.397 21.562,-4.367 36.227,-2.82c39.392,4.154 77.223,11.417 111.872,21.285Z',
  dpadUp:
    'M213.487,271.996c0,-11.214 -9.091,-20.305 -20.305,-20.305l-28.888,-0c-11.215,-0 -20.306,9.091 -20.306,20.305l0,24.336c0,6.286 2.397,12.335 6.703,16.915c6.856,7.293 17.331,18.436 23.351,24.838c1.218,1.296 2.917,2.031 4.696,2.031c1.778,-0 3.478,-0.735 4.696,-2.031c6.019,-6.402 16.494,-17.545 23.35,-24.838c4.306,-4.58 6.703,-10.629 6.703,-16.915c0,-6.766 0,-16.013 0,-24.336Z',
  dpadDown:
    'M213.487,443.093c0,11.215 -9.091,20.306 -20.305,20.306l-28.888,-0c-11.215,-0 -20.306,-9.091 -20.306,-20.306l0,-24.125c0,-6.412 2.494,-12.572 6.953,-17.178c6.884,-7.11 17.23,-17.796 23.166,-23.927c1.214,-1.254 2.885,-1.962 4.631,-1.962c1.745,0 3.416,0.708 4.63,1.962c5.936,6.131 16.282,16.817 23.166,23.927c4.46,4.606 6.953,10.766 6.953,17.178c0,6.746 0,15.888 0,24.125Z',
  dpadLeft:
    'M93.725,322.259c-11.214,0 -20.306,9.091 -20.306,20.306l0,28.888c0,11.214 9.092,20.305 20.306,20.305l24.349,0c6.278,0 12.321,-2.391 16.899,-6.687c7.081,-6.644 17.749,-16.654 23.908,-22.433c1.273,-1.195 2.007,-2.855 2.034,-4.601c0.027,-1.746 -0.656,-3.428 -1.891,-4.661c-6.106,-6.094 -16.81,-16.778 -23.947,-23.901c-4.63,-4.621 -10.904,-7.216 -17.446,-7.216c-6.724,0 -15.757,0 -23.906,0Z',
  dpadRight:
    'M263.75,322.259c11.215,0 20.306,9.091 20.306,20.306l-0,28.888c-0,11.214 -9.091,20.305 -20.306,20.305l-24.349,0c-6.278,0 -12.32,-2.391 -16.899,-6.687c-7.081,-6.644 -17.749,-16.654 -23.907,-22.433c-1.274,-1.195 -2.008,-2.855 -2.035,-4.601c-0.027,-1.746 0.656,-3.428 1.892,-4.661c6.106,-6.094 16.81,-16.778 23.946,-23.901c4.63,-4.621 10.905,-7.216 17.446,-7.216c6.724,0 15.758,0 23.906,0Z',
  create:
    'M281.064,206.321l6.369,31.916c-0,-0 2.557,11.875 -11.724,14.725c-14.281,2.849 -16.478,-9.098 -16.478,-9.098l-6.4,-32.075c-0,-0 -2.559,-11.876 11.739,-14.645c14.299,-2.77 16.494,9.177 16.494,9.177Z',
  options:
    'M839.082,206.321l-6.369,31.916c-0,-0 -2.557,11.875 11.724,14.725c14.281,2.849 16.478,-9.098 16.478,-9.098l6.4,-32.075c0,-0 2.559,-11.876 -11.74,-14.645c-14.298,-2.77 -16.493,9.177 -16.493,9.177Z',
  mute:
    'M590.061,591.266c-0,-3.699 -2.999,-6.698 -6.698,-6.698c-11.914,0 -36.653,0 -48.567,0c-3.7,0 -6.698,2.999 -6.698,6.698c-0,0.001 -0,0.001 -0,0.002c-0,3.699 2.998,6.698 6.698,6.698c11.914,-0 36.653,-0 48.567,-0c3.699,-0 6.698,-2.999 6.698,-6.698c-0,-0.001 -0,-0.001 -0,-0.002Z',
} as const

const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const hasAny = (commands: readonly string[], set?: Set<string>) => commands.some(command => set?.has(command))

const isAnySelected = (commands: readonly string[], selectedCommand?: string | null) =>
  commands.some(command => command === selectedCommand)

const pickCommand = (commands: readonly string[], boundCommands?: Set<string>, selectedCommand?: string | null) => {
  if (selectedCommand && commands.includes(selectedCommand)) return selectedCommand
  const boundCommand = commands.find(command => boundCommands?.has(command))
  return boundCommand ?? commands[0]
}

const getDefaultPaddleCommands = (mode: ReturnType<typeof controllerBackInputMode>): PaddleCommand[] => {
  switch (mode) {
    case 'fourPaddles':
      return ['LSL', 'LSR', 'RSR', 'RSL']
    case 'twoPaddles':
      return ['LSL', 'RSR']
    case 'leftJoyConRail':
      return ['LSL', 'LSR']
    case 'rightJoyConRail':
      return ['RSL', 'RSR']
    default:
      return []
  }
}

// The Steam Controller's back buttons are called L4/L5/R4/R5 on the device and in
// Steam Input, so calling them "L B1" here just made them hard to find. Other
// controllers keep the generic naming: a DualSense Edge's paddles are not L4.
const STEAM_PADDLE_LABELS: Record<PaddleCommand, string> = {
  LSL: 'L4',
  LSR: 'L5',
  RSR: 'R4',
  RSL: 'R5',
}

const getPaddleLabel = (mode: ReturnType<typeof controllerBackInputMode>, command: PaddleCommand, steam = false) => {
  if (steam) {
    return STEAM_PADDLE_LABELS[command]
  }
  if (mode === 'leftJoyConRail' || mode === 'rightJoyConRail') {
    const joyConLabels: Record<PaddleCommand, string> = {
      LSL: 'L SL',
      LSR: 'L SR',
      RSR: 'R SR',
      RSL: 'R SL',
    }
    return joyConLabels[command]
  }
  const backPaddleLabels: Record<PaddleCommand, string> = {
    LSL: 'L B1',
    LSR: 'L B2',
    RSR: 'R B1',
    RSL: 'R B2',
  }
  return backPaddleLabels[command]
}

const uniquePaddleCommands = (commands: PaddleCommand[]) => Array.from(new Set(commands))

function ShellArtwork({ family }: { family: ControllerVisualFamily }) {
  if (family === 'steam') {
    // Steam Controller 2026 shell — modeled after Valve's own schematic
    // The controller has: two circular trackpads at top, analog sticks below,
    // a diamond face button layout, D-pad, and wide grips that flare down.
    return (
      <g aria-hidden="true">
        {/* Main body — rounded top, flared grips at bottom */}
        <path className={styles.shell} d="
          M 200,180
          C 200,140 240,125 300,125 L 817,125
          C 877,125 917,140 917,180
          L 917,340
          C 917,380 905,420 880,460
          L 840,540
          C 820,580 790,600 750,605
          L 367,605
          C 327,600 297,580 277,540
          L 237,460
          C 212,420 200,380 200,340
          Z" />
        {/* Left grip flare */}
        <path className={styles.shell} d="
          M 200,340
          C 195,380 185,420 165,450
          L 120,520
          C 100,560 90,600 100,630
          C 110,650 135,650 150,625
          L 185,560
          C 200,530 205,490 200,450
          Z" />
        {/* Right grip flare */}
        <path className={styles.shell} d="
          M 917,340
          C 922,380 932,420 952,450
          L 997,520
          C 1017,560 1027,600 1017,630
          C 1007,650 982,650 967,625
          L 932,560
          C 917,530 912,490 917,450
          Z" />
        {/* Trackpad bezels — raised circular rims */}
        <circle className={styles.shellLine} cx={280} cy={230} r={78} fill="none" strokeWidth={3} opacity={0.5} />
        <circle className={styles.shellLine} cx={837} cy={230} r={78} fill="none" strokeWidth={3} opacity={0.5} />
        {/* Body outline */}
        <path className={styles.shellLine} d="
          M 200,180
          C 200,140 240,125 300,125 L 817,125
          C 877,125 917,140 917,180
          L 917,340
          C 917,380 905,420 880,460
          L 840,540
          C 820,580 790,600 750,605
          L 367,605
          C 327,600 297,580 277,540
          L 237,460
          C 212,420 200,380 200,340
          Z" fill="none" />
      </g>
    )
  }
  return (
    <g aria-hidden="true">
      <path className={styles.shell} d={DUALSENSE_PATHS.leftHandle} />
      <path className={styles.shell} d={DUALSENSE_PATHS.rightHandle} />
      <path className={styles.shellLine} d={DUALSENSE_PATHS.borderLower} />
      <path className={styles.shellLine} d={DUALSENSE_PATHS.borderLeftUpper} />
      <path className={styles.shellLine} d={DUALSENSE_PATHS.borderRightUpper} />
    </g>
  )
}

function ButtonBubble({
  command,
  family = 'generic',
  cx,
  cy,
  label,
  pressed = false,
  muted = false,
  radius = 23,
  bound = false,
  selected = false,
  onSelect,
  title,
}: ButtonBubbleProps) {
  // A button whose printed marking is a shape gets it drawn; the rest keep their
  // typed label, which is what those controllers print anyway.
  const typedLabel = (
    <text
      className={join(styles.controlText, selected && styles.controlTextSelected, pressed && styles.controlTextPressed)}
      x={cx}
      y={cy}
    >
      {label}
    </text>
  )
  return (
    <g className={join(muted && styles.sideMuted, onSelect && styles.interactive)} onClick={onSelect}>
      {title && <title>{title}</title>}
      <circle
        className={join(
          styles.control,
          bound && styles.controlBound,
          selected && styles.controlSelected,
          pressed && styles.controlPressed
        )}
        cx={cx}
        cy={cy}
        r={radius}
      />
      {/* A press pulses once: the ring grows 1 to 1.6 and fades (--dur-3). */}
      {pressed && <circle className={styles.pressRing} cx={cx} cy={cy} r={radius} />}
      {command ? (
        <InputMark
          command={command}
          family={family}
          cx={cx}
          cy={cy}
          radius={radius}
          className={join(styles.controlMark, (selected || pressed) && styles.controlMarkActive)}
          fallback={typedLabel}
        />
      ) : (
        typedLabel
      )}
    </g>
  )
}

function PathButton({
  d,
  label,
  labelX,
  labelY,
  pressed = false,
  muted = false,
  compact = false,
  bound = false,
  selected = false,
  onSelect,
  title,
  transform,
}: PathButtonProps) {
  return (
    <g className={join(muted && styles.sideMuted, onSelect && styles.interactive)} onClick={onSelect}>
      {title && <title>{title}</title>}
      <path
        className={join(
          styles.control,
          compact && styles.controlCompact,
          bound && styles.controlBound,
          selected && styles.controlSelected,
          pressed && styles.controlPressed
        )}
        d={d}
        transform={transform}
      />
      <text
        className={join(
          styles.controlText,
          compact && styles.controlTextCompact,
          selected && styles.controlTextSelected,
          pressed && styles.controlTextPressed
        )}
        x={labelX}
        y={labelY}
      >
        {label}
      </text>
    </g>
  )
}

function PaddleButton({
  height,
  label,
  pressed = false,
  muted = false,
  width,
  x,
  y,
  bound = false,
  selected = false,
  onSelect,
  title,
}: PaddleButtonProps) {
  return (
    <g className={join(muted && styles.sideMuted, onSelect && styles.interactive)} onClick={onSelect}>
      {title && <title>{title}</title>}
      <rect
        className={join(
          styles.control,
          styles.paddleControl,
          bound && styles.controlBound,
          selected && styles.controlSelected,
          pressed && styles.controlPressed
        )}
        x={x}
        y={y}
        width={width}
        height={height}
        rx={height / 2}
      />
      <text
        className={join(
          styles.controlText,
          styles.paddleText,
          selected && styles.controlTextSelected,
          pressed && styles.controlTextPressed
        )}
        x={x + width / 2}
        y={y + height / 2}
      >
        {label}
      </text>
    </g>
  )
}

function TriggerPath({
  compact = false,
  d,
  fillX,
  fillY,
  fillWidth,
  label,
  labelX,
  labelY,
  value,
  pressed = false,
  muted = false,
  bound = false,
  selected = false,
  onSelect,
  title,
}: TriggerPathProps) {
  const fillValue = clamp(value, 0, 1)
  return (
    <g className={join(muted && styles.sideMuted, onSelect && styles.interactive)} onClick={onSelect}>
      {title && <title>{title}</title>}
      <path
        className={join(
          styles.triggerTrack,
          bound && styles.triggerTrackBound,
          selected && styles.triggerTrackSelected,
          pressed && styles.controlPressed
        )}
        d={d}
      />
      <rect className={styles.triggerFill} x={fillX} y={fillY} width={fillWidth * fillValue} height={12} rx={6} />
      <text className={join(styles.triggerLabel, compact && styles.controlTextCompact, selected && styles.triggerLabelSelected)} x={labelX} y={labelY}>
        {label}
      </text>
    </g>
  )
}

// The bumpers and triggers, as the artwork itself draws them. Each `d` below is
// one subpath of the `--art-line` path in the generated art (controllerArt.ts,
// from steam-controller-front.svg / steam-controller-back.svg): the gap that
// path leaves for a part is exactly that part's face, so filling the same
// outline lights the drawn part and nothing else. Re-copy them if the artwork
// is regenerated; never approximate them with rectangles again.
//
// The front view shows the bumpers only. The triggers sit behind them and are
// not in the front artwork at all; drawing trigger bands there put two bars on
// each shoulder hump that matched nothing on the controller. Presses and pulls
// of both are shown on the back view, where both parts are drawn.
//
// Front: in the art's own space, placed by the same transform the artwork's
// group uses (left hump x[195.6,346.6] y[6.8,57.8] once placed).
const STEAM_FRONT_ART_TRANSFORM = 'translate(42.43417 0) scale(2.3510972)'
const STEAM_FRONT_BUMPER_PATHS = {
  left: 'M129.382 7.86903C125.901 5.04028 123.661 3.08243 118.827 2.92995C115.572 2.82728 112.385 2.95603 109.136 3.0644C105.4 4.07018 101.654 4.28203 98.0498 5.16455C87.5228 7.74208 73.0873 11.3159 66.866 20.9758C66.4188 21.6703 65.4993 23.7752 65.1383 24.5874C71.1418 21.1321 72.672 20.2301 79.043 17.7622C86.4963 14.143 97.9708 12.6025 106.092 10.8694C113.952 9.19218 121.474 9.03155 129.382 7.86903Z',
  right: 'M320.438 3.04245C314.193 4.7123 315.638 4.40565 310.948 7.8373C327.983 9.81368 353.983 12.2806 369.035 20.7569C370.983 21.898 372.955 22.9957 374.953 24.0491C374.658 23.2555 373.587 20.2985 373.182 19.7494C370.51 16.1414 365.392 12.9389 361.31 11.1395C352.217 7.1317 341.765 4.5944 331.955 3.09525C329.835 2.77163 322.612 2.92318 320.438 3.04245Z',
} as const
// Where a bumper's name sits with Details on: over the thick end of the part.
const STEAM_FRONT_BUMPER_LABELS = {
  left: { x: 268, y: 22 },
  right: { x: 851, y: 22 },
} as const

// Back: in the unmirrored back art's space. The back view draws that art inside
// a mirroring group so the controller's left stays on the left, and these go in
// the same group. So the controller's LEFT parts are the ones at the art's
// right edge (x 306-374), matching the L4/L5 paddle hotspots on the left of the
// drawing. The right trigger's face is drawn as two subpaths.
const STEAM_BACK_SHOULDER_PATHS = {
  left: {
    bumper: 'M317.787 8.08931C312.547 8.74231 305.347 11.475 305.925 17.8821C306.175 20.6592 305.422 29.505 306.375 31.5637L306.707 31.3962C307.275 29.562 308.045 28.5567 309.745 27.639C319.807 22.2075 347.767 26.427 358.622 29.7735C359.265 29.9717 359.89 30.224 360.505 30.4937C361.475 30.9007 362.68 31.3437 363.597 31.8137C366.805 33.4565 370.2 34.4632 373.43 36.0307C370.88 32.889 370.507 28.8692 368.152 26.0127C356.332 11.6709 335.612 6.74786 317.787 8.08931Z',
    trigger: 'M373.677 53.9877C374.1 50.5095 373.73 44.6052 372.347 41.41C371.19 40.7005 370.812 38.9482 369.79 37.8407C367.157 34.9897 363.322 32.6375 359.647 31.3902C345.447 26.5712 328.985 25.2205 314.177 27.0582C312.207 27.3025 308.932 28.6317 307.885 30.448C306.042 33.4265 307.172 37.2892 307.892 40.475C306.965 41.1892 306.837 42.3875 306.712 43.5022C305.997 49.8755 310.885 54.0195 315.377 57.52C323.395 63.768 332.895 68.1585 343.062 69.2007C350.885 69.976 359.052 69.5495 366.55 66.9802C367.157 66.772 369.402 66.0342 369.865 65.7525C371.102 65.0677 372.835 64.1707 374.012 63.452C374.062 61.5865 374.34 56.5242 373.767 55.0425C373.027 55.5202 371.422 56.5022 370.627 56.1602C368.687 55.3245 366.257 53.7127 364.382 52.7092C362.235 51.5735 359.98 50.658 357.647 49.9772C348.357 47.2005 337.642 46.5867 327.915 46.1432C321.217 45.8377 313.407 47.8805 308.285 41.8655C308.177 41.7382 307.94 40.6885 307.892 40.475C309.725 41.524 310.982 43.7565 314.542 44.6727C318.462 45.6817 321.972 45.1857 325.972 45.174C329.142 45.1857 332.312 45.261 335.48 45.3997C341.727 45.6917 349.48 46.9467 355.672 48.3782C358.752 49.077 361.722 50.1882 364.505 51.682C366.21 52.6125 369.495 54.7645 371.207 55.2037C372.182 55.1425 372.837 54.5532 373.677 53.9877Z',
  },
  right: {
    bumper: 'M123.864 32.0842C123.036 28.0485 123.696 19.0268 122.968 13.4429C118.105 7.24479 109.18 7.93604 102.092 8.11574C80.0375 9.69586 57.6822 16.8711 55.1232 42.1742C58.782 35.2612 63.0657 32.5195 70.4992 29.733C70.7665 29.6327 71.0342 29.5875 71.3147 29.5315C76.4152 28.3267 83.3355 26.2457 88.7035 25.691C96.0765 24.9291 106.131 24.9575 113.576 25.6275C115.356 25.7877 118.685 26.9977 120.429 27.6325C121.817 29.198 122.655 30.3747 123.864 32.0842Z',
    trigger: 'M54.8335 54.0885C55.6175 54.562 56.448 55.0935 57.264 55.4967C60.1342 53.8762 68.958 48.7425 72.311 48.4387C78.3987 47.5467 84.4322 45.5732 90.6655 45.3085C94.469 45.1015 98.2615 45.2292 102.069 45.1857C108.86 45.1085 116.327 46.5015 121.166 40.4357C123.016 38.1167 122.651 35.3255 122.759 32.4715L120.746 29.2805C114.216 25.6755 105.888 26.1482 98.4912 26.3665C85.9107 26.835 62.6592 28.7875 56.274 42.3902C55.3092 44.4455 54.6482 50.749 54.7672 53.1567C54.783 53.4677 54.805 53.7782 54.8335 54.0885Z'
      + 'M122.521 39.1572C118.81 47.8867 109.238 46.0812 101.303 46.0502C90.091 46.0065 78.667 47.4165 67.9727 50.9012C65.317 51.766 59.679 55.1175 57.1947 56.5745C55.846 55.8717 55.3707 55.555 54.167 54.6215C54.5652 60.8377 52.1262 62.016 57.9982 65.4697C69.4222 70.991 86.1647 70.6385 98.1455 66.1852C107.536 62.6947 126.645 52.5457 122.886 39.657C122.829 39.4625 122.658 39.2992 122.521 39.1572Z',
  },
} as const

// Whether a full-pull binding can ever fire comes down to whether the trigger
// reaches the top of its axis, and no rounded decimal shows that: one count
// short of the maximum still prints as 1.0000. So report the raw count the
// telemetry float was divided down from, against the maximum it has to reach.
// Listed with Details on in the back view's legend, beside the triggers it reads.
const TRIGGER_AXIS_MAX = 32767
const triggerReadout = (value: number) => `${Math.round(value * TRIGGER_AXIS_MAX)}/${TRIGGER_AXIS_MAX}`

// Measured directly from the paths in steam-controller-front.svg, expressed in the
// same 1117x750 space the artwork now uses. Do not hand-tune these: re-measure the
// SVG if the artwork changes.
const STEAM_PAD = {
  left: { cx: 364.9, cy: 410.5, half: 108.0, rot: 10.7 },
  right: { cx: 750.8, cy: 410.5, half: 108.7, rot: -10.5 },
} as const

// The pads are tilted ~10.6 degrees outward, so a live touch point has to be rotated
// into pad space. Clamping to an axis-aligned box put the dot outside the artwork
// near the corners.
function padPoint(pad: { cx: number; cy: number; half: number; rot: number }, u: number, v: number) {
  const t = (pad.rot * Math.PI) / 180
  const c = Math.cos(t)
  const sn = Math.sin(t)
  const x = clamp(u, -1, 1)
  const y = clamp(v, -1, 1)
  return { x: pad.cx + (x * c - y * sn) * pad.half, y: pad.cy + (x * sn + y * c) * pad.half }
}

// Half the width of the stick well in the artwork (paths measuring 135.2 and
// 127.9 units across, left and right). Do not hand-tune: re-measure the SVG.
const STEAM_STICK_RADIUS = 66

// A touch on a pad: the point, a soft ring, and a trail of the last few
// positions fading behind it (Foundations, "Motion": pad/stick trail = 3-5
// fading dots). Positions come from telemetry, one per rendered frame.
function PadTouch({ point }: { point: { x: number; y: number } }) {
  const trail = useRef<{ x: number; y: number }[]>([])
  useEffect(() => {
    trail.current = [point, ...trail.current].slice(0, 5)
  })
  const behind = trail.current.slice(0, 4)
  return (
    <g className={styles.padTouch} aria-hidden="true">
      {behind.map((dot, index) => <circle key={index} cx={dot.x} cy={dot.y} r={10 - index} opacity={0.6 - index * 0.14} />)}
      <circle cx={point.x} cy={point.y} r={13} />
      <circle className={styles.padTouchRing} cx={point.x} cy={point.y} r={22} />
    </g>
  )
}

// The back of the controller, mirrored so left stays left (Controller Live):
// paddles and grip sensors, which the front view cannot show.
const BACK_HOTSPOTS: { command: string; label: string; cx: number; cy: number; rx: number; ry: number }[] = [
  { command: 'MISC6', label: 'Left grip', cx: 30, cy: 228, rx: 16, ry: 52 },
  { command: 'MISC5', label: 'Right grip', cx: 398, cy: 228, rx: 16, ry: 52 },
  { command: 'LSL', label: 'L4', cx: 103, cy: 175, rx: 17, ry: 24 },
  { command: 'LSR', label: 'L5', cx: 84, cy: 235, rx: 15, ry: 23 },
  { command: 'RSR', label: 'R4', cx: 325, cy: 175, rx: 17, ry: 24 },
  { command: 'RSL', label: 'R5', cx: 344, cy: 235, rx: 15, ry: 23 },
]

const BACK_SHOULDERS = [
  { side: 'left', bumper: 'L', bumperTitle: 'Left bumper', triggers: LEFT_TRIGGER_COMMANDS, triggerTitle: 'Left trigger' },
  { side: 'right', bumper: 'R', bumperTitle: 'Right bumper', triggers: RIGHT_TRIGGER_COMMANDS, triggerTitle: 'Right trigger' },
] as const

// Below this a resting trigger's noise would flicker the fill on and off.
const TRIGGER_PULL_FLOOR = 0.02

function SteamBackView({ pressed, boundCommands, selectedCommand, onSelectCommand, bindingLabels, triggers, triggerLabels, showRawTelemetry = false, caption }: {
  /** Layout's focus mode: a caption ("Back · right grip") in place of the legend. */
  caption?: string
  pressed: Set<string>; boundCommands?: Set<string>; selectedCommand?: string | null
  onSelectCommand?: (command: string) => void; bindingLabels?: Record<string, string>
  /** Analog pull of each trigger, 0..1. */
  triggers: { left: number; right: number }
  triggerLabels: { left: string; right: string }
  showRawTelemetry?: boolean
}) {
  const isPressed = (command: string) => pressed.has(command) || (command === 'MISC6' && pressed.has('GRIP_L')) || (command === 'MISC5' && pressed.has('GRIP_R'))
  const isSelected = (command: string) => selectedCommand === command || (command === 'MISC6' && selectedCommand === 'GRIP_L') || (command === 'MISC5' && selectedCommand === 'GRIP_R')
  const legend = BACK_HOTSPOTS.filter(spot => isPressed(spot.command) || boundCommands?.has(spot.command)).slice(0, 4)
  return (
    <div className={join(styles.backView, caption !== undefined && styles.backViewFocus)}>
      <svg className={styles.backArt} viewBox="0 0 428 319" role="img" aria-label="Steam Controller back, mirrored">
        <g transform="translate(428 0) scale(-1 1)" dangerouslySetInnerHTML={{ __html: STEAM_BACK_ART }} />
        {/* Bumpers and triggers, filling the art's own outlines: in the same
            mirroring group, so they cannot drift off the drawn parts. A trigger
            fills with its pull; a bumper is on or off. */}
        <g transform="translate(428 0) scale(-1 1)">
          {BACK_SHOULDERS.map(({ side, bumper, bumperTitle, triggers: triggerCommands, triggerTitle }) => {
            const pull = clamp(triggers[side], 0, 1)
            return (
              <g key={side}>
                <path className={join(styles.backPart, pull > TRIGGER_PULL_FLOOR && styles.backTriggerLive, isAnySelected(triggerCommands, selectedCommand) && styles.backPartSelected)}
                  style={{ '--pull': pull } as CSSProperties} d={STEAM_BACK_SHOULDER_PATHS[side].trigger}
                  onClick={() => onSelectCommand?.(pickCommand(triggerCommands, boundCommands, selectedCommand))}>
                  <title>{triggerTitle}</title>
                </path>
                <path className={join(styles.backPart, pressed.has(bumper) && styles.backPartPressed, selectedCommand === bumper && styles.backPartSelected)}
                  d={STEAM_BACK_SHOULDER_PATHS[side].bumper} onClick={() => onSelectCommand?.(bumper)}>
                  <title>{bumperTitle}</title>
                </path>
              </g>
            )
          })}
        </g>
        {BACK_HOTSPOTS.map(spot => (
          <ellipse key={spot.command} className={join(styles.backSpot, boundCommands?.has(spot.command) && styles.backSpotBound, isPressed(spot.command) && styles.backSpotPressed, isSelected(spot.command) && styles.backSpotSelected)}
            cx={spot.cx} cy={spot.cy} rx={spot.rx} ry={spot.ry} onClick={() => onSelectCommand?.(spot.command)}>
            <title>{spot.label}</title>
          </ellipse>
        ))}
      </svg>
      {caption !== undefined ? <span className={styles.viewCaption}>{caption}</span> : <div className={join(styles.backLegend, showRawTelemetry && styles.backLegendDetailed)}>
        <span className={styles.backLegendTitle}>Back · mirrored</span>
        {legend.map(spot => (
          <span key={spot.command} className={styles.backLegendItem}>
            <span className={join(styles.backLegendMark, isPressed(spot.command) && styles.backLegendMarkLive)} aria-hidden="true" />
            {isPressed(spot.command) && spot.command.startsWith('MISC') ? spot.label + ' held' : (spot.label + ' ' + (bindingLabels?.[spot.command] ?? '').split(' · ')[0]).trim()}
          </span>
        ))}
        {showRawTelemetry && BACK_SHOULDERS.map(({ side }) => (
          <span key={side} className={join(styles.backLegendItem, styles.backLegendReadout)}>
            <span className={join(styles.backLegendMark, triggers[side] > TRIGGER_PULL_FLOOR && styles.backLegendMarkLive)} aria-hidden="true" />
            {triggerLabels[side]} {triggerReadout(clamp(triggers[side], 0, 1))}
          </span>
        ))}
      </div>}
    </div>
  )
}

function Stick({
  cx,
  cy,
  x,
  y,
  baseRadius = 87,
  touched = false,
  pressed = false,
  muted = false,
  bound = false,
  selected = false,
  onSelect,
  title,
}: StickProps) {
  // The ring, knob and throw all scale with the well so the proportions stay put.
  const k = baseRadius / 87
  const knobX = cx + clamp(x, -1, 1) * 27 * k
  const knobY = cy + clamp(-y, -1, 1) * 27 * k
  return (
    <g className={join(muted && styles.sideMuted, onSelect && styles.interactive)} onClick={onSelect}>
      {title && <title>{title}</title>}
      <circle className={join(styles.stickBase, bound && styles.stickBaseBound, selected && styles.stickBaseSelected, touched && styles.capSenseActive)} cx={cx} cy={cy} r={baseRadius} />
      <circle className={join(styles.stickRing, bound && styles.stickRingBound)} cx={cx} cy={cy} r={57 * k} />
      <circle className={join(styles.stickKnob, selected && styles.stickKnobSelected, pressed && styles.stickKnobPressed)} cx={knobX} cy={knobY} r={38 * k} />
    </g>
  )
}

export function ControllerStatusSvg({ bindingLabels,
  boundCommands,
  device,
  selectedCommand,
  onSelectCommand,
  showRawTelemetry = false,
  backView = 'always',
  backCaption,
}: ControllerStatusSvgProps) {
  const focusView = backView === 'focus'
  const showBack = !focusView || isBackInput(device, selectedCommand)
  const family = controllerVisualFamily(device.type)
  const isSteam = family === 'steam'
  const pressed = getPressedControllerCommandSet(device)
  const hasLeftSide = device.split !== 2
  const leftPad = device.status?.leftPad
  const rightPad = device.status?.rightPad
  // The mapper turns each pad's reading by the configured orientation before it
  // reaches telemetry, and the artwork draws the pads as mounted, so the dot is
  // turned back by the same amount: a swipe straight up the body moves it
  // straight up the screen, as the finger did.
  const runtimePrefs = usePreferences().runtime
  const leftPadArt = { ...STEAM_PAD.left, rot: STEAM_PAD.left.rot - (runtimePrefs?.leftPadRotation ?? 0) }
  const rightPadArt = { ...STEAM_PAD.right, rot: STEAM_PAD.right.rot - (runtimePrefs?.rightPadRotation ?? 0) }
  const hasRightSide = device.split !== 1
  const leftTrigger = clamp(device.status?.triggers.left ?? 0, 0, 1)
  const rightTrigger = clamp(device.status?.triggers.right ?? 0, 0, 1)
  const leftStickX = device.status?.leftStick.x ?? 0
  const leftStickY = device.status?.leftStick.y ?? 0
  const rightStickX = device.status?.rightStick.x ?? 0
  const rightStickY = device.status?.rightStick.y ?? 0
  const leftTriggerLabel = isSteam ? 'LT' : family === 'playstation' ? 'L2' : family === 'xbox' ? 'LT' : 'ZL'
  const rightTriggerLabel = isSteam ? 'RT' : family === 'playstation' ? 'R2' : family === 'xbox' ? 'RT' : 'ZR'
  const leftStickBound = hasAny(LEFT_STICK_COMMANDS, boundCommands)
  const rightStickBound = hasAny(RIGHT_STICK_COMMANDS, boundCommands)
  const leftStickSelected = isAnySelected(LEFT_STICK_COMMANDS, selectedCommand)
  const rightStickSelected = isAnySelected(RIGHT_STICK_COMMANDS, selectedCommand)
  const leftTriggerBound = hasAny(LEFT_TRIGGER_COMMANDS, boundCommands)
  const rightTriggerBound = hasAny(RIGHT_TRIGGER_COMMANDS, boundCommands)
  const leftTriggerSelected = isAnySelected(LEFT_TRIGGER_COMMANDS, selectedCommand)
  const rightTriggerSelected = isAnySelected(RIGHT_TRIGGER_COMMANDS, selectedCommand)
  const hasAnySide = hasLeftSide || hasRightSide
  const backInputMode = controllerBackInputMode(device)
  const visiblePaddleCommands = uniquePaddleCommands([
    ...getDefaultPaddleCommands(backInputMode),
    ...PADDLE_COMMANDS.filter(
      command => pressed.has(command) || boundCommands?.has(command) || selectedCommand === command
    ),
  ])
  const visiblePaddleCommandSet = new Set(visiblePaddleCommands)

  if (controllerArtworkModel(device)) {
    return <ModelControllerSvg device={device} bindingLabels={bindingLabels} boundCommands={boundCommands} selectedCommand={selectedCommand} onSelectCommand={onSelectCommand} showRawTelemetry={showRawTelemetry} backView={backView} backCaption={backCaption} />
  }

  if (isSteam) {
      // --- Steam Controller 2026 layout ---
      return (
        <div className={join(styles.visualizer, styles.steamLayout, focusView && styles.steamFocusLayout)}>
          <div className={styles.frontView}>
          <svg className={join(styles.controllerSvg, styles.steamLive, showRawTelemetry && styles.showDetails)} viewBox="0 0 1117 750" role="img" aria-label="Steam Controller live status">
            <title>Steam Controller live status</title>
            {/* The approved tonal rendering (Controller Art 9c), themed by --art-*. */}
            <g className={styles.art} dangerouslySetInnerHTML={{ __html: STEAM_FRONT_ART }} />
            {/* Live overlays on the Steam Controller 2026 front artwork */}
            {/* Sticks (top) */}
            <Stick cx={412} cy={219} baseRadius={STEAM_STICK_RADIUS} touched={device.status?.leftStickTouch} x={leftStickX} y={leftStickY} pressed={pressed.has('L3')} muted={!hasLeftSide} bound={leftStickBound} selected={leftStickSelected} onSelect={hasLeftSide ? () => onSelectCommand?.(pickCommand(LEFT_STICK_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Left stick" />
            <Stick cx={700} cy={219} baseRadius={STEAM_STICK_RADIUS} touched={device.status?.rightStickTouch} x={rightStickX} y={rightStickY} pressed={pressed.has('R3')} muted={!hasRightSide} bound={rightStickBound} selected={rightStickSelected} onSelect={hasRightSide ? () => onSelectCommand?.(pickCommand(RIGHT_STICK_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Right stick" />

            {/* D-pad (upper-left area) */}
            <g className={join(!hasLeftSide && styles.sideMuted)}>
              <ButtonBubble cx={252} cy={99} label="U" pressed={pressed.has('UP')} bound={boundCommands?.has('UP')} selected={selectedCommand === 'UP'} onSelect={hasLeftSide ? () => onSelectCommand?.('UP') : undefined} radius={22} title="D-pad up" />
              <ButtonBubble cx={206} cy={145} label="L" pressed={pressed.has('LEFT')} bound={boundCommands?.has('LEFT')} selected={selectedCommand === 'LEFT'} onSelect={hasLeftSide ? () => onSelectCommand?.('LEFT') : undefined} radius={22} title="D-pad left" />
              <ButtonBubble cx={298} cy={145} label="R" pressed={pressed.has('RIGHT')} bound={boundCommands?.has('RIGHT')} selected={selectedCommand === 'RIGHT'} onSelect={hasLeftSide ? () => onSelectCommand?.('RIGHT') : undefined} radius={22} title="D-pad right" />
              <ButtonBubble cx={252} cy={191} label="D" pressed={pressed.has('DOWN')} bound={boundCommands?.has('DOWN')} selected={selectedCommand === 'DOWN'} onSelect={hasLeftSide ? () => onSelectCommand?.('DOWN') : undefined} radius={22} title="D-pad down" />
            </g>

            {/* ABXY (upper-right area) */}
            <g className={join(!hasRightSide && styles.sideMuted)}>
              <ButtonBubble cx={864} cy={93} radius={31} command="N" family={family} label={controllerButtonGlyph(device.type, 'N')} pressed={pressed.has('N')} bound={boundCommands?.has('N')} selected={selectedCommand === 'N'} onSelect={hasRightSide ? () => onSelectCommand?.('N') : undefined} title="North face button" />
              <ButtonBubble cx={922} cy={146} radius={31} command="E" family={family} label={controllerButtonGlyph(device.type, 'E')} pressed={pressed.has('E')} bound={boundCommands?.has('E')} selected={selectedCommand === 'E'} onSelect={hasRightSide ? () => onSelectCommand?.('E') : undefined} title="East face button" />
              <ButtonBubble cx={864} cy={200} radius={31} command="S" family={family} label={controllerButtonGlyph(device.type, 'S')} pressed={pressed.has('S')} bound={boundCommands?.has('S')} selected={selectedCommand === 'S'} onSelect={hasRightSide ? () => onSelectCommand?.('S') : undefined} title="South face button" />
              <ButtonBubble cx={805} cy={146} radius={31} command="W" family={family} label={controllerButtonGlyph(device.type, 'W')} pressed={pressed.has('W')} bound={boundCommands?.has('W')} selected={selectedCommand === 'W'} onSelect={hasRightSide ? () => onSelectCommand?.('W') : undefined} title="West face button" />
            </g>

            {/* Left pad (bottom-left) */}
            <g className={join(styles.interactive)} onClick={() => onSelectCommand?.('LEFT_PAD')}>
              <rect className={join(styles.control, boundCommands?.has('MISC3') && styles.controlBound, (selectedCommand === 'MISC3' || selectedCommand === 'LEFT_PAD') && styles.controlSelected, leftPad?.touched && styles.capSenseActive)}
                x={STEAM_PAD.left.cx - STEAM_PAD.left.half} y={STEAM_PAD.left.cy - STEAM_PAD.left.half}
                width={STEAM_PAD.left.half * 2} height={STEAM_PAD.left.half * 2} rx="48" ry="48"
                transform={`rotate(${STEAM_PAD.left.rot} ${STEAM_PAD.left.cx} ${STEAM_PAD.left.cy})`} />
              <text className={styles.controlText} x={STEAM_PAD.left.cx} y={STEAM_PAD.left.cy}>{bindingLabels?.LEFT_PAD || 'LPad'}</text>
              {showRawTelemetry && leftPad && <text className={styles.gripSenseText} x={STEAM_PAD.left.cx} y={STEAM_PAD.left.cy + 24}>{`p=${(leftPad.pressure ?? 0).toFixed(4)}`}</text>}
              {leftPad?.touched && <PadTouch point={padPoint(leftPadArt, leftPad.x, leftPad.y)} />}
            </g>

            {/* Right pad (bottom-right) */}
            <g className={join(styles.interactive)} onClick={() => onSelectCommand?.('RIGHT_PAD')}>
              <rect className={join(styles.control, boundCommands?.has('MISC2') && styles.controlBound, (selectedCommand === 'MISC2' || selectedCommand === 'RIGHT_PAD') && styles.controlSelected, rightPad?.touched && styles.capSenseActive)}
                x={STEAM_PAD.right.cx - STEAM_PAD.right.half} y={STEAM_PAD.right.cy - STEAM_PAD.right.half}
                width={STEAM_PAD.right.half * 2} height={STEAM_PAD.right.half * 2} rx="48" ry="48"
                transform={`rotate(${STEAM_PAD.right.rot} ${STEAM_PAD.right.cx} ${STEAM_PAD.right.cy})`} />
              <text className={styles.controlText} x={STEAM_PAD.right.cx} y={STEAM_PAD.right.cy}>{bindingLabels?.RIGHT_PAD || 'RPad'}</text>
              {showRawTelemetry && rightPad && <text className={styles.gripSenseText} x={STEAM_PAD.right.cx} y={STEAM_PAD.right.cy + 24}>{`p=${(rightPad.pressure ?? 0).toFixed(4)}`}</text>}
              {rightPad?.touched && <PadTouch point={padPoint(rightPadArt, rightPad.x, rightPad.y)} />}
            </g>

            {/* Center buttons */}
                        <ButtonBubble cx={557} cy={147} radius={33} command="HOME" family={family} label="Steam" pressed={pressed.has('HOME')} bound={boundCommands?.has('HOME')} selected={selectedCommand === 'HOME'} onSelect={() => onSelectCommand?.('HOME')} title="Steam button" />
                        <ButtonBubble cx={556} cy={409} radius={18} command="MISC1" family={family} label="QAM" pressed={pressed.has('MISC1')} bound={boundCommands?.has('MISC1')} selected={selectedCommand === 'MISC1'} onSelect={() => onSelectCommand?.('MISC1')} title="QAM button" />
                        <ButtonBubble cx={382} cy={77} radius={15} command="-" family={family} label="-" pressed={pressed.has('-')} bound={boundCommands?.has('-')} selected={selectedCommand === '-'} onSelect={() => onSelectCommand?.('-')} title="View button" />
                        <ButtonBubble cx={730} cy={77} radius={15} command="+" family={family} label="+" pressed={pressed.has('+')} bound={boundCommands?.has('+')} selected={selectedCommand === '+'} onSelect={() => onSelectCommand?.('+')} title="Menu button" />

            {/* Bumpers only, filling the artwork's own bumper outlines. The triggers
                are not visible from the front; they are on the back view. */}
            <PathButton d={STEAM_FRONT_BUMPER_PATHS.left} transform={STEAM_FRONT_ART_TRANSFORM} labelX={STEAM_FRONT_BUMPER_LABELS.left.x} labelY={STEAM_FRONT_BUMPER_LABELS.left.y} compact label={controllerButtonGlyph(device.type, 'L')} pressed={pressed.has('L')} muted={!hasLeftSide} bound={boundCommands?.has('L')} selected={selectedCommand === 'L'} onSelect={hasLeftSide ? () => onSelectCommand?.('L') : undefined} title="Left bumper" />
            <PathButton d={STEAM_FRONT_BUMPER_PATHS.right} transform={STEAM_FRONT_ART_TRANSFORM} labelX={STEAM_FRONT_BUMPER_LABELS.right.x} labelY={STEAM_FRONT_BUMPER_LABELS.right.y} compact label={controllerButtonGlyph(device.type, 'R')} pressed={pressed.has('R')} muted={!hasRightSide} bound={boundCommands?.has('R')} selected={selectedCommand === 'R'} onSelect={hasRightSide ? () => onSelectCommand?.('R') : undefined} title="Right bumper" />

          </svg>
          {focusView && <span className={styles.viewCaption}>Front</span>}
          </div>
          {showBack && <SteamBackView pressed={pressed} boundCommands={boundCommands} selectedCommand={selectedCommand} onSelectCommand={onSelectCommand} bindingLabels={bindingLabels} triggers={{ left: leftTrigger, right: rightTrigger }} triggerLabels={{ left: leftTriggerLabel, right: rightTriggerLabel }} showRawTelemetry={showRawTelemetry} caption={focusView ? backCaption ?? 'Back' : undefined} />}
        </div>
      )
  }

  // Offset-stick controllers have their own physical layout, without a
  // PlayStation touchpad or microphone. Unknown devices are labelled generic.
  if (family !== 'playstation') {
    const bubble = (command: string, x: number, y: number, radius = 23) => <ButtonBubble key={command} cx={x} cy={y} radius={radius} command={command} family={family} label={controllerButtonGlyph(device.type, command)} pressed={pressed.has(command)} bound={boundCommands?.has(command)} selected={selectedCommand === command} onSelect={() => onSelectCommand?.(command)} title={bindingLabels?.[command] ?? command} />
    return <div className={styles.visualizer}><svg className={styles.controllerSvg} viewBox="0 0 640 430" role="img" aria-label={`${family === 'nintendo' ? 'Nintendo Pro' : family === 'xbox' ? 'Xbox' : 'Generic'} controller layout`}>
      <path className={styles.control} d={family === 'nintendo' ? 'M145 75 Q90 62 68 139 L34 329 Q27 399 85 397 Q120 398 155 330 L202 287 H438 L485 330 Q520 398 555 397 Q613 399 606 329 L572 139 Q550 62 495 75 Z' : 'M152 77 Q83 63 66 153 L30 337 Q27 396 80 399 Q119 402 157 325 L205 283 H435 L483 325 Q521 402 560 399 Q613 396 610 337 L574 153 Q557 63 488 77 Z'} />
      <PaddleButton x={112} y={43} width={102} height={27} label={leftTriggerLabel} pressed={leftTrigger > .5} bound={leftTriggerBound} selected={leftTriggerSelected} onSelect={() => onSelectCommand?.('ZL')} title="Left trigger" />
      <PaddleButton x={426} y={43} width={102} height={27} label={rightTriggerLabel} pressed={rightTrigger > .5} bound={rightTriggerBound} selected={rightTriggerSelected} onSelect={() => onSelectCommand?.('ZR')} title="Right trigger" />
      <PaddleButton x={107} y={77} width={110} height={24} label={controllerButtonGlyph(device.type, 'L')} bound={boundCommands?.has('L')} selected={selectedCommand === 'L'} pressed={pressed.has('L')} onSelect={() => onSelectCommand?.('L')} title="Left bumper" />
      <PaddleButton x={423} y={77} width={110} height={24} label={controllerButtonGlyph(device.type, 'R')} bound={boundCommands?.has('R')} selected={selectedCommand === 'R'} pressed={pressed.has('R')} onSelect={() => onSelectCommand?.('R')} title="Right bumper" />
      <Stick cx={164} cy={164} baseRadius={52} x={leftStickX} y={leftStickY} bound={leftStickBound} selected={leftStickSelected} pressed={pressed.has('L3')} onSelect={() => onSelectCommand?.('L3')} title="Left stick" />
      <Stick cx={401} cy={266} baseRadius={52} x={rightStickX} y={rightStickY} bound={rightStickBound} selected={rightStickSelected} pressed={pressed.has('R3')} onSelect={() => onSelectCommand?.('R3')} title="Right stick" />
      {bubble('N',486,126)}{bubble('S',486,208)}{bubble('W',445,167)}{bubble('E',527,167)}
      {bubble('UP',238,229,18)}{bubble('DOWN',238,303,18)}{bubble('LEFT',201,266,18)}{bubble('RIGHT',275,266,18)}
      {bubble('-',277,159,15)}{bubble('+',363,159,15)}{bubble('HOME',320,118,20)}
      {PADDLE_LAYOUT.filter(e => visiblePaddleCommandSet.has(e.command)).map((e,i) => <PaddleButton key={e.command} x={i % 2 ? 454 : 100} y={345 + Math.floor(i/2)*27} width={86} height={22} label={getPaddleLabel(backInputMode,e.command)} pressed={pressed.has(e.command)} bound={boundCommands?.has(e.command)} selected={selectedCommand === e.command} onSelect={() => onSelectCommand?.(e.command)} title={BACK_INPUT_TITLES[e.command]} />)}
    </svg></div>
  }
  // PlayStation layout.
  return (
    <div className={styles.visualizer}>
      <svg
        className={styles.controllerSvg}
        viewBox="0 0 1117 892"
        role="img"
        aria-label="Controller live status visualization"
      >
        <ShellArtwork family={family} />

        <TriggerPath d={DUALSENSE_PATHS.l2} fillX={142} fillY={96} fillWidth={106} label={leftTriggerLabel} labelX={196} labelY={62} value={leftTrigger} muted={!hasLeftSide} bound={leftTriggerBound} selected={leftTriggerSelected} onSelect={hasLeftSide ? () => onSelectCommand?.(pickCommand(LEFT_TRIGGER_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Left trigger" />
        <PathButton d={DUALSENSE_PATHS.l1} label={controllerButtonGlyph(device.type, 'L')} labelX={196} labelY={166} pressed={pressed.has('L')} muted={!hasLeftSide} bound={boundCommands?.has('L')} selected={selectedCommand === 'L'} onSelect={hasLeftSide ? () => onSelectCommand?.('L') : undefined} title="Left bumper" />

        <TriggerPath d={DUALSENSE_PATHS.r2} fillX={870} fillY={96} fillWidth={106} label={rightTriggerLabel} labelX={923} labelY={62} value={rightTrigger} muted={!hasRightSide} bound={rightTriggerBound} selected={rightTriggerSelected} onSelect={hasRightSide ? () => onSelectCommand?.(pickCommand(RIGHT_TRIGGER_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Right trigger" />
        <PathButton d={DUALSENSE_PATHS.r1} label={controllerButtonGlyph(device.type, 'R')} labelX={922} labelY={166} pressed={pressed.has('R')} muted={!hasRightSide} bound={boundCommands?.has('R')} selected={selectedCommand === 'R'} onSelect={hasRightSide ? () => onSelectCommand?.('R') : undefined} title="Right bumper" />

        <g className={join(!hasLeftSide && styles.sideMuted)}>
          <PathButton d={DUALSENSE_PATHS.dpadUp} label="U" labelX={179} labelY={296} pressed={pressed.has('UP')} bound={boundCommands?.has('UP')} selected={selectedCommand === 'UP'} onSelect={hasLeftSide ? () => onSelectCommand?.('UP') : undefined} title="D-pad up" />
          <PathButton d={DUALSENSE_PATHS.dpadLeft} label="L" labelX={118} labelY={357} pressed={pressed.has('LEFT')} bound={boundCommands?.has('LEFT')} selected={selectedCommand === 'LEFT'} onSelect={hasLeftSide ? () => onSelectCommand?.('LEFT') : undefined} title="D-pad left" />
          <PathButton d={DUALSENSE_PATHS.dpadRight} label="R" labelX={240} labelY={357} pressed={pressed.has('RIGHT')} bound={boundCommands?.has('RIGHT')} selected={selectedCommand === 'RIGHT'} onSelect={hasLeftSide ? () => onSelectCommand?.('RIGHT') : undefined} title="D-pad right" />
          <PathButton d={DUALSENSE_PATHS.dpadDown} label="D" labelX={179} labelY={420} pressed={pressed.has('DOWN')} bound={boundCommands?.has('DOWN')} selected={selectedCommand === 'DOWN'} onSelect={hasLeftSide ? () => onSelectCommand?.('DOWN') : undefined} title="D-pad down" />
          <PathButton d={DUALSENSE_PATHS.create} label={controllerButtonGlyph(device.type, '-')} labelX={270} labelY={226} pressed={pressed.has('-')} compact bound={boundCommands?.has('-')} selected={selectedCommand === '-'} onSelect={hasLeftSide ? () => onSelectCommand?.('-') : undefined} title="Create / View button" />
        </g>

        <PathButton d={DUALSENSE_PATHS.touchpad} label={controllerButtonGlyph(device.type, 'CAPTURE')} labelX={559} labelY={270} pressed={pressed.has('CAPTURE')} muted={!hasAnySide} bound={boundCommands?.has('CAPTURE')} selected={selectedCommand === 'CAPTURE'} onSelect={hasAnySide ? () => onSelectCommand?.('CAPTURE') : undefined} title="Touchpad / capture button" />

        <g className={join(!hasRightSide && styles.sideMuted)}>
          <ButtonBubble cx={934.079} cy={288.08} radius={34.957} command="N" family={family} label={controllerButtonGlyph(device.type, 'N')} pressed={pressed.has('N')} bound={boundCommands?.has('N')} selected={selectedCommand === 'N'} onSelect={hasRightSide ? () => onSelectCommand?.('N') : undefined} title="North face button" />
          <ButtonBubble cx={1004.08} cy={358.08} radius={34.957} command="E" family={family} label={controllerButtonGlyph(device.type, 'E')} pressed={pressed.has('E')} bound={boundCommands?.has('E')} selected={selectedCommand === 'E'} onSelect={hasRightSide ? () => onSelectCommand?.('E') : undefined} title="East face button" />
          <ButtonBubble cx={934.079} cy={428.08} radius={34.957} command="S" family={family} label={controllerButtonGlyph(device.type, 'S')} pressed={pressed.has('S')} bound={boundCommands?.has('S')} selected={selectedCommand === 'S'} onSelect={hasRightSide ? () => onSelectCommand?.('S') : undefined} title="South face button" />
          <ButtonBubble cx={864.079} cy={358.08} radius={34.957} command="W" family={family} label={controllerButtonGlyph(device.type, 'W')} pressed={pressed.has('W')} bound={boundCommands?.has('W')} selected={selectedCommand === 'W'} onSelect={hasRightSide ? () => onSelectCommand?.('W') : undefined} title="West face button" />
          <PathButton d={DUALSENSE_PATHS.options} label={controllerButtonGlyph(device.type, '+')} labelX={850} labelY={226} pressed={pressed.has('+')} compact bound={boundCommands?.has('+')} selected={selectedCommand === '+'} onSelect={hasRightSide ? () => onSelectCommand?.('+') : undefined} title="Options / Menu button" />
        </g>

        <Stick cx={351.764} cy={528.548} x={leftStickX} y={leftStickY} pressed={pressed.has('L3')} muted={!hasLeftSide} bound={leftStickBound} selected={leftStickSelected} onSelect={hasLeftSide ? () => onSelectCommand?.(pickCommand(LEFT_STICK_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Left stick" />
        <Stick cx={763.456} cy={528.548} x={rightStickX} y={rightStickY} pressed={pressed.has('R3')} muted={!hasRightSide} bound={rightStickBound} selected={rightStickSelected} onSelect={hasRightSide ? () => onSelectCommand?.(pickCommand(RIGHT_STICK_COMMANDS, boundCommands, selectedCommand)) : undefined} title="Right stick" />

        {PADDLE_LAYOUT.filter(entry => visiblePaddleCommandSet.has(entry.command)).map(entry => {
          const hasSide = entry.side === 'left' ? hasLeftSide : hasRightSide
          return (
            <PaddleButton key={entry.command} x={entry.x} y={entry.y} width={entry.width} height={entry.height} label={getPaddleLabel(backInputMode, entry.command)} pressed={pressed.has(entry.command)} muted={!hasSide} bound={boundCommands?.has(entry.command)} selected={selectedCommand === entry.command} onSelect={hasSide ? () => onSelectCommand?.(entry.command) : undefined} title={BACK_INPUT_TITLES[entry.command]} />
          )
        })}

        <ButtonBubble cx={559} cy={532} radius={27} command="HOME" family={family} label={controllerButtonGlyph(device.type, 'HOME')} pressed={pressed.has('HOME')} muted={!hasRightSide} bound={boundCommands?.has('HOME')} selected={selectedCommand === 'HOME'} onSelect={hasRightSide ? () => onSelectCommand?.('HOME') : undefined} title="Home / Guide button" />
        <PathButton d={DUALSENSE_PATHS.mute} label={controllerButtonGlyph(device.type, 'MIC')} labelX={559} labelY={592} pressed={pressed.has('MIC')} muted={!hasRightSide} compact bound={boundCommands?.has('MIC')} selected={selectedCommand === 'MIC'} onSelect={hasRightSide ? () => onSelectCommand?.('MIC') : undefined} title="Microphone button" />
      </svg>
    </div>
  )
}
