/**
 * Колёсико мыши над горизонтальной лентой листает её вбок. Когда лента упёрлась
 * в край — ничего не двигается, страница под курсором тоже стоит. Тачпад и
 * Shift+колесо не трогаем: они и так умеют вбок.
 *
 * Слушатель вешается на саму ленту, а не на window: непассивный wheel на window
 * заставляет браузер на каждый щелчок ждать JS, и обычная прокрутка страницы
 * начинает дёргаться.
 */
export function wheelScroll(node: HTMLElement) {
  node.addEventListener('wheel', onWheel, { passive: false })
  return { destroy: () => node.removeEventListener('wheel', onWheel) }
}

const LINE = 40

function onWheel(this: HTMLElement, e: WheelEvent) {
  if (e.ctrlKey || e.shiftKey) return
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return
  // Лента целиком влезла — листать нечего, пусть крутится страница.
  if (this.scrollWidth <= this.clientWidth) return

  e.preventDefault()
  const dy = e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * this.clientWidth : e.deltaY
  glideBy(this, dy)
}

// Плавную прокрутку ведём сами: scrollTo({ behavior: 'smooth' }) на каждый щелчок
// перезапускает анимацию с новой кривой, а scroll-snap дотягивает ленту назад —
// отсюда рывки. Следующий щелчок добавляется к цели, а не к текущей позиции.
const glides = new WeakMap<HTMLElement, { pos: number; target: number }>()

/** Плавно сдвинуть ленту на dx пикселей (с учётом ещё не доехавшей прокрутки). */
export function glideBy(el: HTMLElement, dx: number) {
  const max = el.scrollWidth - el.clientWidth
  const g = glides.get(el)
  const target = Math.min(max, Math.max(0, (g ? g.target : el.scrollLeft) + dx))
  if (g) {
    g.target = target
    return
  }
  if (Math.abs(target - el.scrollLeft) < 1) return
  if (document.documentElement.classList.contains('reduce-motion')) {
    el.scrollLeft = target
    return
  }

  const state = { pos: el.scrollLeft, target }
  glides.set(el, state)
  let last = performance.now()
  const step = (now: number) => {
    // Экспоненциальное приближение к цели, не зависящее от частоты кадров.
    const k = 1 - Math.pow(0.78, (now - last) / 16.7)
    last = now
    state.pos += (state.target - state.pos) * k
    if (Math.abs(state.target - state.pos) < 0.5) {
      el.scrollLeft = state.target
      glides.delete(el)
      return
    }
    el.scrollLeft = state.pos
    requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
