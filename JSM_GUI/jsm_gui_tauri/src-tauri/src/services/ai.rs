//! The assistant's connection to a model (console v2, D18 and README §6).
//!
//! Four ways to connect, chosen in Settings ▸ Assistant:
//!
//! - `anthropic`: Claude with a Console API key, through the native Messages
//!   API (`POST /v1/messages`, `x-api-key`, `anthropic-version: 2023-06-01`).
//!   No Claude.ai sign-in: Anthropic doesn't allow it for other apps.
//! - `openai_compatible`: any OpenAI-compatible endpoint with a key (the setup
//!   the app had before), `POST {base}/chat/completions`.
//! - `local`: Ollama or LM Studio on this PC, the same protocol with no key on
//!   a loopback address.
//! - `chatgpt`: "Continue with ChatGPT", PKCE sign-in and the Responses API
//!   (services/ai_chatgpt.rs), behind a client id OpenAI issues.
//!
//! Keys and tokens live in Windows Credential Manager (services/credentials.rs).
//! The settings file keeps only the choices, and the web view only ever sees
//! whether a key is stored and its last four characters.
//!
//! "How careful the assistant is" is one setting for every provider: Claude's
//! `output_config.effort` (current Claude models reject `temperature`), and a
//! temperature for the OpenAI-compatible and local servers. ChatGPT's
//! Responses requests take neither.

use std::{fs, path::PathBuf, time::Duration};

use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use crate::services::{ai_chatgpt as chatgpt, credentials};

const AI_SETTINGS_FILE_NAME: &str = "ai-settings.json";
const SETTINGS_VERSION: u32 = 2;
const MAX_CONFIG_CHARS: usize = 16_000;

pub const ANTHROPIC_API: &str = "https://api.anthropic.com/v1";
pub const ANTHROPIC_VERSION: &str = "2023-06-01";
pub const ANTHROPIC_DEFAULT_MODEL: &str = "claude-opus-5-5";
/// The picker's choices before a key is tested (the test fills it from
/// `GET /v1/models`): the default, then the cheaper current models.
pub const ANTHROPIC_SUGGESTED_MODELS: [&str; 4] = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5"];
/// Thinking is always on for current Claude models, so the answer needs room.
const ANTHROPIC_MAX_TOKENS: u32 = 16_000;
const ANTHROPIC_TIMEOUT_SECS: u64 = 300;
const OPENAI_TIMEOUT_SECS: u64 = 180;
const LOCAL_TIMEOUT_SECS: u64 = 300;
const TEST_TIMEOUT_SECS: u64 = 15;
const DETECT_TIMEOUT_MS: u64 = 1500;

pub const OLLAMA_URL: &str = "http://127.0.0.1:11434/v1";
pub const LM_STUDIO_URL: &str = "http://127.0.0.1:1234/v1";

const ANTHROPIC_KEY: &str = "ai/anthropic";
const OPENAI_KEY: &str = "ai/openai_compatible";

// Keep the model reference synced with the shipped JSM documentation instead of
// maintaining a partial handwritten summary that will drift over time.
const QUICK_REFERENCE: &str = concat!(
  "JoyShockMapper full documentation reference. Treat this as the authoritative feature and command guide when generating configs.\n\n",
  include_str!("../../../src/assets/docs/JSM-docs.md")
);
const SYSTEM_PROMPT: &str = r##"You write JoyShockMapper (JSM) profile text for controller mappings, for the JSM Evolved app.

Return a json object with exactly these top-level keys:
- summary: one or two plain sentences saying what changed and why, for someone holding a controller (for example "L5 is free, so reload goes there. X keeps reload too, so nothing you're used to breaks.")
- configText: plain JSM profile text, no markdown fences
- assumptions: array of short strings
- warnings: array of short strings
- unchanged: array of JSM keys (such as "W" or "GYRO_SENS") that the change relates to but deliberately leaves as they were, so the app can show them as context

Rules:
- configText must contain only JSM profile lines and optional # comments.
- Do not include the fixed startup header lines RESET_MAPPINGS, AUTOCONNECT, TELEMETRY_ENABLED, or TELEMETRY_PORT. The app adds them automatically.
- Lines starting with "# @" are the app's own data (labels, icons, modes, menus). Keep them as they are unless the request is about them.
- A bare path line such as "bases/Shooter stick aim.txt" imports a base. Keep it above the profile's own lines.
- Prefer simple, explicit mappings and conservative settings.
- Only use JSM commands and settings you are reasonably confident exist.
- If the user request is ambiguous, make conservative choices and list them in assumptions.
- If a current profile is supplied, preserve unrelated working lines and return the full resulting profile text.
- Never output placeholders like TODO, <fill>, or angle-bracket templates.
"##;

