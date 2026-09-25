# Configuration layers

Use the **Edit layer** picker in the fixed editor header to select **Default** or a named layer from any input page, including Buttons and Overview. The arrows cycle through layers. Switching keeps the current input page and preserves unsaved edits; it changes what you view and edit, without activating the layer on the controller. The selected layer stays visible while the page scrolls. Configure its controller actions under **Manage layers**:

| Action | Behavior |
| --- | --- |
| Hold layer | Activates while the assigned button is held. |
| Apply layer | Activates on press and stays active after release. Pressing again keeps it active. |
| Remove layer | Deactivates the named layer on press, without deleting it or its overrides. |

All three assignments are optional. For a persistent vehicle layer, leave Hold unassigned, assign Apply to an entry button, and Remove to an exit button. A layer can have both Hold and Apply/Remove actions. Layer actions coexist with any direct binding on the same input.

## Create and manage

1. Open **Manage layers**, enter a name such as Comms, and optionally choose a hold button. Select the new layer in the picker to assign Apply and Remove buttons.
2. Leave **Move this button's existing modeshifts into the layer** checked to collect that trigger's assignments from the current profile. This moves bindings, settings, action labels, icons, and overlay placements. Imported files are not edited.
3. Select the new layer. Edit inputs and settings using the normal controls; only changed values are stored as overrides. You can add modeshifts and chords inside the layer.
4. **Save** saves Default and every layer together. The header's **Apply** button applies the whole profile and resets activation to Default. Controller layer actions then activate its layers.

Default is unique and cannot be deleted or renamed. In Manage layers, rename a layer, change its hold button, or delete it. Expand its overrides and choose **Use Default** to restore inheritance for an individual entry. Clearing a button binding explicitly unbinds it in that layer. Undo/redo covers layer changes.

Each layer inherits Default, including its imports. Changes to Default flow
through unless overridden. Persistent layers compose in the order they were
applied.

**Layers stack.** This follows Steam, whose Action Set Layers documentation says
that "more than one layer can be applied at a time and will be applied
consecutively", with "the last layer applied" overriding any conflict before it.
So holding a second layer adds it on top rather than replacing the first, and
releasing it removes only that one. Held layers sit above the persistent ones.

Two more rules come from the same page and we match them: applying a layer that
is already on does nothing and does not reorder it, while removing it and
applying it again puts it on top.

**A separate configuration is our action set.** Steam allows only one action set
at a time, replaces the whole layout rather than modifying it, and clears every
layer of the old set when a new one is activated. That is exactly what loading
another profile does here, so a mode with no relationship to the current one --
a menu layout, say -- belongs in its own configuration with its own binding back,
not in a layer.

**What activates a layer is bound to an input**, not stored on the layer, which
is how Steam does it: you bind "Apply Action Layer" onto a button, and the layer
itself is only a name and a set of overrides. So any number of inputs can drive
the same layer, and a layer nothing is bound to is still a layer -- it simply
never activates.

It is written as an annotation next to the layers, which the mapper ignores:

```
# @layer {"id":"map","name":"Tactical map","overrides":{ ... }}
# @layer-action RSL = toggle map
```

The verbs are `hold`, `apply`, `remove` and `toggle`. An input may be a chord
(`LSL,+`), and one input may carry several actions.

**An action is read in the state it belongs to:** an `apply` is read while its
layer is off and a `remove` while it is on, so a layer never applies and removes
itself in one press. `toggle` is the same input meaning both.

Profiles written before this carried `trigger`, `applyTrigger` and
`removeTrigger` on the layer. Both the editor and the mapper still read those,
so an old profile keeps working; saving it writes the annotations and drops the
fields. `applyTrigger` and `removeTrigger` naming the same input read back as a
`toggle`, which is what that pairing always meant.

Remove targets its named layer, including a persistent layer temporarily hidden by a hold. Removing a currently held layer suppresses that hold until its button is released. Another held or persistent layer can then resume; otherwise Default resumes. If Apply and Remove arrive together for the same layer, Remove wins. A button can be shared by multiple Remove actions to return to Default.

Global chords take priority. Local Apply/Remove presses during a global chord are ignored, and the persistent layer resumes afterward. Applying/changing profiles, disabling mapping, or disconnecting the controller that applied the persistent layer clears activation. Buttons already down when a profile loads must be released and pressed again to Apply; holding a layer still works immediately.

The stacked-layer badge marks inputs used for Hold, Apply, Remove, a modeshift trigger, shifted binding, or simultaneous chord. Its tooltip names the relationships. These inputs are in use even when they have no direct binding. Overview shows the selected layer's effective bindings, including inherited ones, and also works without a connected controller.

## Storage and runtime

Layers are stored as `# @layer` JSON annotations in the existing profile `.txt`. No profile-folder migration is required. Each record has a stable `id`, unique display `name`, digital hold `trigger` (empty when unassigned), optional `applyTrigger` and `removeTrigger` buttons, and an `overrides` map keyed by configuration command or annotation. The normal configuration is Default. Copy/import/save retain the metadata.

JSM Studio prepares disposable, import-resolved configurations under `profiles-library/.layers/` and uses the existing backend held-config worker to activate and restore them. The mapper's restoration mechanism replays the previously applied assignments. The worker handles release/disconnection and refreshes layers after Apply or a runtime profile change. Layer activation requires JSM Studio's backend to be running; loading the annotated source directly in standalone JoyShockMapper runs Default.

Validation covers frontend projection/persistence, browser editing with mocked controller data, import snapshots, and backend selection/priority. Physical-controller timing and gameplay still require a live test.
