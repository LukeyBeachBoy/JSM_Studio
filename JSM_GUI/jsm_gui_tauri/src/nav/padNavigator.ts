// Turns raw controller state into Studio navigation (HANDOFF.md, "Architecture
// proposal: native controller navigation"). While Studio's window has focus
// the applied profile is paused and Studio reads the pad itself:
//
//   D-pad / left stick   move (the stick repeats with acceleration)
//   A / B / X / Y        select · back · toggle/secondary · details/options
//   LB / RB              previous / next section
//   LT / RT              previous / next page
//   View / Menu          title bar · page actions
//   right stick          scroll, or fine adjust while adjusting a value
//   hold B 1.5 s         guaranteed escape from capture
//   hold View + Menu     leave Test mode (0.6 s)
//
// Pure and clock-driven so it can be tested without a browser: feed it a
// snapshot per telemetry sample, it returns what happened since the last one.

export type PadButton = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'VIEW' | 'MENU'
export type Direction = 'up' | 'down' | 'left' | 'right'

export type NavAction =
  | { kind: 'move'; direction: Direction; repeat: boolean }
  | { kind: 'press'; button: PadButton }
  | { kind: 'hold'; button: 'B' }
  | { kind: 'exitTest' }
  | { kind: 'scroll'; dx: number; dy: number }

export type PadSnapshot = {
  /** JSM command names currently down: S E W N L R ZL ZR UP DOWN LEFT RIGHT - + … */
  buttons: ReadonlySet<string>
  leftStick: { x: number; y: number }
  rightStick: { x: number; y: number }
  triggers: { left: number; right: number }
}

// Standard (Xbox-lettered) positions -> JSM commands. A is the south button
// on every family, so PlayStation's Cross and Nintendo's B confirm as well.
const BUTTONS: Record<Exclude<PadButton, 'LT' | 'RT'>, string> = {
  A: 'S', B: 'E', X: 'W', Y: 'N', LB: 'L', RB: 'R', VIEW: '-', MENU: '+',
}

export const REPEAT_DELAY_MS = 380
export const REPEAT_START_MS = 130
export const REPEAT_FLOOR_MS = 55
export const REPEAT_STEP_MS = 12
export const HOLD_BACK_MS = 1500
export const EXIT_TEST_MS = 600

const STICK_ON = 0.55
const STICK_OFF = 0.35
const TRIGGER_ON = 0.6
const TRIGGER_OFF = 0.35
const SCROLL_DEADZONE = 0.2
/** Pixels per second at full right-stick deflection. */
const SCROLL_SPEED = 1600

type RepeatState = { direction: Direction; since: number; next: number; count: number }

export class PadNavigator {
  private held = new Set<PadButton>()
  private stickDirection: Direction | null = null
  private repeat: RepeatState | null = null
  private backSince: number | null = null
  private backFired = false
  private exitSince: number | null = null
  private exitFired = false
  /** View and Menu were down together at some point in this press. */
  private chordSeen = false
  private lastTime: number | null = null

  /** Forget everything held, e.g. when the window loses focus mid-press. */
  reset() {
    this.held.clear()
    this.stickDirection = null
    this.repeat = null
    this.backSince = null
    this.backFired = false
    this.exitSince = null
    this.exitFired = false
    this.chordSeen = false
    this.lastTime = null
  }