// ---- Settings.

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelChoice {
    #[serde(default)]
    pub model: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EndpointChoice {
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub base_url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptChoice {
    /// Issued by OpenAI for this app; empty means the option can't be used.
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub model: String,
    #[serde(default = "default_authorize_url")]
    pub authorize_url: String,
    #[serde(default = "default_token_url")]
    pub token_url: String,
    #[serde(default = "default_responses_url")]
    pub responses_url: String,
    #[serde(default = "default_redirect_port")]
    pub redirect_port: u16,
    /// "Signed in as …", from the id token.
    #[serde(default)]
    pub account: Option<String>,
    /// Unix seconds the access token stops working.
    #[serde(default)]
    pub expires_at: Option<u64>,
}

fn default_authorize_url() -> String { chatgpt::DEFAULT_AUTHORIZE_URL.into() }
fn default_token_url() -> String { chatgpt::DEFAULT_TOKEN_URL.into() }
fn default_responses_url() -> String { chatgpt::DEFAULT_RESPONSES_URL.into() }
fn default_redirect_port() -> u16 { chatgpt::DEFAULT_REDIRECT_PORT }

impl Default for ChatGptChoice {
    fn default() -> Self {
        Self {
            client_id: option_env!("JSM_CHATGPT_CLIENT_ID").unwrap_or_default().to_string(),
            model: "gpt-5".into(),
            authorize_url: default_authorize_url(),
            token_url: default_token_url(),
            responses_url: default_responses_url(),
            redirect_port: default_redirect_port(),
            account: None,
            expires_at: None,
        }
    }
}

/// What is saved in ai-settings.json: choices only, never a secret.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredSettings {
    #[serde(default)]
    pub version: u32,
    /// "chatgpt", "anthropic", "openai_compatible", "local", or none yet.
    #[serde(default)]
    pub provider: Option<String>,
    /// "careful", "balanced" or "quick".
    #[serde(default = "default_careful")]
    pub careful: String,
    #[serde(default = "default_anthropic")]
    pub anthropic: ModelChoice,
    #[serde(default)]
    pub openai_compatible: EndpointChoice,
    #[serde(default = "default_local")]
    pub local: EndpointChoice,
    #[serde(default)]
    pub chatgpt: ChatGptChoice,
}

fn default_careful() -> String { "careful".into() }
fn default_anthropic() -> ModelChoice { ModelChoice { model: ANTHROPIC_DEFAULT_MODEL.into() } }
fn default_local() -> EndpointChoice { EndpointChoice { model: String::new(), base_url: OLLAMA_URL.into() } }

impl Default for StoredSettings {
    fn default() -> Self {
        Self {
            version: SETTINGS_VERSION,
            provider: None,
            careful: default_careful(),
            anthropic: default_anthropic(),
            openai_compatible: EndpointChoice::default(),
            local: default_local(),
            chatgpt: ChatGptChoice::default(),
        }
    }
}

/// The settings file before providers (one OpenAI-compatible endpoint, its
/// key in the clear).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacySettings {
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    base_url: String,
}

/// A key the web view may know about.
#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyState {
    pub has_key: bool,
    pub key_hint: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptView {
    pub client_id: String,
    pub model: String,
    pub redirect_port: u16,
    pub authorize_url: String,
    pub token_url: String,
    pub responses_url: String,
    pub signed_in: bool,
    pub account: Option<String>,
    /// False without a client id; `reason` says why.
    pub available: bool,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnthropicView {
    pub model: String,
    #[serde(flatten)]
    pub key: KeyState,
    pub suggested_models: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointView {
    pub model: String,
    pub base_url: String,
    #[serde(flatten)]
    pub key: KeyState,
}

/// What `get_ai_settings` returns: everything but the secrets.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub provider: Option<String>,
    pub careful: String,
    pub anthropic: AnthropicView,
    pub openai_compatible: EndpointView,
    pub local: EndpointView,
    pub chatgpt: ChatGptView,
    /// The chosen provider has what it needs to answer.
    pub connected: bool,
    /// "Claude · claude-opus-5-5", or why it isn't connected.
    pub status: String,
}

/// A change from the settings page; anything left out stays as it is.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettingsInput {
    /// Some(None) clears the choice.
    #[serde(default, deserialize_with = "double_option")]
    pub provider: Option<Option<String>>,
    pub careful: Option<String>,
    pub anthropic: Option<ModelPatch>,
    pub openai_compatible: Option<EndpointPatch>,
    pub local: Option<EndpointPatch>,
    pub chatgpt: Option<ChatGptPatch>,
}

