// Защита от двойных уведомлений о серии: о ней может сообщить и локальная
// проверка подписок, и сайт (подписка на озвучку). Помним тексты недавно
// показанных уведомлений и не повторяем то же название в течение пары часов.

const TTL = 3 * 60 * 60_000
const recent: { text: string; at: number }[] = []

export function rememberNotified(text: string) {
  recent.push({ text: text.toLowerCase(), at: Date.now() })
}

/** Было ли недавно уведомление с этим названием (или это название — часть недавнего). */
export function wasNotified(text: string) {
  const now = Date.now()
  while (recent.length && now - recent[0].at > TTL) recent.shift()
  const t = text.toLowerCase()
  if (t.length < 3) return false
  return recent.some((r) => r.text.length >= 3 && (r.text.includes(t) || t.includes(r.text)))
}
