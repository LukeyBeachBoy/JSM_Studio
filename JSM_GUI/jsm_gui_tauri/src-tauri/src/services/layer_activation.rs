//! Button-edge tracking for persistent and held configuration layers.
use std::collections::HashSet;
use serde_json::Value;
use super::{config_layers::PreparedLayer, global_chords::layer_pressed};

#[derive(Default)]
pub struct LayerActivation {
    // A persistent layer belongs to the controller that applied it.
    latched: Vec<(String, String)>,
    held_order: Vec<String>,
    previous: HashSet<(String, String)>,
    suppressed_holds: HashSet<String>,
    initialized: bool,
}

impl LayerActivation {
    pub fn reset(&mut self) { *self = Self::default(); }

    pub fn update(&mut self, layers: &[PreparedLayer], devices: &[Value], enabled: bool, global_active: bool) -> Vec<String> {
        if !enabled || devices.is_empty() {
            self.reset();
            return Vec::new();
        }
        let controllers: Vec<_> = devices.iter().enumerate().map(|(index, device)| {
            (device.get("handle").map(Value::to_string).unwrap_or_else(|| format!("index-{index}")), device)
        }).collect();
        let mut down = HashSet::new();
        for layer in layers {
            for button in layer.holds.iter().chain(&layer.applies).chain(&layer.removes).chain(&layer.toggles) {
                if button.is_empty() { continue; }
                for (owner, device) in &controllers {
                    if layer_pressed(device, button, &layer.base) { down.insert((owner.clone(), button.clone())); }
                }
            }
        }
        // Loading a profile while a button is already down must not synthesize
        // a fresh Apply press. Hold actions still work immediately.
        let first_sample = !self.initialized;
        self.initialized = true;
        let rising = |button: &str| if first_sample || button.is_empty() { None } else {
            controllers.iter().find(|(owner, _)| down.contains(&(owner.clone(), button.to_string())) &&
                !self.previous.contains(&(owner.clone(), button.to_string()))).map(|(owner, _)| owner.clone())
        };
        let held = |button: &str| !button.is_empty() && down.iter().any(|(_, key)| key == button);
        // A layer is held if ANY input bound to Hold is down, and an Apply,
        // Remove or Toggle fires when any of its inputs goes down.
        let any_held = |buttons: &Vec<String>| buttons.iter().any(|button| held(button));

        self.latched.retain(|(id, owner)| layers.iter().any(|l| &l.id == id) && controllers.iter().any(|(key, _)| key == owner));
        self.suppressed_holds.retain(|id| layers.iter().any(|l| &l.id == id && any_held(&l.holds)));
        // Global-chord buttons operate that config, not the suspended local
        // layer. Still consume their edges so release cannot trigger Apply.
        if !global_active {
            // An activator means Apply while the layer is off and Remove while
            // it is on. A layer therefore never applies and removes itself in
            // one press, the same input can serve as both (a toggle), and the
            // two can differ -- "L4 and START to enter, START alone to leave" --
            // because each is only read in the state it belongs to.
            let on: Vec<String> = self.latched.iter().map(|(id, _)| id.clone()).collect();
            let any_rising = |buttons: &Vec<String>| buttons.iter().find_map(|button| rising(button));
            for layer in layers {
                let latched_now = on.contains(&layer.id);
                // Toggle is one input meaning "the other thing": it applies while
                // the layer is off and removes while it is on.
                let toggled = any_rising(&layer.toggles);
                if !latched_now {
                    if let Some(owner) = any_rising(&layer.applies).or_else(|| toggled.clone()) {
                        self.latched.push((layer.id.clone(), owner));
                        continue; // one press cannot also remove what it just applied
                    }
                }
                // Remove is read while the layer is on in either sense: latched,
                // or held right now -- a Remove against a held layer cancels the
                // hold until its hold input is released.
                let removing = any_rising(&layer.removes).is_some() || (latched_now && toggled.is_some());
                if (latched_now || any_held(&layer.holds)) && removing {
                    self.latched.retain(|(id, _)| id != &layer.id);
                    if any_held(&layer.holds) { self.suppressed_holds.insert(layer.id.clone()); }
                }
            }
        }
        // An applied layer that suppresses holds keeps every other layer's hold
        // out while it is on; its own hold, if it has one, still counts.
        let suppressing = self.latched.iter().any(|(id, _)| layers.iter().any(|l| &l.id == id && l.suppress_holds));
        let may_hold = |layer: &PreparedLayer| !suppressing || layer.suppress_holds;
        self.held_order.retain(|id| layers.iter().any(|l| &l.id == id && any_held(&l.holds) && may_hold(l)) && !self.suppressed_holds.contains(id));
        for layer in layers {
            if may_hold(layer) && any_held(&layer.holds) && !self.suppressed_holds.contains(&layer.id) && !self.held_order.contains(&layer.id) { self.held_order.push(layer.id.clone()); }
        }
        self.previous = down;
        // Steam: "More than one layer can be applied at a time and will be
        // applied consecutively", with "the last layer applied" winning any
        // conflict. So every held layer is active, in press order, on top of the
        // persistent ones; a held-and-applied layer is included only once.
        self.latched.iter().map(|(id, _)| id.clone()).filter(|id| !self.held_order.contains(id)).chain(self.held_order.iter().cloned()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// One input per action is all these cases need; the lists exist so a layer
    /// can be driven from several.
    pub(super) fn one(button: &str) -> Vec<String> {
        if button.is_empty() { Vec::new() } else { vec![button.to_string()] }
    }
    fn layer(id: &str, hold: &str, apply: &str, remove: &str) -> PreparedLayer {
        PreparedLayer { id: id.into(), holds: one(hold), applies: one(apply), removes: one(remove), toggles: Vec::new(), profile_path: id.into(), name: id.into(), base: String::new(), overrides: Default::default(), suppress_holds: false }
    }

    // Layers design 15e: "Tactical map suppresses holds while active, so L4
    // won't hold Vehicles while the map is up."
    #[test]
    fn an_applied_layer_that_suppresses_holds_keeps_other_holds_out() {
        let mut map = layer("map", "", "RSL", "RSR");
        map.suppress_holds = true;
        let layers = [layer("vehicles", "LSL", "", ""), map];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"], "holds work while the map is off");
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, RSL), vec!["map"]);
        assert_eq!(run(&mut state, &layers, LSL), vec!["map"], "the map keeps the hold out");
        assert_eq!(run(&mut state, &layers, 0), vec!["map"]);
        assert_eq!(run(&mut state, &layers, RSR), Vec::<String>::new(), "removing the map");
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"], "holds work again once it is off");
    }
    fn device(handle: u32, bits: u64) -> Value { json!({"handle":handle,"status":{"buttons":bits}}) }
    fn run(state: &mut LayerActivation, layers: &[PreparedLayer], bits: u64) -> Vec<String> {
        state.update(layers, &[device(1, bits)], true, false)
    }
    const LSL: u64 = 1 << 19;
    const RSR: u64 = 1 << 20;
    const MISC6: u64 = 1 << 32;