fn double_option<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<Option<String>>, D::Error> {
    Ok(Some(Option::<String>::deserialize(deserializer)?))
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelPatch {
    pub model: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointPatch {
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptPatch {
    pub client_id: Option<String>,
    pub model: Option<String>,
    pub redirect_port: Option<u16>,
    pub authorize_url: Option<String>,
    pub token_url: Option<String>,
    pub responses_url: Option<String>,
}

pub const PROVIDERS: [&str; 4] = ["chatgpt", "anthropic", "openai_compatible", "local"];

fn key_name(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some(ANTHROPIC_KEY),
        "openai_compatible" => Some(OPENAI_KEY),
        _ => None,
    }
}

fn key_state(provider: &str) -> KeyState {
    let secret = key_name(provider).and_then(credentials::load);
    KeyState { has_key: secret.is_some(), key_hint: secret.as_deref().map(credentials::hint) }
}

pub fn is_loopback(base_url: &str) -> bool {
    let rest = base_url.trim().trim_start_matches("http://").trim_start_matches("https://");
    if rest.starts_with("[::1]") {
        return true;
    }
    let host = rest.split(['/', ':']).next().unwrap_or_default().to_ascii_lowercase();
    host == "127.0.0.1" || host == "localhost"
}

fn normalize(mut stored: StoredSettings) -> StoredSettings {
    stored.version = SETTINGS_VERSION;
    if stored.provider.as_deref().is_some_and(|p| !PROVIDERS.contains(&p)) {
        stored.provider = None;
    }
    if !["careful", "balanced", "quick"].contains(&stored.careful.as_str()) {
        stored.careful = default_careful();
    }
    for endpoint in [&mut stored.openai_compatible, &mut stored.local] {
        endpoint.model = endpoint.model.trim().to_string();
        endpoint.base_url = endpoint.base_url.trim().trim_end_matches('/').to_string();
    }
    stored.anthropic.model = stored.anthropic.model.trim().to_string();
    if stored.anthropic.model.is_empty() {
        stored.anthropic.model = ANTHROPIC_DEFAULT_MODEL.into();
    }
    if stored.local.base_url.is_empty() {
        stored.local.base_url = OLLAMA_URL.into();
    }
    stored.chatgpt.client_id = stored.chatgpt.client_id.trim().to_string();
    stored
}

/// Reads the settings file, moving an old one's key into Credential Manager
/// and rewriting the file without it.
pub fn load_stored(app: &AppHandle) -> Result<StoredSettings, String> {
    let path = settings_file(app)?;
    let Ok(raw) = fs::read_to_string(&path) else { return Ok(StoredSettings::default()) };
    let (stored, migrated) = parse_stored(&raw, |secret| credentials::store(OPENAI_KEY, secret))?;
    if migrated {
        write_stored(app, &stored)?;
    }
    Ok(stored)
}

/// The file's text as settings, and whether it was the old shape (whose key
/// has been handed to `keep_key`).
pub fn parse_stored(raw: &str, keep_key: impl FnOnce(&str) -> Result<(), String>) -> Result<(StoredSettings, bool), String> {
    let value: Value = serde_json::from_str(raw).map_err(|error| format!("Failed to parse AI settings: {error}"))?;
    if value.get("version").and_then(Value::as_u64).unwrap_or(0) >= 2 || value.get("provider").is_some() {
        let stored = serde_json::from_value::<StoredSettings>(value).map_err(|error| format!("Failed to parse AI settings: {error}"))?;
        return Ok((normalize(stored), false));
    }
    let legacy = serde_json::from_value::<LegacySettings>(value).map_err(|error| format!("Failed to parse AI settings: {error}"))?;
    let mut stored = StoredSettings::default();
    let base_url = legacy.base_url.trim().trim_end_matches('/').to_string();
    let key = legacy.api_key.trim();
    if !base_url.is_empty() && is_loopback(&base_url) && key.is_empty() {
        stored.local = EndpointChoice { model: legacy.model.trim().into(), base_url };
        stored.provider = Some("local".into());
    } else {
        stored.openai_compatible = EndpointChoice { model: legacy.model.trim().into(), base_url };
        if !key.is_empty() {
            keep_key(key)?;
            stored.provider = Some("openai_compatible".into());
        }
    }
    Ok((normalize(stored), true))
}

fn write_stored(app: &AppHandle, stored: &StoredSettings) -> Result<(), String> {
    let path = settings_file(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("Failed to create {}: {error}", parent.display()))?;
    }
    let content = serde_json::to_string_pretty(stored).map_err(|error| format!("Failed to serialize AI settings: {error}"))?;
    // Atomic like every other file under the app data dir.
    crate::runtime::write_file_atomically(&path, content).map_err(|error| format!("Failed to save AI settings: {error}"))
}

pub fn view(stored: &StoredSettings) -> AiSettings {
    let anthropic_key = key_state("anthropic");
    let openai_key = key_state("openai_compatible");
    let chatgpt_signed_in = credentials::load(chatgpt::REFRESH_TOKEN).is_some() || credentials::load(chatgpt::ACCESS_TOKEN).is_some();
    let available = !stored.chatgpt.client_id.is_empty();
    let (connected, status) = match stored.provider.as_deref() {
        Some("anthropic") if anthropic_key.has_key => (true, format!("Claude · {}", stored.anthropic.model)),
        Some("anthropic") => (false, "Claude · needs an API key".into()),
        Some("openai_compatible") if openai_key.has_key && !stored.openai_compatible.base_url.is_empty() && !stored.openai_compatible.model.is_empty() => {
            (true, format!("{} · {}", host_of(&stored.openai_compatible.base_url), stored.openai_compatible.model))
        }
        Some("openai_compatible") => (false, "OpenAI-compatible · needs a key, model and address".into()),
        Some("local") if !stored.local.model.is_empty() => (true, format!("On this PC · {}", stored.local.model)),
        Some("local") => (false, "On this PC · pick a model".into()),
        Some("chatgpt") if available && chatgpt_signed_in => (true, format!("ChatGPT{}", stored.chatgpt.account.as_ref().map(|a| format!(" · {a}")).unwrap_or_default())),
        Some("chatgpt") => (false, "ChatGPT · not signed in".into()),
        _ => (false, "not connected".into()),
    };
    AiSettings {
        provider: stored.provider.clone(),
        careful: stored.careful.clone(),
        anthropic: AnthropicView { model: stored.anthropic.model.clone(), key: anthropic_key, suggested_models: ANTHROPIC_SUGGESTED_MODELS.iter().map(|m| m.to_string()).collect() },
        openai_compatible: EndpointView { model: stored.openai_compatible.model.clone(), base_url: stored.openai_compatible.base_url.clone(), key: openai_key },
        local: EndpointView { model: stored.local.model.clone(), base_url: stored.local.base_url.clone(), key: KeyState { has_key: false, key_hint: None } },
        chatgpt: ChatGptView {
            client_id: stored.chatgpt.client_id.clone(),
            model: stored.chatgpt.model.clone(),
            redirect_port: stored.chatgpt.redirect_port,
            authorize_url: stored.chatgpt.authorize_url.clone(),
            token_url: stored.chatgpt.token_url.clone(),
            responses_url: stored.chatgpt.responses_url.clone(),
            signed_in: chatgpt_signed_in,
            account: stored.chatgpt.account.clone(),
            available,
            reason: (!available).then(|| "Needs OpenAI's approval for this app".to_string()),
        },
        connected,
        status,
    }
}

fn host_of(base_url: &str) -> String {
    base_url.trim_start_matches("https://").trim_start_matches("http://").split('/').next().unwrap_or(base_url).to_string()
}

pub fn load_settings(app: &AppHandle) -> Result<AiSettings, String> {
    Ok(view(&load_stored(app)?))
}

pub fn apply_patch(stored: &mut StoredSettings, input: AiSettingsInput) {
    if let Some(provider) = input.provider {
        stored.provider = provider;
    }
    if let Some(careful) = input.careful {
        stored.careful = careful;
    }
    if let Some(patch) = input.anthropic {
        if let Some(model) = patch.model { stored.anthropic.model = model; }
    }
    for (target, patch) in [(&mut stored.openai_compatible, input.openai_compatible), (&mut stored.local, input.local)] {
        if let Some(patch) = patch {
            if let Some(model) = patch.model { target.model = model; }
            if let Some(base_url) = patch.base_url { target.base_url = base_url; }
        }
    }
    if let Some(patch) = input.chatgpt {
        if let Some(value) = patch.client_id { stored.chatgpt.client_id = value; }
        if let Some(value) = patch.model { stored.chatgpt.model = value; }
        if let Some(value) = patch.redirect_port { stored.chatgpt.redirect_port = value; }
        if let Some(value) = patch.authorize_url { stored.chatgpt.authorize_url = value; }
        if let Some(value) = patch.token_url { stored.chatgpt.token_url = value; }
        if let Some(value) = patch.responses_url { stored.chatgpt.responses_url = value; }
    }
    *stored = normalize(stored.clone());
}

pub fn save_settings(app: &AppHandle, input: AiSettingsInput) -> Result<AiSettings, String> {
    let mut stored = load_stored(app)?;
    apply_patch(&mut stored, input);
    write_stored(app, &stored)?;
    Ok(view(&stored))
}

pub fn set_key(app: &AppHandle, provider: &str, key: &str) -> Result<AiSettings, String> {
    let name = key_name(provider).ok_or_else(|| format!("{provider} doesn't use a key."))?;
    credentials::store(name, key.trim())?;
    let mut stored = load_stored(app)?;
    if !key.trim().is_empty() {
        stored.provider = Some(provider.to_string());
    }
    write_stored(app, &stored)?;
    Ok(view(&stored))
}

/// "Sign out · forget keys": every key and token goes, and no provider is chosen.
pub fn forget_credentials(app: &AppHandle) -> Result<AiSettings, String> {
    for name in [ANTHROPIC_KEY, OPENAI_KEY, chatgpt::ACCESS_TOKEN, chatgpt::REFRESH_TOKEN] {
        credentials::forget(name)?;
    }
    let mut stored = load_stored(app)?;
    stored.provider = None;
    stored.chatgpt.account = None;
    stored.chatgpt.expires_at = None;
    write_stored(app, &stored)?;
    Ok(view(&stored))
}

// ---- Requests.

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMappingRequest {
    pub user_prompt: String,
    pub current_config: Option<String>,
    pub current_profile_name: Option<String>,
    pub include_current_config: Option<bool>,
    pub conversation_history: Option<Vec<ConversationMessage>>,
    pub locale: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateMappingResponse {
    pub summary: String,
    pub config_text: String,
    pub assumptions: Vec<String>,
    pub warnings: Vec<String>,
    pub unchanged: Vec<String>,
    pub model: String,
    pub provider: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelResponse {
    #[serde(default)]
    summary: String,
    #[serde(default, alias = "config_text")]
    config_text: String,
    #[serde(default)]
    assumptions: Vec<String>,
    #[serde(default)]
    warnings: Vec<String>,
    #[serde(default)]
    unchanged: Vec<String>,
}

/// The reply's shape, for Claude's structured outputs and ChatGPT's text format.
pub fn response_schema() -> Value {
    let strings = json!({ "type": "array", "items": { "type": "string" } });
    json!({
        "type": "object",
        "properties": {
            "summary": { "type": "string" },
            "configText": { "type": "string" },
            "assumptions": strings,
            "warnings": strings,
            "unchanged": strings,
        },
        "required": ["summary", "configText", "assumptions", "warnings", "unchanged"],
        "additionalProperties": false,
    })
}

/// Claude's effort for "How careful the assistant is".
pub fn effort_for(careful: &str) -> &'static str {
    match careful {
        "quick" => "low",
        "balanced" => "medium",
        _ => "high",
    }
}

/// A temperature for the OpenAI-compatible and local servers.
pub fn temperature_for(careful: &str) -> f32 {
    match careful {
        "quick" => 0.6,
        "balanced" => 0.3,
        _ => 0.1,
    }
}

/// Models that take `output_config.effort` (Haiku 4.5 rejects it).
fn claude_takes_effort(model: &str) -> bool {
    !model.starts_with("claude-haiku-4") && !model.starts_with("claude-3")
}

/// Models with the server-side refusal fallback, sent as `fallbacks: "default"`.
pub fn claude_has_fallbacks(model: &str) -> bool {
    ["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"].contains(&model)
}

fn build_user_prompt(request: &GenerateMappingRequest) -> String {
    let explanation_language = match request.locale.as_deref() {
        Some(locale) if locale.to_ascii_lowercase().starts_with("zh") => "Simplified Chinese",
        _ => "English",
    };
    let include_current = request.include_current_config.unwrap_or(true);
    let profile_name = request.current_profile_name.as_deref().unwrap_or("Unsaved profile");
    let current_config = if include_current { normalize_current_config(request.current_config.as_deref()) } else { None };
    let current_config_block = match current_config {
        Some(config) => format!("Current profile name: {profile_name}\nCurrent profile text (full profile, preserve unrelated lines when practical):\n```txt\n{config}\n```"),
        None => "Current profile text: none supplied. Start from scratch.".to_string(),
    };
    format!(
        "Generate a json object for the latest turn of a JoyShockMapper mapping conversation.\n\
Explain summary, assumptions, and warnings in {explanation_language}.\n\
Use conservative defaults when the request is underspecified.\n\
{current_config_block}\n\n\
{QUICK_REFERENCE}\n\
Latest user request:\n{}\n",
        request.user_prompt.trim()
    )
}

/// The conversation as alternating user / assistant turns, starting with the
/// user and ending with the new request (the shape every provider accepts).
pub fn conversation(request: &GenerateMappingRequest) -> Vec<(String, String)> {
    let mut turns: Vec<(String, String)> = Vec::new();
    for entry in request.conversation_history.iter().flatten() {
        let role = entry.role.trim().to_ascii_lowercase();
        let content = entry.content.trim();
        if content.is_empty() || !matches!(role.as_str(), "user" | "assistant") {
            continue;
        }
        if turns.is_empty() && role == "assistant" {
            continue;
        }
        match turns.last_mut() {
            Some((last, text)) if *last == role => {
                text.push_str("\n\n");
                text.push_str(content);
            }
            _ => turns.push((role, content.to_string())),
        }
    }
    let prompt = build_user_prompt(request);
    match turns.last_mut() {
        Some((last, text)) if last == "user" => {
            text.push_str("\n\n");
            text.push_str(&prompt);
        }
        _ => turns.push(("user".into(), prompt)),
    }
    turns
}

/// `POST /v1/messages` for Claude: no temperature (current models reject it),
/// effort for "How careful", structured output for the reply, room for
/// thinking, and the refusal fallback where the model has one.
pub fn build_anthropic_request(model: &str, careful: &str, request: &GenerateMappingRequest) -> Value {
    let messages: Vec<Value> = conversation(request).into_iter().map(|(role, content)| json!({ "role": role, "content": content })).collect();
    let mut output_config = json!({ "format": { "type": "json_schema", "schema": response_schema() } });
    if claude_takes_effort(model) {
        output_config["effort"] = json!(effort_for(careful));
    }
    let mut body = json!({
        "model": model,
        "max_tokens": ANTHROPIC_MAX_TOKENS,
        "system": SYSTEM_PROMPT,
        "messages": messages,
        "output_config": output_config,
    });
    if claude_has_fallbacks(model) {
        body["fallbacks"] = json!("default");
    }
    body
}

/// `POST {base}/chat/completions` for OpenAI-compatible and local servers.
pub fn build_chat_request(model: &str, careful: &str, request: &GenerateMappingRequest, local: bool) -> Value {
    let mut messages = vec![json!({ "role": "system", "content": SYSTEM_PROMPT })];
    messages.extend(conversation(request).into_iter().map(|(role, content)| json!({ "role": role, "content": content })));
    json!({
        "model": model,
        "temperature": temperature_for(careful),
        "max_tokens": if local { 4096 } else { 8000 },
        "messages": messages,
    })
}

/// Claude's reply text, refusing to read past a refusal or a cut-off answer.
pub fn parse_anthropic_response(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).map_err(|error| format!("Claude answered something unexpected: {error}"))?;
    match value.get("stop_reason").and_then(Value::as_str) {
        Some("refusal") => {
            let explanation = value.pointer("/stop_details/explanation").and_then(Value::as_str).unwrap_or("");
            return Err(format!("Claude declined this request.{}", if explanation.is_empty() { String::new() } else { format!(" {explanation}") }));
        }
        Some("max_tokens") => return Err("Claude's answer was cut off before it finished. Ask for a smaller change.".into()),
        _ => {}
    }
    let text: String = value
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .collect();
    if text.trim().is_empty() {
        return Err("Claude returned no answer.".into());
    }
    Ok(text)
}

pub fn parse_chat_response(body: &str) -> Result<String, String> {
    let value: Value = serde_json::from_str(body).map_err(|error| format!("The model answered something unexpected: {error}"))?;
    value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or_else(|| "The model returned no answer.".to_string())
}

/// Model ids from `GET /models` (OpenAI-compatible, Ollama, LM Studio and
/// Anthropic all answer `{"data": [{"id": …}]}`).
pub fn parse_models(body: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(body) else { return Vec::new() };
    let mut ids: Vec<String> = value
        .get("data")
        .or_else(|| value.get("models"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|model| model.get("id").or_else(|| model.get("name")).and_then(Value::as_str).map(str::to_string))
        .collect();
    ids.dedup();
    ids
}

fn parse_model_response(raw_content: &str) -> Result<ModelResponse, String> {
    let payload = extract_json_payload(raw_content);
    serde_json::from_str::<ModelResponse>(&payload).map_err(|error| format!("The model's answer wasn't the expected json: {error}. It said: {}", raw_content.trim().chars().take(400).collect::<String>()))
}

/// Tolerant for local servers that wrap json in fences or prose.
fn extract_json_payload(raw_content: &str) -> String {
    let trimmed = raw_content.trim();
    let without_fences = trimmed.trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    match (without_fences.find('{'), without_fences.rfind('}')) {
        (Some(start), Some(end)) if end >= start => without_fences[start..=end].to_string(),
        _ => without_fences.to_string(),
    }
}

fn normalize_current_config(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(if trimmed.chars().count() > MAX_CONFIG_CHARS {
        format!("{}\n# ... truncated by the app before sending to the model", trimmed.chars().take(MAX_CONFIG_CHARS).collect::<String>())
    } else {
        trimmed.to_string()
    })
}

fn trim_list(items: Vec<String>) -> Vec<String> {
    items.into_iter().map(|item| item.trim().to_string()).filter(|item| !item.is_empty()).collect()
}

fn extract_api_error(body: &str) -> String {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.pointer("/error/message").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_else(|| body.trim().chars().take(400).collect())
}

fn client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder().timeout(Duration::from_secs(timeout_secs)).build().map_err(|error| format!("Failed to initialize HTTP client: {error}"))
}

fn anthropic_headers(builder: reqwest::RequestBuilder, key: &str) -> reqwest::RequestBuilder {
    builder.header("x-api-key", key).header("anthropic-version", ANTHROPIC_VERSION)
}

async fn read(response: reqwest::Response, who: &str) -> Result<String, String> {
    let status = response.status();
    let body = response.text().await.map_err(|error| format!("Failed to read {who}'s answer: {error}"))?;
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => format!("{who} didn't accept the key ({}): {}", status.as_u16(), extract_api_error(&body)),
            code => format!("{who} answered {code}: {}", extract_api_error(&body)),
        });
    }
    Ok(body)
}

