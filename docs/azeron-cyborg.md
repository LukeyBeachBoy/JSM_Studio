# Azeron Cyborg

JSM's Windows SDL backend supports native control of the Azeron Cyborg V2 (`16d0:12f7`) as controller type 25. The vendor HID interface supplies 26 independently numbered physical buttons (`JOY1`–`JOY26`), the four thumb-switch directions (`UP`, `RIGHT`, `DOWN`, `LEFT`), and raw analog-stick readings. The analog joystick uses the existing left-stick settings, including deadzones, response curves, keyboard directions, mouse and virtual-controller output.

Quit Azeron Software, including its tray icon, while using native control. **Any onboard profile can be selected**: JSM temporarily enters software mode, suppressing onboard mappings, and reads physical controls directly. It reads the device's stored stick endpoints and center offsets, then applies JSM's own stick settings. It does not rewrite profiles, calibration, firmware, or the selected onboard profile. Studio displays whether takeover is active or why it could not start. If Azeron Software starts, JSM releases control and waits for it to close; it reconnects automatically afterward.

JSM restores onboard mode when the mapper stops or disconnects. `AzeronRecovery.exe` also restores it after a mapper/GUI crash or loss of the native input worker heartbeat. Takeover is refused if recovery cannot be armed. The helper is launched hidden, survives the GUI's process-cleanup job, holds the device claim until restoration completes, and then exits. Mapping Off keeps native capture available for Studio while disabling JSM's mappings; stopping the mapper returns control to the device.

Disable other remappers' hiding/remapping for this device when using JSM. Windows can list the USB device while SDL cannot access its DirectInput interface. If `ManagedControllers.txt` restricts devices, include `16d0:12f7` using the format documented in managed-controllers.md.

Example:

```text
JOY1 = SPACE
JOY2 = E
JOY1,JOY2 = TAB
JOY25 = ESC
LEFT_STICK_MODE = LEFT_STICK
VIRTUAL_CONTROLLER = XBOX
```

Numbered inputs support the normal mapping engine's taps, holds, simultaneous presses, chords, layer activators and virtual-menu buttons. Studio provides a labelled, clickable Cyborg drawing in the existing controller line-art style, live button/stick feedback, keyboard-accessible hit targets and model-specific overrides. No gyro, touchpad, rumble or analog triggers are advertised. DirectInput provides device discovery; the vendor HID interface provides input, and the duplicate XInput companion is excluded. Native takeover does not fall back silently to profile-dependent DirectInput mappings. Other Azeron USB models and non-Windows native takeover are not yet supported.

## Input latency and overhead

The native reader waits on Windows overlapped HID I/O and wakes when a report
arrives. It does not add a polling sleep or busy-spin. Reports go straight into
a fixed-capacity queue; the mapper consumes them on its existing 1 ms Studio
tick. Every button transition is kept in order, including a press and release
inside one HID report. Analog-only updates coalesce to the newest stick position.
The queue is bounded to 256 button transitions; after an extreme consumer stall,
overflow releases held inputs and resumes the current physical state rather than
replaying an unbounded backlog. Disconnect and software-mode loss cancel queued
presses and release held inputs.

Process scanning runs in the recovery helper, outside the input thread. Recovery
heartbeats run twice per second, and the three-second watchdog remains enabled.
Controller-setting lookup uses references instead of allocating scope lists per
lookup; model, physical-device and layer isolation still apply. The Cyborg skips
unavailable touch and Steam hardware-setting callbacks. Live preview rendering
and WebView telemetry stop when the editor loses focus; native mapping continues.

Normal **Press** bindings dispatch on receipt by the mapper. Tap, hold, double-tap
and simultaneous-press mappings retain their configured timing semantics. USB
firmware/debounce, Windows scheduling and the game's input sampling still affect
end-to-end latency; the 1 ms mapper tick is not a guarantee of 1 ms physical
button-to-game latency. Restrictor scaling and rotation add no buffering window.

Validation: `tests/azeron_input_queue.cpp` covers rapid and overlapping taps,
analog coalescing, mode loss/disconnect, overflow recovery and concurrent delivery.
`tests/controller_scope_benchmark.cpp` measures optimized settings lookup and heap
allocation counts. `tests/telemetry_performance_regression.cjs` verifies that the
live preview stops scheduling/rendering when unfocused or hidden.

## One game, several controllers

Open a game config, then **Controller layouts** above its drawing. **Add layout** saves another controller model inside the same config. Choose a model to edit its bindings; disconnected saved models remain editable. Disconnecting or reordering devices does not change the edit destination. The matching bindings apply independently to each connected controller. Shared bindings remain the fallback for models without overrides.

The portable text format uses `# @controller-layout type-N` to declare a model and `# @controller type-N ...` for its assignments, labels and layers. Existing single-controller configs continue to work without migration.

## Stick fit: restrictor ring and rotation

