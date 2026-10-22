import type { AnimeShort, Likes } from './api/types'

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const DAYS = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

export function date(unix: number, withTime = false) {
  const d = new Date(unix * 1000)
  const s = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  const y = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''
  return withTime ? `${s}${y}, ${hm(d)}` : s + y
}

export function hm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function weekday(unix: number) {
  return DAYS[new Date(unix * 1000).getDay()]
}

export function ago(unix: number) {
  const s = Math.floor(Date.now() / 1000 - unix)
  if (s < 60) return 'только что'
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} дн назад`
  return date(unix)
}

export function duration(sec: number) {
  sec = Math.max(0, Math.floor(sec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const mm = String(m).padStart(h ? 2 : 1, '0')
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`
}

export function rating(a: Pick<AnimeShort, 'rating'>): number | null {
  const r = typeof a.rating === 'number' ? a.rating : a.rating?.average
  return r ? Math.round(r * 10) / 10 : null
}

/** Шкала цветов оценок с сайта: 1 — красный, 10 — зелёный. */
export const RATE_COLORS = [
  '#f66',
  '#fb8a60',
  '#f7af5a',
  '#f3d554',
  '#e1ee4f',
  '#b1e84a',
  '#81e246',
  '#53dc42',
  '#3fd557',
  '#3cce7b',
]

export function rateColor(r: number | null | undefined): string | undefined {
  if (!r) return undefined
  return RATE_COLORS[Math.min(10, Math.max(1, Math.round(r))) - 1]
}

/**
 * Связки «оценившие также смотрели» — голоса пользователей. Один-два голоса —
 * обычно шутка («Собачья какашка» к «Чёрному клеверу»), показываем от трёх.
 */
export const MIN_USER_VOTES = 3

export function userVotes(l: Likes | undefined) {
  return (l?.likes ?? 0) - (l?.dislikes ?? 0)
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export function compact(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K'
  return String(n)
}

export function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...a: A) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), ms)
  }
}

/** Время просмотра: «45 мин», «12 ч 5 мин», «601 ч». */
export function spent(sec: number) {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  return h >= 100 || m % 60 === 0 ? `${h} ч` : `${h} ч ${m % 60} мин`
}

/** Роли, которые сайт показывает плашкой. Остальные служебные — не выводим. */
const ROLES: Record<string, string> = {
  root: 'Администратор',
  admin: 'Администратор',
  moderatorPlus: 'Старший модератор',
  moderator: 'Модератор',
  reviewerHead: 'Глава рецензентов',
  reviewer: 'Рецензент',
  blogger: 'Блогер',
  tester: 'Тестер',
}

export function roleTitles(roles: string[] | undefined) {
  return [...new Set((roles ?? []).map((r) => ROLES[r]).filter(Boolean))]
}

/** «в сети» — если заходил последние 5 минут. */
export function isOnline(lastOnline: number | undefined) {
  return !!lastOnline && Date.now() / 1000 - lastOnline < 300
}
