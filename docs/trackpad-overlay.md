# Trackpad overlay — 12 September 2026

An always-on-top window that draws the live trackpad menu while a thumb is on the
pad: the regions, what each is bound to, where your finger is, and which region
will fire. It exists so a pad menu can be denser than four blind cells.

## Why it is not bannable

The overlay is a **plain top-level OS window**. It does not attach to, hook, or
inject anything into a game:

- No `CreateRemoteThread`, `WriteProcessMemory`, `SetWindowsHookEx` or
  `LoadLibrary` against any process.
- No DirectX/Vulkan present-chain hook, no `dxgi.dll` shim, no shader overlay.
- It never reads or writes another process's memory, and never opens a handle to
  a game process at all.

Its only input is the controller telemetry JoyShockMapper already broadcasts on
loopback UDP (`127.0.0.1:8974`). JoyShockMapper reads the controller through SDL,
as any input remapper does. From the game's point of view nothing has happened:
there is another window on the desktop, and the mouse/keyboard events it already
receives are unchanged.

For completeness, `jsm-console-injector.exe` in this repo is named misleadingly.
It uses `AttachConsole` + `WriteConsoleInput` against **JoyShockMapper's own
console window** to type a command into it. It does not touch games either.

**The cost of that boundary:** Windows will not composite an always-on-top window
over a game running in **exclusive fullscreen**. Borderless windowed is required.
The only way to draw over exclusive fullscreen is to hook the game's
presentation, which is exactly the thing being avoided. This is a deliberate
trade, not an oversight.

## Why it is not capped at 60 Hz

The main UI is throttled on purpose, in three places:

| Gate | Where | Effect |
| --- | --- | --- |
| `telemetry_ui_active` | `telemetry.rs` | stops emitting when another app has focus |
| `16_667 µs` | `telemetry.rs` | 60 Hz cap |
| `1000/60` + blur pause | `useTelemetry.ts` | 60 Hz cap again, and pauses on blur |

All three are wrong for an overlay, and the focus gates are *fatal*: the overlay
is read precisely when a game has focus, which is when the main UI deliberately
goes quiet. So the overlay does not share that path at all.

Instead, `overlay_active` gates a second emit in the same receive loop, capped by
`overlay_interval_us`. The overlay window measures its own display's refresh rate
over 40 animation frames and reports it via `overlay_set_refresh_hz`, so a 240 Hz
panel is driven at 240 Hz and a 60 Hz one is not woken 240 times a second for
frames it cannot show. The rate is reset when the overlay closes, so moving it to
a different monitor re-measures.

Three further things keep it cheap:

- **Its own document.** `overlay.html` is a separate vite entry; the bundle is
  ~6.5 kB (3 kB gzipped) and loads none of the editor.
- **A trimmed payload.** `emit_overlay_packet` forwards only the two pad samples
  and the button bitmask, not gyro/sticks/triggers/battery/device metadata, and
  emits only to the overlay window so the main WebView is never woken.
- **No React in the hot path.** Only the menu *identity* is React state. Finger
  position and the highlighted region are written straight to the DOM
  (`transform`, a `data-selected` attribute), so a packet costs a compositor
  update rather than a render.

Visibility is CSS opacity, not window show/hide: a window-manager round trip on
every touch would add latency to the one thing that must feel instant.

## touch = preview, click = execute

This is already how the backend behaves, and predates the overlay:
`LEFT_GRID_REQUIRES_CLICK` / `RIGHT_GRID_REQUIRES_CLICK = ON` gate a region on
the pad click rather than on contact (`main.cpp`). The overlay adds no input
handling of its own — it only draws what the backend would do. When the active
menu requires a click, the overlay says so.

## The layout contract

Configs describe their own overlays; nothing about any game is in the UI.

- **Regions, shape, deadzone** come from the pad settings already in the config
  (`*_TOUCHPAD_MODE`, `*_GRID_SIZE`, `*_GRID_SHAPE`, `*_GRID_DEADZONE`).
- **Labels** reuse `# @label RT1 = Reload`, the same directive the binding editor
  writes, so naming an action in Studio names it on the pad.
- **Position** is a new `# @overlay` directive:

