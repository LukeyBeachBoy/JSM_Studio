//! A disposable controller view; source profiles keep every controller's inputs.
use serde_json::Value;

pub fn model(device: &Value) -> String {
    if device["type"].as_i64() == Some(5) && device["vid"].as_i64() == Some(0x054c) && device["pid"].as_i64() == Some(0x0df2) { return "type-5-edge".into(); }
    format!("type-{}", device["type"].as_i64().unwrap_or(0))
}
pub fn translate(key: &str, left: bool) -> String {
    fn token(t: &str, left: bool) -> String {
        let side = if left { "LEFT_" } else { "RIGHT_" };
        if t == format!("{side}GRID_REQUIRES_CLICK") {return "TOUCHPAD_GRID_REQUIRES_CLICK".into();}
        if let Some(rest) = t.strip_prefix(side) { if rest.starts_with("TOUCH") || rest.starts_with("GRID_") {return rest.into();} }
        let grid = if left {"LT"} else {"RT"};
        if let Some(n) = t.strip_prefix(grid) { if !n.is_empty() && n.chars().all(|c|c.is_ascii_digit()) {return format!("T{n}");} }
        if t == if left {"MISC3"} else {"MISC2"} {return "CAPTURE".into();}
        if left && t == "MISC4" {return "TOUCH".into();}
        t.into()
    }
    let mut out=String::new(); let mut word=String::new();
    for c in key.chars().chain(std::iter::once('\0')) {
        if c.is_ascii_uppercase() || c.is_ascii_digit() || c=='_' {word.push(c);} else {out.push_str(&token(&word,left));word.clear();if c!='\0' {out.push(c);}}
    } out
}
pub fn project(text: &str, model: &str) -> String {
    let prefix = format!("# @controller {model} ");
    let pad_prefix = format!("# @controller-pad {model} ");
    let left = text.lines().filter_map(|line| line.trim().strip_prefix(&pad_prefix)).last()==Some("left");
    let force_pad = text.lines().any(|line|line.trim().starts_with(&pad_prefix));
    let single = ["type-4","type-5","type-5-edge"].contains(&model);
    let mut base=Vec::new();let mut overrides=Vec::new();let mut layers=Vec::<Value>::new();
    for line in text.lines() {
        if let Some(value)=line.trim().strip_prefix(&prefix) {overrides.push(value.to_string());}
        else if line.trim().starts_with(&pad_prefix) || !line.trim().starts_with("# @controller") {base.push(line.to_string());}
    }
    let keys:Vec<_>=base.iter().filter(|l|!l.trim().starts_with('#')).filter_map(|l|l.split_once('=').map(|(k,_)|k.trim().to_string())).collect();
    let mut additions=Vec::new();
    if single {for line in &base {if line.trim().starts_with('#') {continue;} if let Some((key,value))=line.split_once('=') {let mapped=translate(key.trim(),left);if mapped!=key.trim() && (force_pad || !keys.contains(&mapped)) {additions.push(format!("{mapped} = {value}"));}}}}
    let mut result=Vec::new();
    for (line, variant) in base.iter().map(|l|(l,false)).chain(overrides.iter().map(|l|(l,true))) {
        if let Some(json)=line.trim().strip_prefix("# @layer ") {
            if let Ok(mut layer)=serde_json::from_str::<Value>(json) {
                if single && !variant {
                    if let Some(values)=layer["overrides"].as_object_mut() {*values=values.iter().map(|(k,v)|(translate(k,left),v.clone())).collect();}
                    for key in ["trigger","applyTrigger","removeTrigger"] {if let Some(v)=layer[key].as_str() {layer[key]=Value::String(translate(v,left));}}
                }
                if let Some(id)=layer["id"].as_str() { if let Some(index)=layers.iter().position(|old|old["id"].as_str()==Some(id)) {layers[index]=layer;} else {layers.push(layer);} }
            }
        } else if single && !variant && line.trim().starts_with("# @layer-action ") {
            if let Some((key,value))=line.split_once('=') {result.push(format!("# @layer-action {} = {value}",translate(key.trim().trim_start_matches("# @layer-action "),left)));}
        } else {result.push(line.clone());}
    }
    // Runtime model rows must not override composed layer assignments later.
    result.extend(additions); result.extend(overrides.iter().filter(|l|!l.starts_with("# @layer ")).cloned());
    for layer in layers.iter().filter(|l|l["deleted"].as_bool()!=Some(true)) {result.push(format!("# @layer {layer}"));}
    result.join("\n")
}
#[cfg(test)] mod tests {use super::*;
#[test] fn variants_and_pad_fallback_preserve_source() {
 let text="RIGHT_TOUCHPAD_MODE = MOUSE\nRT1 = J\nLT1 = K\nS = SPACE\n# @controller type-5 S = ENTER\n# @controller type-24 S = F";
 let ds=project(text,"type-5");assert!(ds.contains("TOUCHPAD_MODE =  MOUSE"));assert!(ds.ends_with("S = ENTER"));assert!(ds.contains("T1 =  J"));
 let steam=project(text,"type-24");assert!(steam.ends_with("S = F"));assert!(!steam.contains("T1 =  J"));
 assert_eq!(translate("MISC3,LT2",true),"CAPTURE,T2");
}
}
