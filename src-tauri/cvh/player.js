// Обёртка над плеером CDNVideoHub — замена ru.yummyani.me/iframeCVH.html, который
// без VPN не открывается. Страницу отдаёт само приложение со схемы cvh://, то есть
// с чужого для него origin: к окну приложения и IPC доступа нет, общение только
// через postMessage. События те же, что шлёт обёртка сайта (player_*).
;(async () => {
  if (window.top === window) return

  const q = new URLSearchParams(location.search)
  const send = (key, value) => window.parent.postMessage({ key, value }, '*')

  // Плеер помнит своё состояние между запусками; продолжение с места ведёт приложение.
  try {
    localStorage.removeItem('state_player_data')
    localStorage.removeItem('player_data')
  } catch {}

  await customElements.whenDefined('video-player')
  const el = document.createElement('video-player')

  // Реклама: плеер спрашивает свой контроллер, пора ли показать преролл, мидролл или
  // паузролл. Отвечаем «нет» — и ролики даже не запрашиваются.
  const ads = el.adController
  if (ads) {
    ads.shouldShowPreroll = ads.shouldShowMidroll = ads.shouldShowPauseroll = () => false
    ads.hasVastUrls = () => false
  }

  const attrs = {
    'priority-voice': q.get('dubbing_code') || '',
    episode: q.get('episode') || '',
    'data-aggregator': 'mali',
    'data-title-id': q.get('anime_id') || '',
    'data-publisher-id': '745',
    'is-show-voice-only': 'true',
    'disable-licensed': 'true',
  }
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.getElementById('player').appendChild(el)

  el.addEventListener('currentTime', (e) => {
    const t = Number(e.detail?.time)
    if (t >= 1) send('player_time_update', t)
  })
  el.addEventListener('durationChange', (e) => {
    const d = Number(e.detail?.duration)
    if (d > 0) send('player_duration_update', d)
  })
  el.addEventListener('playComplete', () => send('player_video_ended'))

  while (!el.messageBridge?.iframe) await new Promise(requestAnimationFrame)
  const bridge = el.messageBridge

  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return
    const d = e.data
    if (d?.method === 'seek' && Number.isFinite(d.seconds)) bridge.send('seekTime', { position: d.seconds })
  })

  // Список серий и выбор озвучки есть в приложении — у плеера их прячем, как это делает сайт
  // (плеер возвращает их при каждой перерисовке, поэтому каждый кадр).
  const hide = () => {
    try {
      bridge.send('hideControls')
      bridge.send('hideNavigation')
    } finally {
      requestAnimationFrame(hide)
    }
  }
  hide()
})()
