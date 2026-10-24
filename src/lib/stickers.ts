// Стикеры и смайлы из наборов Telegram (scripts/fetch-stickers.py). В тексте сообщения —
// код :<набор><номер>:, например :pp12:. Сайт и другие клиенты видят его как есть,
// у нас он превращается в картинку. Разбор общий — для лички и будущих чатов.
import manifest from './stickers.json'

export type StickerKind = 'sticker' | 'emoji'
export interface Sticker {
  pack: string
  n: number
  emoji: string
  kind: StickerKind
  /** Убран из набора: старые сообщения его показывают, в выборе его нет. */
  gone?: boolean
}
export interface Pack {
  id: string
  title: string
  kind: StickerKind
  items: Sticker[]
}

export const PACKS: Pack[] = Object.entries(manifest).map(([id, p]) => {
  const kind = p.kind as StickerKind
  return { id, title: p.title, kind, items: p.items.map((it) => ({ pack: id, n: it.n, emoji: it.emoji, kind, gone: 'gone' in it })) }
})

const BY_CODE = new Map(PACKS.flatMap((p) => p.items.map((s) => [code(s), s] as const)))

const CODE = /:([a-z]+\d{1,4}):/g

export function code(s: Pick<Sticker, 'pack' | 'n'>) {
  return `:${s.pack}${s.n}:`
}

export const stickerUrl = (s: Pick<Sticker, 'pack' | 'n'>) => `/stickers/${s.pack}/${s.n}.webp`

/** Текст кусками: строки и стикеры. Незнакомые коды остаются текстом. */
export function splitStickers(text: string): (string | Sticker)[] {
  const out: (string | Sticker)[] = []
  let last = 0
  for (const m of text.matchAll(CODE)) {
    const s = BY_CODE.get(m[0])
    if (!s) continue
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(s)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Сообщение из одного стикера (не смайла) — его показываем крупно и без пузыря. */
export function soleSticker(text: string): Sticker | null {
  const s = BY_CODE.get(text.trim())
  return s?.kind === 'sticker' ? s : null
}

/** Сколько смайлов в сообщении, если кроме них там ничего нет; 0 — есть текст. */
export function emojiOnly(text: string) {
  const parts = splitStickers(text.trim())
  const ok = parts.every((p) => (typeof p === 'string' ? !p.trim() : p.kind === 'emoji'))
  return ok ? parts.filter((p) => typeof p !== 'string').length : 0
}

/** Для превью диалога и уведомлений: стикер — его эмодзи и подпись, смайл — эмодзи. */
export function stickersPlain(text: string) {
  return text.replace(CODE, (c) => {
    const s = BY_CODE.get(c)
    if (!s) return c
    return s.kind === 'sticker' ? `${s.emoji} Стикер`.trim() : s.emoji || c
  })
}
