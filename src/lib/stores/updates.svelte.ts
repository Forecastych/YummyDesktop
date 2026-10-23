// Обновления из GitHub Releases (tauri-plugin-updater): при запуске и раз в 6 часов смотрим
// latest.json. Подпись установщика плагин проверяет сам — по публичному ключу из tauri.conf.json.
import type { Update } from '@tauri-apps/plugin-updater'
import { isTauri } from '../native'

const FIRST_CHECK = 10_000
const INTERVAL = 6 * 60 * 60_000

export const updates = $state({
  /** Версия, до которой можно обновиться; null — обновлений нет (или ещё не проверяли). */
  version: null as string | null,
  notes: '',
  checking: false,
  /** Проверка хоть раз прошла — чтобы отличить «нет обновлений» от «не проверяли». */
  checked: false,
  /** Доля скачанного 0..1; null — не качаем. */
  progress: null as number | null,
  error: null as string | null,
  /** Плашку закрыли — до следующей найденной версии не показываем. */
  dismissed: false,
})

let pending: Update | null = null

/** Ошибки плагина приходят строкой из Rust (сеть, подпись, установщик) — показываем как есть. */
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)) || 'Не удалось проверить обновления'

export async function checkUpdates() {
  if (!isTauri || updates.checking || updates.progress !== null) return
  updates.checking = true
  updates.error = null
  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const u = await check()
    if (u?.version !== updates.version) updates.dismissed = false
    pending = u
    updates.version = u?.version ?? null
    updates.notes = u?.body ?? ''
    updates.checked = true
  } catch (e) {
    updates.error = errorText(e)
  } finally {
    updates.checking = false
  }
}

/** Скачивает и запускает установщик; на Windows он сам закрывает приложение. */
export async function installUpdate() {
  if (!pending || updates.progress !== null) return
  updates.error = null
  updates.progress = 0
  let total = 0
  let got = 0
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0
      else if (e.event === 'Progress' && total) updates.progress = Math.min(1, (got += e.data.chunkLength) / total)
    })
  } catch (e) {
    updates.error = errorText(e)
    updates.progress = null
  }
}

export function startUpdateChecker() {
  if (!isTauri) return
  setTimeout(checkUpdates, FIRST_CHECK)
  setInterval(checkUpdates, INTERVAL)
}
