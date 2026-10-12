use futures_util::StreamExt;
use serde::Serialize;
use serde_json::json;
use tauri::ipc::Channel;

use crate::settings::Settings;

/// Events streamed from the LLM provider to the frontend.
#[derive(Clone, Serialize)]
#[serde(tag = "type", content = "data", rename_all = "snake_case")]
pub enum LlmEvent {
    Token(String),
    Done,
    Error(String),
}

const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Enough headroom for a 24×24×24 build in symbol rows (~20k tokens).
const ANTHROPIC_MAX_TOKENS: u32 = 16000;

/// Sends one completion request and streams tokens into `on_event`.
pub async fn stream_completion(
    settings: &Settings,
    system: &str,
    user: &str,
    on_event: Channel<LlmEvent>,
) -> Result<(), String> {
    let result = match settings.provider.as_str() {
        "anthropic" => stream_anthropic(settings, system, user, &on_event).await,
        _ => stream_openai(settings, system, user, &on_event).await,
    };
    match result {
        Ok(()) => {
            let _ = on_event.send(LlmEvent::Done);
            Ok(())
        }
        Err(e) => {
            let _ = on_event.send(LlmEvent::Error(e.clone()));
            Err(e)
        }
    }
}

async fn stream_openai(
    settings: &Settings,
    system: &str,
    user: &str,
    on_event: &Channel<LlmEvent>,
) -> Result<(), String> {
    let base = if settings.base_url.is_empty() {
        "https://api.openai.com/v1"
    } else {
        settings.base_url.trim_end_matches('/')
    };
    let url = format!("{base}/chat/completions");

    let client = build_client(settings)?;
    let mut request = client.post(&url).json(&json!({
        "model": settings.model,
        "stream": true,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ]
    }));
    if !settings.api_key.is_empty() {
        request = request.bearer_auth(&settings.api_key);
    }
    let response = request.send().await.map_err(http_error)?;

    let status = response.status();
    if !status.is_success() {
        // Include the URL: a wrong/unapplied base_url is the #1 suspect when
        // requests hit the wrong host (region blocks, weird 4xx bodies…).
        return Err(format!("HTTP {status} от {url}: {}", trim_body(response).await));
    }

    consume_sse(response, |payload| {
        let v: serde_json::Value = serde_json::from_str(payload)
            .map_err(|e| format!("битый SSE-кадр от провайдера: {e}"))?;
        if let Some(text) = v["choices"][0]["delta"]["content"].as_str() {
            if !text.is_empty() {
                let _ = on_event.send(LlmEvent::Token(text.to_string()));
            }
        }
        Ok(())
    })
    .await
}

async fn stream_anthropic(
    settings: &Settings,
    system: &str,
    user: &str,
    on_event: &Channel<LlmEvent>,
) -> Result<(), String> {
    let base = if settings.base_url.is_empty() {
        "https://api.anthropic.com"
    } else {
        settings.base_url.trim_end_matches('/')
    };
    let url = format!("{base}/v1/messages");

    let client = build_client(settings)?;
    let response = client
        .post(&url)
        .header("x-api-key", &settings.api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .json(&json!({
            "model": settings.model,
            "max_tokens": ANTHROPIC_MAX_TOKENS,
            "stream": true,
            "system": system,
            "messages": [
                { "role": "user", "content": user }
            ]
        }))
        .send()
        .await
        .map_err(http_error)?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("HTTP {status} от {url}: {}", trim_body(response).await));
    }

    consume_sse(response, |payload| {
        let v: serde_json::Value = serde_json::from_str(payload)
            .map_err(|e| format!("битый SSE-кадр от провайдера: {e}"))?;
        if v["type"] == "content_block_delta" && v["delta"]["type"] == "text_delta" {
            if let Some(text) = v["delta"]["text"].as_str() {
                if !text.is_empty() {
                    let _ = on_event.send(LlmEvent::Token(text.to_string()));
                }
            }
        }
        Ok(())
    })
    .await
}

fn build_client(settings: &Settings) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder().user_agent(concat!("vibe-build/", env!("CARGO_PKG_VERSION")));
    if let Some(timeout) = stream_timeout(settings) {
        builder = builder.timeout(timeout);
    }
    builder.build().map_err(|e| format!("не удалось создать HTTP-клиент: {e}"))
}

/// Overall request cap; streaming responses need a generous one.
fn stream_timeout(_settings: &Settings) -> Option<std::time::Duration> {
    Some(std::time::Duration::from_secs(600))
}

fn http_error(e: reqwest::Error) -> String {
    if e.is_connect() {
        format!("нет соединения с провайдером: {e}")
    } else if e.is_timeout() {
        format!("таймаут запроса: {e}")
    } else {
        format!("ошибка запроса: {e}")
    }
}

async fn trim_body(response: reqwest::Response) -> String {
    let text = response.text().await.unwrap_or_default();
    text.chars().take(400).collect()
}

/// Reads the SSE stream line by line, invoking `handle` on each `data:` payload.
async fn consume_sse(
    response: reqwest::Response,
    mut handle: impl FnMut(&str) -> Result<(), String>,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(http_error)?;
        buffer.extend_from_slice(&chunk);

        // Process complete lines; keep the trailing partial line in the buffer.
        while let Some(pos) = buffer.iter().position(|&b| b == b'\n') {
            let line: Vec<u8> = buffer.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim();
            if let Some(payload) = line.strip_prefix("data:") {
                let payload = payload.trim();
                if payload.is_empty() {
                    continue;
                }
                if payload == "[DONE]" {
                    return Ok(());
                }
                handle(payload)?;
            }
        }
    }
    Ok(())
}

/// Command invoked by the frontend. `on_event` is a Tauri Channel.
#[tauri::command]
pub async fn generate_build(
    app: tauri::AppHandle,
    system: String,
    user: String,
    on_event: Channel<LlmEvent>,
) -> Result<(), String> {
    let settings = crate::settings::load(&app)?
        .ok_or("Провайдер не настроен. Откройте настройки и укажите провайдера и API-ключ.")?;
    stream_completion(&settings, &system, &user, on_event).await
}

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<Option<Settings>, String> {
    crate::settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    crate::settings::save(&app, &settings)
}