    // A layer held while the left grip is let go ("!MISC6"), not while it is
    // held: on from the start, off while gripping, back on at release.
    #[test]
    fn a_hold_on_a_released_grip_is_on_while_the_grip_is_up() {
        let layers = [layer("aim", "!MISC6", "", "")];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &layers, 0), vec!["aim"], "released from the start");
        assert_eq!(run(&mut state, &layers, MISC6), Vec::<String>::new(), "gripping lets it go");
        assert_eq!(run(&mut state, &layers, 0), vec!["aim"], "and releasing brings it back");
        // Stacked with an ordinary hold, it follows its own input.
        let both = [layer("aim", "!MISC6", "", ""), layer("comms", "RSR", "", "")];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &both, RSR), vec!["aim", "comms"]);
        assert_eq!(run(&mut state, &both, RSR | MISC6), vec!["comms"]);
    }

    // Toggle on "!X" flips as X is released, not as it is pressed.
    #[test]
    fn a_toggle_on_a_released_input_flips_on_release() {
        let mut map = layer("map", "", "", "");
        map.toggles = one("!RSR");
        let layers = [map];
        let mut state = LayerActivation::default();
        // Up at the start is the released state already, not a release edge.
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new(), "loading does not toggle");
        assert_eq!(run(&mut state, &layers, RSR), Vec::<String>::new(), "pressing does nothing");
        assert_eq!(run(&mut state, &layers, 0), vec!["map"], "releasing toggles it on");
        assert_eq!(run(&mut state, &layers, RSR), vec!["map"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new(), "and the next release off");
    }
    const LSR: u64 = 1 << 21;
    const RSL: u64 = 1 << 22;

    // Steam stacks layers rather than swapping between them: holding a second
    // one adds it on top, and releasing it removes only that one. Checked
    // against the documented rules in Action Set Layers.
    #[test]
    fn held_layers_stack_in_press_order_and_release_independently() {
        let layers = [layer("comms", "RSR", "", ""), layer("vehicles", "LSL", "", "")];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &layers, RSR), vec!["comms"]);
        // Both held: both active, the newer one last so it wins conflicts.
        assert_eq!(run(&mut state, &layers, RSR | LSL), vec!["comms", "vehicles"]);
        // Releasing one removes that one alone.
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        // Press order decides the order of the stack, not the layer list.
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, LSL | RSR), vec!["vehicles", "comms"]);
        assert_eq!(run(&mut state, &layers, RSR), vec!["comms"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
    }

    #[test]
    fn apply_survives_release_and_remove_returns_to_default_without_repeating() {
        let layers = [layer("comms", "", "RSR", "LSL")];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, RSR), vec!["comms"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["comms"]);
        assert_eq!(run(&mut state, &layers, RSR), vec!["comms"], "Apply is idempotent, not a toggle");
        assert_eq!(run(&mut state, &layers, RSR | LSL), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, RSR), Vec::<String>::new(), "still-held Apply must not reapply after Remove");
        run(&mut state, &layers, 0);
        assert_eq!(run(&mut state, &layers, RSR), vec!["comms"]);
    }
    #[test]
    fn held_layer_restores_persistent_layer_and_remove_can_cancel_a_hold() {
        let layers = [layer("vehicles", "", "RSR", "LSL"), layer("comms", "LSR", "", "RSL")];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        run(&mut state, &layers, RSR);
        assert_eq!(run(&mut state, &layers, LSR), vec!["vehicles", "comms"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, LSR | RSL), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, LSR), vec!["vehicles"], "removed hold stays suppressed until release");
        run(&mut state, &layers, 0);
        assert_eq!(run(&mut state, &layers, LSR), vec!["vehicles", "comms"]);
        assert_eq!(run(&mut state, &layers, LSL | LSR), vec!["comms"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new(), "removing the suspended persistent layer is remembered");
    }
    #[test]
    fn applied_layers_stack_and_removal_is_targeted() {
        let layers = [layer("a", "", "RSR", "LSL"), layer("b", "", "LSR", "RSL")];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        run(&mut state, &layers, RSR);
        assert_eq!(run(&mut state, &layers, LSR), vec!["a", "b"]);
        assert_eq!(run(&mut state, &layers, LSL), vec!["b"]);
        assert_eq!(run(&mut state, &layers, RSL), Vec::<String>::new());
    }
    #[test]
    fn global_chords_consume_local_edges_but_preserve_the_persistent_layer() {
        let layers = [layer("a", "", "RSR", "LSL"), layer("b", "", "LSR", "RSL")];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        run(&mut state, &layers, RSR);
        state.update(&layers, &[device(1, LSR | LSL)], true, true);
        assert_eq!(run(&mut state, &layers, LSR | LSL), vec!["a"]);
    }
    #[test]
    fn profile_reset_disable_and_owner_disconnect_clear_persistence() {
        let layers = [layer("a", "", "RSR", "LSL")];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        run(&mut state, &layers, RSR);
        state.reset();
        assert_eq!(run(&mut state, &layers, RSR), Vec::<String>::new(), "profile changes do not create a new press");
        run(&mut state, &layers, 0);
        run(&mut state, &layers, RSR);
        assert_eq!(state.update(&layers, &[device(2, 0)], true, false), Vec::<String>::new(), "disconnecting the owner clears its layer even if another pad remains");
        state.update(&layers, &[device(1, 0)], true, false);
        run(&mut state, &layers, RSR);
        assert_eq!(state.update(&layers, &[device(1, RSR)], false, false), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, RSR), Vec::<String>::new());
        assert_eq!(state.update(&layers, &[], true, false), Vec::<String>::new());
    }
}

