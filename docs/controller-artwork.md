# Controller artwork and live inputs

The artwork imported from PC Controller Views.html lives in `JSM_GUI/jsm_gui_tauri/src/assets/controllers`. All 18 supplied front/back SVGs are retained. The existing calibrated Steam live view remains active for type 24. Eight additional layouts use `ModelControllerSvg` through the shared `ControllerStatusSvg`, on Home and the binding overview.

| Artwork | JSM identifier |
| --- | --- |
| Switch Pro | Type 3 |
| DualShock 4 | Type 4 |
| DualSense | Type 5 |
| DualSense Edge | VID 054c, PID 0df2, overriding the shared DualSense type |
| Xbox Elite Series 2 | Type 7 (Xbox Elite family) |
| Xbox Series X/S | Type 8 |
| 8BitDo Pro 2 | Types 15 and 16 (USB/Bluetooth) |
| 8BitDo Ultimate 2 | Type 18 |
| Steam Controller | Type 24, existing renderer |

Other models retain their existing family/generic rendering. Do not assign third-party models a supplied shell merely because they share a button layout.

Live button masks use `getPressedControllerCommandSet`, matching the mapper's SDLWrapper mappings. Rear artwork is supplied mirrored: left-hand inputs remain on the left. Triggers show continuous intensity; sticks move their live position dots. PlayStation pad contact uses the available left-pad telemetry. Physical profile switches, pairing buttons, trigger-stop sliders and turbo controls have no fabricated JSM binding.

Controls retain bound/selected highlights and support pointer, Enter and Space selection, including stick-direction and full-trigger aliases. SVG masks and gradients are scoped to each preview instance. Artwork uses the existing `--art-*` theme tokens.

Reimport from the repository root with:

```powershell
python scripts/import-controller-views.py 'C:/Users/luker/Downloads/PC Controller Views.html'
```

Browser regression: `tests/controller_artwork_browser_regression.cjs`; set `JSM_TEST_URL` to a running web development server with `?mock`. It renders the production dispatcher with simulated telemetry and checks all mapped types, controls, analog movement, presses, paddles and binding selection. Physical-device and installed-package tests are separate.

DualSense Edge identifier source: https://discourse.libsdl.org/t/sdl-adds-dualsense-edge/39559
