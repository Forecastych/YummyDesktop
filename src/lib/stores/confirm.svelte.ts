// Подтверждение «точно удалить?» вместо window.confirm: тот в WebView2 рисует системное
// окно «Сообщение с tauri.localhost» мимо темы приложения. Один диалог на всё приложение
// (ConfirmDialog в App), кто угодно ждёт ответа: if (!(await ask({...}))) return.

export interface Ask {
  title: string
  text?: string
  /** Надпись на кнопке подтверждения, по умолчанию «Да». */
  ok?: string
  /** Необратимое действие: кнопка красная. */
  danger?: boolean
}

export const asking: { q: (Ask & { resolve: (ok: boolean) => void }) | null } = $state({ q: null })

export function ask(q: Ask): Promise<boolean> {
  // Новый вопрос поверх незакрытого — старый считаем отменённым.
  asking.q?.resolve(false)
  return new Promise((resolve) => (asking.q = { ...q, resolve }))
}

export function answer(ok: boolean) {
  const q = asking.q
  asking.q = null
  q?.resolve(ok)
}
