// «В сети» на сайте: пока окно приложения на экране, отмечаемся POST /profile/online
// раз в 4,5 минуты — как сам сайт (у него «в сети» — визит не старше 5 минут, см. isOnline).
// Окно в трее онлайном не считается: сайт в скрытой вкладке тоже молчит.
import { Api } from '../api/endpoints'
import { onNative } from '../native'
import { auth } from './auth.svelte'

const INTERVAL = 4.5 * 60_000

let last = 0
let timer: ReturnType<typeof setTimeout> | undefined
let started = false
/** WebView2 в спрятанном окне остаётся «visible» — про трей сообщает Rust. */
let inTray = false

const hidden = () => inTray || document.visibilityState === 'hidden'

async function ping() {
  clearTimeout(timer)
  // Скрыто — следующий круг запустит возврат окна.
  if (!auth.profile?.id || hidden()) return
  last = Date.now()
  await Api.markOnline().catch(() => {})
  timer = setTimeout(ping, INTERVAL)
}

function shown() {
  if (!hidden() && Date.now() - last >= INTERVAL) ping()
}

export function startOnline() {
  if (started) return
  started = true
  document.addEventListener('visibilitychange', shown)
  onNative('tray-hidden', () => (inTray = true))
  onNative('tray-shown', () => {
    inTray = false
    shown()
  })
  $effect.root(() => {
    $effect(() => {
      if (auth.profile?.id) ping()
      else clearTimeout(timer)
    })
  })
}
