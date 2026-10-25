import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Роутер читает location при импорте — грузим его после того, как подготовили окно.
let router: typeof import('./router.svelte')
const scrollTo = vi.fn()

beforeAll(async () => {
  location.hash = '#/'
  window.scrollTo = scrollTo as typeof window.scrollTo
  // Страница «длинная», чтобы восстановление прокрутки не ждало догрузки контента.
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 100_000, configurable: true })
  router = await import('./router.svelte')
})

beforeEach(() => scrollTo.mockClear())

function setScroll(y: number) {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
}

/** Дождаться hashchange и пары кадров, в которых роутер крутит страницу. */
async function settle(act: () => void) {
  const changed = new Promise((r) => addEventListener('hashchange', r, { once: true }))
  act()
  await changed
  for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r))
}

const lastScroll = () => scrollTo.mock.calls.at(-1)

describe('match', () => {
  it('достаёт параметры из пути', () => {
    expect(router.match('/anime/:url', '/anime/igra-druzey')).toEqual({ url: 'igra-druzey' })
    expect(router.match('/user/:id/lists', '/user/42/lists')).toEqual({ id: '42' })
  })

  it('декодирует параметры', () => {
    expect(router.match('/search/:q', '/search/%D0%B8%D0%B3%D1%80%D0%B0')).toEqual({ q: 'игра' })
  })

  it('не совпадает при другой длине или другом сегменте', () => {
    expect(router.match('/anime/:url', '/anime')).toBeNull()
    expect(router.match('/anime/:url', '/anime/a/b')).toBeNull()
    expect(router.match('/anime/:url', '/post/1')).toBeNull()
  })

  it('link добавляет решётку', () => {
    expect(router.link('/anime/x')).toBe('#/anime/x')
  })
})

describe('прокрутка', () => {
  it('новый переход на уже открытую раньше страницу открывает её сверху', async () => {
    await settle(() => router.go('/anime/a'))
    setScroll(1200)
    await settle(() => router.go('/'))
    setScroll(0)
    await settle(() => router.go('/anime/a'))
    expect(router.route.path).toBe('/anime/a')
    expect(lastScroll()).toEqual([0, 0])
  })

  it('«назад» возвращает туда, где был', async () => {
    await settle(() => router.go('/anime/b'))
    setScroll(800)
    await settle(() => router.go('/'))
    setScroll(0)
    await settle(() => history.back())
    expect(router.route.path).toBe('/anime/b')
    expect(lastScroll()).toEqual([0, 800])
  })

  it('замена адреса не теряет метку записи', async () => {
    await settle(() => router.go('/anime/c'))
    setScroll(300)
    router.go('/anime/c?ep=2', true)
    expect(router.route.query.get('ep')).toBe('2')
    await settle(() => router.go('/'))
    setScroll(0)
    await settle(() => history.back())
    expect(router.route.path).toBe('/anime/c')
    expect(lastScroll()).toEqual([0, 300])
  })
})
