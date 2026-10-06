# Controller virtual keyboard

Preferences selects Standard, Split or Daisywheel and shows the live renderer as a preview. Appearance can follow the app theme/accent or use neutral dark/light. Shortcut assignments persist separately for each layout. Choosing an assigned button swaps its actions.

Expand **Haptics**, below the keyboard preview, to use the shared binding effect selector: Off, Tick, Click, Tone, Rumble (back motor), Sweep, Pulse or Tap. Explicit effects follow the same pad/back motor routing as bindings and previews; they do not force the dedicated grip actuators. **Steam keyboard** reproduces the 4 October puck capture: pad key crossings use Tick +1 dB, press and release use Tick +5 dB, and touch/shortcut feedback uses the exact 400 us single pulse. Default intensity (35%) matches captured tick gain; changing intensity adjusts tick gain logarithmically. The captured pulse has fixed strength. Shortcut feedback remains enabled for Space/Caps even though Steam emitted no commands for those presses in this capture. See `steam-keyboard-haptic-capture.md`. Intensity is 0–100%, defaulting to 35%; selection feedback stays lighter than typing feedback. Steam's Pulse is fixed strength, as indicated in the shared selector. Off or 0% silences all keyboard feedback. Settings apply to shortcuts, trackpad and joystick navigation in every layout and persist independently of other controller feedback settings.

## Global chords and regular commands

The immutable **Default Global Chords** configuration ships with one editable activation row: Guide/HOME **or** Quick Access/MISC1. Each row contains alternatives; each alternative requires all its buttons together. Existing separate rows targeting the same configuration merge on upgrade. Separate controllers cannot combine inputs to satisfy an AND group. Personal activations retain priority.

The default configuration includes Steam-style mouse, scrolling, clicking, Enter/Escape, Alt-Tab, screenshot and volume controls. Its ordinary command bindings are:

- X/Square: `W = "OPEN_KEYBOARD"` opens or closes the keyboard.
- Right rear button: `RSL = "TOGGLE_MAPPING"` pauses/resumes mapping.
- Other right rear button: `RSR = "CALIBRATE_GYRO"` starts gyro calibration.

Open keyboard and Pause/resume mapping are available in the regular command picker, including press/tap/hold activators. Native mapper events include the initiating controller, a mapper session and a sequence number; Studio deduplicates retransmitted packets and ignores old event history after restart. Legacy Personal configurations using `# @keyboard-open` migrate their placeholder binding to the ordinary command without replacing custom bindings.

Edit opens the protected configuration dialog with **Clone as Personal**. Its buttons are controller-navigable. Built-in configuration files cannot be edited, renamed or deleted; library Delete/Rename controls are omitted. The activation row itself can be edited, retargeted or removed. Removal persists across launches. **Reset default settings** in Preferences restores startup, controller, keyboard and appearance preferences and re-adds the default activation, while preserving personal configurations and other global chords. The former reserved-chords section and runtime mechanism have been removed.

## Keyboard controls

- Standard: D-pad or left stick selects; south face button types. Either touchpad selects across the keyboard; pad click types.
- Split: each pad covers its own half, with independent live touch indicators and click edges.
- Daisywheel: left stick selects one of eight circular groups; face buttons choose a character. Right trigger holds numbers/symbols and left trigger holds Shift. D-pad left repeats Backspace, right inserts Space, down Enter, up Caps Lock. The wheel's D-pad hub shows whatever each direction is bound to, and the Shift/Symbols chips light while held.
- Daisywheel banks (petals clockwise from up; characters in X Y B A order, i.e. left, top, right, bottom):
  - Letters, classic: `abcd efgh ijkl mnop qrst uvwx yz,. ?!'-`. Sentence punctuation needs no trigger.
  - Letters, Input Labs: their desktop profile (`alpakka_firmware/src/profiles/desktop.c`), whose up-left petal is `@ ? . ,`; their two empty slots carry `'` and `-`.
  - Right trigger (or right stick): `1234 5678 90., +-*/ =%() @#$& :;'" ?!_\`.
  - Both triggers: `` []{} <>|~ ^`€£ ¥¢°§ ±×÷… «»¿¡ –—•¶ ©®™µ ``. Every printable ASCII character is reachable; Caps Lock affects letters only.
- Petal selection holds across a boundary by 7° and releases at 0.26 rather than the 0.32 engage radius, so a resting stick cannot flicker (or tick) between petals. The right stick's switch into the symbols bank uses the same engage/release pair.
- Daisywheel Move uses the right bumper plus either touchpad or the right stick. Resize uses the left bumper plus either touchpad or the left stick. Both bumpers reset size/position. These assignments are configurable.
- Right stick normally selects symbol groups, with D-pad choosing their characters. The optional **Right stick as D-pad** mode instead makes it a center-utility alias, retaining the left stick's letter selection.
- The optional **Input Labs tweaked** grouping matches their ABXY grouping, puts vowels on A, and X/Y on their corresponding buttons. Preferences credits [Input Labs](https://inputlabs.io/blog/alphanumeric_input).
- The right center/Menu/Options/+ button closes all layouts. Standard/Split defaults are X for Backspace, Y for Space, left trigger for Shift, left stick click for Caps Lock, right trigger for Enter, left bumper for Symbols, right stick click for Move, and right bumper for Resize. Both bumpers reset size/position. **Reset to defaults** inside Controller shortcuts resets only the selected layout, preserving other layouts and haptic preferences; existing custom shortcuts are preserved until reset.

The wheel and all its labels/glyphs scale as one square canvas, even in a tall or narrow host. Native resizing uses a uniform aspect ratio and monitor constraints. Grid keys carry controller-specific shortcut glyphs, labelled merged space bars, Caps Lock and a keyboard-close icon. Key labels and shortcut glyphs share a centered baseline; stick clicks explicitly identify L3/R3. Symbols is labelled in the footer. Controller focus uses one rounded shared highlight.

## Input ownership

A native Rust reducer handles raw mapper telemetry independently of WebView rendering. A temporary empty mapping at `profiles-library/.layers/virtual-keyboard.txt` captures typing input through the serialized `STUDIO_CHORD_BEGIN/END` stack and restores the applied profile. Ordinary global chords take priority while the keyboard is open, so their regular commands remain usable. Capture acknowledgement and neutral release precede typing. Only the initiating controller types; disconnect, stale telemetry and failed acknowledgement close the keyboard.

The renderer receives changed state and coalesces updates to animation frames. The compact keyboard document excludes the editor and icon catalog. Keyboard preferences persist in `virtual-keyboard.json` in the runtime directory.

## Verification boundary

TypeScript/Vite, native unit tests, the actual mapper binding-parser harness, and the SDL mapper release build are checked. Isolated Edge fixtures cover appearances, geometry, minimum/unequal-aspect resizing, layout previews, tweaked grouping, OR/AND activation editing, default removal, controller dialogs and focus styling. Browser fixtures simulate the native bridge.

Installed-app and physical-controller game playtests remain separate: typing into a game, live move/resize, multi-controller ownership, overlay recovery and perceived latency need hardware validation. No installer was produced for this source change.

Grid selection retains the current key within a 10% key-width/height boundary band to prevent touch noise from flickering between adjacent keys and repeatedly firing navigation ticks. Horizontal and vertical selection settle independently. Deliberate crossings switch on the same native input packet; large movements jump directly to the destination. Lifting clears the selection history, while the visual touch cursor continues to follow raw position. This applies independently to both pads in Standard and Split.

