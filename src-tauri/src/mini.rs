// Мини-плеер: главное окно сжимается до маленького поверх остальных в правом нижнем углу.
// Фронт сам прячет всё, кроме плеера; здесь — только геометрия окна и её возврат.
use std::sync::Mutex;

use tauri::{LogicalSize, PhysicalPosition, PhysicalSize, Runtime, Window};

const MINI: LogicalSize<f64> = LogicalSize { width: 480.0, height: 270.0 };
const MINI_MIN: LogicalSize<f64> = LogicalSize { width: 320.0, height: 180.0 };
/// То же, что minWidth/minHeight главного окна в tauri.conf.json.
const NORMAL_MIN: LogicalSize<f64> = LogicalSize { width: 900.0, height: 600.0 };
/// Отступ от края рабочей области, логические пиксели.
const MARGIN: f64 = 16.0;

struct Saved {
    pos: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
    maximized: bool,
}

/// Геометрия окна до мини-режима; None — окно в обычном режиме.
static SAVED: Mutex<Option<Saved>> = Mutex::new(None);

#[tauri::command]
pub fn mini_player<R: Runtime>(window: Window<R>, on: bool) -> Result<(), String> {
    if on { enter(&window) } else { leave(&window) }.map_err(|e| e.to_string())
}

fn enter<R: Runtime>(w: &Window<R>) -> tauri::Result<()> {
    let mut saved = SAVED.lock().unwrap_or_else(|e| e.into_inner());
    if saved.is_some() {
        return Ok(());
    }
    if w.is_fullscreen()? {
        w.set_fullscreen(false)?;
    }
    let maximized = w.is_maximized()?;
    if maximized {
        w.unmaximize()?;
    }
    *saved = Some(Saved { pos: w.outer_position()?, size: w.inner_size()?, maximized });

    w.set_min_size(Some(MINI_MIN))?;
    w.set_size(MINI)?;
    w.set_always_on_top(true)?;
    if let Some(m) = w.current_monitor()? {
        let area = m.work_area();
        let outer = w.outer_size()?;
        let gap = (MARGIN * m.scale_factor()) as i32;
        let x = area.position.x + area.size.width as i32 - outer.width as i32 - gap;
        let y = area.position.y + area.size.height as i32 - outer.height as i32 - gap;
        w.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

/// Вернуть окну прежний вид. Зовётся и перед закрытием: иначе window-state
/// запомнит мини-размер и следующий запуск откроется крошечным.
pub fn leave<R: Runtime>(w: &Window<R>) -> tauri::Result<()> {
    let Some(s) = SAVED.lock().unwrap_or_else(|e| e.into_inner()).take() else {
        return Ok(());
    };
    w.set_always_on_top(false)?;
    w.set_min_size(Some(NORMAL_MIN))?;
    w.set_size(s.size)?;
    w.set_position(s.pos)?;
    if s.maximized {
        w.maximize()?;
    }
    Ok(())
}
