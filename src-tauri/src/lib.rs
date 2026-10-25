use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use tauri::http::{Request, Response};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::PageLoadEvent;
use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

mod discord;
mod imgcache;
mod mini;
mod shiki;

const SITE_LOGIN_LABEL: &str = "site-login";
/// Отдельной страницы /login у сайта больше нет (404): форма входа живёт
/// в шапке любой страницы, после входа сайт перезагружает страницу.
const SITE_LOGIN_URL: &str = "https://old.yummyani.me/";
/// Сброс пароля: письмо со ссылкой сайт шлёт только после hCaptcha, а она живёт на его домене.
const SITE_RESET_PATH: &str = "/login/reset-password";
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
/// `reset` — сразу на страницу сброса пароля; токен из кук ловим так же, если человек
/// потом войдёт в том же окне.
#[tauri::command]
async fn site_login_start(app: AppHandle, reset: Option<bool>) -> Result<(), String> {
    let reset = reset.unwrap_or(false);
    let mut url: Url = SITE_LOGIN_URL.parse().map_err(|e| format!("{e}"))?;
    if reset {
        url.set_path(SITE_RESET_PATH);
    }
    if let Some(w) = app.get_webview_window(SITE_LOGIN_LABEL) {
        if reset {
            let _ = w.navigate(url);
        }
        let _ = w.set_focus();
        return Ok(());
    }
    let title = if reset { "Восстановление пароля YummyAnime" } else { "Вход через сайт YummyAnime" };
    WebviewWindowBuilder::new(&app, SITE_LOGIN_LABEL, WebviewUrl::External(url))
        .title(title)
        .inner_size(520.0, 760.0)
        .on_page_load(|webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            // На странице сброса раскрытая форма входа закрыла бы форму с почтой.
            if payload.url().path() != SITE_RESET_PATH {
                let _ = webview.eval(OPEN_LOGIN_FORM_JS);
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

/// Агент для своих кнопок плеера: прячет родной интерфейс и пересылает приложению
/// состояние <video>. Молчит, пока его не позовёт Player.svelte.
fn player_agent<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("player-agent")
        .js_init_script_on_all_frames(include_str!("../scripts/player-agent.js"))
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
        .tooltip("YummyAnime Desktop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            // Галочку меню переключает само; сообщаем фронту новое состояние.
            "notify" => {
                let on = app.state::<TrayNotify>().0.is_checked().unwrap_or(true);
                let _ = app.emit_to("main", "tray-notify", on);
            }
            "quit" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = mini::leave(&w.as_ref().window());
                }
                app.exit(0)
            }
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

/// Строка от фронта: ошибки JS и неудачные запросы к API. Отдельная цель «front»,
/// чтобы в файле было видно, с какой стороны пришло.
#[tauri::command]
fn log_line(level: String, message: String) {
    match level.as_str() {
        "error" => log::error!(target: "front", "{message}"),
        "warn" => log::warn!(target: "front", "{message}"),
        _ => log::info!(target: "front", "{message}"),
    }
}

#[tauri::command]
fn open_log_dir(app: AppHandle) -> Result<(), String> {
    let dir = app.path().app_log_dir().map_err(|e| format!("{e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{e}"))?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(|e| format!("{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // Рамку окна рисуем сами: сохранённое состояние не должно возвращать системную.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::DECORATIONS)
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::LogDir { file_name: Some("yummianime".into()) }),
                    Target::new(TargetKind::Stdout),
                ])
                .level(log::LevelFilter::Info)
                // Болтливые крейты (сеть, webview) — только предупреждения.
                .level_for("reqwest", log::LevelFilter::Warn)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .max_file_size(1_000_000)
                // Рядом с текущим остаётся один прошлый файл (с датой в имени): лог до сбоя не теряется.
                .rotation_strategy(RotationStrategy::KeepSome(2))
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(navigation_guard())
        .plugin(no_ads())
        .plugin(player_agent())
        .register_uri_scheme_protocol(CVH_SCHEME, |_ctx, req| cvh_protocol(req))
        .register_asynchronous_uri_scheme_protocol(imgcache::SCHEME, imgcache::protocol)
        .setup(|app| {
            log::info!("YummyAnime Desktop {} запущен", app.package_info().version);
            // В релизе panic = abort: без этого хука причина падения не оставила бы следа.
            std::panic::set_hook(Box::new(|info| log::error!("panic: {info}")));
            imgcache::init(app.handle())?;
            Ok(setup_tray(app.handle())?)
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = mini::leave(window);
                }
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
            log_line,
            open_log_dir,
            tray_set_notify,
            set_close_to_tray,
            discord::discord_set,
            mini::mini_player,
            shiki::shiki_rates,
            imgcache::img_cache_stats,
            imgcache::img_cache_set_limit,
            imgcache::img_cache_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
