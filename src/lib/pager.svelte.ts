import { errorText } from './query.svelte'

/**
 * Постраничная подгрузка: копит элементы, отбрасывает дубли по id и ответы
 * на устаревший запрос (после reset). Конец — когда страница пришла неполной.
 */
export function pager<T>(load: (offset: number) => Promise<T[]>, size: number, id: (t: T) => number) {
  const s = $state({ items: [] as T[], done: false, loading: false, error: null as string | null })
  let gen = 0

  async function more() {
    if (s.loading || s.done) return
    const my = gen
    s.loading = true
    s.error = null
    try {
      const list = await load(s.items.length)
      if (my !== gen) return
      const seen = new Set(s.items.map(id))
      s.items = [...s.items, ...list.filter((t) => !seen.has(id(t)))]
      s.done = list.length < size
    } catch (e) {
      if (my === gen) s.error = errorText(e)
    } finally {
      if (my === gen) s.loading = false
    }
  }

  function reset() {
    gen++
    s.items = []
    s.done = false
    s.error = null
    s.loading = false
    return more()
  }

  return Object.assign(s, { more, reset })
}

export type Pager<T> = ReturnType<typeof pager<T>>
