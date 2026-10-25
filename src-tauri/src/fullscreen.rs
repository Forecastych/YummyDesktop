// Полноэкранный режим окна. Развёрнутое окно сначала сворачиваем в обычное: tao для
// развёрнутого окна без рамки урезает клиентскую область до рабочей области монитора
// (WM_NCCALCSIZE, «чтобы не закрыть панель задач») и в полноэкранном режиме тоже —
// по краям оставались щели, а снизу торчала полоса высотой с панель задач.
//
// Когда плеер уходит в fullscreen через requestFullscreen, tauri-runtime-wry сам ставит
// окну полноэкранный режим (ContainsFullScreenElementChanged) — часто раньше, чем сюда
// доходит наша команда. Поэтому «уже в fullscreen» не повод ничего не делать: если окно
// при этом развёрнуто, выходим, сворачиваем в обычное и входим заново.
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Runtime, Window};

/// Окно было развёрнуто до входа в полноэкранный режим — развернуть обратно при выходе.
static WAS_MAXIMIZED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub fn set_fullscreen<R: Runtime>(window: Window<R>, on: bool) -> Result<(), String> {
    set(&window, on).map_err(|e| e.to_string())
}

pub fn set<R: Runtime>(w: &Window<R>, on: bool) -> tauri::Result<()> {
    if on {
        let zoomed = is_zoomed(w);
        let maximized = w.is_maximized()? || zoomed;
        let fullscreen = w.is_fullscreen()?;
        if fullscreen && !maximized {
            return Ok(());
        }
        log::info!("fullscreen on: fullscreen={fullscreen} maximized={maximized} zoomed={zoomed}");
        if fullscreen {
            w.set_fullscreen(false)?;
        }
        if maximized {
            WAS_MAXIMIZED.store(true, Ordering::Relaxed);
            // Флаг tao мог разойтись с Win32: без него unmaximize не делает SW_RESTORE.
            w.maximize()?;
            w.unmaximize()?;
        }
        w.set_fullscreen(true)?;
        log::info!("fullscreen on: done, zoomed={}", is_zoomed(w));
        Ok(())
    } else {
        // Окно могли уже вывести из fullscreen вместе с document.exitFullscreen —
        // развернуть обратно всё равно нужно.
        if w.is_fullscreen()? {
            w.set_fullscreen(false)?;
        }
        if WAS_MAXIMIZED.swap(false, Ordering::Relaxed) {
            w.maximize()?;
        }
        Ok(())
    }
}

/// Развёрнуто ли окно с точки зрения самой Windows (флаг tao бывает устаревшим).
#[cfg(windows)]
fn is_zoomed<R: Runtime>(w: &Window<R>) -> bool {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn IsZoomed(hwnd: *mut std::ffi::c_void) -> i32;
    }
    w.hwnd().map(|h| unsafe { IsZoomed(h.0) } != 0).unwrap_or(false)
}

#[cfg(not(windows))]
fn is_zoomed<R: Runtime>(_: &Window<R>) -> bool {
    false
}
