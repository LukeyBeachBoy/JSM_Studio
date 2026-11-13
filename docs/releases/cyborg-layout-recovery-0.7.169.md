# Cyborg layout recovery and clearer controller setup

The controller layout page now starts with compact shared/controller choices.
Adding a model, other saved layouts and the long shared-input compatibility list
stay collapsed until needed. Add-controller fields use the current surface,
accent and text tokens, including light mode. An individual Cyborg correctly
reports that it inherits the saved model layout instead of appearing empty.

The thumb assembly uses a side elevation: the five-way knob is on the upper
thumb housing, stick-click 21 is on the oblique stick cap, and upper/lower keys
25 and 22 are adjacent on the same diagonal tower. Numbering and native input
decoding are unchanged. Diagram hit targets remain separately selectable.

The Cyberpunk recovery reads the user's reWASD export through
`scripts/import-cyberpunk-rewasd.py`. It accounts for 37 keyboard assignments,
four analog-direction entries and five layer transitions. Physical reWASD Cyborg
V2 positions are translated to JSM's native numbering. Shared and Steam layout
rows remain byte-for-byte unchanged; the existing file is backed up before an
atomic replacement. The source reWASD file is never edited.

On foot: 1 Dodge, 2 Sprint, 3 Jump, 4 Crouch, 5 Reload, 6 Heal, 7 Alt,
9 Interact, 10 Shift + apostrophe (Mod menu), 11 Melee, 12 Ability,
15 Radio, 16 Phone, 17 Inventory, 18 Enter, 19 Skip dialogue,
22 Escape, 23 Hacking view, 24 Call vehicle and 26 Draw/holster.
The stick sends WASD and the knob sends arrow keys.

Upper thumb 25 toggles Driving. Driving uses analog steering; 2 sends Space,
3 sends S and 4 sends W. Interact sends an immediate F tap; holding it also
returns to on-foot controls. This uses the current JSM hold time because the
export does not store a long-press duration. A bounded, controller-owned native
`LAYER_REMOVE` action provides this behavior without reloading a whole profile.

Mouse Back holds Weapons: 6/7/8/9 send 1/2/3/4. Entering Weapons clears Driving;
releasing Back returns to on-foot controls. A global Hold to swap still has
priority over local layers. Existing native rotation/restrictor fit is preserved;
the export's numerical stick-sensitivity values are recorded in the import report,
not treated as an equivalent JSM curve.

Validation covers importer rejection of unsupported entries, exact preservation
of other controller layouts, physical-device inheritance, separate thumb hit
targets, collapsed disclosures, amber/dark and light controls, and narrow layout.
The real reconstructed base, Driving and Weapons configs pass an isolated native
mapper parse with hardware connections disabled. The Rust layer suite verifies
layer removal and normal reactivation. Installation and gameplay remain separate
checks; reopen Cyberpunk after updating to load the restored source.
