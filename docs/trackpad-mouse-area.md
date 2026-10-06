# Trackpad mouse area — 1 October 2026

`TOUCHPAD_MODE = MOUSE_AREA`: a trackpad as a map of one rectangle of the
screen. Where the finger is on the pad is where the cursor is inside that
rectangle, absolutely, and the finger cannot take the cursor out of it. Steam
Input calls this a mouse region. It exists so a hotbar or an inventory can be
swept with a thumb instead of swiping the whole way across the screen.

Studio's addition is how the rectangle is made: you draw it on the screen,
over the running game, rather than typing numbers or dragging sliders.

## What the mapper stores

```
RIGHT_TOUCHPAD_MODE = MOUSE_AREA
RIGHT_TOUCHPAD_AREA = 0.3000 0.9000 0.4000 0.0800   # left top width height
RIGHT_TOUCHPAD_AREA_FIT = UNIFORM                   # optional; STRETCH is the default
```

The area is four **fractions of the screen the game is on**, never pixels. A
profile drawn on a 1080p desktop monitor puts the cursor on the same part of a
4K TV: the picker writes fractions of the monitor it was drawn on, and the
mapper multiplies by the size of the monitor the foreground window is on at
the moment of the touch (`setMouseOnActiveScreen`, `src/win32/InputHelpers.cpp`).
The cursor is placed with `MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK`, so
an area drawn on a second screen lands on that screen and not on the primary.

Settings exist in three scopes, as every pad setting does: `TOUCHPAD_AREA` for
a single-pad controller, `LEFT_`/`RIGHT_TOUCHPAD_AREA` for the Steam Controller.
Default `0 0 1 1`, the whole screen.

## Pad shape

A DualSense pad is roughly 2:1, a Steam Controller's two pads are square, and
the rectangle the user draws is whatever shape the hotbar is. `*_TOUCHPAD_AREA_FIT`
decides how the two are laid over each other:

| Fit | What happens |
| --- | --- |
| `STRETCH` (default) | The whole pad is the whole area. Every point is reachable and the pad's edges are the area's edges; a square pad over a wide strip moves faster sideways than up and down. This is Steam's behaviour. |
| `UNIFORM` | The same cursor travel per millimetre both ways. The pad is scaled to **cover** the area (CSS `background-size: cover`) and centred on it, so the area's longer side spans the pad and the pad's spare travel on the other axis clamps to the area's edge. Nothing in the area is unreachable; some of the pad is dead travel. The picker draws that footprint dashed. |

The pad's shape comes from the driver (`GetTouchpadDimension`), the same value
the overlay already uses, so nothing is keyed on a controller model.

## The arithmetic lives in one header

`include/TouchAreaMapping.h` is pure arithmetic with no dependency on the rest
of the mapper. `utils/mouseArea.ts` mirrors it for the editor's preview and the
picker's ghost, and `tests/mouse_area_regression.cjs` compiles the real header
with MSVC and sweeps both over the same inputs, the same way the overlay's hit
test is checked. The two must agree or the preview lies about where a touch
puts the cursor.

Behaviour notes, all deliberate:

- Only a finger that has **just landed or moved** places the cursor. A resting
  thumb sends nothing, so the physical mouse still works between swipes and the
  cursor is not pinned against it every poll.
- While a finger is on a MOUSE_AREA pad, **gyro mouse output is held off**
  (`JoyShock::touchAreaHold`, the same role `lockMouse` plays for the stick's
  MOUSE_RING). Otherwise aiming drags the cursor out of the area between two
  placements.
- There is no sensitivity, no filter and no momentum. The position is the
  position. The MOUSE mode's pipeline is untouched.
- A rectangle in a config that is off-screen or zero-sized is pulled back on
  screen and given a minimum size (`touch_area::sanitize`) rather than parking
  the cursor on one pixel.

## The picker (`services/area_picker.rs`, `src/areapicker/`)

A window the size of one monitor, over whatever is on it. Unlike the overlay
and the HUD it **takes input**: it is not click-through and it is focused,
because drawing is done with the mouse and Esc/Enter have to reach it. Studio's
main window is minimised while it is open so the game, not Studio, is what
shows through the glass; it comes back when the picker closes.

- Drag on empty glass draws a new rectangle; drag inside the rectangle moves
  it; drag a handle resizes it. The existing area is drawn ready to adjust.
- Enter keeps, Esc cancels, Tab moves the picker to the next monitor (for a
  game on a screen other than the one the mouse was on).
- The result travels as fractions of the monitor the picker covered; the
  window covers that monitor exactly, so a fraction of the window is a fraction
  of the screen. The main window receives `mouse-area-picked` with the pad it
  was opened for, and `useMouseAreaConfig` writes the setting.
- Like the overlay, it is a plain top-level window: it can be composited over a
  **borderless** game, not over exclusive fullscreen. Same trade, same reason
  (see `trackpad-overlay.md`).

The stacking guard that keeps the overlay above a fullscreen game will raise
the overlay above the picker too. The overlay is click-through and invisible
unless a pad is touched, so this costs nothing.

## In the editor

The Mode row on a pad offers **Mouse area**. The pad's well becomes a picture
of the screen with the area on it (and the live finger, placed where the mapper
would put the cursor), and two rows follow:

- **Screen area** — the value reads "40% × 8% at 30%, 90%" (or "Whole screen");
  activating it opens the picker.
- **Pad fit** — Stretch to fill, or Keep pad shape.

The single-pad card (DualSense) has the same two rows.

## Not done

- Live finger dot inside the picker while drawing. The overlay's telemetry is
  emitted only to the overlay window; the picker would need its own emit.
- An edge inset for pads whose sensor cannot report the last couple of percent
  at the rim. Not needed for a hotbar; worth a setting if it comes up.
- Steam Deck and original Steam Controller pads: the mapper only recognises
  the 2026 controller's two pads (`SDLWrapper.cpp` type detection), so on those
  the mode is single-pad like a DualSense. That predates this feature.
- Hardware check on a controller. The arithmetic is tested; the SendInput
  placement over a real game is not yet.
