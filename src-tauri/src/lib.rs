use std::borrow::Cow;

use serde::Serialize;
use tauri::http::{Request, Response};
use tauri::webview::PageLoadEvent;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const SITE_LOGIN_LABEL: &str = "site-login";
/// Отдельной страницы /login у сайта больше нет (404): форма входа живёт
/// в шапке любой страницы, после входа сайт перезагружает страницу.
const SITE_LOGIN_URL: &str = "https://old.yummyani.me/";
/// Кука, в которую сайт кладёт токен; её проверяем первой.
const TOKEN_COOKIE: &str = "yummy_token";
/// Домены, где сайт может оставить авторизационную куку
/// (вход через VK и Shikimori возвращается на site.yummyani.me и yummy-anime.ru).
const COOKIE_ORIGINS: [&str; 5] = [
    "https://old.yummyani.me/",
    "https://yummyani.me/",
    "https://site.yummyani.me/",
    "https://yummy-anime.ru/",
    "https://api.yani.tv/",
];
/// Форма входа спрятана в выпадающем меню шапки — раскрываем её сразу.
const OPEN_LOGIN_FORM_JS: &str =
    "document.querySelectorAll('.login-form').forEach(function (f) { f.classList.add('open') })";

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
            let _ = webview.eval(OPEN_LOGIN_FORM_JS);
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
                            if !looks_like_jwt(&v) || candidates.contains(&v) {
                                continue;
                            }
                            if c.name() == TOKEN_COOKIE {
                                candidates.insert(0, v);
                            } else {
                                candidates.push(v);
                            }
                        }
                    }
                }
                // Окно не закрываем: в куках может лежать протухший токен от прошлой
                // сессии. Фронт проверит кандидатов и сам закроет окно через site_login_close.
                if !candidates.is_empty() {
                    let _ = webview.app_handle().emit_to("main", "site-login-token", SiteLoginPayload { candidates });
                }
            });
        })
        .build()
        .map_err(|e| format!("{e}"))?;
    Ok(())
}

#[tauri::command]
fn site_login_close(app: AppHandle) {
    if let Some(w) = app.get_webview_window(SITE_LOGIN_LABEL) {
        let _ = w.close();
    }
}

/// Своя обёртка для плеера CDNVideoHub вместо ru.yummyani.me/iframeCVH.html,
/// который без VPN не открывается. Отдаётся со схемы cvh:// — для webview это
/// отдельный origin, так что сторонний скрипт плеера не достаёт до приложения.
/// Скрипты — только с player.cdnvideohub.com: реклама и счётчики плеера отсекаются.
const CVH_SCHEME: &str = "cvh";
const CVH_PAGE: &str = include_str!("../cvh/player.html");
const CVH_SCRIPT: &str = include_str!("../cvh/player.js");
const CVH_CSP: &str = "default-src 'none';     script-src 'self' https://player.cdnvideohub.com;     style-src 'self' 'unsafe-inline' https:;     img-src https: data: blob:;     media-src https: data: blob:;     font-src https: data:;     connect-src https: wss:;     frame-src https:;     worker-src blob:;     frame-ancestors http://tauri.localhost tauri://localhost http://localhost:1430";

fn cvh_protocol(req: Request<Vec<u8>>) -> Response<Cow<'static, [u8]>> {
    let (body, mime) = match req.uri().path() {
        "/" | "/player.html" => (CVH_PAGE, "text/html; charset=utf-8"),
        "/player.js" => (CVH_SCRIPT, "text/javascript; charset=utf-8"),
        _ => {
            return Response::builder()
                .status(404)
                .body(Cow::Borrowed(&[][..]))
                .expect("static response");
        }
    };
    Response::builder()
        .header("Content-Type", mime)
        .header("Content-Security-Policy", CVH_CSP)
        .header("Cache-Control", "no-store")
        .body(Cow::Borrowed(body.as_bytes()))
        .expect("static response")
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

/// Вырезает рекламу из плееров во встроенных фреймах (Kodik, Alloha, CVH).
fn no_ads<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("no-ads")
        .js_init_script_on_all_frames(include_str!("../scripts/noads.js"))
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
        .plugin(no_ads())
        .register_uri_scheme_protocol(CVH_SCHEME, |_ctx, req| cvh_protocol(req))
        .invoke_handler(tauri::generate_handler![site_login_start, site_login_close])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