In **Joysticks**, select the Cyborg layout for the game. **Restrictor ring** expands
the shorter physical travel to full input before deadzones, keyboard directions,
flicks, menus and virtual-stick output. It defaults to Off. **Ring travel** starts
at 70% and can be adjusted from 10% to 100%; this is a starting value, not an
automatic measurement of your ring. Lower it if the adjusted vector cannot reach
the edge with the ring fitted. Switching the toggle off retains the travel value.

**Stick rotation** accepts -180° to +180°, with 0.1° fine adjustments. Positive is
clockwise. Hold the stick in your natural forward direction and choose **Use
current direction as up** to align it. This rotates the input without snapping
or quantizing other directions. Normal axis inversion and mode settings follow.

The controller drawing highlights pressed buttons and shows two live vectors:
dashed grey is physical travel, green is adjusted input. The larger compass shows
heading and magnitude, the inner deadzone and the full-speed edge. These vectors
are before deadzones and mode output; they are not a readback from the game.
The joystick editor previews the layout being edited; the Layout drawing follows
the mapper's active settings. Disconnected saved layouts remain editable.

Open **Global Cyborg stick defaults** from Sticks or Settings → Controller to set
stick mode, restrictor travel, rotation, deadzones and keyboard-direction thresholds
for every game. These defaults are saved in Studio’s settings, scoped to the Cyborg,
and reloaded by the mapper after a restart. Game settings (including settings in a
shared base), controller layouts, layers and modeshifts take precedence. Reset a
game setting to inherit the global default again. Other controllers are unaffected.
Neither global nor game settings modify Azeron profiles or hardware calibration. For
example, a ring-enabled Cyborg layout alongside an unchanged Steam layout uses:

```text
# @controller type-25 LEFT_STICK_RESTRICTOR_RING = ON
# @controller type-25 LEFT_STICK_RESTRICTOR_RANGE = 0.7
# @controller type-25 LEFT_STICK_ROTATION = -12.5
```

Use `OFF` in another game's Cyborg layout when removing the ring. The matching
`RIGHT_STICK_*` commands are also supported; the ring toggle is exposed for the
Cyborg's single left stick. Both sticks expose rotation.

## Cyberpunk controls

Keyboard directions have their own controls under **Sticks → Fine-tune →
Directions**. The Cyborg preset uses 70° cardinal zones, 5° angular stability,
35% activation and a 17% release margin (release below 18%). These are spatial
thresholds, with no debounce timer or smoothing delay. A new direction requires
35% travel even when reversing directly across the centre, preventing a small
spring rebound from briefly sending the opposite key. Deliberate diagonals
remain available; choose a 90° cardinal width for strictly four-way movement.
These thresholds operate on the rotated/ring-adjusted vector and affect keyboard
directions only. Analog steering keeps the ordinary stick deadzones.

Commands are `LEFT_STICK_CARDINAL_WIDTH`, `LEFT_STICK_DIRECTION_HYSTERESIS`,
`LEFT_STICK_DIRECTION_DEADZONE` and `LEFT_STICK_DIRECTION_RELEASE_MARGIN`, with
matching `RIGHT_STICK_*` commands. They support controller layouts, layers and
modeshifts. Unconfigured profiles keep the original 53.130102° cardinal width,
zero direction hysteresis/margin and the ordinary inner deadzone. Changing stick
mode releases the keyboard directions before analog/mouse/menu output takes over.

Holding a WASD direction still holds a key, just like a keyboard. Text fields
can therefore auto-repeat characters while held; a string typed into a text box
does not by itself distinguish normal key repeat from repeated press/release
edges. `tests/stick_directions.cpp` replays the recorded raw Cyborg movement to
test those edges, as well as legacy defaults, spatial hysteresis and reversals.

The **Set up Cyberpunk for Cyborg** action adds a Cyborg variant while retaining the original shared/Steam layout. The thumbstick uses WASD on foot, with the mouse handling aim. Upper thumb button 25 sends Escape; lower thumb button 22 toggles the Driving layer. Driving sends analog left-stick output for steering and disables the stick's WASD bindings. Buttons 1/2/3 become accelerate, brake/reverse and handbrake; 4 exits, 5 operates the radio and 6 changes camera. Tap 22 again to return to the on-foot layout. Driving is scoped to the Cyborg and clears on disconnect.

The picture follows fixed physical numbering. The 5-way thumb control uses the hat plus button 20; stick-click is 21, and the two side thumb buttons are 25 and 22. Button 26 is the additional lower finger key: it remains distinct from thumb button 25 even if an onboard profile assigns both the same joystick number. `JOY27`–`JOY32` remain parseable for older configs but are not advertised as native physical inputs.

`tests/azeron_native_protocol.cpp` covers the independently implemented wire decoder, calibration, physical-position mapping, framing, truncated/malformed reports and release state. The protocol uses read-only firmware/details requests and volatile mode, raw-stream and ping commands. Vendor application code used as a local protocol reference is kept in an ignored build directory and is not bundled or copied into the implementation.

