// Тонкая прослойка над Tauri: в обычном браузере (npm run dev) всё деградирует мягко.

export const isTauri = '__TAURI_INTERNALS__' in window

export async function notify(title: string, body: string) {
  if (isTauri) {
    const n = await import('@tauri-apps/plugin-notification')
    let granted = await n.isPermissionGranted()
    if (!granted) granted = (await n.requestPermission()) === 'granted'
    if (granted) n.sendNotification({ title, body })
    return
  }
  if ('Notification' in window) {
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission === 'granted') new Notification(title, { body })
  }
}

export async function openExternal(url: string) {
  if (isTauri) {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

export async function setFullscreen(on: boolean) {
  if (!isTauri) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().setFullscreen(on)
}

/** Масштаб всего интерфейса. В Tauri — zoom самого webview (вместе с iframe плеера), в браузере — CSS zoom. */
export async function setZoom(factor: number) {
  if (isTauri) {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    await getCurrentWebview().setZoom(factor)
  } else {
    document.documentElement.style.zoom = String(factor)
  }
}

export async function setTitle(title: string) {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTitle(title)
  } else {
    document.title = title
  }
}

/**
 * Адрес своей обёртки CVH (её отдаёт Rust со схемы cvh://). Tauri на Windows и Android
 * обслуживает свои схемы как http://<схема>.localhost, на остальных — как <схема>://localhost.
 */
export function cvhPlayerUrl(search: string): string | null {
  if (!isTauri) return null
  const http = /Windows|Android/.test(navigator.userAgent)
  return (http ? 'http://cvh.localhost/' : 'cvh://localhost/') + search
}

/** Открывает окно входа на самом сайте и ждёт токены из его кук. */
export async function startSiteLogin(onTokens: (candidates: string[]) => void): Promise<() => void> {
  if (!isTauri) throw new Error('Доступно только в десктопной сборке')
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')])
  const un = await listen<{ candidates: string[] }>('site-login-token', (e) => onTokens(e.payload.candidates))
  await invoke('site_login_start')
  return un
}

export async function closeSiteLogin() {
  if (!isTauri) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('site_login_close')
}

async function invokeSafe(cmd: string, args?: Record<string, unknown>) {
  if (!isTauri) return
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke(cmd, args).catch(() => {})
}

/** Галочка «Уведомления» в меню трея. */
export const traySetNotify = (on: boolean) => invokeSafe('tray_set_notify', { on })

/** Крестик прячет окно в трей (true) или закрывает приложение (false). */
export const setCloseToTray = (on: boolean) => invokeSafe('set_close_to_tray', { on })

/** Подписка на событие от Rust; в браузере — пустышка. */
export async function onNative<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  if (!isTauri) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<T>(event, (e) => cb(e.payload))
}
