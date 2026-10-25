import { describe, expect, it } from 'vitest'
import { PACKS, code, emojiOnly, soleSticker, splitStickers, stickerUrl, stickersPlain } from './stickers'

const first = PACKS[0].items[0]
const second = PACKS[0].items[1]

describe('манифест', () => {
  it('наборы не пустые, номера в наборе не повторяются', () => {
    expect(PACKS.length).toBeGreaterThan(0)
    for (const p of PACKS) {
      expect(p.items.length).toBeGreaterThan(0)
      expect(new Set(p.items.map((s) => s.n)).size).toBe(p.items.length)
    }
  })

  it('код и путь к картинке', () => {
    expect(code({ pack: 'pp', n: 12 })).toBe(':pp12:')
    expect(stickerUrl({ pack: 'pp', n: 12 })).toBe('/stickers/pp/12.webp')
  })
})

describe('splitStickers', () => {
  it('режет текст на строки и стикеры', () => {
    expect(splitStickers(`привет ${code(first)} как дела`)).toEqual(['привет ', first, ' как дела'])
  })

  it('незнакомый код остаётся текстом', () => {
    expect(splitStickers('время :zz9999: ок')).toEqual(['время :zz9999: ок'])
  })

  it('стикеры подряд', () => {
    expect(splitStickers(code(first) + code(second))).toEqual([first, second])
  })
})

describe('emojiOnly', () => {
  it('считает смайлы, если кроме них ничего нет', () => {
    const emoji = PACKS.find((p) => p.kind === 'emoji')!.items[0]
    expect(emojiOnly(` ${code(emoji)} ${code(emoji)} `)).toBe(2)
    expect(emojiOnly(`${code(emoji)} текст`)).toBe(0)
    expect(emojiOnly('просто текст')).toBe(0)
  })
})

describe('soleSticker', () => {
  it('смайл крупно не показываем', () => {
    const emoji = PACKS.find((p) => p.kind === 'emoji')!.items[0]
    expect(soleSticker(code(emoji))).toBeNull()
    expect(soleSticker('текст')).toBeNull()
  })
})

describe('stickersPlain', () => {
  it('смайл — в эмодзи, незнакомый код как есть', () => {
    const emoji = PACKS.find((p) => p.kind === 'emoji')!.items[0]
    expect(stickersPlain(`ок ${code(emoji)} :zz1:`)).toBe(`ок ${emoji.emoji} :zz1:`)
  })
})