fn finish(raw: &str, model: &str, provider: &str) -> Result<GenerateMappingResponse, String> {
    let parsed = parse_model_response(raw)?;
    let config_text = parsed.config_text.trim().to_string();
    if config_text.is_empty() {
        return Err("The model returned no configuration text.".into());
    }
    Ok(GenerateMappingResponse {
        summary: parsed.summary.trim().to_string(),
        config_text,
        assumptions: trim_list(parsed.assumptions),
        warnings: trim_list(parsed.warnings),
        unchanged: trim_list(parsed.unchanged),
        model: model.to_string(),
        provider: provider.to_string(),
    })
}

pub async fn generate_mapping(app: &AppHandle, request: GenerateMappingRequest) -> Result<GenerateMappingResponse, String> {
    if request.user_prompt.trim().is_empty() {
        return Err("Describe the change you want first.".into());
    }
    let stored = load_stored(app)?;
    let provider = stored.provider.clone().ok_or("The assistant isn't set up yet. Choose how it connects in Settings ▸ Assistant.")?;
    match provider.as_str() {
        "anthropic" => {
            let key = credentials::load(ANTHROPIC_KEY).ok_or("Add your Claude API key in Settings ▸ Assistant first.")?;
            let model = stored.anthropic.model.clone();
            let mut call = anthropic_headers(client(ANTHROPIC_TIMEOUT_SECS)?.post(format!("{ANTHROPIC_API}/messages")), &key).json(&build_anthropic_request(&model, &stored.careful, &request));
            if claude_has_fallbacks(&model) {
                call = call.header("anthropic-beta", "server-side-fallback-2026-07-01");
            }
            let body = read(call.send().await.map_err(|error| format!("Couldn't reach Claude: {error}"))?, "Claude").await?;
            finish(&parse_anthropic_response(&body)?, &model, &provider)
        }
        "openai_compatible" | "local" => {
            let local = provider == "local";
            let endpoint = if local { &stored.local } else { &stored.openai_compatible };
            if endpoint.base_url.is_empty() || endpoint.model.is_empty() {
                return Err("Choose a model and address in Settings ▸ Assistant first.".into());
            }
            let key = if local { None } else { credentials::load(OPENAI_KEY) };
            if key.is_none() && !is_loopback(&endpoint.base_url) {
                return Err("Add the provider's API key in Settings ▸ Assistant first.".into());
            }
            let mut call = client(if local { LOCAL_TIMEOUT_SECS } else { OPENAI_TIMEOUT_SECS })?
                .post(format!("{}/chat/completions", endpoint.base_url))
                .json(&build_chat_request(&endpoint.model, &stored.careful, &request, local));
            if let Some(key) = key {
                call = call.bearer_auth(key);
            }
            let who = if local { "The model on this PC" } else { "The provider" };
            let body = read(call.send().await.map_err(|error| format!("Couldn't reach {}: {error}", endpoint.base_url))?, who).await?;
            finish(&parse_chat_response(&body)?, &endpoint.model, &provider)
        }
        "chatgpt" => {
            let model = stored.chatgpt.model.clone();
            let raw = chatgpt_generate(app, &stored, &request).await?;
            finish(&raw, &model, &provider)
        }
        other => Err(format!("Unknown assistant provider {other}.")),
    }
}

