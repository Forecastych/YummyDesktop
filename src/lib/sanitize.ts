// Санитайзер HTML постов: белый список тегов/атрибутов, iframe — только YouTube/VK.
// Ссылки на yummyani.me/catalog/item/* переписываются во внутренние маршруты.

const ALLOWED = new Set([
  'P', 'BR', 'HR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'IMG', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
  'H1', 'H2', 'H3', 'H4', 'SPAN', 'DIV', 'FIGURE', 'FIGCAPTION', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'IFRAME',
])
const IFRAME_HOSTS = /^(www\.)?(youtube\.com|youtube-nocookie\.com|vk\.com|vkvideo\.ru|rutube\.ru)$/

function abs(u: string) {
  return u.startsWith('//') ? 'https:' + u : u
}

export function internalLink(href: string): string | null {
  const m = href.match(/yumm?y-?ani(?:me)?\.(?:me|ru|tv)\/catalog\/item\/([\w-]+)/)
  return m ? `#/anime/${m[1]}` : null
}

export function sanitize(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild as HTMLElement
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...child.childNodes)
        continue
      }
      for (const attr of [...child.attributes]) {
        const keep =
          (attr.name === 'href' && child.tagName === 'A') ||
          (attr.name === 'src' && (child.tagName === 'IMG' || child.tagName === 'IFRAME')) ||
          attr.name === 'alt' ||
          (attr.name === 'style' && /^text-align:\s*\w+;?$/.test(attr.value))
        if (!keep) child.removeAttribute(attr.name)
      }
      if (child.tagName === 'A') {
        const href = abs(child.getAttribute('href') ?? '')
        const inner = internalLink(href)
        if (inner) child.setAttribute('href', inner)
        else if (/^https?:/.test(href)) {
          child.setAttribute('href', href)
          child.setAttribute('data-external', '')
        } else child.removeAttribute('href')
      }
      if (child.tagName === 'IMG') {
        child.setAttribute('src', abs(child.getAttribute('src') ?? ''))
        child.setAttribute('loading', 'lazy')
        child.setAttribute('decoding', 'async')
      }
      if (child.tagName === 'IFRAME') {
        let ok = false
        try {
          ok = IFRAME_HOSTS.test(new URL(abs(child.getAttribute('src') ?? '')).hostname)
        } catch {
          ok = false
        }
        if (!ok) {
          child.remove()
          continue
        }
        child.setAttribute('src', abs(child.getAttribute('src')!))
        child.setAttribute('loading', 'lazy')
        child.setAttribute('allowfullscreen', '')
        child.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
      }
      walk(child)
    }
  }
  walk(root)
  return root.innerHTML
}

/** Текст комментария: экранируем, переводы строк и [спойлер] — в разметку. */
export function commentHtml(text: string): string {
  const esc = text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
  return esc
    .replace(/\[(?:спойлер|spoiler)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:спойлер|spoiler)\]/gi, '<span class="spoiler" tabindex="0">$1</span>')
    .replace(/\n/g, '<br>')
}
