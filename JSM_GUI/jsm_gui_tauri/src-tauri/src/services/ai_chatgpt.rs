//! "Continue with ChatGPT" (console v2, D18; README §6): OAuth 2.0 with PKCE
//! and a loopback redirect, then the Responses API.
//!
//! OpenAI offers plan-billed sign-in to approved apps only, so the flow is
//! built behind a client id the person (or a build) supplies in Settings ▸
//! Assistant. Without one the option stays visible and says why it can't be
//! used. The endpoints are settings too, defaulting to OpenAI's.
//!
//! The flow:
//!   1. A random code_verifier (64 bytes, base64url) and its S256 challenge, and
//!      a random `state`.
//!   2. A one-shot listener on 127.0.0.1 (the registered port, or any free one),
//!      then the authorize URL in the default browser.
//!   3. One GET to the redirect path: its `state` must match, its `code` is
//!      exchanged with the verifier for an access and a refresh token, which go
//!      to Windows Credential Manager. The browser tab is told it can close.
//!   4. Requests use the access token, refreshed when it has expired or a call
//!      answers 401. Sign out forgets both.
//!
//! Requests go to the Responses API only, `stream: true`, `store: false` and no
//! temperature, as the program requires. reqwest is built without its stream
//! feature, so the event stream is read whole and its `data:` lines parsed.

use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::atomic::{AtomicBool, Ordering},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const DEFAULT_AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
pub const DEFAULT_TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
pub const DEFAULT_RESPONSES_URL: &str = "https://api.openai.com/v1/responses";
pub const DEFAULT_REDIRECT_PORT: u16 = 1455;
pub const REDIRECT_PATH: &str = "/auth/callback";
pub const SCOPE: &str = "openid profile email offline_access";
/// How long the browser has to come back.
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

pub const ACCESS_TOKEN: &str = "ai/chatgpt-access";
pub const REFRESH_TOKEN: &str = "ai/chatgpt-refresh";

static CANCEL: AtomicBool = AtomicBool::new(false);
static RUNNING: AtomicBool = AtomicBool::new(false);

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn random_bytes(count: usize) -> Result<Vec<u8>, String> {
    let mut bytes = vec![0u8; count];
    getrandom::getrandom(&mut bytes).map_err(|error| format!("No secure random numbers: {error}"))?;
    Ok(bytes)
}

/// The PKCE pair: a 86-character verifier and its S256 challenge.
#[derive(Debug, Clone)]
pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

pub fn challenge_for(verifier: &str) -> String {
    b64url(&Sha256::digest(verifier.as_bytes()))
}

pub fn new_pkce() -> Result<Pkce, String> {
    let verifier = b64url(&random_bytes(64)?);
    Ok(Pkce { challenge: challenge_for(&verifier), verifier })
}

pub fn new_state() -> Result<String, String> {
    Ok(b64url(&random_bytes(32)?))
}

pub fn percent_encode(text: &str) -> String {
    let mut out = String::new();
    for byte in text.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => out.push(byte as char),
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

pub fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok());
                match hex {
                    Some(value) => {
                        out.push(value);
                        i += 3;
                    }
                    None => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            other => {
                out.push(other);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}{REDIRECT_PATH}")
}

pub fn authorize_url(base: &str, client_id: &str, redirect: &str, pkce: &Pkce, state: &str) -> String {
    let separator = if base.contains('?') { '&' } else { '?' };
    format!(
        "{base}{separator}response_type=code&client_id={}&redirect_uri={}&scope={}&code_challenge={}&code_challenge_method=S256&state={}",
        percent_encode(client_id),
        percent_encode(redirect),
        percent_encode(SCOPE),
        percent_encode(&pkce.challenge),
        percent_encode(state),
    )
}

/// What came back to the redirect: the code, or why not.
#[derive(Debug, PartialEq)]
pub enum Callback {
    Code(String),
    Denied(String),
    /// Not the redirect path (a favicon request): keep waiting.
    Other,
}

