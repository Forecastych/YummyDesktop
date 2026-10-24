// Агент плеера: даёт приложению свои кнопки поверх любого плеера (Kodik, Alloha, CVH…).
// Tauri кладёт скрипт во все фреймы, но он молчит, пока родитель не позовёт его
// сообщением {__yd:1, cmd:'init'}. Зовёт только приложение — своему iframe с плеером,
// дальше фреймы передают зов вниз по цепочке. Чужие фреймы (вход на сайт, капча) его
// не получают и живут как обычно.
//
// Фрейм, в котором нашёлся <video>, прячет всё, кроме картинки, и шлёт приложению
// (window.top) его состояние. Его родители оставляют видимым только iframe, ведущий
// к видео. Команды (play, pause, seek…) идут сверху вниз через все фреймы.
;(() => {
  if (window.top === window) return

  const TAG = '__yd'
  const post = (w, m) => {
    try {
      w.postMessage({ [TAG]: 1, ...m }, '*')
    } catch {}
  }
  const up = (m) => post(window.top, m)

  let active = false
  let video = null
  /** Элемент, оставленный видимым: свой <video> или iframe, за которым видео. */
  let shown = null
  let shownStyle = null
  let bare = false
  let revealed = false

  const STYLE = `
html.yd-bare, html.yd-bare body { background: #000 !important; overflow: hidden !important; }
html.yd-bare * { visibility: hidden !important; }
`
  const SHOW = {
    visibility: 'visible',
    position: 'fixed',
    inset: '0',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    'max-width': 'none',
    'max-height': 'none',
    margin: '0',
    padding: '0',
    border: '0',
    transform: 'none',
    opacity: '1',
    'z-index': '2147483647',
    background: '#000',
    'object-fit': 'contain',
  }

  function setBare(on) {
    if (revealed) on = false
    if (on === bare) return
    bare = on
    let st = document.getElementById('yd-bare')
    if (on && !st) {
      st = document.createElement('style')
      st.id = 'yd-bare'
      st.textContent = STYLE
      document.documentElement.appendChild(st)
    }
    document.documentElement.classList.toggle('yd-bare', on)
  }

  /** Inline + important: перебивает стили плеера и работает внутри shadow DOM. */
  function show(el) {
    if (shown === el) return
    unshow()
    if (revealed) return
    shown = el
    shownStyle = el.getAttribute('style')
    for (const [k, v] of Object.entries(SHOW)) el.style.setProperty(k, v, 'important')
    setBare(true)
  }

  function unshow() {
    if (!shown) return
    if (shownStyle == null) shown.removeAttribute('style')
    else shown.setAttribute('style', shownStyle)
    shown = null
    shownStyle = null
  }

  // ---- поиск видео (в том числе в открытых shadow root) ----

  const score = (v) =>
    (v.currentSrc || v.src ? 4 : 0) + (v.duration > 0 ? 2 : 0) + (v.offsetWidth * v.offsetHeight > 0 ? 1 : 0)

  function findVideo(root, depth) {
    let best = null
    for (const v of root.querySelectorAll('video')) if (!best || score(v) > score(best)) best = v
    if (depth < 3) {
      for (const el of root.querySelectorAll('*')) {
        if (!el.shadowRoot) continue
        const v = findVideo(el.shadowRoot, depth + 1)
        if (v && (!best || score(v) > score(best))) best = v
      }
    }
    return best
  }

  const EVENTS = [
    'play',
    'pause',
    'playing',
    'waiting',
    'seeking',
    'seeked',
    'timeupdate',
    'durationchange',
    'loadedmetadata',
    'progress',
    'volumechange',
    'ratechange',
    'emptied',
  ]

  function bufferedEnd(v) {
    const b = v.buffered
    const t = v.currentTime
    for (let i = 0; i < b.length; i++) if (b.start(i) <= t + 0.5 && b.end(i) >= t) return b.end(i)
    return t
  }

  let pending = false
  function report() {
    if (pending) return
    pending = true
    setTimeout(() => {
      pending = false
      const v = video
      if (!v) return
      up({
        ev: 'state',
        paused: v.paused,
        time: v.currentTime || 0,
        dur: Number.isFinite(v.duration) ? v.duration : 0,
        buf: bufferedEnd(v),
        vol: v.volume,
        muted: v.muted,
        rate: v.playbackRate,
        waiting: !v.paused && (v.seeking || v.readyState < 3),
      })
    }, 50)
  }
  const onEnded = () => up({ ev: 'ended' })

  function adopt(v) {
    if (video === v) return
    if (video) {
      for (const e of EVENTS) video.removeEventListener(e, report)
      video.removeEventListener('ended', onEnded)
    }
    video = v
    for (const e of EVENTS) v.addEventListener(e, report)
    v.addEventListener('ended', onEnded)
    show(v)
    post(window.parent, { ev: 'video' })
    report()
  }

  function scan() {
    const v = findVideo(document, 0)
    if (v && v !== video) adopt(v)
  }

  // ---- старт плеера, у которого ещё нет <video>: жмём его собственную кнопку ----

  function kick() {
    const was = bare
    // Спрятанные элементы elementFromPoint не видит — на мгновение показываем всё.
    // Кадр не успевает отрисоваться: всё происходит синхронно.
    document.documentElement.classList.remove('yd-bare')
    const x = innerWidth / 2
    const y = innerHeight / 2
    const el = document.elementFromPoint(x, y)
    if (was) document.documentElement.classList.add('yd-bare')
    // В центре чужой iframe — нажмёт агент внутри него.
    if (!el || el.tagName === 'IFRAME') return
    const opt = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opt, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mousedown', opt))
    el.dispatchEvent(new PointerEvent('pointerup', { ...opt, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mouseup', opt))
    el.dispatchEvent(new MouseEvent('click', opt))
  }

  function play() {
    const v = video
    if (v && (v.currentSrc || v.src)) {
      v.play().catch(() => kick())
      return
    }
    kick()
  }

  function run(d) {
    const v = video
    switch (d.cmd) {
      case 'play':
        play()
        break
      case 'pause':
        v?.pause()
        break
      case 'seek':
        if (v && Number.isFinite(d.t)) v.currentTime = Math.max(0, d.t)
        break
      case 'volume':
        if (v && Number.isFinite(d.v)) v.volume = Math.min(1, Math.max(0, d.v))
        break
      case 'muted':
        if (v) v.muted = !!d.v
        break
      case 'rate':
        if (v && Number.isFinite(d.v)) v.playbackRate = d.v
        break
      case 'reveal':
        // Своими кнопками управлять не вышло — возвращаем плееру его родной интерфейс.
        revealed = true
        unshow()
        setBare(false)
        break
    }
  }

  const kids = () => document.querySelectorAll('iframe')
  const toKids = (m) => {
    for (const f of kids()) if (f.contentWindow) post(f.contentWindow, m)
  }

  function activate() {
    if (active) return
    active = true
    up({ ev: 'hello', href: location.href })
    // Плеер может пересоздать свои фреймы и <video> — переспрашиваем, пока живы.
    setInterval(() => {
      toKids({ cmd: 'init' })
      scan()
    }, 700)
    scan()
  }

  window.addEventListener('message', (e) => {
    const d = e.data
    if (!d || typeof d !== 'object' || d[TAG] !== 1) return
    if (e.source === window.parent && typeof d.cmd === 'string') {
      if (d.cmd === 'init') return activate(), toKids(d)
      if (!active) return
      run(d)
      toKids(d)
      return
    }
    // Дочерний фрейм нашёл видео — оставляем видимым только его iframe.
    if (active && d.ev === 'video' && !video) {
      for (const f of kids()) {
        if (f.contentWindow !== e.source) continue
        show(f)
        post(window.parent, { ev: 'video' })
        break
      }
    }
  })
})()
