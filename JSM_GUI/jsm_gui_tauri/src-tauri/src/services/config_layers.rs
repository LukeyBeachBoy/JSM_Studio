//! Profile-local held layers share the serialized global-chord worker.
//! Portable metadata stays in the source profile; generated files are disposable.
use std::{collections::BTreeMap, fs, path::{Component, Path}};
use serde::Deserialize;
use tauri::AppHandle;
use crate::runtime;
use std::sync::atomic::{AtomicU64, Ordering};
static APPLY_REVISION: AtomicU64 = AtomicU64::new(0);
pub fn applied() { APPLY_REVISION.fetch_add(1, Ordering::SeqCst); }
pub fn revision() -> u64 { APPLY_REVISION.load(Ordering::SeqCst) }

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Layer {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub apply_trigger: String,
    #[serde(default)]
    pub remove_trigger: String,
    /// While this layer is applied, other layers' holds are ignored -- a map
    /// or menu layer that must not be half-covered by a grip-held layer.
    #[serde(default)]
    pub suppress_holds: bool,
    pub overrides: BTreeMap<String, String>,
}

#[derive(Clone, Debug)]
pub struct PreparedLayer {
    pub id: String,
    /// Every input bound to each action. Activation belongs to the input, the
    /// way Steam binds "Apply Action Layer" to a button, so a layer can be
    /// driven from several inputs and a layer with none simply never fires.
    pub holds: Vec<String>,
    pub applies: Vec<String>,
    pub removes: Vec<String>,
    pub toggles: Vec<String>,
    pub profile_path: String,
    pub name: String,
    pub base: String,
    pub overrides: BTreeMap<String, String>,
    pub suppress_holds: bool,
}

pub fn compose(app: &AppHandle, layers: &[PreparedLayer], ids: &[String]) -> Result<Option<String>, String> {
    use std::hash::{Hash, Hasher};
    let selected: Vec<_> = ids.iter().filter_map(|id| layers.iter().find(|l| &l.id == id)).collect();
    let Some(first) = selected.first() else { return Ok(None); };
    let content = compose_content(&first.base, selected.iter().map(|layer| &layer.overrides));
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    content.hash(&mut hash);
    let name = selected.iter().map(|l| l.name.as_str()).collect::<Vec<_>>().join(" + ");
    let name: String = name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).take(100).collect();
    let parent = Path::new(&first.profile_path).parent().ok_or("Missing layer directory")?;
    let path = parent.join(format!("{}-{}.txt", hash.finish(), name.trim_end_matches([' ', '.'])));
    let root = runtime::runtime_dir(app)?;
    // The mapper is told to load this the moment it is written, and it may
    // still be reading an identically named one from an earlier stack.
    runtime::write_file_atomically(root.join(&path), content)?;
    Ok(Some(path.to_string_lossy().replace('\\', "/")))
}

fn compose_content<'a>(base: &str, overrides: impl Iterator<Item = &'a BTreeMap<String, String>>) -> String {
    let mut content = format!("RESET_MAPPINGS\n{base}\n");
    for assignments in overrides {
        for (key, value) in assignments {
            let separator = if key.starts_with("# @overlay ") { " " } else { " = " };
            content.push_str(&format!("{key}{separator}{value}\n"));
        }
    }
    content.push_str("TELEMETRY_ENABLED = ON\nTELEMETRY_PORT = 8974\n");
    content
}

/// `# @layer-action <INPUT> = <verb> <layer id>`
#[derive(Clone, Debug, PartialEq)]
pub struct LayerAction {
    pub input: String,
    pub verb: String,
    pub layer_id: String,
}