/// Reads the request line of one HTTP request and checks `state`.
pub fn parse_callback(request_line: &str, expected_state: &str) -> Result<Callback, String> {
    let target = request_line.split_whitespace().nth(1).unwrap_or_default();
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    if path != REDIRECT_PATH {
        return Ok(Callback::Other);
    }
    let mut code = None;
    let mut state = None;
    let mut error = None;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        let value = percent_decode(value);
        match key {
            "code" => code = Some(value),
            "state" => state = Some(value),
            "error_description" => error = Some(value),
            "error" if error.is_none() => error = Some(value),
            _ => {}
        }
    }
    if state.as_deref() != Some(expected_state) {
        return Err("The sign-in answer didn't match this request, so it was ignored. Try again.".into());
    }
    if let Some(reason) = error {
        return Ok(Callback::Denied(reason));
    }
    code.filter(|code| !code.is_empty()).map(Callback::Code).ok_or_else(|| "The sign-in answer had no code. Try again.".into())
}

fn reply(stream: &mut TcpStream, ok: bool) {
    let body = if ok {
        "<!doctype html><meta charset=utf-8><title>JSM Evolved</title><body style=\"font:16px system-ui;background:#131920;color:#e8eef4;display:grid;place-items:center;height:100vh;margin:0\"><p>Signed in. You can close this tab and go back to JSM Evolved.</p>"
    } else {
        "<!doctype html><meta charset=utf-8><title>JSM Evolved</title><body style=\"font:16px system-ui;background:#131920;color:#e8eef4;display:grid;place-items:center;height:100vh;margin:0\"><p>Sign-in didn't finish. Go back to JSM Evolved to try again.</p>"
    };
    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len());
}

