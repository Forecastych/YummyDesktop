// Короткие всплывашки внизу экрана: «Добавлено в „Просмотрено“», ошибки фоновых действий.

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'error'
}

export const toasts: Toast[] = $state([])
let seq = 0

export function toast(text: string, kind: Toast['kind'] = 'info', ms = kind === 'error' ? 5000 : 2500) {
  if (!text) return
  // Одинаковые подряд не копим — переставляем таймер у последней.
  const last = toasts.at(-1)
  if (last?.text === text) toasts.pop()
  const t = { id: ++seq, text, kind }
  toasts.push(t)
  if (toasts.length > 3) toasts.shift()
  setTimeout(() => {
    const i = toasts.findIndex((x) => x.id === t.id)
    if (i >= 0) toasts.splice(i, 1)
  }, ms)
}