// ---- ChatGPT.

async fn chatgpt_access_token(app: &AppHandle, stored: &StoredSettings, force_refresh: bool) -> Result<String, String> {
    let expired = stored.chatgpt.expires_at.is_some_and(|at| at <= chatgpt::now_secs() + 30);
    if !force_refresh && !expired {
        if let Some(token) = credentials::load(chatgpt::ACCESS_TOKEN) {
            return Ok(token);
        }
    }
    let refresh = credentials::load(chatgpt::REFRESH_TOKEN).ok_or("Sign in with ChatGPT again in Settings ▸ Assistant.")?;
    let tokens = chatgpt::post_token(&client(30)?, &stored.chatgpt.token_url, &chatgpt::refresh_form(&refresh, &stored.chatgpt.client_id)).await?;
    save_tokens(app, &tokens)?;
    Ok(tokens.access_token)
}

fn save_tokens(app: &AppHandle, tokens: &chatgpt::TokenResponse) -> Result<(), String> {
    credentials::store(chatgpt::ACCESS_TOKEN, &tokens.access_token)?;
    if let Some(refresh) = &tokens.refresh_token {
        credentials::store(chatgpt::REFRESH_TOKEN, refresh)?;
    }
    let mut stored = load_stored(app)?;
    stored.chatgpt.expires_at = tokens.expires_in.map(|seconds| chatgpt::now_secs() + seconds);
    if let Some(account) = tokens.id_token.as_deref().and_then(chatgpt::account_label) {
        stored.chatgpt.account = Some(account);
    }
    write_stored(app, &stored)
}

