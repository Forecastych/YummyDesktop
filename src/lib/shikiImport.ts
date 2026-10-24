// Импорт списков с Shikimori: сначала собираем план (что и куда ляжет), человек смотрит
// и подтверждает — только тогда пишем в аккаунт.
import { Api } from './api/endpoints'
import type { ListId } from './api/types'
import { shikiRates, type ShikiRate } from './native'
import { listOf, reloadLists } from './stores/lists.svelte'

const LIST_OF: Record<ShikiRate['status'], ListId> = {
  watching: 0,
  rewatching: 0,
  planned: 1,
  completed: 2,
  dropped: 3,
  on_hold: 5,
}
/** Столько id влезает в один запрос /anime и одну пачку записи. */
const BATCH = 100

export interface ImportItem {
  id: number
  title: string
  list: ListId
  rate?: number
}

export interface ImportPlan {
  /** Всего аниме в списке Шикимори. */
  total: number
  /** Новые для списков YummyAnime. */
  items: ImportItem[]
  /** Уже лежат в каком-нибудь списке — не трогаем. */
  already: number
  /** На YummyAnime такого тайтла нет. */
  missing: number
}

export async function planImport(user: string, onProgress: (done: number, total: number) => void): Promise<ImportPlan> {
  const rates = await shikiRates(user)
  const plan: ImportPlan = { total: rates.length, items: [], already: 0, missing: 0 }
  for (let i = 0; i < rates.length; i += BATCH) {
    const part = rates.slice(i, i + BATCH)
    const found = await Api.list({ shikimori_ids: part.map((r) => r.shikimori_id), limit: BATCH }, { ttl: 0 })
    const byShiki = new Map(found.map((a) => [Number(a.remote_ids?.shikimori_id), a]))
    for (const r of part) {
      const a = byShiki.get(r.shikimori_id)
      if (!a) plan.missing++
      else if (listOf(a.anime_id) !== null) plan.already++
      else plan.items.push({ id: a.anime_id, title: a.title, list: LIST_OF[r.status] ?? 1, ...(r.score > 0 && { rate: r.score }) })
    }
    onProgress(Math.min(i + BATCH, rates.length), rates.length)
  }
  return plan
}

/** Записать план в аккаунт. Возвращает, сколько тайтлов добавлено. */
export async function runImport(uid: number, items: ImportItem[], onProgress: (done: number) => void): Promise<number> {
  let done = 0
  try {
    for (let i = 0; i < items.length; i += BATCH) {
      const part = items.slice(i, i + BATCH)
      await Api.addToLists(uid, part.map(({ id, list, rate }) => ({ id, list, ...(rate && { rate }) })))
      done += part.length
      onProgress(done)
    }
  } finally {
    // И при ошибке посреди импорта: часть пачек уже на сервере, метки на карточках должны это показать.
    await reloadLists().catch(() => {})
  }
  return done
}
