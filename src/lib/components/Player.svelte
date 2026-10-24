<script lang="ts">
  import { untrack } from 'svelte'
  import { Play, SkipForward } from '@lucide/svelte'
  import { img } from '../api/client'
  import { Api } from '../api/endpoints'
  import type { AnimeShort, Video } from '../api/types'
  import { duration as fmt } from '../format'
  import { cvhPlayerUrl, isTauri, onNative, setFullscreen } from '../native'
  import { auth } from '../stores/auth.svelte'
  import { progressOf, setProgress, touch } from '../stores/history.svelte'
  import { settings } from '../stores/settings.svelte'
  import PlayerControls, { type VideoState } from './PlayerControls.svelte'

  interface Props {
    anime: AnimeShort
    video: Video
    hasNext: boolean
    onNext: () => void
  }
  let { anime, video, hasNext, onNext }: Props = $props()

  let frame: HTMLIFrameElement | undefined = $state()
  let box: HTMLDivElement | undefined = $state()
  let time = $state(0)
  let dur = $state(0)
  let toast = $state('')
  let countdown = $state(0)
  /** Окно спрятали в трей — плеер выгружен, чтобы серия не играла в фоне. */
  let stopped = $state(false)

  $effect(() => {
    const un = onNative('tray-hidden', () => {
      stopped = true
      flushWatch()
      cancelCountdown()
    })
    return () => void un.then((f) => f())
  })

  function resume() {
    // Новый iframe начнёт с нуля — продолжение с места сработает как при открытии серии.
    resumed = false
    stopped = false
  }

  // Плеер — только https: адрес приходит с сервера, javascript:/data: в iframe не пускаем.
  // Обёртку CVH с сайта (*.yummyani.me/iframeCVH.html) без VPN не открыть — подменяем своей.
  const src = $derived.by(() => {
    const u = video.iframe_url.startsWith('//') ? 'https:' + video.iframe_url : video.iframe_url
    if (!u.startsWith('https://')) return 'about:blank'
    let url: URL
    try {
      url = new URL(u)
    } catch {
      return 'about:blank'
    }
    if (url.pathname === '/iframeCVH.html') return cvhPlayerUrl(url.search) ?? u
    return u
  })
  // Управлять снаружи умеем Kodik (его postMessage API) и CVH через свою обёртку.
  const bridge = $derived(/kodik/i.test(src) ? 'kodik' : /^(http:\/\/cvh\.localhost|cvh:)/.test(src) ? 'cvh' : null)
  const op = $derived(video.skips?.opening)
  const ed = $derived(video.skips?.ending)
  const inOpening = $derived(!!op && op.length > 0 && time >= op.time && time < op.time + op.length - 1)
  const inEnding = $derived(!!ed && ed.length > 0 && time >= ed.time && time < ed.time + ed.length - 1)

  // ---- свои кнопки: агент внутри фреймов плеера (src-tauri/scripts/player-agent.js) ----
  // Агент есть только в приложении. Не ответил или не нашёл видео — показываем родной
  // интерфейс плеера, как раньше.
  const AGENT_WAIT = 6000
  const PULSE = 300
  /** Попытки запустить плеер, у которого ещё нет <video>: раз в ~1.5 с, около 12 секунд. */
  const PLAY_EVERY = 5
  const PLAY_TRIES = 8
  const IDLE: VideoState = { paused: true, time: 0, dur: 0, buf: 0, vol: 1, muted: false, rate: 1, waiting: false }

  let agent = $state(false)
  let native = $state(!isTauri)
  let hasVideo = $state(false)
  let st = $state<VideoState>({ ...IDLE })
  /** Нажали «смотреть» (или серия запустилась сама) — заставку с постером больше не показываем. */
  let started = $state(false)
  let fs = $state(false)
  /** Запустить серию, как только плеер будет готов: после «следующей серии» или смены серии на ходу. */
  let wantPlay = false
  let playTries = 0

  const custom = $derived(isTauri && !native)
  const cover = $derived(custom && (!started || !hasVideo))
  const backdrop = $derived(img(anime.poster?.big || anime.poster?.medium))

  function cmd(name: string, extra: Record<string, unknown> = {}) {
    frame?.contentWindow?.postMessage({ __yd: 1, cmd: name, ...extra }, '*')
  }

  /** Сообщение от агента из нашего iframe или из фреймов внутри него. */
  function fromPlayer(src: MessageEventSource | null) {
    const own = frame?.contentWindow
    let w = src as Window | null
    for (let i = 0; i < 8 && w && own; i++) {
      if (w === own) return true
      if (w === window || w.parent === w) return false
      w = w.parent
    }
    return false
  }

  $effect(() => {
    const f = frame
    if (!f || !isTauri) return
    untrack(() => {
      // Новый iframe: другая серия или возврат из трея. Если видео шло — продолжаем.
      if (hasVideo && !st.paused) wantPlay = true
      agent = false
      native = false
      hasVideo = false
      st = { ...IDLE }
      started = wantPlay
      playTries = 0
    })
    const born = Date.now()
    let tick = 0
    const id = setInterval(() => {
      tick++
      if (!agent) {
        if (Date.now() - born > AGENT_WAIT) {
          native = true
          clearInterval(id)
        } else f.contentWindow?.postMessage({ __yd: 1, cmd: 'init' }, '*')
        return
      }
      if (!wantPlay || tick % PLAY_EVERY) return
      if (hasVideo && !st.paused) return void (wantPlay = false)
      if (++playTries > PLAY_TRIES) {
        wantPlay = false
        if (!hasVideo) giveUp()
        return
      }
      cmd('play')
    }, PULSE)
    return () => clearInterval(id)
  })

  /** Агент так и не нашёл видео — отдаём управление родным кнопкам плеера. */
  function giveUp() {
    cmd('reveal')
    native = true
    flash('Плеер не отдал управление — включены его кнопки')
  }

  function play() {
    started = true
    if (hasVideo && st.dur > 0) return cmd('play')
    wantPlay = true
    playTries = 0
    cmd('play')
  }

  function togglePlay() {
    if (st.paused) play()
    else cmd('pause')
  }

  function onAgent(d: Record<string, unknown>) {
    switch (d.ev) {
      case 'hello':
        agent = true
        break
      case 'video':
        if (!hasVideo) {
          hasVideo = true
          // Громкость общая для всех плееров — выставляем сразу, как появилось видео.
          cmd('volume', { v: settings.playerVolume })
          cmd('muted', { v: settings.playerMuted })
        }
        break
      case 'state':
        if (!hasVideo) onAgent({ ev: 'video' })
        st = {
          paused: !!d.paused,
          time: Number(d.time) || 0,
          dur: Number(d.dur) || 0,
          buf: Number(d.buf) || 0,
          vol: Number(d.vol ?? 1),
          muted: !!d.muted,
          rate: Number(d.rate) || 1,
          waiting: !!d.waiting,
        }
        if (!st.paused) started = true
        if (st.dur > 0) dur = st.dur
        // До старта видео стоит на нуле: перемотка на конец опенинга до загрузки потерялась бы.
        if (!st.paused || st.time > 0) onTime(st.time)
        break
      case 'ended':
        ended()
        break
    }
  }

  function setVolume(v: number) {
    settings.playerVolume = v
    cmd('volume', { v })
  }

  function setMuted(m: boolean) {
    settings.playerMuted = m
    cmd('muted', { v: m })
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else (custom ? box : frame)?.requestFullscreen().catch(() => {})
  }

  function next() {
    cancelCountdown()
    wantPlay = true
    onNext()
  }

  // Состояние, которое сбрасывается при смене серии.
  let resumed = false
  let skippedOp = false
  let skippedEd = false
  let lastSaved = 0
  let countdownTimer: ReturnType<typeof setInterval> | undefined

  // Позиция для сайта: как и сайт, шлём её при смене серии и выходе, плюс раз в минуту —
  // окно может уйти в трей или быть убито, не дойдя до beforeunload.
  const WATCH_SYNC_EVERY = 60_000
  let watch: { videoId: number; time: number; times: Set<number> } | null = null
  let watchSentAt = 0

  function flushWatch(keepalive = false) {
    const w = watch
    watch = null
    watchSentAt = Date.now()
    if (!w || !auth.profile) return
    Api.markWatched(w.videoId, w.time, [...w.times], keepalive).catch(() => {})
  }

  function trackWatch(t: number) {
    if (watch?.videoId !== video.video_id) {
      watch = { videoId: video.video_id, time: t, times: new Set() }
      watchSentAt = Date.now()
    }
    // Как сайт: не ближе 10 секунд к концу, чтобы «продолжить» не открывало титры.
    watch.time = dur > 0 ? Math.max(Math.min(t, dur - 10), 0) : t
    watch.times.add(Math.round(t))
    if (Date.now() - watchSentAt >= WATCH_SYNC_EVERY) flushWatch()
  }

  $effect(() => {
    const v = video
    untrack(() => {
      time = 0
      dur = v.duration || 0
      resumed = false
      skippedOp = false
      skippedEd = false
      lastSaved = 0
      cancelCountdown()
      const p = progressOf(anime.anime_id, v.number)
      touch({
        animeId: anime.anime_id,
        url: anime.anime_url,
        title: anime.title,
        poster: anime.poster,
        videoId: v.video_id,
        episode: v.number,
        dubbing: v.data.dubbing,
        player: v.data.player,
        time: p?.time ?? 0,
        duration: p?.duration || v.duration || 0,
      })
    })
    // Сменили серию или закрыли тайтл — досылаем позицию в прошлой.
    return () => flushWatch()
  })

  function send(method: string, extra: Record<string, unknown> = {}) {
    const msg = bridge === 'kodik' ? { key: 'kodik_player_api', value: { method, ...extra } } : { method, ...extra }
    frame?.contentWindow?.postMessage(msg, '*')
  }

  function seek(seconds: number) {
    if (hasVideo) cmd('seek', { t: seconds })
    else send('seek', { seconds: Math.floor(seconds) })
  }

  function flash(text: string) {
    toast = text
    setTimeout(() => toast === text && (toast = ''), 3000)
  }

  function skipOpening() {
    if (!op) return
    skippedOp = true
    seek(op.time + op.length)
  }

  function skipEnding() {
    if (!ed) return
    skippedEd = true
    if (hasNext && settings.autoNext) next()
    else seek(ed.time + ed.length)
  }

  function startCountdown() {
    if (!hasNext || !settings.autoNext || countdownTimer) return
    countdown = 5
    countdownTimer = setInterval(() => {
      countdown--
      if (countdown <= 0) next()
    }, 1000)
  }

  function cancelCountdown() {
    clearInterval(countdownTimer)
    countdownTimer = undefined
    countdown = 0
  }

  function onTime(t: number) {
    time = t
    if (!resumed && dur > 0) {
      resumed = true
      const p = progressOf(anime.anime_id, video.number)
      if (settings.resume && p && !p.done && p.time > 15 && p.time < dur - 30 && t < 5) {
        seek(p.time)
        flash(`Продолжаем с ${fmt(p.time)}`)
        return
      }
    }
    if (inOpening && settings.autoSkipOpening && !skippedOp) {
      skipOpening()
      flash('Опенинг пропущен')
    }
    if (inEnding && settings.autoSkipEnding && !skippedEd) skipEnding()
    if (t > 0) trackWatch(t)

    // Прогресс пишем раз в 5 секунд, а не на каждый тик плеера.
    if (Math.abs(t - lastSaved) >= 5 && dur > 0) {
      lastSaved = t
      if (setProgress(anime.anime_id, video.number, t, dur)) flushWatch()
    }
  }

  function ended() {
    if (dur > 0) {
      setProgress(anime.anime_id, video.number, dur, dur)
      trackWatch(dur)
      flushWatch()
    }
    startCountdown()
  }

  function onMessage(e: MessageEvent) {
    if (!frame) return
    const a = e.data as Record<string, unknown> | null
    if (a?.__yd === 1) {
      if (fromPlayer(e.source)) onAgent(a)
      return
    }
    // Ниже — собственные события Kodik и обёртки CVH. Когда видео ведёт агент, они его дублируют.
    if (e.source !== frame.contentWindow || hasVideo) return
    const d = e.data as { key?: string; value?: unknown } | null
    if (!d || typeof d.key !== 'string') return
    // Kodik шлёт kodik_player_*, обёртка CVH — те же события без префикса.
    switch (d.key.replace(/^kodik_/, '')) {
      case 'player_duration_update':
        dur = Number(d.value) || dur
        break
      case 'player_time_update':
        onTime(Number(d.value) || 0)
        break
      case 'player_video_ended':
        ended()
        break
    }
  }

  // Полноэкранный режим растягивает только webview — растягиваем и окно.
  function onFullscreen() {
    fs = !!document.fullscreenElement
    setFullscreen(fs).catch(() => {})
  }
