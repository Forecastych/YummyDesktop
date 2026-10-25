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

  /** Стили-прятки внутри shadow root: правило из STYLE туда не проникает, а VK-плеер
   *  (внутри CVH) ещё и делает контейнеру all:initial — его постер и кнопка play
   *  оставались видны поверх видео. */
  const shadowStyles = []
  const setShadows = (on) => {
    for (const st of shadowStyles) st.disabled = !on
  }

  function hideShadows(el) {
    for (let root = el.getRootNode(); root instanceof ShadowRoot; root = root.host.getRootNode()) {
      if (shadowStyles.some((st) => st.parentNode === root)) continue
      const st = document.createElement('style')
      st.textContent = '* { visibility: hidden !important; }'
      st.disabled = !bare
      root.appendChild(st)
      shadowStyles.push(st)
    }
  }

  /** Предки показанного элемента с принудительной opacity: VK-плеер (после возврата
   *  из трея) вешает обёртке видео класс hidden с opacity 0 — видео играет, экран чёрный.
   *  Плеер может перерисовать стили, поэтому вызывается и из опроса. */
  let lifted = []
  function lift(el) {
    for (let p = el.parentNode; p; p = p.parentNode || p.host) {
      if (!(p instanceof Element)) continue
      if (!lifted.some(([e]) => e === p))
        lifted.push([p, p.style.getPropertyValue('opacity'), p.style.getPropertyPriority('opacity')])
      p.style.setProperty('opacity', '1', 'important')
    }
  }
  function unlift() {
    for (const [e, v, pr] of lifted) v ? e.style.setProperty('opacity', v, pr) : e.style.removeProperty('opacity')
    lifted = []
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
    setShadows(on)
  }

  /** Inline + important: перебивает стили плеера и работает внутри shadow DOM. */
  function show(el) {
    if (shown === el) return
    unshow()
    if (revealed) return
    shown = el
    shownStyle = el.getAttribute('style')
    for (const [k, v] of Object.entries(SHOW)) el.style.setProperty(k, v, 'important')
    hideShadows(el)
    lift(el)
    setBare(true)
  }

  function unshow() {
    if (!shown) return
    unlift()
    if (shownStyle == null) shown.removeAttribute('style')
    else shown.setAttribute('style', shownStyle)
    shown = null
    shownStyle = null
  }

  // ---- поиск видео (в том числе в открытых shadow root) ----

  // Играющее видео важнее всего (у VK-плеера есть пул запасных <video>), а текущему —
  // полбалла форы, чтобы при равенстве не прыгать между элементами.
  const score = (v) =>
    (!v.paused && v.readyState >= 2 ? 8 : 0) +
    (v.currentSrc || v.src ? 4 : 0) +
    (v.duration > 0 ? 2 : 0) +
    (v.offsetWidth * v.offsetHeight > 0 ? 1 : 0) +
    (v === video ? 0.5 : 0)

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
      syncSession(v)
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

  // ---- медиаклавиши и плитка Windows: MediaSession того фрейма, где играет <video> ----

  /** Что показывать в плитке; присылает приложение командой meta. */
  let meta = null

  function seekBy(dt) {
    const v = video
    if (v) v.currentTime = Math.max(0, Math.min(v.currentTime + dt, Number.isFinite(v.duration) ? v.duration : Infinity))
  }

  function applyMeta() {
    const ms = navigator.mediaSession
    if (!ms || !video || !meta) return
    try {
      ms.metadata = new MediaMetadata({
        title: meta.title || '',
        artist: meta.artist || '',
        album: 'YummyAnime',
        artwork: meta.artwork ? [{ src: meta.artwork }] : [],
      })
    } catch {}
    const set = (action, handler) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {}
    }
    set('play', () => play())
    set('pause', () => video?.pause())
    set('seekbackward', (d) => seekBy(-(d.seekOffset || 10)))
    set('seekforward', (d) => seekBy(d.seekOffset || 10))
    set('seekto', (d) => {
      if (video && Number.isFinite(d.seekTime)) video.currentTime = Math.max(0, d.seekTime)
    })
    // Следующую серию переключает приложение — у фрейма нет списка серий.
    set('nexttrack', meta.next ? () => up({ ev: 'media', action: 'nexttrack' }) : null)
  }

  function syncSession(v) {
    const ms = navigator.mediaSession
    if (!ms || !meta) return
    ms.playbackState = v.paused ? 'paused' : 'playing'
    const dur = v.duration
    if (Number.isFinite(dur) && dur > 0) {
      try {
        ms.setPositionState({ duration: dur, position: Math.min(v.currentTime || 0, dur), playbackRate: v.playbackRate || 1 })
      } catch {}
    }
  }

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
    applyMeta()
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
    setShadows(false)
    const x = innerWidth / 2
    const y = innerHeight / 2
    let el = document.elementFromPoint(x, y)
    // Хост shadow DOM (у CVH это <video-player>) отдаёт сам себя — спускаемся к тому,
    // что под точкой на самом деле.
    for (let d = 0; el?.shadowRoot && d < 3; d++) {
      const inner = el.shadowRoot.elementFromPoint(x, y)
      if (!inner || inner === el) break
      el = inner
    }
    if (was) document.documentElement.classList.add('yd-bare'), setShadows(true)
    // В центре чужой iframe — нажмёт агент внутри него.
    if (!el || el.tagName === 'IFRAME') return
    press(el, x, y)
  }

  function press(el, x, y) {
    const opt = { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, button: 0, view: window }
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opt, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mousedown', opt))
    el.dispatchEvent(new PointerEvent('pointerup', { ...opt, pointerType: 'mouse', isPrimary: true }))
    el.dispatchEvent(new MouseEvent('mouseup', opt))
    el.dispatchEvent(new MouseEvent('click', opt))
  }

  function play() {
    const v = video
    // VK-плеер (CVH), запущенный мимо своей кнопки «Смотреть», так и считает себя
    // не начатым: видео идёт, а панели управления — и меню качества в ней — нет.
    const thumb = vkRoot()?.querySelector('[data-testid=unstarted-thumb]:not(.hidden) .playButton')
    if (thumb && (!v || v.paused)) return press(thumb, innerWidth / 2, innerHeight / 2)
    if (v && (v.currentSrc || v.src)) {
      v.play().catch(() => kick())
      return
    }
    kick()
  }

  // ---- качество: родное меню плеера спрятано, список и выбор берём из его DOM ----
  // Kodik (Flowplayer): пункты .fp-quality-dropdown .items div[data-quality],
  // у текущего класс current, у недоступного — blocked. Клик ловит делегированный
  // jQuery-обработчик плеера, поэтому хватает синтетического click.
  // VK-плеер (внутри CVH) — ниже, у него меню есть в DOM, только пока открыто.

  const QUALITY_ITEMS = '.fp-quality-dropdown .items div[data-quality]'
  let qualitySig = ''
  let qualityList = []

  function sendQuality(list, cur) {
    // Фреймы без меню молчат: их пустой список затёр бы настоящий.
    if (!list.length && !qualitySig) return
    qualityList = list
    const sig = JSON.stringify([list, cur])
    if (sig === qualitySig) return
    qualitySig = sig
    up({ ev: 'quality', list, cur })
  }

  function scanQuality() {
    if (vkRoot()) return vkScanOnce()
    const list = []
    let cur = null
    for (const el of document.querySelectorAll(QUALITY_ITEMS)) {
      const id = el.getAttribute('data-quality')
      const label = el.textContent.trim() || (/^\d+$/.test(id) ? id + 'p' : id)
      const blocked = el.classList.contains('blocked')
      list.push({ id, label, blocked, title: blocked ? el.getAttribute('title') || '' : '' })
      if (el.classList.contains('current')) cur = id
    }
    sendQuality(list, cur)
  }

  // VK: Настройки → Качество → «Другое» — там пункты li[data-value] (auto, 1080p, 720p…),
  // у выбранного data-selected="true". Снаружи (через CVH) качество не переключить: команды
  // changeQuality VK-фрейм не слушает. Пока фрейм в режиме bare, меню скрыто вместе со
  // всем интерфейсом плеера, так что проход по нему не видно.

  const vkRoot = () => document.querySelector('.shadow-root-container')?.shadowRoot || null
  const VK_OTHER = '[data-testid=quality-other-settings-sub-menu]'
  let vkBusy = false
  let vkKnown = false
  let vkTries = 0

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  async function waitFor(root, sel) {
    for (let i = 0; i < 20; i++) {
      const el = root.querySelector(sel)
      if (el) return el
      await sleep(50)
    }
    return null
  }

  /** Открыть меню до подменю «Другое»; null — не вышло. Закрывает vkClose. */
  async function vkOpen(r) {
    const btn = r.querySelector('[data-testid=settings-btn]')
    if (!btn) return null
    if (!r.querySelector('[data-testid=quality-settings]')) btn.click()
    const q = await waitFor(r, '[data-testid=quality-settings]')
    q?.click()
    const other = q && (await waitFor(r, '[data-testid=quality-other-settings]'))
    other?.click()
    return other ? waitFor(r, VK_OTHER) : null
  }

  // Кнопка настроек меню только открывает — закрывает его Escape.
  function vkClose(r) {
    const m = r.querySelector('[data-testid=settings-menu]') || r.querySelector('.settings-menu-container')
    m?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, composed: true }))
  }

  async function vkScan() {
    const r = vkRoot()
    if (!r || vkBusy) return
    vkBusy = true
    try {
      const sub = await vkOpen(r)
      if (!sub) return
      const list = []
      let cur = null
      for (const li of sub.querySelectorAll('li[data-value]')) {
        const id = li.getAttribute('data-value')
        list.push({ id, label: li.getAttribute('aria-label') || id, blocked: false, title: '' })
        if (li.querySelector('[data-selected=true]')) cur = id
      }
      vkKnown = list.length > 0
      sendQuality(list, cur)
    } finally {
      vkClose(r)
      vkBusy = false
    }
  }

  // Меню появляется, когда видео уже пошло; список читаем один раз (несколько попыток).
  function vkScanOnce() {
    const v = video
    if (vkKnown || vkBusy || revealed || !bare || !v || v.currentTime < 1 || vkTries >= 5) return
    // Нет кнопки настроек — плеер ещё не начат; попытку на это не тратим.
    if (!vkRoot()?.querySelector('[data-testid=settings-btn]')) return
    vkTries++
    vkScan()
  }

  async function vkSet(id) {
    const r = vkRoot()
    if (!r || vkBusy) return
    vkBusy = true
    try {
      const sub = await vkOpen(r)
      const li = sub && [...sub.querySelectorAll('li[data-value]')].find((li) => li.getAttribute('data-value') === id)
      if (!li) return vkClose(r)
      // После выбора VK сам закрывает меню.
      li.click()
      sendQuality(qualityList, id)
    } finally {
      vkBusy = false
    }
  }

  function setQuality(id) {
    if (vkRoot()) return void vkSet(id)
    for (const el of document.querySelectorAll(QUALITY_ITEMS)) {
      if (el.getAttribute('data-quality') !== id) continue
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
      setTimeout(scanQuality, 300)
      return
    }
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
      case 'quality':
        if (typeof d.v === 'string') setQuality(d.v)
        break
      case 'meta':
        meta = d
        applyMeta()
        break
      case 'reveal':
        // Своими кнопками управлять не вышло — возвращаем плееру его родной интерфейс.
        revealed = true
        unshow()
        setBare(false)
        break
    }
  }

  /** iframe документа, в том числе внутри открытых shadow root: у CVH фрейм с видео
   *  лежит в shadow DOM элемента <video-player>, и querySelectorAll его не видит. */
  function frames(root, depth, out) {
    for (const f of root.querySelectorAll('iframe')) out.push(f)
    if (depth < 3) for (const el of root.querySelectorAll('*')) if (el.shadowRoot) frames(el.shadowRoot, depth + 1, out)
    return out
  }
  const kids = () => frames(document, 0, [])
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
      scanQuality()
      if (shown) lift(shown)
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