```
# @overlay RIGHT at 0.82 0.74 size 300
# @overlay LEFT  at 0.18 0.74 size 260
# @overlay RIGHT:MISC2 at 0.5 0.5 size 360
```

Position is the **centre** of the menu as a fraction of the monitor work area, so
a layout survives a resolution change; size is its width in logical pixels. The
optional `:LAYER` suffix is a chord prefix, so **every menu bound to a trackpad
can sit somewhere different** — a base menu in the corner, a click-shifted menu
centre-screen. JoyShockMapper ignores comment lines, so a config carrying these
still loads anywhere.

Layers are discovered from the chorded lines themselves (`MISC2,RIGHT_GRID_SIZE
= 2 2` announces a `RIGHT:MISC2` menu), so a config that invents a new chord gets
an overlay for it without the UI knowing anything about it.

### When the menu appears

```
# @overlay RSTICK at 0.5 0.5 size 300 show touch
```

`show` takes `ring` or `touch`, and which one you want depends on when the
regions fire:

- `ring` — the menu stays hidden until the thumb or the stick reaches the ring
  where the bindings are, i.e. until a region is actually selected. The menu is a
  confirmation of what you have chosen, and the screen stays quiet otherwise.
- `touch` — the menu appears on any contact, or on any tilt past the stick's own
  `*_STICK_DEADZONE_INNER`, *before* anything is selected. This is what you want
  when a region fires the moment it is touched: the wheel is up while you are
  still aiming, so you can pick the action rather than discovering it.

The default is per surface, and is what each already did: a pad menu appears on
contact, a stick wheel waits for the ring. A profile with no `show` behaves
exactly as it did before the option existed.

On a rectangular grid the two are the same thing — every touch lands in a region
— so `ring` only changes behaviour where there is a dead zone to be inside of.

## The failure mode that matters

If the overlay's idea of which region is selected drifts from the backend's, it
highlights one action while the pad fires another — strictly worse than no
overlay. `tests/overlay_layout_regression.cjs` compiles the real
`touchGridCell`/`touchFourWayCell` out of `TouchGridRouting.h` and requires all
2646 swept coordinates to agree.

It earned its keep immediately: the first run found **20 mismatches**, all on
exact diagonals, because the backend computes in `float` and JavaScript numbers
are `double` — enough to flip a knife-edge `|dy| >= |dx|` comparison.
`hitTestRegion` now rounds each step with `Math.fround` to reproduce the
backend's rounding rather than approximate it.

## Pad shape

A menu is drawn as the shape of the pad it belongs to. The dimensions come from
the driver (`GetTouchpadDimension`) and ride on telemetry as `touchpadWidth` /
`touchpadHeight`, so a Steam Controller's square pad, a DualSense's roughly 2:1
pad and anything else are all correct without a table of controller models.
`0` means "no touchpad, or the driver would not say", which falls back to square.

Only the RATIO is used (`utils/padGeometry`). A stored `size` is the menu's
WIDTH; the height follows the aspect, so one number keeps the right shape on any
controller and any screen. The editor preview uses the same value, which is what
fixed it drawing a rectangle for a square pad.

## Still to do

- **Icons per region** (Iconify). The stretch goal of importing *custom* icons is
  explicitly out of scope for now but is a recorded requirement -- see TODO-7.
- **Radial / donut menus**, GTA-V-weapon-wheel style, and letting the sticks drive
  a menu the same way the pads do. The layout contract already carries a shape,
  so this is a renderer plus a backend region shape, not a redesign. See TODO-8.
- **Nested menus.** Not started; the layer mechanism is the natural basis.

## Verified

- Window creation, `WS_EX_TOPMOST` / `WS_EX_LAYERED` / `WS_EX_TRANSPARENT`, and
  starting hidden until enabled -- confirmed by enumerating the live app's
  windows.
- Drawing over a running game, in-game, at 240 Hz -- confirmed by the user.
- Hit-test parity with the backend across 2646 coordinates, every run.
- Drag-to-position writing correct `# @overlay` lines, driven through real
  pointer events in the editor.

Still unverified: pad shapes other than square, which needs a DualSense or
DualShock to plug in. The square case is the fallback as well as the Steam
Controller's real value, so a wrong aspect would not currently be visible.