async fn chatgpt_generate(app: &AppHandle, stored: &StoredSettings, request: &GenerateMappingRequest) -> Result<String, String> {
    if stored.chatgpt.client_id.is_empty() {
        return Err("Continue with ChatGPT needs OpenAI's approval for this app.".into());
    }
    let input: Vec<Value> = conversation(request).into_iter().map(|(role, content)| json!({ "role": role, "content": content })).collect();
    let body = chatgpt::build_responses_request(&stored.chatgpt.model, SYSTEM_PROMPT, input, &response_schema());
    let http = client(OPENAI_TIMEOUT_SECS)?;
    for attempt in 0..2 {
        let token = chatgpt_access_token(app, stored, attempt > 0).await?;
        let response = http
            .post(&stored.chatgpt.responses_url)
            .bearer_auth(token)
            .header("accept", "text/event-stream")
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("Couldn't reach ChatGPT: {error}"))?;
        if response.status().as_u16() == 401 && attempt == 0 {
            continue;
        }
        let text = read(response, "ChatGPT").await?;
        return chatgpt::parse_responses_stream(&text);
    }
    Err("ChatGPT didn't accept the sign-in. Sign in again in Settings ▸ Assistant.".into())
}

/// The whole sign-in: listen, open the browser, wait, exchange, store.
pub async fn chatgpt_sign_in(app: &AppHandle) -> Result<AiSettings, String> {
    let stored = load_stored(app)?;
    if stored.chatgpt.client_id.is_empty() {
        return Err("Continue with ChatGPT needs OpenAI's approval for this app.".into());
    }
    let _guard = chatgpt::SignInGuard::begin()?;
    let (listener, port) = chatgpt::bind(stored.chatgpt.redirect_port)?;
    let pkce = chatgpt::new_pkce()?;
    let state = chatgpt::new_state()?;
    let redirect = chatgpt::redirect_uri(port);
    let url = chatgpt::authorize_url(&stored.chatgpt.authorize_url, &stored.chatgpt.client_id, &redirect, &pkce, &state);
    open::that(&url).map_err(|error| format!("Couldn't open the browser: {error}"))?;
    let code = tauri::async_runtime::spawn_blocking(move || chatgpt::wait_for_code(listener, &state, chatgpt::sign_in_timeout()))
        .await
        .map_err(|error| error.to_string())??;
    let tokens = chatgpt::post_token(&client(30)?, &stored.chatgpt.token_url, &chatgpt::exchange_form(&code, &redirect, &stored.chatgpt.client_id, &pkce.verifier)).await?;
    save_tokens(app, &tokens)?;
    let mut stored = load_stored(app)?;
    stored.provider = Some("chatgpt".into());
    write_stored(app, &stored)?;
    Ok(view(&stored))
}

