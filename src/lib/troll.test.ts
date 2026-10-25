import { describe, expect, it } from 'vitest'
import { TROLL_IDS, suspiciousLink } from './troll'

const tv = (anime_id: number, alias = 'tv') => ({ anime_id, type: { alias } }) as never

describe('suspiciousLink', () => {
  it('мемы из списка — всегда вброс', () => {
    const id = [...TROLL_IDS][0]
    expect(suspiciousLink(tv(id), { likes: 100, dislikes: 0 } as never)).toBe(true)
  })

  it('связку активно минусуют', () => {
    expect(suspiciousLink(tv(1), { likes: 3, dislikes: 2 } as never)).toBe(true)
    expect(suspiciousLink(tv(1), { likes: 10, dislikes: 2 } as never)).toBe(false)
  })

  it('короткометражке нужно больше голосов', () => {
    expect(suspiciousLink(tv(1, 'short-tv'), { likes: 4, dislikes: 0 } as never)).toBe(true)
    expect(suspiciousLink(tv(1, 'short-tv'), { likes: 5, dislikes: 0 } as never)).toBe(false)
  })

  it('обычная связка проходит', () => {
    expect(suspiciousLink(tv(5488), { likes: 7, dislikes: 1 } as never)).toBe(false)
    expect(suspiciousLink(tv(5488), undefined)).toBe(false)
  })
})
