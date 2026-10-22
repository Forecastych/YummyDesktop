import { untrack } from 'svelte'
import { ApiError, isAbort } from './api/client'

export interface Query<T> {
  readonly data: T | undefined
  readonly error: string | null
  readonly loading: boolean
  retry(): void
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 404) return 'Не найдено'
    if (e.status === 429) return 'Слишком много запросов, подождите немного'
    return e.message
  }
  return 'Нет соединения с сервером'
}

/**
 * Загрузка данных для компонента. Вызывать при инициализации компонента.
 * Всё $state, прочитанное синхронно в `fn` (параметры маршрута, язык), — зависимости:
 * при их смене прошлый запрос отменяется и уходит новый.
 * `peek` отдаёт кэш синхронно — страница рисуется сразу, без спиннера.
 */
export function query<T>(fn: (signal: AbortSignal) => Promise<T>, peek?: () => T | undefined): Query<T> {
  const s = $state({ data: undefined as T | undefined, error: null as string | null, loading: true, n: 0 })

  $effect(() => {
    void s.n
    const ctrl = new AbortController()
    const cached = peek?.()
    untrack(() => {
      // Без кэша сбрасываем данные, иначе при смене тайтла мелькнёт прошлый.
      s.data = cached
      s.error = null
      s.loading = true
    })
    fn(ctrl.signal).then(
      (v) => {
        if (ctrl.signal.aborted) return
        s.data = v
        s.loading = false
      },
      (e) => {
        if (ctrl.signal.aborted || isAbort(e)) return
        s.error = errorText(e)
        s.loading = false
      },
    )
    return () => ctrl.abort()
  })

  return {
    get data() {
      return s.data
    },
    get error() {
      return s.error
    },
    get loading() {
      return s.loading
    },
    retry: () => s.n++,
  }
}