// ---- Test and detect.

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTest {
    pub ok: bool,
    pub models: Vec<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalServer {
    /// "Ollama" or "LM Studio".
    pub name: String,
    pub base_url: String,
    pub models: Vec<String>,
}

async fn list_models(url: String, key: Option<(String, bool)>, timeout: Duration) -> Result<Vec<String>, String> {
    let http = Client::builder().timeout(timeout).build().map_err(|error| error.to_string())?;
    let mut call = http.get(&url);
    match key {
        Some((key, true)) => call = anthropic_headers(call, &key),
        Some((key, false)) => call = call.bearer_auth(key),
        None => {}
    }
    let response = call.send().await.map_err(|error| format!("Couldn't reach {url}: {error}"))?;
    let body = read(response, "The server").await?;
    Ok(parse_models(&body))
}

pub async fn test_connection(app: &AppHandle, provider: &str) -> Result<ConnectionTest, String> {
    let stored = load_stored(app)?;
    let timeout = Duration::from_secs(TEST_TIMEOUT_SECS);
    let result = match provider {
        "anthropic" => match credentials::load(ANTHROPIC_KEY) {
            Some(key) => list_models(format!("{ANTHROPIC_API}/models?limit=100"), Some((key, true)), timeout).await,
            None => Err("Paste your Claude API key first.".into()),
        },
        "openai_compatible" => {
            let endpoint = &stored.openai_compatible;
            if endpoint.base_url.is_empty() {
                Err("Add the provider's address first.".into())
            } else {
                let key = credentials::load(OPENAI_KEY);
                if key.is_none() && !is_loopback(&endpoint.base_url) {
                    Err("Add the provider's API key first.".into())
                } else {
                    list_models(format!("{}/models", endpoint.base_url), key.map(|key| (key, false)), timeout).await
                }
            }
        }
        "local" => list_models(format!("{}/models", stored.local.base_url), None, timeout).await,
        "chatgpt" => {
            if stored.chatgpt.client_id.is_empty() {
                Err("Needs OpenAI's approval for this app".into())
            } else {
                chatgpt_access_token(app, &stored, false).await.map(|_| vec![stored.chatgpt.model.clone()])
            }
        }
        other => Err(format!("Unknown assistant provider {other}.")),
    };
    Ok(match result {
        Ok(models) => ConnectionTest { ok: true, models, error: None },
        Err(error) => ConnectionTest { ok: false, models: Vec::new(), error: Some(error) },
    })
}

/// Ollama and LM Studio, if either is running here.
pub async fn detect_local_models() -> Vec<LocalServer> {
    let timeout = Duration::from_millis(DETECT_TIMEOUT_MS);
    let ollama = list_models(format!("{OLLAMA_URL}/models"), None, timeout).await;
    let lm_studio = list_models(format!("{LM_STUDIO_URL}/models"), None, timeout).await;
    let mut found = Vec::new();
    if let Ok(models) = ollama {
        found.push(LocalServer { name: "Ollama".into(), base_url: OLLAMA_URL.into(), models });
    }
    if let Ok(models) = lm_studio {
        found.push(LocalServer { name: "LM Studio".into(), base_url: LM_STUDIO_URL.into(), models });
    }
    found
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| format!("Failed to resolve app data directory: {error}"))?.join(AI_SETTINGS_FILE_NAME))
}

// ---- Commands (the provider ones; get/save/generate stay in commands.rs).

#[tauri::command]
pub fn set_ai_key(app: AppHandle, provider: String, key: String) -> Result<AiSettings, String> {
    set_key(&app, &provider, &key)
}

#[tauri::command]
pub fn forget_ai_credentials(app: AppHandle) -> Result<AiSettings, String> {
    forget_credentials(&app)
}

#[tauri::command]
pub async fn test_ai_connection(app: AppHandle, provider: String) -> Result<ConnectionTest, String> {
    test_connection(&app, &provider).await
}

#[tauri::command]
pub async fn detect_local_ai_models() -> Vec<LocalServer> {
    detect_local_models().await
}

#[tauri::command]
pub async fn chatgpt_sign_in_command(app: AppHandle) -> Result<AiSettings, String> {
    chatgpt_sign_in(&app).await
}

