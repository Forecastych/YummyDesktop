/**
 * Колёсико мыши над горизонтальной лентой листает её вбок. Когда лента упёрлась
 * в край — колёсико снова листает страницу. Тачпад и Shift+колесо не трогаем:
 * они и так умеют вбок.
 */
export function enableWheelScroll() {
  window.addEventListener('wheel', onWheel, { passive: false })
}

const LINE = 40
// Ленты с scroll-snap и отступом стоят в покое не на 0, а на величине отступа.
const EDGE = 16
// Куда едет плавная прокрутка: следующий щелчок колеса добавляется к цели,
// а не к текущей позиции, иначе быстрые щелчки «съедают» друг друга.
const targets = new WeakMap<Element, { left: number; at: number }>()

function onWheel(e: WheelEvent) {
  if (e.defaultPrevented || e.ctrlKey || e.shiftKey) return
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return

  for (let el = e.target as Element | null; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (!/auto|scroll/.test(cs.overflowX) || el.scrollWidth <= el.clientWidth) {
      // Вертикальный скролл внутри (список серий, выпадашка) важнее ленты снаружи.
      if (/auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) return
      continue
    }

    const dy = e.deltaMode === 1 ? e.deltaY * LINE : e.deltaMode === 2 ? e.deltaY * el.clientWidth : e.deltaY
    const max = el.scrollWidth - el.clientWidth
    const prev = targets.get(el)
    const base = prev && performance.now() - prev.at < 300 ? prev.left : el.scrollLeft
    if ((dy < 0 && base <= EDGE) || (dy > 0 && base >= max - EDGE)) return

    e.preventDefault()
    const left = Math.min(max, Math.max(0, base + dy))
    targets.set(el, { left, at: performance.now() })
    // Привязка к карточкам откатывает короткий шаг колеса назад — на время
    // прокрутки выключаем её, по окончании лента сама довернёт до карточки.
    const box = el as HTMLElement
    box.style.scrollSnapType = 'none'
    box.addEventListener('scrollend', () => (box.style.scrollSnapType = ''), { once: true })
    el.scrollTo({ left, behavior: 'smooth' })
    return
  }
}