  /**
   * One snapshot in, the actions since the last snapshot out. In test mode the
   * profile owns the pad, so only the View + Menu exit chord is read.
   */
  update(pad: PadSnapshot, now: number, testing = false): NavAction[] {
    const actions: NavAction[] = []
    const dt = this.lastTime == null ? 0 : Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000))
    this.lastTime = now

    const down = new Set<PadButton>()
    for (const [button, command] of Object.entries(BUTTONS) as [PadButton, string][]) {
      if (pad.buttons.has(command)) down.add(button)
    }
    // Triggers are analog on most pads; hysteresis keeps a half pull from
    // chattering between pages.
    const trigger = (button: 'LT' | 'RT', value: number, digital: string) => {
      const wasDown = this.held.has(button)
      if (pad.buttons.has(digital) || value >= TRIGGER_ON || (wasDown && value > TRIGGER_OFF)) down.add(button)
    }
    trigger('LT', pad.triggers.left, 'ZL')
    trigger('RT', pad.triggers.right, 'ZR')

    // ---- Test mode: nothing but the exit chord.
    const exitChord = down.has('VIEW') && down.has('MENU')
    if (exitChord) this.chordSeen = true
    if (exitChord) {
      this.exitSince ??= now
      if (!this.exitFired && now - this.exitSince >= EXIT_TEST_MS) {
        this.exitFired = true
        actions.push({ kind: 'exitTest' })
      }
    } else {
      this.exitSince = null
      this.exitFired = false
    }
    if (testing) {
      this.held = down
      this.repeat = null
      this.stickDirection = null
      return actions
    }

    // ---- Presses fire on the way down. View and Menu wait for release, so
    // holding both for the exit chord does not also jump to the title bar.
    for (const button of down) {
      if (this.held.has(button)) continue
      if (button === 'VIEW' || button === 'MENU') continue
      actions.push({ kind: 'press', button })
    }
    for (const button of this.held) {
      if (down.has(button) || (button !== 'VIEW' && button !== 'MENU')) continue
      if (!this.chordSeen) actions.push({ kind: 'press', button })
    }
    if (!down.has('VIEW') && !down.has('MENU')) this.chordSeen = false

    // ---- Hold B: the escape that always works, even from capture.
    if (down.has('B')) {
      this.backSince ??= now
      if (!this.backFired && now - this.backSince >= HOLD_BACK_MS) {
        this.backFired = true
        actions.push({ kind: 'hold', button: 'B' })
      }
    } else {
      this.backSince = null
      this.backFired = false
    }
    this.held = down

    // ---- Movement: D-pad first, else the left stick past its threshold.
    const dpad: Direction | null = pad.buttons.has('UP') ? 'up' : pad.buttons.has('DOWN') ? 'down'
      : pad.buttons.has('LEFT') ? 'left' : pad.buttons.has('RIGHT') ? 'right' : null
    const { x, y } = pad.leftStick
    const magnitude = Math.hypot(x, y)
    if (magnitude < STICK_OFF) this.stickDirection = null
    else if (magnitude >= STICK_ON || this.stickDirection) {
      // Positive y is up on the wire (see ControllerStatusSvg's Stick).
      this.stickDirection = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down')
    }
    const direction = dpad ?? this.stickDirection
    if (!direction) {
      this.repeat = null
    } else if (!this.repeat || this.repeat.direction !== direction) {
      this.repeat = { direction, since: now, next: now + REPEAT_DELAY_MS, count: 0 }
      actions.push({ kind: 'move', direction, repeat: false })
    } else if (now >= this.repeat.next) {
      const interval = Math.max(REPEAT_FLOOR_MS, REPEAT_START_MS - REPEAT_STEP_MS * this.repeat.count)
      this.repeat.count += 1
      this.repeat.next = now + interval
      actions.push({ kind: 'move', direction, repeat: true })
    }

    // ---- Right stick: continuous scroll, scaled by deflection squared so
    // small pushes read slowly.
    const rx = pad.rightStick.x, ry = pad.rightStick.y
    const deflection = Math.hypot(rx, ry)
    if (dt > 0 && deflection > SCROLL_DEADZONE) {
      const scale = ((deflection - SCROLL_DEADZONE) / (1 - SCROLL_DEADZONE)) ** 2 * SCROLL_SPEED * dt / deflection
      actions.push({ kind: 'scroll', dx: rx * scale, dy: -ry * scale })
    }
    return actions
  }
}
