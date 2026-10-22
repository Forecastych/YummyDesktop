use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Emitter, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const SITE_LOGIN_LABEL: &str = "site-login";
const SITE_LOGIN_URL: &str = "https://old.yummyani.me/login";
/// Домены, где сайт может оставить авторизационную куку.
const COOKIE_ORIGINS: [&str; 3] = [
    "https://old.yummyani.me/",
    "https://yummyani.me/",
    "https://api.yani.tv/",
];

#[derive(Clone, Serialize)]
struct SiteLoginPayload {
    /// Значения кук, похожие на JWT. Фронт сам проверит их запросом /profile.
    candidates: Vec<String>,
}

fn looks_like_jwt(v: &str) -> bool {
    let parts: Vec<&str> = v.split('.').collect();
    parts.len() == 3 && parts.iter().all(|p| p.len() > 8)
}

/// Запасной вход: открываем страницу логина самого сайта (там капча работает
/// на своём домене), а после ухода со страницы логина забираем токен из кук.
#[tauri::command]
async fn site_login_start(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(SITE_LOGIN_LABEL) {
        let _ = w.set_focus();
        return Ok(());
    }
    let url: Url = SITE_LOGIN_URL.parse().map_err(|e| format!("{e}"))?;
    WebviewWindowBuilder::new(&app, SITE_LOGIN_LABEL, WebviewUrl::External(url))
        .title("Вход через сайт YummyAnime")
        .inner_size(520.0, 760.0)
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let path = payload.url().path().to_string();
            if path.starts_with("/login") || path.starts_with("/register") {
                return;
            }
            // На Windows чтение кук из обработчика событий webview блокируется —
            // уходим в отдельную задачу.
            let webview = webview.clone();
            tauri::async_runtime::spawn(async move {
                let mut candidates = Vec::new();
                for origin in COOKIE_ORIGINS {
                    let Ok(u) = origin.parse::<Url>() else { continue };
                    if let Ok(cookies) = webview.cookies_for_url(u) {
                        for c in cookies {
                            // Кука может хранить токен как «Bearer%20<jwt>».
                            let raw = c.value().replace("%20", " ");
                            let v = raw.strip_prefix("Bearer ").unwrap_or(&raw).trim().to_string();
                            if looks_like_jwt(&v) && !candidates.contains(&v) {
                                candidates.push(v);
                            }
                        }
                    }
                }
                if candidates.is_empty() {
                    return;
                }
                let app = webview.app_handle().clone();
                let _ = app.emit_to("main", "site-login-token", SiteLoginPayload { candidates });
                if let Some(w) = app.get_webview_window(SITE_LOGIN_LABEL) {
                    let _ = w.close();
                }
            });
        })
        .build()
        .map_err(|e| format!("{e}"))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![site_login_start])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
