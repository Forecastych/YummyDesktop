// Вырезает рекламу из плееров. Tauri добавляет скрипт во все фреймы до скриптов страницы,
// поэтому подмены успевают раньше, чем плеер сохранит себе ссылки на оригиналы.
;(() => {
  const host = location.hostname
  if (host === 'tauri.localhost' || host === 'localhost' || host === '127.0.0.1') return

  // Kodik: список роликов приходит в JSON-ответе /ftor (поля vast и reserve_vast).
  // Без них плеер считает, что рекламы нет, и сразу запускает серию.
  if (/kodik|aniqit/.test(host)) {
    const parse = JSON.parse
    JSON.parse = function (text, reviver) {
      const v = parse.call(this, text, reviver)
      if (v && typeof v === 'object' && ('vast' in v || 'reserve_vast' in v)) {
        delete v.vast
        delete v.reserve_vast
        delete v.mini_banner
      }
      return v
    }
  }

  // Остальные плееры (Alloha и прочие) берут рекламу по стандарту VAST/VMAP.
  // Ответ рекламного сервера подменяем пустым VAST — для плеера это «рекламы нет».
  const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><VAST version="3.0"></VAST>'
  const isVast = (s) => /<(VAST|vmap:VMAP)[\s>]/.test(String(s).slice(0, 1024))
  const emptyDoc = () => new DOMParser().parseFromString(EMPTY, 'text/xml')

  const X = XMLHttpRequest.prototype
  const orig = (k) => Object.getOwnPropertyDescriptor(X, k).get
  const text = orig('responseText')
  const resp = orig('response')
  const xml = orig('responseXML')
  const flag = new WeakMap()

  // Проверяем только законченные текстовые ответы: видео и плейлисты идут как arraybuffer.
  const blocked = (xhr) => {
    if (flag.has(xhr)) return flag.get(xhr)
    if (xhr.readyState !== 4) return false
    let hit = false
    try {
      if (xhr.responseType === '' || xhr.responseType === 'text') hit = isVast(text.call(xhr))
      else if (xhr.responseType === 'document') hit = /^(VAST|vmap:VMAP)$/.test(xml.call(xhr)?.documentElement?.nodeName)
    } catch {}
    flag.set(xhr, hit)
    return hit
  }

  Object.defineProperties(X, {
    responseText: {
      configurable: true,
      get() {
        return blocked(this) ? EMPTY : text.call(this)
      },
    },
    response: {
      configurable: true,
      get() {
        if (!blocked(this)) return resp.call(this)
        return this.responseType === 'document' ? emptyDoc() : EMPTY
      },
    },
    responseXML: {
      configurable: true,
      get() {
        return blocked(this) ? emptyDoc() : xml.call(this)
      },
    },
  })

  const fetch = window.fetch
  if (fetch) {
    window.fetch = function (...args) {
      return fetch.apply(this, args).then((res) => {
        const type = res.headers.get('content-type') || ''
        if (type && !/xml|text\/plain/i.test(type)) return res
        if (Number(res.headers.get('content-length')) > 512 * 1024) return res
        return res
          .clone()
          .text()
          .then(
            (s) => (isVast(s) ? new Response(EMPTY, { status: 200, headers: { 'content-type': 'text/xml' } }) : res),
            () => res,
          )
      })
    }
  }
})()