#[cfg(test)]
mod toggle_tests {
    use super::*;
    use serde_json::json;

    fn layer(id: &str, apply: &str, remove: &str) -> PreparedLayer {
        PreparedLayer {
            id: id.into(), holds: Vec::new(), applies: super::tests::one(apply),
            removes: super::tests::one(remove), toggles: Vec::new(),
            profile_path: id.into(), name: id.into(),
            base: String::new(), overrides: Default::default(), suppress_holds: false,
        }
    }
    fn device(bits: u64) -> Value { json!({"handle":1,"status":{"buttons":bits}}) }
    fn run(state: &mut LayerActivation, layers: &[PreparedLayer], bits: u64) -> Vec<String> {
        state.update(layers, &[device(bits)], true, false)
    }
    const START: u64 = 1 << 4;
    const LSL: u64 = 1 << 19;
    const RSR: u64 = 1 << 20;

    // Menu mode: one chord in, the same chord out.
    #[test]
    fn the_same_input_for_apply_and_remove_toggles_the_layer() {
        let layers = [layer("menu", "LSL,+", "LSL,+")];
        let mut state = LayerActivation::default();
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        // Either half alone does nothing: that is the point of a chord.
        assert_eq!(run(&mut state, &layers, LSL), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, START), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());

        // Both together turns it on, and it stays on after the release.
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu"]);
        assert_eq!(run(&mut state, &layers, LSL), vec!["menu"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["menu"]);
        // Holding it down again does not flap: only the press counts.
        assert_eq!(run(&mut state, &layers, LSL | START), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, LSL | START), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        // And again, to be sure it is a toggle and not a one-shot.
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu"]);
    }

