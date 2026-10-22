<script lang="ts">
  import { untrack } from 'svelte'
  import { SkipForward } from '@lucide/svelte'
  import { Api } from '../api/endpoints'
  import type { AnimeShort, Video } from '../api/types'
  import { duration as fmt } from '../format'
  import { setFullscreen } from '../native'
  import { auth } from '../stores/auth.svelte'
  import { progressOf, setProgress, touch } from '../stores/history.svelte'
  import { settings } from '../stores/settings.svelte'

  interface Props {
    anime: AnimeShort
    video: Video
    hasNext: boolean
    onNext: () => void
  }
  let { anime, video, hasNext, onNext }: Props = $props()

  let frame: HTMLIFrameElement | undefined = $state()
  let time = $state(0)
  let dur = $state(0)
  let toast = $state('')
  let countdown = $state(0)

  // Плеер — только https: адрес приходит с сервера, javascript:/data: в iframe не пускаем.
  const src = $derived.by(() => {
    const u = video.iframe_url.startsWith('//') ? 'https:' + video.iframe_url : video.iframe_url
    return u.startsWith('https://') ? u : 'about:blank'
  })
  // Управлять снаружи умеем только Kodik: у него есть postMessage API.
  const bridge = $derived(/kodik/i.test(src))
  const op = $derived(video.skips?.opening)
  const ed = $derived(video.skips?.ending)
  const inOpening = $derived(!!op && op.length > 0 && time >= op.time && time < op.time + op.length - 1)
  const inEnding = $derived(!!ed && ed.length > 0 && time >= ed.time && time < ed.time + ed.length - 1)

  // Состояние, которое сбрасывается при смене серии.
  let resumed = false
  let skippedOp = false
  let skippedEd = false
  let lastSaved = 0
  let countdownTimer: ReturnType<typeof setInterval> | undefined

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
  })

  function send(method: string, extra: Record<string, unknown> = {}) {
    frame?.contentWindow?.postMessage({ key: 'kodik_player_api', value: { method, ...extra } }, '*')
  }

  function seek(seconds: number) {
    send('seek', { seconds: Math.floor(seconds) })
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
    if (hasNext && settings.autoNext) onNext()
    else seek(ed.time + ed.length)
  }

  function startCountdown() {
    if (!hasNext || !settings.autoNext || countdownTimer) return
    countdown = 5
    countdownTimer = setInterval(() => {
      countdown--
      if (countdown <= 0) {
        cancelCountdown()
        onNext()
      }
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

    // Прогресс пишем раз в 5 секунд, а не на каждый тик плеера.
    if (Math.abs(t - lastSaved) >= 5 && dur > 0) {
      lastSaved = t
      const crossed = setProgress(anime.anime_id, video.number, t, dur)
      if (crossed && auth.profile) Api.markWatched(video.video_id, t, dur).catch(() => {})
    }
  }

  function onMessage(e: MessageEvent) {
    if (!frame || e.source !== frame.contentWindow) return
    const d = e.data as { key?: string; value?: unknown } | null
    if (!d || typeof d.key !== 'string') return
    switch (d.key) {
      case 'kodik_player_duration_update':
        dur = Number(d.value) || dur
        break
      case 'kodik_player_time_update':
        onTime(Number(d.value) || 0)
        break
      case 'kodik_player_video_ended':
        if (dur > 0) {
          const crossed = setProgress(anime.anime_id, video.number, dur, dur)
          if (crossed && auth.profile) Api.markWatched(video.video_id, dur, dur).catch(() => {})
        }
        startCountdown()
        break
    }
  }

  // Полноэкранный режим iframe растягивает только webview — растягиваем и окно.
  function onFullscreen() {
    setFullscreen(!!document.fullscreenElement).catch(() => {})
  }
</script>

<svelte:window onmessage={onMessage} />
<svelte:document onfullscreenchange={onFullscreen} />

<div class="player">
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

  {#if bridge && inOpening && !settings.autoSkipOpening}
    <button class="skip" onclick={skipOpening}><SkipForward size={15} /> Пропустить опенинг</button>
  {:else if bridge && inEnding && !settings.autoSkipEnding}
    <button class="skip" onclick={skipEnding}>
      <SkipForward size={15} />
      {hasNext && settings.autoNext ? 'Следующая серия' : 'Пропустить эндинг'}
    </button>
  {/if}

  {#if countdown > 0}
    <div class="next">
      <div>Следующая серия через {countdown}</div>
      <div class="row">
        <button class="btn primary small" onclick={() => (cancelCountdown(), onNext())}>Смотреть</button>
        <button class="btn small" onclick={cancelCountdown}>Отмена</button>
      </div>
    </div>
  {/if}

  {#if toast}<div class="toast">{toast}</div>{/if}
</div>

{#if !bridge}
  <p class="hint">
    Плеер «{video.data.player.replace(/^Плеер\s+/i, '')}» не сообщает время просмотра — автопропуск и продолжение с места работают только в
    Kodik. Серия всё равно отмечается в истории.
  </p>
{/if}

<style>
  .player {
    position: relative;
    aspect-ratio: 16 / 9;
    max-height: calc(100vh - var(--header-h) - 40px);
    margin: 0 auto;
    background: #000;
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
    right: 16px;
    bottom: 64px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 9px 14px;
    background: rgba(0, 0, 0, 0.75);
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: var(--radius);
    color: #fff;
    font-weight: 600;
  }
  .skip:hover {
    background: var(--accent);
    border-color: var(--accent);
  }
  .next {
    position: absolute;
    right: 16px;
    bottom: 64px;
    padding: 12px 14px;
    background: rgba(0, 0, 0, 0.85);
    border-radius: var(--radius);
    color: #fff;
  }
  .next .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .toast {
    position: absolute;
    left: 50%;
    top: 14px;
    transform: translateX(-50%);
    padding: 6px 12px;
    background: rgba(0, 0, 0, 0.8);
    border-radius: var(--radius);
    color: #fff;
    font-size: 13px;
    pointer-events: none;
  }
  .hint {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
</style>
