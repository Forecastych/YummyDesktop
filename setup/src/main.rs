// Установщик YummyAnime Desktop: окно в стиле приложения поверх обычного NSIS.
// NSIS-установщик (тот же, что качает автообновление) зашит в exe и запускается
// с /S — он сам кладёт файлы, ярлыки, деинсталлятор и закрывает запущенное приложение.
#![windows_subsystem = "windows"]

use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::{env, fs};

use serde::Serialize;
use tauri::window::Color;
use tauri::{AppHandle, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use winreg::RegKey;
use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

const PAYLOAD: &[u8] = include_bytes!(env!("YD_PAYLOAD"));
const PRODUCT: &str = "YummyAnime Desktop";
const EXE: &str = "yummi-desktop.exe";
/// Ключ, который пишет NSIS (installMode: currentUser): папка — в InstallLocation, в кавычках.
const UNINSTALL: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\YummyAnime Desktop";
const NO_WINDOW: u32 = 0x0800_0000;

/// NSIS во временный файл: запускать можно только с диска.
fn payload() -> Result<PathBuf, String> {
  let path = env::temp_dir().join(format!("yummianime-setup-{}.exe", std::process::id()));
  fs::write(&path, PAYLOAD).map_err(|e| format!("Не удалось распаковать установщик: {e}"))?;
  Ok(path)
}

/// Без WebView2 наше окно не откроется — тогда показываем родной NSIS: он сам
/// доставит WebView2 вместе с приложением.
fn has_webview2() -> bool {
  const ID: &str = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
  [
    (HKEY_LOCAL_MACHINE, format!(r"SOFTWARE\WOW6432Node\{ID}")),
    (HKEY_LOCAL_MACHINE, format!(r"SOFTWARE\{ID}")),
    (HKEY_CURRENT_USER, format!(r"Software\{ID}")),
  ]
  .iter()
  .any(|(hive, path)| {
    RegKey::predef(*hive)
      .open_subkey(path)
      .and_then(|k| k.get_value::<String, _>("pv"))
      .is_ok_and(|v| !v.is_empty() && v != "0.0.0.0")
  })
}

fn desktop_dir() -> Option<PathBuf> {
  RegKey::predef(HKEY_CURRENT_USER)
    .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders")
    .and_then(|k| k.get_value::<String, _>("Desktop"))
    .ok()
    .map(PathBuf::from)
}

#[derive(Serialize)]
struct Info {
  version: String,
  dir: String,
  /// Уже установленная версия — тогда кнопка «Обновить».
  installed: Option<String>,
  /// Есть ли ярлык на рабочем столе: при обновлении оставляем как было.
  shortcut: bool,
}

#[tauri::command]
fn info(app: AppHandle) -> Info {
  let key = RegKey::predef(HKEY_CURRENT_USER).open_subkey(UNINSTALL).ok();
  let dir = key
    .as_ref()
    .and_then(|k| k.get_value::<String, _>("InstallLocation").ok())
    .map(|d| d.trim_matches('"').to_string())
    .filter(|d| !d.is_empty())
    .unwrap_or_else(|| {
      let local = env::var("LOCALAPPDATA").unwrap_or_default();
      Path::new(&local).join(PRODUCT).display().to_string()
    });
  let installed = key.and_then(|k| k.get_value("DisplayVersion").ok());
  let shortcut = desktop_dir().is_some_and(|d| d.join(format!("{PRODUCT}.lnk")).exists());
  Info { version: app.package_info().version.to_string(), dir, installed, shortcut }
}

/// Выбранная папка + «YummyAnime Desktop», если пользователь не выбрал её саму.
#[tauri::command]
async fn pick_dir(window: WebviewWindow, dir: String) -> Option<String> {
  let start = Path::new(&dir).parent().unwrap_or(Path::new(&dir)).to_path_buf();
  let picked = rfd::AsyncFileDialog::new()
    .set_title("Папка установки")
    .set_directory(start)
    .set_parent(&window)
    .pick_folder()
    .await?;
  let path = picked.path();
  let path = if path.ends_with(PRODUCT) { path.to_path_buf() } else { path.join(PRODUCT) };
  Some(path.display().to_string())
}

#[tauri::command]
async fn install(dir: String, desktop: bool) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || run_setup(&dir, desktop))
    .await
    .map_err(|e| e.to_string())?
}

fn run_setup(dir: &str, desktop: bool) -> Result<(), String> {
  let setup = payload()?;
  // /D= должен идти последним и без кавычек, даже с пробелами в пути — так требует NSIS.
  let status = Command::new(&setup)
    .arg("/S")
    .raw_arg(format!("/D={dir}"))
    .creation_flags(NO_WINDOW)
    .status();
  let _ = fs::remove_file(&setup);
  match status {
    Ok(s) if s.success() => {}
    Ok(s) => {
      return Err(format!(
        "Установщик завершился с кодом {}. Проверьте, что в папку можно писать.",
        s.code().unwrap_or(-1)
      ));
    }
    Err(e) => return Err(format!("Не удалось запустить установщик: {e}")),
  }
  // Тихий NSIS всегда кладёт ярлык на рабочий стол.
  if !desktop {
    if let Some(d) = desktop_dir() {
      let _ = fs::remove_file(d.join(format!("{PRODUCT}.lnk")));
    }
  }
  Ok(())
}

#[tauri::command]
fn launch(app: AppHandle, dir: String) {
  let _ = Command::new(Path::new(&dir).join(EXE)).current_dir(&dir).spawn();
  app.exit(0);
}

/// Флаги WebView2 по умолчанию у Tauri плюс стандартная переменная окружения —
/// Tauri задаёт флаги сам и переменную иначе бы перекрыл (нужна для отладки по CDP).
fn browser_args() -> String {
  let base = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";
  match env::var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") {
    Ok(extra) if !extra.is_empty() => format!("{base} {extra}"),
    _ => base.to_string(),
  }
}

fn main() {
  if !has_webview2() {
    if let Ok(setup) = payload() {
      let _ = Command::new(&setup).status();
      let _ = fs::remove_file(setup);
    }
    return;
  }

  // Профиль WebView2 — во временной папке, чтобы установщик не мусорил в AppData.
  let data = env::temp_dir().join(format!("yummianime-setup-{}.webview", std::process::id()));
  let app = tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![info, pick_dir, install, launch])
    .setup({
      let data = data.clone();
      move |app| {
        WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
          .title("Установка YummyAnime Desktop")
          .inner_size(560.0, 400.0)
          .resizable(false)
          .maximizable(false)
          .decorations(false)
          .shadow(true)
          .center()
          .visible(false)
          .background_color(Color(34, 34, 34, 255))
          .data_directory(data)
          .additional_browser_args(&browser_args())
          .build()?;
        Ok(())
      }
    })
    .build(tauri::generate_context!())
    .expect("не удалось открыть окно установщика");
  app.run(move |_, e| {
    if let RunEvent::Exit = e {
      let _ = fs::remove_dir_all(&data);
    }
  });
}