</script>

<svelte:window onmessage={onMessage} onbeforeunload={() => flushWatch(true)} />
<svelte:document onfullscreenchange={onFullscreen} />

<div class="player" class:fs bind:this={box}>
  {#if stopped}
    <button class="stopped" onclick={resume}>
      <span class="glass play"><Play size={34} /></span>
      <span>Пауза: окно было свёрнуто в трей</span>
      {#if time > 0}<small>Продолжить с {fmt(time)}</small>{/if}
    </button>
  {:else}
  {#key src}
    <iframe
      bind:this={frame}
      {src}
      title="{anime.title} — серия {video.number}"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowfullscreen
      referrerpolicy="origin"
      scrolling="no"
    ></iframe>
  {/key}

  {#if cover}
    <!-- Пока видео не пошло: свой постер вместо чужой заставки плеера. -->
    <button class="cover" onclick={play} disabled={started}>
      {#if backdrop}<img src={backdrop} alt="" />{/if}
      {#if started}
        <span class="spin" aria-hidden="true"></span>
      {:else}
        <span class="glass play"><Play size={34} fill="currentColor" /></span>
        <span class="cap">Серия {video.number}</span>
      {/if}
    </button>
  {:else if custom}
    <PlayerControls
      {st}
      {op}
      {ed}
      {hasNext}
      {fs}
      onToggle={togglePlay}
      onSeek={seek}
      onVolume={setVolume}
      onMute={setMuted}
      onRate={(v) => cmd('rate', { v })}
      onFullscreen={toggleFullscreen}
      onNext={next}
    />
  {/if}
  {/if}

  {#if (bridge || hasVideo) && inOpening && !settings.autoSkipOpening}
    <button class="skip glass" onclick={skipOpening}><SkipForward size={15} /> Пропустить опенинг</button>
  {:else if (bridge || hasVideo) && inEnding && !settings.autoSkipEnding}
    <button class="skip glass" onclick={skipEnding}>
      <SkipForward size={15} />
      {hasNext && settings.autoNext ? 'Следующая серия' : 'Пропустить эндинг'}
    </button>
  {/if}

  {#if countdown > 0}
    <div class="next glass">
      <div>Следующая серия через {countdown}</div>
      <div class="row">
        <button class="glass pill on" onclick={next}>Смотреть</button>
        <button class="glass pill" onclick={cancelCountdown}>Отмена</button>
      </div>
    </div>
  {/if}

  {#if toast}<div class="toast glass">{toast}</div>{/if}
</div>

{#if !bridge && native}
  <p class="hint">
    Плеер «{video.data.player.replace(/^Плеер\s+/i, '')}» не сообщает время просмотра — автопропуск и продолжение с места работают только в
    Kodik и CVH. Серия всё равно отмечается в истории.
  </p>
{/if}

<style>
  .stopped {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    color: #fff;
  }
  .stopped .play {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    padding-left: 4px;
    border-radius: 50%;
  }
  .stopped small {
    color: var(--muted);
  }
  .stopped:hover .play {
    border-color: rgba(255, 255, 255, 0.5);
    transform: scale(1.05);
  }
  .player {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: calc(100vh - var(--header-h) - 40px);
    margin: 0 auto;
    background: #000;
  }
  .player.fs {
    max-height: none;
  }
  .cover {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    overflow: hidden;
    background: #000;
    color: #fff;
  }
  .cover img {
    position: absolute;
    inset: -40px;
    width: calc(100% + 80px);
    height: calc(100% + 80px);
    object-fit: cover;
    filter: blur(28px) brightness(0.45) saturate(1.3);
  }
  .cover .play {
    position: relative;
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    padding-left: 5px;
    border-radius: 50%;
  }
  .cover:hover .play {
    border-color: rgba(255, 255, 255, 0.5);
    transform: scale(1.06);
  }
  .cover .cap {
    position: relative;
    font-size: 15px;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
  .cover .spin {
    position: relative;
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  iframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .skip {
    position: absolute;
    z-index: 4;
    right: 16px;
    bottom: 92px;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    font-weight: 600;
  }
  .next {
    position: absolute;
    z-index: 4;
    right: 16px;
    bottom: 92px;
    padding: 12px 14px;
    border-radius: 18px;
  }
  .next .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .pill {
    height: 30px;
    padding: 0 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
  }
  .toast {
    position: absolute;
    z-index: 4;
    left: 50%;
    top: 14px;
    transform: translateX(-50%);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    pointer-events: none;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