#[tauri::command]
pub fn chatgpt_cancel_sign_in() {
    chatgpt::cancel();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(prompt: &str, history: Vec<(&str, &str)>) -> GenerateMappingRequest {
        GenerateMappingRequest {
            user_prompt: prompt.into(),
            current_config: Some("RESET_MAPPINGS\nW = R\n".into()),
            current_profile_name: Some("Wardogs".into()),
            include_current_config: Some(true),
            conversation_history: Some(history.into_iter().map(|(role, content)| ConversationMessage { role: role.into(), content: content.into() }).collect()),
            locale: Some("en".into()),
        }
    }

    #[test]
    fn claude_requests_use_effort_and_structured_output_never_temperature() {
        let body = build_anthropic_request("claude-opus-5-5", "careful", &request("Put reload on a back button", vec![]));
        assert_eq!(body["model"], json!("claude-opus-5-5"));
        assert_eq!(body["max_tokens"], json!(16000));
        assert!(body.get("temperature").is_none() && body.get("top_p").is_none());
        assert!(body.get("thinking").is_none(), "thinking is always on for Opus 5.5; disabling it is a 400");
        assert_eq!(body["output_config"]["effort"], json!("high"));
        assert_eq!(body["output_config"]["format"]["type"], json!("json_schema"));
        assert_eq!(body["output_config"]["format"]["schema"]["required"].as_array().unwrap().len(), 5);
        assert_eq!(body["fallbacks"], json!("default"));
        assert!(body["system"].as_str().unwrap().contains("JoyShockMapper"));
        let messages = body["messages"].as_array().unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], json!("user"));
        assert!(messages[0]["content"].as_str().unwrap().contains("Put reload on a back button"));
        assert!(messages[0]["content"].as_str().unwrap().contains("W = R"));

        assert_eq!(build_anthropic_request("claude-sonnet-5-5", "quick", &request("x", vec![]))["output_config"]["effort"], json!("low"));
        assert_eq!(build_anthropic_request("claude-sonnet-5-5", "balanced", &request("x", vec![]))["output_config"]["effort"], json!("medium"));
        let haiku = build_anthropic_request("claude-haiku-4-5", "careful", &request("x", vec![]));
        assert!(haiku["output_config"].get("effort").is_none(), "Haiku 4.5 rejects effort");
        assert!(haiku.get("fallbacks").is_none());
    }

    #[test]
    fn conversations_alternate_and_start_with_the_person() {
        let turns = conversation(&request("and now jump", vec![("assistant", "stray"), ("user", "a"), ("user", "b"), ("assistant", "done"), ("system", "no")]));
        assert_eq!(turns.iter().map(|(role, _)| role.as_str()).collect::<Vec<_>>(), ["user", "assistant", "user"]);
        assert!(turns[0].1.contains("a\n\nb"));
        assert!(turns[2].1.contains("and now jump"));
    }

    #[test]
    fn chat_requests_carry_a_temperature_from_how_careful() {
        let body = build_chat_request("gpt-4.1", "careful", &request("x", vec![]), false);
        assert_eq!(body["messages"][0]["role"], json!("system"));
        assert!((body["temperature"].as_f64().unwrap() - 0.1).abs() < 1e-6);
        assert_eq!(body["max_tokens"], json!(8000));
        assert_eq!(build_chat_request("llama3", "quick", &request("x", vec![]), true)["max_tokens"], json!(4096));
    }

    #[test]
    fn claude_answers_are_read_only_after_checking_why_it_stopped() {
        let ok = r#"{"content":[{"type":"thinking","thinking":""},{"type":"text","text":"{\"summary\":\"s\"}"}],"stop_reason":"end_turn"}"#;
        assert_eq!(parse_anthropic_response(ok).unwrap(), "{\"summary\":\"s\"}");
        let refused = r#"{"content":[],"stop_reason":"refusal","stop_details":{"type":"refusal","category":null,"explanation":"Not this."}}"#;
        assert!(parse_anthropic_response(refused).unwrap_err().contains("declined"));
        assert!(parse_anthropic_response(r#"{"content":[{"type":"text","text":"{"}],"stop_reason":"max_tokens"}"#).unwrap_err().contains("cut off"));
    }

    #[test]
    fn model_lists_read_every_providers_shape() {
        assert_eq!(parse_models(r#"{"data":[{"id":"claude-opus-5-5","display_name":"Claude Opus 5.5"},{"id":"claude-sonnet-5-5"}],"has_more":false}"#), ["claude-opus-5-5", "claude-sonnet-5-5"]);
        assert_eq!(parse_models(r#"{"object":"list","data":[{"id":"llama3.1:8b","object":"model"}]}"#), ["llama3.1:8b"]);
        assert!(parse_models("not json").is_empty());
    }

    #[test]
    fn answers_parse_with_or_without_fences() {
        let reply = finish("```json\n{\"summary\":\"Moved reload\",\"configText\":\"LSR = R\",\"assumptions\":[],\"warnings\":[\" \"],\"unchanged\":[\"W\"]}\n```", "m", "local").unwrap();
        assert_eq!(reply.config_text, "LSR = R");
        assert_eq!(reply.unchanged, ["W"]);
        assert!(reply.warnings.is_empty());
        assert!(finish("{\"summary\":\"x\",\"configText\":\"  \"}", "m", "local").is_err());
    }

    #[test]
    fn the_old_settings_file_moves_its_key_out() {
        let mut kept = String::new();
        let (stored, migrated) = parse_stored(r#"{"apiKey":" sk-old-1234567890 ","model":"gpt-4.1","baseUrl":"https://api.openai.com/v1/","temperature":0.2}"#, |key| { kept = key.to_string(); Ok(()) }).unwrap();
        assert!(migrated);
        assert_eq!(kept, "sk-old-1234567890");
        assert_eq!(stored.provider.as_deref(), Some("openai_compatible"));
        assert_eq!(stored.openai_compatible.base_url, "https://api.openai.com/v1");
        assert_eq!(stored.openai_compatible.model, "gpt-4.1");
        let written = serde_json::to_string(&stored).unwrap();
        assert!(!written.contains("sk-old"), "the key never goes back into the file");

        let (local, _) = parse_stored(r#"{"apiKey":"","model":"llama3","baseUrl":"http://127.0.0.1:11434/v1","temperature":0.2}"#, |_| panic!("no key to keep")).unwrap();
        assert_eq!(local.provider.as_deref(), Some("local"));
        assert_eq!(local.local.model, "llama3");

        let (current, migrated) = parse_stored(r#"{"version":2,"provider":"anthropic","careful":"balanced"}"#, |_| panic!()).unwrap();
        assert!(!migrated);
        assert_eq!(current.anthropic.model, ANTHROPIC_DEFAULT_MODEL);
        assert_eq!(current.careful, "balanced");
    }

    #[test]
    fn patches_change_only_what_they_name() {
        let mut stored = StoredSettings::default();
        apply_patch(&mut stored, serde_json::from_str(r#"{"provider":"local","local":{"model":"qwen"}}"#).unwrap());
        assert_eq!(stored.provider.as_deref(), Some("local"));
        assert_eq!(stored.local.model, "qwen");
        assert_eq!(stored.local.base_url, OLLAMA_URL);
        apply_patch(&mut stored, serde_json::from_str(r#"{"careful":"quick"}"#).unwrap());
        assert_eq!(stored.provider.as_deref(), Some("local"), "an absent provider is left alone");
        apply_patch(&mut stored, serde_json::from_str(r#"{"provider":null}"#).unwrap());
        assert_eq!(stored.provider, None, "null clears it");
        apply_patch(&mut stored, serde_json::from_str(r#"{"provider":"nonsense"}"#).unwrap());
        assert_eq!(stored.provider, None);
    }

    #[test]
    fn loopback_addresses_need_no_key() {
        assert!(is_loopback("http://127.0.0.1:11434/v1"));
        assert!(is_loopback("http://localhost:1234/v1"));
        assert!(!is_loopback("https://api.openai.com/v1"));
        assert!(!is_loopback("http://127.0.0.1.evil.com/v1"));
    }

    #[test]
    fn chatgpt_without_a_client_id_says_why() {
        let mut stored = StoredSettings::default();
        stored.chatgpt.client_id.clear();
        let shown = view(&stored);
        assert!(!shown.chatgpt.available);
        assert_eq!(shown.chatgpt.reason.as_deref(), Some("Needs OpenAI's approval for this app"));
    }
}
