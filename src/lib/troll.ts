// Защита рекомендаций от вбросов. «Оценившие также смотрели» — это голоса пользователей за связку
// двух тайтлов, и мемные связки там набирают голоса так же, как настоящие: к «Магической битве»
// пришивают «Боевого петуха» и «Собачью какашку», к «Ванпанчмену» — мультфильм 1907 года.
// Каталог и поиск это не трогает — только подборки, которые приложение советует само.
import type { AnimeShort, Likes } from './api/types'

/**
 * Тайтлы, которые раздают как шутку. Найдены по выдаче для популярных тайтлов
 * (2026-10): высокий плюс при нулевом сходстве с исходником.
 */
export const TROLL_IDS: ReadonlySet<number> = new Set([
  13621, // «Боевой петух» — реальный онгоинг, но пришивают его ко всему подряд
  13642, // «Собачья какашка»
  7999, // «Это что за Чебурашка?»
  11045, // «Новая техника говносупа»
  11780, // «Движущиеся картинки» (1907)
])

/** Форматы, которые подсовывают ради смеха: хватает пары голосов, чтобы всплыть. */
const SHORT = new Set(['short-movie', 'short-tv', 'clip', 'music'])
const SHORT_MIN_VOTES = 5

/** Жанры, которые советовать можно, только если человек сам такое смотрит. */
export const SENSITIVE_GENRES = new Set(['erotica', 'hentaj', 'hentai', 'ne-yaponskoe'])

/** Пользовательская связка похожа на вброс: мем из списка, спорные голоса, короткометражка с парой плюсов. */
export function suspiciousLink(a: Pick<AnimeShort, 'anime_id' | 'type'>, l: Likes | undefined): boolean {
  if (TROLL_IDS.has(a.anime_id)) return true
  const likes = l?.likes ?? 0
  const dislikes = l?.dislikes ?? 0
  // Связку активно минусуют — значит, многие видят в ней шутку.
  if (dislikes >= 2 && dislikes >= likes * 0.6) return true
  if (SHORT.has(a.type?.alias ?? '') && likes - dislikes < SHORT_MIN_VOTES) return true
  return false
}
