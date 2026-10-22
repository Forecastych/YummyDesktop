use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::http::{Request, Response};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
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

// ---- трей: крестик прячет окно, приложение живёт в фоне и шлёт уведомления ----

/// Прятать окно в трей вместо выхода. Настройку присылает фронт.
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// Пункт «Уведомления» в меню трея — фронт держит его в синхроне со своей настройкой.
struct TrayNotify(CheckMenuItem<Wry>);

fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn setup_tray(app: &AppHandle<Wry>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть", true, None::<&str>)?;
    let notify = CheckMenuItem::with_id(app, "notify", "Уведомления", true, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &notify, &PredefinedMenuItem::separator(app)?, &quit])?;
    app.manage(TrayNotify(notify));

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("YummyDesktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            // Галочку меню переключает само; сообщаем фронту новое состояние.
            "notify" => {
                let on = app.state::<TrayNotify>().0.is_checked().unwrap_or(true);
                let _ = app.emit_to("main", "tray-notify", on);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

#[tauri::command]
fn tray_set_notify(app: AppHandle, on: bool) {
    let _ = app.state::<TrayNotify>().0.set_checked(on);
}

#[tauri::command]
fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(navigation_guard())
        .plugin(no_ads())
        .register_uri_scheme_protocol(CVH_SCHEME, |_ctx, req| cvh_protocol(req))
        .setup(|app| Ok(setup_tray(app.handle())?))
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    // Плеер в спрятанном окне продолжал бы играть — фронт его остановит.
                    let _ = window.emit("tray-hidden", ());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            site_login_start,
            site_login_close,
            tray_set_notify,
            set_close_to_tray
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
