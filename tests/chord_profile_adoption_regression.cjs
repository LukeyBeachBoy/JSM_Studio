// A profile chosen inside Quick Access must become the saved applied profile;
// device telemetry alone cannot survive Studio's focus handover.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const worker = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src-tauri/src/services/global_chords.rs', 'utf8');
const commands = fs.readFileSync('JSM_GUI/jsm_gui_tauri/src-tauri/src/commands.rs', 'utf8');
const choice = worker.slice(worker.indexOf('if !late && binding_chose_profile('), worker.indexOf('let global=eligible_global_profile('));
assert.match(choice, /controller\.cancelled=true/);
assert.match(choice, /adopt_profile_loaded_by_binding\(&app,&state,&live\)/, 'a live controller choice must update the state used by focus handover');
const adopt = commands.slice(commands.indexOf('pub(crate) fn adopt_profile_loaded_by_binding('), commands.indexOf('pub(crate) fn studio_focus_changed('));
assert.match(adopt, /runtime::set_active_profile\(app, path\)/);
assert.match(adopt, /app\.emit\("applied-profile-changed"/);
assert.ok(adopt.indexOf('runtime::set_active_profile(app, path)') < adopt.indexOf('keep_studio_navigation('), 'persist the choice before navigation takes the pad');
console.log('PASS: controller profile choices persist before focus handover and notify the editor');
