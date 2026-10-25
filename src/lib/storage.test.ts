import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { load, remove, save } from './storage'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('storage', () => {
  it('сохраняет и читает с префиксом', () => {
    save('a', { x: 1 })
    expect(localStorage.getItem('yd.a')).toBe('{"x":1}')
    expect(load('a', null)).toEqual({ x: 1 })
  })

  it('нет ключа или битый JSON — запасное значение', () => {
    expect(load('нет', 42)).toBe(42)
    localStorage.setItem('yd.broken', '{oops')
    expect(load('broken', 'fallback')).toBe('fallback')
  })

  it('remove удаляет', () => {
    save('a', 1)
    remove('a')
    expect(load('a', null)).toBeNull()
  })

  it('при переполнении чистит кэш API, а пользовательские данные оставляет', () => {
    localStorage.setItem('yd.cache:home', '"big"')
    localStorage.setItem('yd.token', '"t"')
    const set = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => {
        throw new DOMException('full', 'QuotaExceededError')
      })
      .mockImplementation(function (this: Storage, k, v) {
        set.call(this, k, v)
      })
    save('history', [1])
    expect(localStorage.getItem('yd.cache:home')).toBeNull()
    expect(localStorage.getItem('yd.token')).toBe('"t"')
    expect(load('history', null)).toEqual([1])
  })

  it('если места нет совсем — не падает', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => save('x', 1)).not.toThrow()
  })
})
