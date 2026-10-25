// Полноэкранный режим окна. Развёрнутое окно сначала сворачиваем в обычное: tao для
// развёрнутого окна без рамки урезает клиентскую область до рабочей области монитора
// (WM_NCCALCSIZE, «чтобы не закрыть панель задач») и в полноэкранном режиме тоже —
// по краям оставались щели, а снизу торчала панель задач.
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Runtime, Window};

/// Окно было развёрнуто до входа в полноэкранный режим — развернуть обратно при выходе.
static WAS_MAXIMIZED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_fullscreen<R: Runtime>(window: Window<R>, on: bool) -> Result<(), String> {
    set(&window, on).map_err(|e| e.to_string())
}

pub fn set<R: Runtime>(w: &Window<R>, on: bool) -> tauri::Result<()> {
    if on == w.is_fullscreen()? {
        return Ok(());
    }
    if on {
        let maximized = w.is_maximized()?;
        WAS_MAXIMIZED.store(maximized, Ordering::Relaxed);
        if maximized {
            w.unmaximize()?;
        }
        w.set_fullscreen(true)
    } else {
        w.set_fullscreen(false)?;
        if WAS_MAXIMIZED.swap(false, Ordering::Relaxed) {
            w.maximize()?;
        }
        Ok(())
    }
}