pub fn parse_actions(text: &str, layers: &[Layer]) -> Vec<LayerAction> {
    let mut actions: Vec<LayerAction> = Vec::new();
    let mut add = |input: &str, verb: &str, layer_id: &str| {
        if input.is_empty() || !layers.iter().any(|layer| layer.id == layer_id) { return; }
        let action = LayerAction { input: input.to_uppercase(), verb: verb.to_string(), layer_id: layer_id.to_string() };
        if !actions.contains(&action) { actions.push(action); }
    };
    for line in text.lines() {
        let Some(rest) = line.trim().strip_prefix("# @layer-action ") else { continue; };
        let Some((input, tail)) = rest.split_once('=') else { continue; };
        let mut parts = tail.split_whitespace();
        let (Some(verb), Some(id)) = (parts.next(), parts.next()) else { continue; };
        if parts.next().is_some() { continue; }
        let verb = verb.to_lowercase();
        if ["hold", "apply", "remove", "toggle"].contains(&verb.as_str()) { add(input.trim(), &verb, id); }
    }
    // Profiles written before activation moved to the input still carry it on
    // the layer. Read both, so a profile keeps working until it is saved again.
    for layer in layers {
        if !layer.trigger.is_empty() { add(&layer.trigger, "hold", &layer.id); }
        let (apply, remove) = (&layer.apply_trigger, &layer.remove_trigger);
        if !apply.is_empty() && apply == remove { add(apply, "toggle", &layer.id); }
        else {
            if !apply.is_empty() { add(apply, "apply", &layer.id); }
            if !remove.is_empty() { add(remove, "remove", &layer.id); }
        }
    }
    actions
}

pub fn parse(text: &str) -> Vec<Layer> {
    text.lines().filter_map(|line| {
        let json = line.trim().strip_prefix("# @layer ")?;
        let layer: Layer = serde_json::from_str(json).ok()?;
        if layer.id.is_empty() || layer.name.is_empty() { return None; }
        // Metadata represents assignments only, never extra injected lines.
        if layer.overrides.iter().any(|(k, v)| k.contains(['\n', '\r', '=']) || v.contains(['\n', '\r'])) { return None; }
        Some(layer)
    }).collect()
}

fn safe_relative(path: &str) -> bool {
    !path.contains(':') && !path.contains('\\') && Path::new(path).components().all(|c| matches!(c, Component::Normal(_)))
}

fn snapshot(root: &Path, text: &str, stack: &mut Vec<String>) -> Result<String, String> { snapshot_inner(root, text, stack, false) }
fn snapshot_inner(root: &Path, text: &str, stack: &mut Vec<String>, retain_layers: bool) -> Result<String, String> {
    let mut lines = Vec::new();
    for line in text.lines() {
        if !retain_layers && line.trim().starts_with("# @layer ") { continue; }
        let candidate = line.split('#').next().unwrap_or("").trim().replace('\\', "/");
        if !candidate.contains('=') && candidate.to_lowercase().ends_with(".txt") {
            if !safe_relative(&candidate) { return Err("Invalid layer import path".into()); }
            if stack.contains(&candidate) || stack.len() >= 32 { return Err("Circular layer import".into()); }
            let imported = fs::read_to_string(root.join(&candidate)).map_err(|e| e.to_string())?;
            stack.push(candidate);
            lines.push(snapshot_inner(root, &imported, stack, retain_layers)?);
            stack.pop();
        } else { lines.push(line.to_string()); }
    }
    Ok(lines.join("\n"))
}

pub fn prepare(app: &AppHandle, source: &str) -> Result<Vec<PreparedLayer>, String> { prepare_for_model(app, source, "") }

