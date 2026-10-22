use serde::Serialize;
use tauri::webview::PageLoadEvent;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

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

/// Своё ли это содержимое: собранный фронт или dev-сервер Vite.
fn is_app_url(url: &Url) -> bool {
    match url.scheme() {
        "tauri" | "about" | "data" | "blob" => true,
        "http" | "https" => matches!(url.host_str(), Some("tauri.localhost" | "localhost" | "127.0.0.1")),
        _ => false,
    }
}

/// Главное окно никогда не уходит на чужие страницы: внешние ссылки, которые
/// фронт почему-то не перехватил, открываются в системном браузере.
/// Окно входа через сайт (site-login) живёт на сайте и сюда не попадает.
fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("nav-guard")
        .on_navigation(|webview, url| {
            if webview.label() != "main" || is_app_url(url) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = webview.app_handle().opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        .build()
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
        .plugin(navigation_guard())
        .invoke_handler(tauri::generate_handler![site_login_start])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