    // A toggle must not disturb the layers that use two separate inputs.
    #[test]
    fn separate_apply_and_remove_still_behave_and_coexist_with_a_toggle() {
        let layers = [layer("menu", "LSL,+", "LSL,+"), layer("vehicles", "RSR", "LSL")];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        assert_eq!(run(&mut state, &layers, RSR), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["vehicles"]);
        // The menu toggle shares LSL with the other layer's Remove, so pressing
        // the chord removes that one and applies this one in the same sample.
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["menu"]);
        assert_eq!(run(&mut state, &layers, LSL | START), Vec::<String>::new());
    }

    // Wardogs Layered puts the menu toggle on LSL,+ while LSL alone still holds
    // the Vehicles layer. Pressing the chord therefore runs both, and this is
    // what that actually does -- worth knowing rather than discovering.
    #[test]
    fn a_toggle_chord_that_shares_a_button_with_a_hold_layer_runs_both() {
        let mut vehicles = layer("vehicles", "", "");
        vehicles.holds = vec!["LSL".to_string()];
        let layers = [layer("menu", "LSL,+", "LSL,+"), vehicles];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        // Reaching for the chord holds the Vehicles layer on the way.
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"]);
        // With both down the menu latches and the hold is still a hold.
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu", "vehicles"]);
        // Letting go leaves menu mode alone on top of Default.
        assert_eq!(run(&mut state, &layers, 0), vec!["menu"]);
        // And the same chord takes it off again.
        assert_eq!(run(&mut state, &layers, LSL), vec!["menu", "vehicles"]);
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
    }

    // Menu mode as Luke described it: you enter it from inside the Vehicles
    // layer (L4 held, then START), and you leave it with START on its own,
    // because in menu mode L4 is not holding anything.
    #[test]
    fn entering_from_a_hold_layer_and_leaving_on_the_bare_button() {
        let mut vehicles = layer("vehicles", "", "");
        vehicles.holds = vec!["LSL".to_string()];
        let layers = [layer("menu", "LSL,+", "+"), vehicles];
        let mut state = LayerActivation::default();
        run(&mut state, &layers, 0);
        // START on its own, with menu off, must do nothing: it is the pause
        // button in the base configuration.
        assert_eq!(run(&mut state, &layers, START), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        // L4 holds Vehicles; adding START from there applies the menu.
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu", "vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["menu"]);
        // In menu mode START alone takes it off again.
        assert_eq!(run(&mut state, &layers, START), Vec::<String>::new());
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
        // ...and the chord still works for leaving, since + is what is read.
        assert_eq!(run(&mut state, &layers, LSL), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["menu", "vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), vec!["menu"]);
        assert_eq!(run(&mut state, &layers, LSL | START), vec!["vehicles"]);
        assert_eq!(run(&mut state, &layers, 0), Vec::<String>::new());
    }
}
