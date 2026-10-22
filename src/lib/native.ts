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

export async function setTitle(title: string) {
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().setTitle(title)
  } else {
    document.title = title
  }
}

/** Открывает окно входа на самом сайте и ждёт токены из его кук. */
export async function startSiteLogin(onTokens: (candidates: string[]) => void): Promise<() => void> {
  if (!isTauri) throw new Error('Доступно только в десктопной сборке')
  const [{ invoke }, { listen }] = await Promise.all([import('@tauri-apps/api/core'), import('@tauri-apps/api/event')])
  const un = await listen<{ candidates: string[] }>('site-login-token', (e) => onTokens(e.payload.candidates))
  await invoke('site_login_start')
  return un
}
