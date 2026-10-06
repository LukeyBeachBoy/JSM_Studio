# Triton probe and firmware tooling

Small tools used for the 2026-09-29 investigation of the Steam Controller 2026
firmware (`docs/triton-firmware-customisation.md`). None of this is part of the
build; it is kept so the next session does not have to rewrite it.

## scprobe.exe — talk to the controller over HID

`build.bat` compiles `scprobe.cpp` with the VS 2022 Build Tools (hid.lib,
setupapi.lib). It opens the controller's vendor collection (usage page 0xFF00)
directly through Win32 HID, so it works while JoyShockMapper has the controller
open. Over USB the controller is PID 0x1302 and HidHide does not cloak it; over
the puck (PID 0x1304) HidHide hides it from anything not on its whitelist, so run
the probe from a whitelisted path or pause HidHide.

```
scprobe list                                  every Valve HID collection present
scprobe cmd <hex cmd> [payload bytes...]      feature report [1][cmd][len][payload], prints the reply
scprobe settings                              dump settings 0..95 via 0x89 (one id per request)
scprobe store-get <key>                       0xED: read a named settings-store key (e.g. user/haptic_boot_level)
scprobe store-set <key> <bytes...>            0xEE: RAM-only write of a named key (see the doc before using)
scprobe out <bytes...>                        output report (haptics 0x80..0x85)
```

Read-only commands: `cmd 83` (attributes, incl. firmware build time), `cmd 89 <id> 00 00`,
`cmd e9` (LED colour), `cmd db` (boot-sound level), `store-get <key>`, `cmd be`
(battery), `cmd f2 00` (debug/version). Never send `cmd 86` (factory reset) or
`cmd fe` (erase calibration).

## Firmware listing helpers

- `thumbdis.rs`: a yaxpeax-arm Thumb-2 linear-sweep disassembler
  (`cargo new thumbdis`, add `yaxpeax-arm = "0.3"` and `yaxpeax-arch = "0.3"`,
  drop this file in as `src/main.rs`). Usage: `thumbdis <fw> 8000 > listing.asm`
  (skips the 32-byte header, base 0x8000). Known quirks: 16-bit conditional
  branch / cbz / cbnz targets print 2 bytes too high, `mov.w rX, imm` encoded
  `6ff0....` is really MVN, VFP instructions come out as `.hword` pairs.
- `xref.js`: `node xref.js <fw> 8000 <addr-hex>...` lists every 32-bit word in
  the image equal to the address or address|1 (pointer tables, literal pools).
- `table.js`: dumps the settings range table (`default min max` per id) from
  `IBEX_FW_6AA43B55.fw` in the current directory.

The firmware images live in `C:\Program Files (x86)\Steam\bin\hardwareupdater\`
(`IBEX_FW_*.fw` is the controller, `PROTEUS_FW_*.fw` the puck).