pub fn prepare_for_model(app: &AppHandle, source: &str, model: &str) -> Result<Vec<PreparedLayer>, String> {
    let source = source.replace('\\', "/");
    if !safe_relative(&source) || !source.starts_with("profiles-library/") { return Ok(Vec::new()); }
    let root = runtime::runtime_dir(app)?;
    let text = fs::read_to_string(root.join(&source)).map_err(|e| e.to_string())?;
    let expanded = snapshot_inner(&root, &text, &mut vec![source.clone()], true)?;
    let text = super::controller_layouts::project(&expanded, model);
    let layers = parse(&text);
    if layers.is_empty() { return Ok(Vec::new()); }
    let base = snapshot(&root, &text, &mut vec![source.clone()])?;
    let parent = Path::new(&source).file_stem().and_then(|p| p.to_str()).unwrap_or("Profile");
    let directory = root.join("profiles-library/.layers").join(parent);
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    let actions = parse_actions(&text, &layers);
    for (index, layer) in layers.into_iter().enumerate() {
        let name: String = layer.name.chars().map(|c| if c.is_control() || "<>:\"/\\|?*".contains(c) { '_' } else { c }).collect();
        let path = format!("profiles-library/.layers/{parent}/{index}-{}.txt", name.trim_end_matches([' ', '.']));
        let mut content = format!("RESET_MAPPINGS\n{base}\n");
        for (key, value) in &layer.overrides {
            let separator = if key.starts_with("# @overlay ") { " " } else { " = " };
            content.push_str(&format!("{key}{separator}{value}\n"));
        }
        content.push_str("TELEMETRY_ENABLED = ON\nTELEMETRY_PORT = 8974\n");
        runtime::write_file_atomically(root.join(&path), content)?;
        let inputs = |verb: &str| actions.iter().filter(|a| a.layer_id == layer.id && a.verb == verb).map(|a| a.input.clone()).collect::<Vec<_>>();
        result.push(PreparedLayer { id: layer.id.clone(), holds: inputs("hold"), applies: inputs("apply"), removes: inputs("remove"), toggles: inputs("toggle"), profile_path: path, name: layer.name.clone(), base: base.clone(), overrides: layer.overrides, suppress_holds: layer.suppress_holds });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn composition_preserves_unrelated_values_and_last_layer_wins() {
        let a = BTreeMap::from([("N".into(), "J".into()), ("E".into(), "K".into())]);
        let b = BTreeMap::from([("N".into(), "NONE".into()), ("L,N".into(), "ENTER".into())]);
        let content = compose_content("N = SPACE\nW = R", [&a, &b].into_iter());
        let effective: BTreeMap<_,_> = content.lines().filter_map(|line| line.split_once('=')).map(|(k,v)| (k.trim(),v.trim())).collect();
        assert_eq!(effective["N"], "NONE");
        assert_eq!(effective["E"], "K");
        assert_eq!(effective["W"], "R");
        assert_eq!(effective["L,N"], "ENTER");
        let restored = compose_content("N = SPACE", [&a].into_iter());
        assert!(restored.contains("N = J"));
        assert!(!restored.contains("N = NONE"));
    }
    #[test]
    fn metadata_and_nested_chords() {
        let layers = parse("# @layer {\"id\":\"a\",\"name\":\"Comms\",\"trigger\":\"RSR\",\"overrides\":{\"L,N\":\"J\",\"N\":\"NONE\"}}");
        assert_eq!(layers.len(), 1);
        assert_eq!(layers[0].overrides["L,N"], "J");
        assert!(parse("# @layer broken").is_empty());
        assert!(!safe_relative("profiles-library/../secret.txt"));
        assert!(!safe_relative("C:/secret.txt"));
    }
    #[test]
    fn persistent_actions_are_optional_and_legacy_holds_still_parse() {
        let legacy = parse(r#"# @layer {"id":"a","name":"Comms","trigger":"RSR","overrides":{}}"#);
        assert_eq!(legacy[0].trigger, "RSR");
        assert!(legacy[0].apply_trigger.is_empty());
        assert!(legacy[0].remove_trigger.is_empty());
        let persistent = parse(r#"# @layer {"id":"a","name":"Vehicles","trigger":"","applyTrigger":"LSR","removeTrigger":"RSL","overrides":{}}"#);
        assert_eq!(persistent.len(), 1);
        assert!(persistent[0].trigger.is_empty());
        assert_eq!(persistent[0].apply_trigger, "LSR");
        assert_eq!(persistent[0].remove_trigger, "RSL");
    }
    #[test]
    fn inherited_snapshot_is_self_contained_and_keeps_assignment_order() {
        let dir = std::env::temp_dir().join(format!("jsm-layer-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let template = dir.join("template.txt");
        fs::write(&template, "N = SPACE\nL,N = K\n# @label N = Jump\n").unwrap();
        let text = snapshot(&dir, "RESET_MAPPINGS\ntemplate.txt\nN = ENTER\n# @layer {}", &mut vec![]).unwrap();
        assert!(text.contains("N = SPACE\nL,N = K\n# @label N = Jump\nN = ENTER"));
        assert!(!text.contains("template.txt"));
        assert!(!text.contains("@layer"));
        fs::write(&template, "template.txt").unwrap();
        assert!(snapshot(&dir, "template.txt", &mut vec![]).is_err());
        fs::remove_file(template).unwrap();
        fs::remove_dir(dir).unwrap();
    }
}

#[cfg(test)]
mod action_tests {
    use super::*;

    const LAYERS: &str = concat!(
        "# @layer {\"id\":\"comms\",\"name\":\"Comms\",\"overrides\":{}}\n",
        "# @layer {\"id\":\"map\",\"name\":\"Tactical map\",\"overrides\":{}}\n",
    );

    #[test]
    fn activation_is_read_from_the_inputs_and_several_may_drive_one_layer() {
        let text = format!(
            "{LAYERS}# @layer-action RSR = hold comms\n# @layer-action LSL = hold comms\n# @layer-action RSL = toggle map\n",
        );
        let layers = parse(&text);
        let actions = parse_actions(&text, &layers);
        assert_eq!(actions.len(), 3);
        let inputs = |verb: &str, id: &str| actions.iter()
            .filter(|a| a.verb == verb && a.layer_id == id)
            .map(|a| a.input.as_str()).collect::<Vec<_>>();
        // Two different inputs hold the same layer, which the old model could
        // not express at all: a layer had exactly one hold field.
        assert_eq!(inputs("hold", "comms"), vec!["RSR", "LSL"]);
        assert_eq!(inputs("toggle", "map"), vec!["RSL"]);

        // An action naming a layer that is not there is not an action.
        let orphan = format!("{LAYERS}# @layer-action RSR = hold nosuchlayer\n");
        assert!(parse_actions(&orphan, &parse(&orphan)).is_empty());

        // Neither is a verb we do not have, or a malformed line.
        for junk in ["# @layer-action RSR = summon comms", "# @layer-action RSR = hold", "# @layer-action = hold comms"] {
            let text = format!("{LAYERS}{junk}\n");
            assert!(parse_actions(&text, &parse(&text)).is_empty(), "accepted {junk}");
        }
    }

    #[test]
    fn a_profile_from_before_the_move_still_activates() {
        // trigger / applyTrigger / removeTrigger on the layer itself.
        let text = concat!(
            "# @layer {\"id\":\"comms\",\"name\":\"Comms\",\"trigger\":\"RSR\",\"overrides\":{}}\n",
            "# @layer {\"id\":\"veh\",\"name\":\"Vehicles\",\"trigger\":\"\",\"applyTrigger\":\"LSL\",\"removeTrigger\":\"LSR\",\"overrides\":{}}\n",
            "# @layer {\"id\":\"map\",\"name\":\"Map\",\"trigger\":\"\",\"applyTrigger\":\"RSL\",\"removeTrigger\":\"RSL\",\"overrides\":{}}\n",
        );
        let layers = parse(text);
        let actions = parse_actions(text, &layers);
        let find = |verb: &str, id: &str| actions.iter().any(|a| a.verb == verb && a.layer_id == id);
        assert!(find("hold", "comms"), "a hold trigger becomes a Hold on that input");
        assert!(find("apply", "veh") && find("remove", "veh"), "separate apply/remove survive");
        // The same input for both was how a toggle had to be written before the
        // verb existed, so it reads back as one rather than as two fighting.
        assert!(find("toggle", "map"), "apply == remove reads as a toggle");
        assert!(!find("apply", "map") && !find("remove", "map"));
    }
}