Validation: `node tests/azeron_cyborg_regression.cjs` covers decoding, capabilities, isolation, serialization, independent Steam/Cyborg layouts and the Driving preset. `tests/azeron_cyborg_native.cpp` covers button/hat masks and axis endpoints. `tests/azeron_cyborg_browser_regression.cjs` and `tests/multi_controller_game_browser_regression.cjs` cover artwork, live feedback, hit targets, adding/selecting layouts and disconnected editing. Rust tests cover toggle edges, controller isolation and disconnect reset. A successful build is not gameplay validation.

## Native physical input check — 27 October 2026

The installed 0.7.162 mapper captured 9,674 samples with mappings disabled, including 9,673 active native samples and one initial connecting sample. The requested upper and lower side-thumb presses registered in order as JOY25 and JOY22. Finger inputs JOY1–9, JOY14–19 and JOY23–26, plus all four hat directions, were observed. JOY10–13, JOY20 and JOY21 were not exercised in this capture. All buttons returned to released.

The user started with a stick restrictor ring fitted, then removed it near the end. Both axes reached -1.0 and +1.0 in the later motion segment, with a final resting value of approximately (-0.0100, +0.0038). The capture did not change calibration or the selected onboard profile. Normal JSM operation resumed afterward, with the Cyborg reporting native control active alongside the Steam Controller. Saved Cyberpunk and Azeron settings hashes remained unchanged. Gameplay is still a separate check.

Evidence is in the ignored `build-jsm-sdl/azeron-protocol-reference/physical-input-live.jsonl`, `physical-input-results.json` and `physical-input-restored.json` files.

## Earlier DirectInput check — 26 October 2026

With reWASD mapping disabled and an Azeron joystick profile selected, the built mapper opened the physical DirectInput interface as type 25. A live telemetry capture confirmed buttons JOY1–JOY25, all four hat directions, and analog movement on both stick axes. Recorded ranges were X -1.000 to +0.998 and Y -0.973 to +1.000; the final stick reading was approximately (-0.002, 0). All buttons returned to released. The separate XInput interface remained idle throughout the test.

JOY26–JOY32 are available firmware assignments but were not exercised. The final mapper also opened only type 25 and parsed both the on-foot and Driving configurations without errors or missing button handlers. Capture evidence is local at `build-jsm-sdl/azeron-live-check/telemetry-persistent.jsonl`; final smoke evidence is in `build-jsm-sdl/azeron-acceptance/`. Physical output/gameplay and unplug/reconnect checks remain separate from automated validation.

## Automatic hiding of native controllers

When `ManagedControllers.txt` explicitly enrolls `16d0:12f7`, JSM Evolved repairs
the enrolled Azeron's HidHide rules before launching the mapper and checks for
reconnected/new USB instances every five seconds. It hides the DirectInput and
XInput HID game-controller collections plus the XnaComposite USB interface that
actually serves XInput. The USB interface is discovered through the live PnP
parent chain and class, rather than a saved port-specific instance ID. Keyboard,
mouse, configurator, USB composite parent and hub interfaces are excluded.

The editor and mapper are allowed through HidHide before rules are written.
Existing hidden devices and third-party rules are preserved. Saved rules survive
Windows restarts; a new or repaired rule needs administrator access, using the
existing Settings → Startup administrator flow. Normal Windows startup remains
unelevated. Missing HidHide is not installed automatically, and inverse HidHide
mode is not changed automatically.

In Settings → Hide the real controller, **Show to games** on the Azeron disables
automatic hiding persistently; **Hide from games** enables it again. Turning the
master hiding switch off also disables automatic repair. No controller restart,
Steam restart, firmware change or profile edit is performed by this feature.

## Mouse side buttons for Hold to swap

In **Settings → Hold to swap**, select a configuration card to open **Choose inputs
to hold**. Click inputs on the controller drawing, choose **Mouse Back (button 4)**
or **Mouse Forward (button 5)** on the mouse drawing, or use the labelled buttons.
Select several inputs to require them together. **Another way to hold it** opens
the same visual picker for an alternative trigger. **Listen for input instead**
is an optional action; Escape or the clickable footer Cancel stops listening
without changing the saved trigger. Choose **Azeron Cyborg only** under Which controller to apply
the held configuration to that controller; Any controller applies it independently
to every connected controller. Release the mouse button to restore each controller’s
previous configuration. The Windows worker reads side buttons while Studio is in
the background, and mapping Off disables the swaps. This reads the Windows side
buttons across mice; it does not identify an individual mouse or suppress the
button’s normal Back/Forward action in other applications.

The artwork draws one five-way thumb switch, 21 on the analog stick for stick-click,
25 on the upper thumb button, and 22 on the lower thumb button. Input numbering
and existing bindings are preserved.
