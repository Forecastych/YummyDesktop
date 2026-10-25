import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RATE_COLORS,
  ago,
  avgColor,
  compact,
  date,
  duration,
  isOnline,
  plural,
  rateColor,
  rating,
  roleTitles,
  spent,
  userVotes,
} from './format'

const unix = (...a: [number, number, number, number?, number?]) => new Date(...a).getTime() / 1000

afterEach(() => vi.useRealTimers())

describe('date', () => {
  it('год пишет только для прошлых лет', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 25) })
    expect(date(unix(2026, 0, 5))).toBe('5 янв')
    expect(date(unix(2020, 4, 9, 9, 7), true)).toBe('9 мая 2020, 09:07')
  })
})

describe('ago', () => {
  it('переходит от минут к часам, дням и дате', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 25, 12, 0) })
    const now = Date.now() / 1000
    expect(ago(now - 30)).toBe('только что')
    expect(ago(now - 5 * 60)).toBe('5 мин назад')
    expect(ago(now - 3 * 3600)).toBe('3 ч назад')
    expect(ago(now - 2 * 86400)).toBe('2 дн назад')
    expect(ago(now - 30 * 86400)).toBe('25 сен')
  })
})

describe('duration', () => {
  it('минуты и часы', () => {
    expect(duration(65)).toBe('1:05')
    expect(duration(3725)).toBe('1:02:05')
    expect(duration(59.9)).toBe('0:59')
  })

  it('отрицательное — ноль', () => {
    expect(duration(-5)).toBe('0:00')
  })
})

describe('rating', () => {
  it('принимает число и объект, округляет до десятых', () => {
    expect(rating({ rating: 8.30705 } as never)).toBe(8.3)
    expect(rating({ rating: { average: 7.75 } } as never)).toBe(7.8)
  })

  it('без оценки — null', () => {
    expect(rating({ rating: 0 } as never)).toBeNull()
    expect(rating({ rating: undefined } as never)).toBeNull()
  })
})

describe('цвета оценок', () => {
  it('rateColor держится в шкале 1–10', () => {
    expect(rateColor(1)).toBe(RATE_COLORS[0])
    expect(rateColor(10)).toBe(RATE_COLORS[9])
    expect(rateColor(15)).toBe(RATE_COLORS[9])
    expect(rateColor(0.4)).toBe(RATE_COLORS[0])
    expect(rateColor(null)).toBeUndefined()
  })

  it('avgColor растягивает 6–9.5 на всю шкалу', () => {
    expect(avgColor(6)).toBe(RATE_COLORS[0])
    expect(avgColor(9.5)).toBe(RATE_COLORS[9])
    expect(avgColor(8.3)).not.toBe(avgColor(9.2))
  })
})

describe('plural', () => {
  const p = (n: number) => plural(n, 'серия', 'серии', 'серий')
  it.each([
    [1, 'серия'],
    [2, 'серии'],
    [5, 'серий'],
    [11, 'серий'],
    [12, 'серий'],
    [21, 'серия'],
    [22, 'серии'],
    [111, 'серий'],
    [0, 'серий'],
  ])('%i → %s', (n, word) => expect(p(n)).toBe(word))
})

describe('compact', () => {
  it.each([
    [999, '999'],
    [1000, '1K'],
    [1500, '1.5K'],
    [587_054, '587.1K'],
    [1_000_000, '1M'],
    [3_869_000, '3.9M'],
  ])('%i → %s', (n, s) => expect(compact(n)).toBe(s))

  it('у границы тысяч не пишет «1000K»', () => {
    expect(compact(999_960)).toBe('1M')
  })
})

describe('spent', () => {
  it.each([
    [45 * 60, '45 мин'],
    [3600, '1 ч'],
    [12 * 3600 + 5 * 60, '12 ч 5 мин'],
    [601 * 3600 + 20 * 60, '601 ч'],
  ])('%i с → %s', (sec, s) => expect(spent(sec)).toBe(s))
})

describe('мелочи', () => {
  it('userVotes — плюсы минус минусы', () => {
    expect(userVotes({ likes: 7, dislikes: 1 } as never)).toBe(6)
    expect(userVotes(undefined)).toBe(0)
  })

  it('roleTitles выкидывает служебные роли и повторы', () => {
    expect(roleTitles(['root', 'admin', 'banned', 'blogger'])).toEqual(['Администратор', 'Блогер'])
    expect(roleTitles(undefined)).toEqual([])
  })

  it('isOnline — последние 5 минут', () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 25, 12, 0) })
    const now = Date.now() / 1000
    expect(isOnline(now - 60)).toBe(true)
    expect(isOnline(now - 600)).toBe(false)
    expect(isOnline(undefined)).toBe(false)
  })
})
