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
//   hold View + Menu     leave Test mode (0.6 s); a tap of B leaves it too
//
// Pure and clock-driven so it can be tested without a browser: feed it a
// snapshot per telemetry sample, it returns what happened since the last one.

export type PadButton = 'A' | 'B' | 'X' | 'Y' | 'LB' | 'RB' | 'LT' | 'RT' | 'VIEW' | 'MENU'
export type Direction = 'up' | 'down' | 'left' | 'right'

export type NavAction =
  | { kind: 'move'; direction: Direction; repeat: boolean }
  | { kind: 'press'; button: PadButton }
  | { kind: 'hold'; button: 'B' | 'MENU' }
  /** Leave Test mode: the View + Menu chord, or a tap of B (what the status
   *  chip promises). `button` says which. */
  | { kind: 'exitTest'; button?: 'B' }
  | { kind: 'scroll'; dx: number; dy: number }

export type PadSnapshot = {
  /** JSM command names currently down: S E W N L R ZL ZR UP DOWN LEFT RIGHT - + … */
  buttons: ReadonlySet<string>
  /**
   * Commands that went down since the previous snapshot, held or not
   * (telemetry's `pressedSince`). Snapshots arrive at the display rate, so a
   * quick tap can start and end between two of them; this is how it still
   * counts. Absent from older mappers, which only lose such taps.
   */
  pressedSince?: ReadonlySet<string>
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
/** Holding Menu this long opens the Configuration menu; a tap saves. */
export const HOLD_MENU_MS = 450
export const EXIT_TEST_MS = 600

const STICK_ON = 0.55
const STICK_OFF = 0.35
// A page turns a little under half way (about 15,700 of 32,767). At 0.6 the
// page turned well short of the full pull the Triggers page draws, yet still
// felt like a long reach; this is a soft pull, meant as one. Released below
// 0.28, so a trigger resting part way cannot chatter between pages.
const TRIGGER_ON = 0.48
const TRIGGER_OFF = 0.28
const SCROLL_DEADZONE = 0.2
/** Pixels per second at full right-stick deflection. */
const SCROLL_SPEED = 1600

const ALL_BUTTONS: PadButton[] = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'VIEW', 'MENU']

const dpadDirection = (buttons: ReadonlySet<string>): Direction | null =>
  buttons.has('UP') ? 'up' : buttons.has('DOWN') ? 'down' : buttons.has('LEFT') ? 'left' : buttons.has('RIGHT') ? 'right' : null

/** The left stick's direction, with hysteresis against the one it had. */
const stickDirection = ({ x, y }: { x: number; y: number }, previous: Direction | null): Direction | null => {
  const magnitude = Math.hypot(x, y)
  if (magnitude < STICK_OFF) return null
  if (magnitude < STICK_ON && !previous) return null
  // Positive y is up on the wire (see ControllerStatusSvg's Stick).
  return Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'up' : 'down')
}

type RepeatState = { direction: Direction; since: number; next: number; count: number }

export class PadNavigator {
  private held = new Set<PadButton>()
  private stickDirection: Direction | null = null
  private repeat: RepeatState | null = null
  private backSince: number | null = null
  private backFired = false
  private menuSince: number | null = null
  private menuFired = false
  private exitSince: number | null = null
  private exitFired = false
  /** View and Menu were down together at some point in this press. */
  private chordSeen = false
  private lastTime: number | null = null
  /** The next snapshot only records what is held; nothing it holds fires. */
  private latched = false

  /**
   * Forget everything held, e.g. when the window loses focus mid-press.
   *
   * With `latch`, whatever is still down when reading resumes is taken as
   * already handled and fires only after it is released and pressed again.
   * Studio stops reading while something else owns the pad -- a global chord
   * swapped in, another configuration loaded -- and the buttons used there
   * are usually still held the moment it hands back: RT clicking the mouse in
   * a chord configuration must not also turn the page when the chord ends.
   */
  reset(latch = false) {
    this.held.clear()
    this.stickDirection = null
    this.repeat = null
    this.backSince = null
    this.backFired = false
    this.exitSince = null
    this.exitFired = false
    this.chordSeen = false
    this.lastTime = null
    this.latched = latch
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

    // A press that began (and maybe ended) between two snapshots still counts
    // once: fast taps must never be dropped.
    const tapped = (button: PadButton) => {
      const command = button === 'LT' ? 'ZL' : button === 'RT' ? 'ZR' : BUTTONS[button as keyof typeof BUTTONS]
      return Boolean(command && pad.pressedSince?.has(command))
    }

    // ---- Test mode: nothing but the exits -- the View + Menu chord, and a
    // tap of B, which the status chip ("Testing · B to stop") promises.
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
      const back = !exitChord && ((down.has('B') && !this.held.has('B')) || tapped('B'))
      if (back && !actions.length) actions.push({ kind: 'exitTest', button: 'B' })
      this.held = down
      this.repeat = null
      this.stickDirection = null
      return actions
    }

    // ---- Reading resumes after something else owned the pad: record what is
    // held, fire nothing. The D-pad or stick direction still held is parked
    // until it is let go.
    if (this.latched) {
      this.latched = false
      this.held = down
      this.backSince = down.has('B') ? now : null
      this.backFired = down.has('B')
      if (!down.has('VIEW') && !down.has('MENU')) this.chordSeen = false
      else this.chordSeen = true
      const parked = dpadDirection(pad.buttons) ?? stickDirection(pad.leftStick, null)
      this.stickDirection = stickDirection(pad.leftStick, null)
      this.repeat = parked ? { direction: parked, since: now, next: Infinity, count: 0 } : null
      return actions
    }

    // ---- Presses fire on the way down. View and Menu wait for release, so
    // holding both for the exit chord does not also jump to the title bar.
    for (const button of ALL_BUTTONS) {
      if (button === 'VIEW' || button === 'MENU') continue
      if ((down.has(button) && !this.held.has(button)) || tapped(button)) actions.push({ kind: 'press', button })
    }
    // ---- Hold Menu: the Configuration menu. A tap (released before that) is a
    // press, which saves; a hold never also fires the press on release.
    if (down.has('MENU') && !down.has('VIEW')) {
      this.menuSince ??= now
      if (!this.menuFired && !this.chordSeen && now - this.menuSince >= HOLD_MENU_MS) {
        this.menuFired = true
        actions.push({ kind: 'hold', button: 'MENU' })
      }
    }
    for (const button of ['VIEW', 'MENU'] as const) {
      const released = this.held.has(button) && !down.has(button)
      const tappedBetween = tapped(button) && !down.has(button) && !this.held.has(button)
      const heldPast = button === 'MENU' && this.menuFired
      if ((released || tappedBetween) && !this.chordSeen && !heldPast) actions.push({ kind: 'press', button })
    }
    if (!down.has('MENU')) { this.menuSince = null; this.menuFired = false }
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
    const dpad = dpadDirection(pad.buttons)
    this.stickDirection = stickDirection(pad.leftStick, this.stickDirection)
    const direction = dpad ?? this.stickDirection
    // A D-pad tap that went down between snapshots: gone again, or let go and
    // pressed again while this sample still shows it held.
    const dpadTap = pad.pressedSince ? dpadDirection(pad.pressedSince) : null
    if (!direction) {
      this.repeat = null
      if (dpadTap) actions.push({ kind: 'move', direction: dpadTap, repeat: false })
    } else if (!this.repeat || this.repeat.direction !== direction || (dpad && dpadTap === dpad)) {
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
