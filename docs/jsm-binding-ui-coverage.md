# Native binding output and activator coverage

This complements the command/variable inventory. `python scripts/audit-jsm-bindings.py --write` inspects both platform key parsers and compiles the actual Windows `nameToKey`, `KeyCode` and `Mapping` code. `scripts/export-gui-binding-tokens.cjs` reads the graphical catalogs themselves rather than maintaining a second keyboard list. The generated `jsm-binding-inventory.json` records accepted outputs, codes, aliases and whether they appear in those catalogs. No mapper is launched and no OS or gamepad output is emitted.

The native check currently verifies 174 graphical tokens and inventories 184 accepted Windows tokens. These counts will change as graphical coverage improves. Acceptance by the parser establishes serialization compatibility, not correct physical emission or game behavior.

| Native capability | Graphical handling | Classification / remaining work |
| --- | --- | --- |
| Letters, number row, punctuation, F1–F12, navigation, numpad | Drawn keyboard / numpad and key capture | Graphical; every catalog token checked against actual native Mapping parsing |
| F13–F24 | Extended function keys disclosure in the action picker / keyboard dialog; also searchable | Graphical; browser selection, save/reload and actual native Mapping acceptance verified separately |
| `CONTROL`, `ALT`, `SHIFT` | Left/right modifier choices | Equivalent Windows output for the generic/left modifier; imported spelling preserved. Right modifiers remain distinct. Parser codes differ, so raw identifiers are not indiscriminately rewritten. |
| `SUBSTRACT` | Numpad Subtract | LEGACY typo alias of `SUBTRACT`; preserve imports, write the canonical picker choice |
| `NONE` | Remove command / empty binding | Deliberate empty action; no requirement to add a visible "None" output command to a new menu item |
| `CALIBRATE` | Gyro calibration action and calibration tools | Existing hold-to-calibrate action requires semantic review against the full `CALIBRATE_GYRO` workflow |
| `GYRO_ON`, `GYRO_OFF` | Enable/disable gyro (this controller), with press/hold/release/toggle controls; activation-condition settings remain separate | Graphical. Actual native ownership tests preserve overlapping holds, event-specific actions, independent toggles and balanced global counters. Save/reload preserves assignment conditions and unknown lines. Physical gyro verification pending. |
| Xbox / DS4 aliases | Gamepad glyph picker and scheme conversion | Graphical. Alias codes and source tokens recorded independently. Actual virtual-driver emission pending. |
| `SMALL_RUMBLE`, `BIG_RUMBLE`, `Rhhhh` | Feedback / rumble action editor | Typed amplitudes, rather than exposing hex as primary UI. Windows arbitrary-hex parser checked with bounded string views. Linux lacks the same arbitrary-hex parser and requires separate platform work. |
| `HAPTIC_<side>_<effect>_<gain>` | Typed haptic action picker | Graphical family with side, effect and gain; hardware effect verification pending |
| Quoted command / file execution | JSM actions, configuration picker, custom command editor | Graphical command categories plus expert editor. Native registry inventory defines available commands; quoting and unknown-line round-trip remain covered separately. |
| `CYCLE` quoted action | Cycle settings sheet | 2–32 simple steps; compound per-step mappings remain PARTIAL |

The parser audit found two concrete defects: the Equals key displayed by the keyboard was rejected by the native parser, and out-of-range function names such as F25 could resolve to reserved JSM gyro-action codes. Equals now maps to its ordinary key, and valid function keys are bounded to F1–F24 on both platforms. Existing valid tokens keep their spelling and behavior. The Windows rumble parser now respects the declared string-view length instead of reading beyond a five-byte token.

The full native output catalog and the event modifier enums are separate from input relationships:

| Binding semantics | GUI owner | Status |
| --- | --- | --- |
| Start / regular press, release, tap, hold, turbo | Shared command card trigger selector | Graphical; native event timing / interruption review continues |
| Toggle, instant, explicit release | Command settings sheet | Graphical; dedicated native Mapping/FSM tests and round-trip tests |
| Double press | Physical input's second registered mapping | Graphical for registered inputs; deliberately absent from synthetic menu item editors |
| Simultaneous presses, diagonal chords, held/released input chords | Shared modifier / relationship editors | PARTIAL; compatibility tests exist, exhaustive applicability and controller-focus review continue |
| Multiple independent actions | Add / duplicate / remove command cards | Graphical; release/toggle combinations covered in named-menu browser and native runtime tests |
| Setting mode shifts | Layers and source-specific setting scopes | JSM-specific capability; assignment registrations declare which variables actually permit chords |
| Activator start/end delay, interruption, cycle of compound actions | Existing timing controls cover only some behavior | PARTIAL; global sleep is not presented as per-activator delay parity |

Useful advanced behavior is not declared complete merely because it parses, appears in the source editor, or has a documentation reference.

## Steam Controller pad contacts

Steam Controller left pad contact is `MISC4`; right pad contact is `TOUCH`. Each now has its own Touch binding sheet and human input name, distinct from left/right clicks (`MISC3`/`MISC2`) and region cells. The native dispatcher previously omitted these contact bindings and the side-specific dual-stage settings; both pads now use independent touch/click FSM slots. Normal actions, gyro conditions, chords/layers and named-menu conditions consume the same native input identifiers. All seven touch/click policies remain ordinary native settings, including held overrides. Raw contact telemetry is previewed independently even when the digital button mask is zero; emitted activator timing remains owned by JSM. Native trigger/runtime harnesses and browser save/reload pass. Physical touch/click behavior remains pending.

Steam physical touch/click, Grip Sense and stick-touch conditions are sampled before gyro and settings lookup. Their chord state follows raw hardware even when a touch/click activator policy suppresses the corresponding action. This prevents a click-held policy from releasing its own condition and alternating every poll. Actual Context/dispatcher/FSM tests cover suppressed-action releases, inverted touch conditions and legacy non-Steam behavior; physical validation remains pending.
