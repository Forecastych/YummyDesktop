import { Api } from './api/endpoints'

// Наведение на карточку дольше 150 мс — подгружаем тайтл заранее,
// к клику ответ уже в кэше и страница открывается мгновенно.
let timer: ReturnType<typeof setTimeout> | undefined
const done = new Set<string>()

export function prefetchAnime(node: HTMLElement, url: string) {
  const enter = () => {
    if (done.has(url)) return
    timer = setTimeout(() => {
      done.add(url)
      Api.anime(url).catch(() => done.delete(url))
    }, 150)
  }
  const leave = () => clearTimeout(timer)
  node.addEventListener('pointerenter', enter)
  node.addEventListener('pointerleave', leave)
  node.addEventListener('focus', enter)
  return {
    update(next: string) {
      url = next
    },
    destroy() {
      node.removeEventListener('pointerenter', enter)
      node.removeEventListener('pointerleave', leave)
      node.removeEventListener('focus', enter)
    },
  }
}
