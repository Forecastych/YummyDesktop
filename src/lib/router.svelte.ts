// Минимальный hash-роутер с восстановлением прокрутки при «назад».

export interface Route {
  path: string
  query: URLSearchParams
  hash: string
}

function parse(): Route {
  const raw = location.hash.slice(1) || '/'
  const [path, qs = ''] = raw.split('?')
  return { path: decodeURI(path) || '/', query: new URLSearchParams(qs), hash: raw }
}

export const route: Route = $state(parse())

const scrollPos = new Map<string, number>()
let current = route.hash
let restoring = 0

function apply(next: Route) {
  current = next.hash
  route.path = next.path
  route.query = next.query
  route.hash = next.hash
}

addEventListener('hashchange', () => {
  scrollPos.set(current, scrollY)
  const next = parse()
  apply(next)
  restoreScroll(scrollPos.get(next.hash) ?? 0)
})

/** Страница догружает контент асинхронно, поэтому пробуем несколько кадров. */
function restoreScroll(y: number) {
  const id = ++restoring
  const started = performance.now()
  const tick = () => {
    if (id !== restoring) return
    if (document.documentElement.scrollHeight - innerHeight >= y || performance.now() - started > 1500) {
      scrollTo(0, y)
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function go(path: string, replace = false) {
  if (replace) {
    // Замена адреса без перехода (например, смена серии) — прокрутку не трогаем.
    history.replaceState(null, '', '#' + path)
    apply(parse())
  } else {
    location.hash = path
  }
}

export function back() {
  history.length > 1 ? history.back() : go('/')
}

/** Сопоставление пути с шаблоном вида `/anime/:url`. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/')
  const s = path.split('/')
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export const link = (path: string) => '#' + path
