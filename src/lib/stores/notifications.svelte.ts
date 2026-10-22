// Уведомления сайта: ответы на комментарии, лайки, новые серии подписанных озвучек.
// Пока приложение запущено (в том числе свёрнутым в трей), раз в 3 минуты смотрим
// счётчик непрочитанных и показываем системное уведомление о новых.
import { Api } from '../api/endpoints'
import type { Notification } from '../api/types'
import { notify } from '../native'
import { errorText } from '../query.svelte'
import { plainText } from '../sanitize'
import { load, save } from '../storage'
import { auth } from './auth.svelte'
import { rememberNotified, wasNotified } from './notified'
import { settings } from './settings.svelte'

const INTERVAL = 3 * 60_000
/** Больше стольких уведомлений за раз — одно сводное. */
const MAX_SEPARATE = 3

export const notifs = $state({ unread: 0, items: [] as Notification[], loading: false, error: null as string | null })

/** Самое новое уведомление, о котором уже сообщили в Windows. 0 — ещё ни разу не проверяли. */
let lastId = load<number>('notif-last', 0)

const isEpisode = (n: Notification) => n.type === 'anime_episode' || n.sub_type === 'new_episode'

export const notifTitle = (n: Notification) => plainText(n.title_html || '') || 'YummyAnime'
export const notifText = (n: Notification) => plainText(n.text_html || '')

async function announce(list: Notification[]) {
  const fresh = list.filter((n) => !n.viewed && n.id > lastId)
  // Минимум 1: пустой список при первой проверке тоже считается проверкой.
  const max = Math.max(lastId, 1, ...list.map((n) => n.id))
  const first = lastId === 0
  if (max !== lastId) save('notif-last', (lastId = max))
  // Первый запуск: старые непрочитанные не вываливаем пачкой.
  if (first || !settings.notifyEpisodes || !fresh.length) return

  const shown = fresh.filter((n) => {
    const text = `${notifTitle(n)} ${notifText(n)}`
    // О новой серии уже могла сообщить локальная проверка подписок.
    if (isEpisode(n) && wasNotified(text)) return false
    rememberNotified(text)
    return true
  })
  if (shown.length > MAX_SEPARATE) {
    await notify(`Новых уведомлений: ${shown.length}`, shown.slice(0, 4).map(notifTitle).join(' · '))
    return
  }
  for (const n of shown.reverse()) await notify(notifTitle(n), notifText(n))
}

async function poll() {
  if (!auth.profile) {
    notifs.unread = 0
    return
  }
  const counts = await Api.notificationCounts()
  const unread = Array.isArray(counts) ? counts.reduce((n, c) => n + (Number(c.count) || 0), 0) : 0
  const changed = unread !== notifs.unread
  notifs.unread = unread
  if (lastId && (!unread || !changed)) return
  await announce(await Api.notifications(0, 30))
}

/** Список для страницы уведомлений. */
export async function loadNotifications() {
  if (!auth.profile) return
  notifs.loading = true
  notifs.error = null
  try {
    const list = await Api.notifications(0, 50)
    notifs.items = Array.isArray(list) ? list : []
    await announce(notifs.items).catch(() => {})
  } catch (e) {
    notifs.error = errorText(e)
  } finally {
    notifs.loading = false
  }
}

export async function markRead(n: Notification) {
  if (n.viewed) return
  n.viewed = true
  notifs.unread = Math.max(0, notifs.unread - 1)
  await Api.readNotification(n.id).catch(() => {})
}

export async function markAllRead() {
  await Api.readNotifications()
  for (const n of notifs.items) n.viewed = true
  notifs.unread = 0
}

export async function removeNotification(n: Notification) {
  await Api.deleteNotification(n.id)
  notifs.items = notifs.items.filter((x) => x.id !== n.id)
  if (!n.viewed) notifs.unread = Math.max(0, notifs.unread - 1)
}

export async function clearAllNotifications() {
  await Api.clearNotifications()
  notifs.items = []
  notifs.unread = 0
}

let timer: ReturnType<typeof setInterval> | undefined

export function startNotifications() {
  if (timer) return
  const tick = () => poll().catch(() => {})
  timer = setInterval(tick, INTERVAL)
  // После входа в аккаунт — сразу, не дожидаясь следующего круга.
  $effect.root(() => {
    $effect(() => {
      if (auth.profile?.id) setTimeout(tick, 5_000)
      else notifs.unread = 0
    })
  })
}