/// Waits on the listener for the redirect, until it arrives, the time runs
/// out or the person cancels from the app.
pub fn wait_for_code(listener: TcpListener, expected_state: &str, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|error| error.to_string())?;
    let started = Instant::now();
    loop {
        if CANCEL.load(Ordering::SeqCst) {
            return Err("Sign-in cancelled.".into());
        }
        if started.elapsed() > timeout {
            return Err("Sign-in timed out. Try again.".into());
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buffer = [0u8; 8192];
                let read = stream.read(&mut buffer).unwrap_or(0);
                let request = String::from_utf8_lossy(&buffer[..read]).into_owned();
                let first = request.lines().next().unwrap_or_default().to_string();
                match parse_callback(&first, expected_state) {
                    Ok(Callback::Other) => {
                        let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                    Ok(Callback::Code(code)) => {
                        reply(&mut stream, true);
                        return Ok(code);
                    }
                    Ok(Callback::Denied(reason)) => {
                        reply(&mut stream, false);
                        return Err(format!("ChatGPT sign-in was refused: {reason}"));
                    }
                    Err(error) => {
                        reply(&mut stream, false);
                        return Err(error);
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(error) => return Err(format!("The sign-in listener failed: {error}")),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    #[serde(default)]
    pub expires_in: Option<u64>,
    #[serde(default)]
    pub id_token: Option<String>,
}

/// The email (or name) inside an id_token, for "Signed in as …". The token is
/// not verified here: it only labels the account, it authorises nothing.
pub fn account_label(id_token: &str) -> Option<String> {
    let payload = id_token.split('.').nth(1)?;
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let claims: Value = serde_json::from_slice(&bytes).ok()?;
    claims.get("email").or_else(|| claims.get("name")).and_then(Value::as_str).map(str::to_string)
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

pub fn exchange_form(code: &str, redirect: &str, client_id: &str, verifier: &str) -> Vec<(&'static str, String)> {
    vec![
        ("grant_type", "authorization_code".into()),
        ("code", code.into()),
        ("redirect_uri", redirect.into()),
        ("client_id", client_id.into()),
        ("code_verifier", verifier.into()),
    ]
}

pub fn refresh_form(refresh_token: &str, client_id: &str) -> Vec<(&'static str, String)> {
    vec![("grant_type", "refresh_token".into()), ("refresh_token", refresh_token.into()), ("client_id", client_id.into())]
}

pub async fn post_token(client: &reqwest::Client, url: &str, form: &[(&'static str, String)]) -> Result<TokenResponse, String> {
    let response = client.post(url).form(form).send().await.map_err(|error| format!("Couldn't reach OpenAI's sign-in: {error}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI's sign-in answered {}: {}", status.as_u16(), body.trim()));
    }
    serde_json::from_str(&body).map_err(|error| format!("OpenAI's sign-in answered something unexpected: {error}"))
}

pub struct SignInGuard;
impl SignInGuard {
    pub fn begin() -> Result<Self, String> {
        if RUNNING.swap(true, Ordering::SeqCst) {
            return Err("A sign-in is already waiting for the browser.".into());
        }
        CANCEL.store(false, Ordering::SeqCst);
        Ok(SignInGuard)
    }
}
impl Drop for SignInGuard {
    fn drop(&mut self) {
        RUNNING.store(false, Ordering::SeqCst);
    }
}

pub fn cancel() {
    CANCEL.store(true, Ordering::SeqCst);
}

/// Binds the loopback listener: the registered port, or any free one when the
/// setting is 0.
pub fn bind(port: u16) -> Result<(TcpListener, u16), String> {
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|error| format!("Couldn't listen on 127.0.0.1:{port} for the sign-in ({error}). Close whatever uses that port and try again."))?;
    let bound = listener.local_addr().map_err(|error| error.to_string())?.port();
    Ok((listener, bound))
}

pub fn sign_in_timeout() -> Duration {
    SIGN_IN_TIMEOUT
}

// ---- Responses API.

/// A Responses API request: streamed, not stored, no temperature, with the
/// reply's shape fixed by a JSON schema.
pub fn build_responses_request(model: &str, instructions: &str, input: Vec<Value>, schema: &Value) -> Value {
    json!({
        "model": model,
        "instructions": instructions,
        "input": input,
        "stream": true,
        "store": false,
        "text": { "format": { "type": "json_schema", "name": "jsm_mapping", "strict": true, "schema": schema } },
    })
}

/// The text of a streamed response: the `response.output_text.delta` events in
/// order, or the finished response's output when no delta arrived.
pub fn parse_responses_stream(body: &str) -> Result<String, String> {
    let mut text = String::new();
    let mut completed: Option<Value> = None;
    for line in body.lines() {
        let Some(data) = line.strip_prefix("data:").map(str::trim) else { continue };
        if data.is_empty() || data == "[DONE]" {
            continue;
        }
        let Ok(event) = serde_json::from_str::<Value>(data) else { continue };
        match event.get("type").and_then(Value::as_str).unwrap_or_default() {
            "response.output_text.delta" => text.push_str(event.get("delta").and_then(Value::as_str).unwrap_or_default()),
            "response.completed" => completed = event.get("response").cloned(),
            "response.failed" | "error" | "response.error" => {
                let message = event
                    .pointer("/response/error/message")
                    .or_else(|| event.pointer("/error/message"))
                    .or_else(|| event.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("ChatGPT couldn't answer.");
                return Err(message.to_string());
            }
            "response.incomplete" => return Err("ChatGPT stopped before finishing its answer. Try a shorter request.".into()),
            "response.refusal.done" => return Err("ChatGPT declined this request.".into()),
            _ => {}
        }
    }
    if text.is_empty() {
        if let Some(response) = completed {
            for item in response.get("output").and_then(Value::as_array).into_iter().flatten() {
                for part in item.get("content").and_then(Value::as_array).into_iter().flatten() {
                    if part.get("type").and_then(Value::as_str) == Some("output_text") {
                        text.push_str(part.get("text").and_then(Value::as_str).unwrap_or_default());
                    }
                }
            }
        }
    }
    if text.trim().is_empty() {
        return Err("ChatGPT returned no answer.".into());
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_follows_rfc_7636() {
        // The RFC's own example.
        assert_eq!(challenge_for("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let pkce = new_pkce().unwrap();
        assert!((43..=128).contains(&pkce.verifier.len()));
        assert!(pkce.verifier.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
        assert_ne!(new_state().unwrap(), new_state().unwrap());
    }

    #[test]
    fn the_authorize_url_carries_everything_encoded() {
        let pkce = Pkce { verifier: "v".into(), challenge: "abc-_".into() };
        let url = authorize_url(DEFAULT_AUTHORIZE_URL, "app 1", &redirect_uri(1455), &pkce, "s/t");
        assert!(url.starts_with("https://auth.openai.com/oauth/authorize?response_type=code&client_id=app%201&"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A1455%2Fauth%2Fcallback"));
        assert!(url.contains("code_challenge=abc-_&code_challenge_method=S256&state=s%2Ft"));
        assert!(url.contains("scope=openid%20profile%20email%20offline_access"));
    }

    #[test]
    fn the_callback_is_checked_against_state() {
        assert_eq!(parse_callback("GET /auth/callback?code=a%2Bb&state=xyz HTTP/1.1", "xyz").unwrap(), Callback::Code("a+b".into()));
        assert!(parse_callback("GET /auth/callback?code=abc&state=other HTTP/1.1", "xyz").is_err());
        assert_eq!(parse_callback("GET /favicon.ico HTTP/1.1", "xyz").unwrap(), Callback::Other);
        assert_eq!(parse_callback("GET /auth/callback?error=access_denied&state=xyz HTTP/1.1", "xyz").unwrap(), Callback::Denied("access_denied".into()));
    }

    #[test]
    fn the_loopback_listener_hands_back_the_code() {
        let (listener, port) = bind(0).unwrap();
        let client = std::thread::spawn(move || {
            let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(stream, "GET /auth/callback?code=the-code&state=st HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
            let mut answer = String::new();
            let _ = stream.read_to_string(&mut answer);
            answer
        });
        assert_eq!(wait_for_code(listener, "st", Duration::from_secs(5)).unwrap(), "the-code");
        assert!(client.join().unwrap().contains("You can close this tab"));
    }

    #[test]
    fn responses_requests_stream_without_storing_or_temperature() {
        let request = build_responses_request("gpt-5", "rules", vec![json!({"role": "user", "content": "hi"})], &json!({"type": "object"}));
        assert_eq!(request["stream"], json!(true));
        assert_eq!(request["store"], json!(false));
        assert!(request.get("temperature").is_none());
        assert_eq!(request["text"]["format"]["type"], json!("json_schema"));
    }

    #[test]
    fn a_streamed_response_is_put_back_together() {
        let body = "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"{\\\"a\\\":\"}\n\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"1}\"}\n\ndata: {\"type\":\"response.completed\",\"response\":{}}\n";
        assert_eq!(parse_responses_stream(body).unwrap(), "{\"a\":1}");
        let completed_only = "data: {\"type\":\"response.completed\",\"response\":{\"output\":[{\"content\":[{\"type\":\"output_text\",\"text\":\"done\"}]}]}}\n";
        assert_eq!(parse_responses_stream(completed_only).unwrap(), "done");
        assert!(parse_responses_stream("data: {\"type\":\"response.failed\",\"response\":{\"error\":{\"message\":\"quota\"}}}\n").unwrap_err().contains("quota"));
    }

    #[test]
    fn the_account_comes_from_the_id_token() {
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"email":"luke@example.com"}"#);
        assert_eq!(account_label(&format!("h.{payload}.s")).as_deref(), Some("luke@example.com"));
        assert_eq!(account_label("nonsense"), None);
    }
}
