<script lang="ts" module>
  /** Что агент плеера сообщает о <video> (см. src-tauri/scripts/player-agent.js). */
  export interface VideoState {
    paused: boolean
    time: number
    dur: number
    buf: number
    vol: number
    muted: boolean
    rate: number
    waiting: boolean
  }
</script>

<script lang="ts">
  import { Check, Maximize, Minimize, Pause, PictureInPicture2, Play, Settings, SkipForward, Volume1, Volume2, VolumeX } from '@lucide/svelte'
  import type { Skip } from '../api/types'
  import { duration as fmt } from '../format'
  import { settings } from '../stores/settings.svelte'

  interface Props {
    st: VideoState
    op: Skip | null | undefined
    ed: Skip | null | undefined
    hasNext: boolean
    fs: boolean
    /** Окно сжато до мини-плеера поверх остальных. */
    mini: boolean
    onToggle: () => void
    onSeek: (t: number) => void
    onVolume: (v: number) => void
    onMute: (m: boolean) => void
    onRate: (r: number) => void
    onFullscreen: () => void
    onNext: () => void
    onMini: () => void
  }
  let { st, op, ed, hasNext, fs, mini, onToggle, onSeek, onVolume, onMute, onRate, onFullscreen, onNext, onMini }: Props = $props()

  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
  const HIDE_AFTER = 2500

  let idle = $state(false)
  let hovered = $state(false)
  let menuOpen = $state(false)
  let idleTimer: ReturnType<typeof setTimeout> | undefined

  // Прогресс: позиция под курсором и перетаскивание.
  let bar: HTMLDivElement | undefined = $state()
  let hoverT: number | null = $state(null)
  let hoverX = $state(0)
  let barW = $state(0)
  let tipW = $state(0)
  let dragT: number | null = $state(null)
  let vol: HTMLDivElement | undefined = $state()
  let volDrag = $state(false)

  // Значок по центру, как на YouTube: мигает при паузе, перемотке и громкости.
  let pulse = $state<{ id: number; kind: 'play' | 'pause' | 'text'; text?: string } | null>(null)
  let pulseId = 0
  let pulseTimer: ReturnType<typeof setTimeout> | undefined

  const shown = $derived(!idle || st.paused || menuOpen || dragT != null || volDrag)
  const t = $derived(dragT ?? st.time)
  const pct = (x: number) => (st.dur > 0 ? `${Math.min(100, Math.max(0, (x / st.dur) * 100))}%` : '0%')
  const chapter = (x: number) =>
    op && op.length > 0 && x >= op.time && x < op.time + op.length
      ? 'Опенинг'
      : ed && ed.length > 0 && x >= ed.time && x < ed.time + ed.length
        ? 'Эндинг'
        : ''
  const level = $derived(st.muted ? 0 : st.vol)

  function wake() {
    idle = false
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => (idle = true), HIDE_AFTER)
  }
  $effect(() => () => {
    clearTimeout(idleTimer)
    clearTimeout(pulseTimer)
  })

  function flash(kind: 'play' | 'pause' | 'text', text?: string) {
    pulse = { id: ++pulseId, kind, text }
    clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => (pulse = null), 650)
  }

  function toggle() {
    flash(st.paused ? 'play' : 'pause')
    onToggle()
  }

  function seekBy(d: number) {
    if (!(st.dur > 0)) return
    onSeek(Math.min(st.dur - 0.5, Math.max(0, st.time + d)))
    flash('text', d > 0 ? `+${d} с` : `−${-d} с`)
  }

  function setVol(v: number) {
    v = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100
    onVolume(v)
    if (v > 0 && st.muted) onMute(false)
  }

  // ---- полоса прогресса ----

  function timeAt(e: PointerEvent) {
    const r = bar!.getBoundingClientRect()
    const k = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    // offsetWidth — в CSS-пикселях, как и left подсказки (rect при CSS zoom больше).
    barW = bar!.offsetWidth
    hoverX = k * barW
    return k * st.dur
  }

  function barDown(e: PointerEvent) {
    if (!(st.dur > 0) || e.button !== 0) return
    bar!.setPointerCapture(e.pointerId)
    dragT = timeAt(e)
  }
  function barMove(e: PointerEvent) {
    if (!(st.dur > 0)) return
    const x = timeAt(e)
    hoverT = x
    if (dragT != null) dragT = x
  }
  function barUp() {
    if (dragT == null) return
    onSeek(dragT)
    dragT = null
  }

  // ---- громкость ----

  function volAt(e: PointerEvent) {
    const r = vol!.getBoundingClientRect()
    setVol((e.clientX - r.left) / r.width)
  }
  function volDown(e: PointerEvent) {
    if (e.button !== 0) return
    vol!.setPointerCapture(e.pointerId)
    volDrag = true
    volAt(e)
  }

  // ---- клавиатура: как на YouTube ----

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.altKey || e.metaKey) return
    const el = e.target as HTMLElement
    if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
    // Пробел на кнопке или ссылке вне плеера — это нажатие на неё, а не пауза.
    if (e.code === 'Space' && el.closest('button, a, [role="button"]') && !el.closest('.ctl')) return
    const near = fs || hovered
    let done = true
    switch (e.code) {
      case 'Space':
      case 'KeyK':
        toggle()
        break
      case 'ArrowLeft':
        seekBy(-5)
        break
      case 'ArrowRight':
        seekBy(5)
        break
      case 'KeyJ':
        seekBy(-10)
        break
      case 'KeyL':
        seekBy(10)
        break
      case 'KeyF':
        onFullscreen()
        break
      case 'KeyI':
        onMini()
        break
      case 'KeyM':
        onMute(!st.muted)
        flash('text', st.muted ? 'Звук включён' : 'Без звука')
        break
      case 'KeyN':
        if (e.shiftKey && hasNext) onNext()
        else done = false
        break
      case 'ArrowUp':
      case 'ArrowDown':
        // Стрелки вверх-вниз листают страницу — громкость только когда плеер под курсором.
        if (!near) return
        setVol(level + (e.code === 'ArrowUp' ? 0.05 : -0.05))
        flash('text', `${Math.round(Math.min(1, Math.max(0, level + (e.code === 'ArrowUp' ? 0.05 : -0.05))) * 100)}%`)
        break
      default:
        done = false
    }
    if (done) {
      e.preventDefault()
      wake()
    }
  }

  function closeMenuOutside(e: PointerEvent) {
    if (menuOpen && !(e.target as HTMLElement).closest('.menu, .gear')) menuOpen = false
  }
</script>

<svelte:window onkeydown={onKey} onpointerdown={closeMenuOutside} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="ctl"
  class:shown
  class:hovered
  onpointermove={wake}
  onpointerdown={wake}
  onpointerenter={() => ((hovered = true), wake())}
  onpointerleave={() => ((hovered = false), (idle = true), (hoverT = null))}
  onmousedown={(e) => e.preventDefault()}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="hit" onclick={toggle} ondblclick={onFullscreen}></div>

  {#if st.waiting}
    <div class="spin" aria-hidden="true"></div>
  {/if}

  {#if pulse}
    {#key pulse.id}
      <div class="pulse glass" class:text={pulse.kind === 'text'}>
        {#if pulse.kind === 'play'}<Play size={30} fill="currentColor" />{:else if pulse.kind === 'pause'}<Pause
            size={30}
            fill="currentColor"
          />{:else}{pulse.text}{/if}
      </div>
    {/key}
  {/if}

  <div class="bottom">
    <div
      class="bar"
      class:drag={dragT != null}
      bind:this={bar}
      role="slider"
      tabindex="-1"
      aria-label="Перемотка"
      aria-valuemin={0}
      aria-valuemax={Math.round(st.dur)}
      aria-valuenow={Math.round(t)}
      onpointerdown={barDown}
      onpointermove={barMove}
      onpointerup={barUp}
      onpointercancel={() => (dragT = null)}
      onpointerleave={() => (hoverT = null)}
    >
      <div class="track">
        <div class="buf" style:width={pct(st.buf)}></div>
        {#if hoverT != null}<div class="hov" style:width={pct(hoverT)}></div>{/if}
        <div class="played" style:width={pct(t)}></div>
        {#each [op, ed] as s, i (i)}
          {#if s && s.length > 0 && st.dur > 0}
            <div class="seg" style:left={pct(s.time)} style:width={pct(s.length)}></div>
          {/if}
        {/each}
      </div>
      <div class="thumb" style:left={pct(t)}></div>
      {#if hoverT != null}
        <!-- Не даём подсказке вылезти за края плеера. -->
        <div
          class="tip glass"
          bind:offsetWidth={tipW}
          style:left="{Math.min(barW - tipW / 2, Math.max(tipW / 2, hoverX))}px"
        >
          {#if chapter(hoverT)}<b>{chapter(hoverT)}</b>{/if}
          {fmt(hoverT)}
        </div>
      {/if}
    </div>

    <div class="row">
      <div class="group">
        <button class="btn glass" title={st.paused ? 'Смотреть (k)' : 'Пауза (k)'} onclick={toggle}>
          {#if st.paused}<Play size={22} fill="currentColor" />{:else}<Pause size={22} fill="currentColor" />{/if}
        </button>
        {#if hasNext}
          <button class="btn glass" title="Следующая серия (Shift+N)" onclick={onNext}>
            <SkipForward size={20} fill="currentColor" />
          </button>
        {/if}
        <div class="vol glass" class:open={volDrag}>
          <button class="btn" title={st.muted ? 'Включить звук (m)' : 'Без звука (m)'} onclick={() => onMute(!st.muted)}>
            {#if level === 0}<VolumeX size={21} />{:else if level < 0.5}<Volume1 size={21} />{:else}<Volume2 size={21} />{/if}
          </button>
          <div
            class="vslider"
            bind:this={vol}
            role="slider"
            tabindex="-1"
            aria-label="Громкость"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(level * 100)}
            onpointerdown={volDown}
            onpointermove={(e) => volDrag && volAt(e)}
            onpointerup={() => (volDrag = false)}
            onpointercancel={() => (volDrag = false)}
          >
            <div class="vtrack"><div class="vfill" style:width="{level * 100}%"></div></div>
            <div class="vthumb" style:left="{level * 100}%"></div>
          </div>
        </div>
      </div>

      <div class="glass time">
        <span>{fmt(t)} <i>/</i> {fmt(st.dur)}</span>
        {#if chapter(t)}<span class="chap">· {chapter(t)}</span>{/if}
      </div>

      <div class="sp"></div>

      <div class="group">
        <button class="btn glass gear" class:spun={menuOpen} title="Настройки" onclick={() => (menuOpen = !menuOpen)}>
          <Settings size={20} />
          {#if st.rate !== 1}<span class="badge">{st.rate}×</span>{/if}
        </button>
        <button class="btn glass" class:on={mini} title={mini ? 'Вернуть окно (i)' : 'Мини-плеер поверх окон (i)'} onclick={onMini}>
          <PictureInPicture2 size={20} />
        </button>
        <button class="btn glass" title={fs ? 'Выйти из полноэкранного режима (f)' : 'Во весь экран (f)'} onclick={onFullscreen}>
          {#if fs}<Minimize size={20} />{:else}<Maximize size={20} />{/if}
        </button>
      </div>
    </div>

    {#if menuOpen}
      <div class="menu glass">
        <div class="mtitle">Скорость</div>
        <div class="rates">
          {#each RATES as r (r)}
            <button class="rate" class:on={st.rate === r} onclick={() => onRate(r)}>{r === 1 ? 'Обычная' : `${r}×`}</button>
          {/each}
        </div>
        <div class="msep"></div>
        <label class="opt">
          <span>Пропускать опенинг</span>
          <input type="checkbox" class="sw" bind:checked={settings.autoSkipOpening} />
        </label>
        <label class="opt">
          <span>Пропускать эндинг</span>
          <input type="checkbox" class="sw" bind:checked={settings.autoSkipEnding} />
        </label>
        <label class="opt">
          <span>Следующая серия сама</span>
          <input type="checkbox" class="sw" bind:checked={settings.autoNext} />
        </label>
        <div class="mhint"><Check size={12} /> Работает во всех плеерах</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .ctl {
    position: absolute;
    inset: 0;
    z-index: 2;
    cursor: none;
    user-select: none;
  }
  .ctl.shown {
    cursor: default;
  }
  /* Затемнение снизу — чтобы кнопки читались на светлой картинке. */
  .ctl::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 160px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
    opacity: 0;
    transition: opacity 0.25s;
    pointer-events: none;
  }
  .shown::after {
    opacity: 1;
  }
  .hit {
    position: absolute;
    inset: 0;
  }

  .bottom {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 12px;
    z-index: 1;
    opacity: 0;
    transform: translateY(6px);
    transition:
      opacity 0.25s,
      transform 0.25s;
    pointer-events: none;
  }
  .shown .bottom {
    opacity: 1;
    transform: none;
  }
  /* Курсор в плеере, но кнопки уже спрятались: клик по месту кнопки должен попасть
     в кнопку, а не провалиться на паузу. */
  .shown .bottom,
  .hovered .bottom {
    pointer-events: auto;
  }

  /* ---- прогресс ---- */
  .bar {
    position: relative;
    height: 18px;
    margin: 0 4px 6px;
    cursor: pointer;
    touch-action: none;
  }
  .track {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    overflow: hidden;
    transition:
      height 0.12s,
      margin-top 0.12s;
  }
  .bar:hover .track,
  .bar.drag .track {
    height: 6px;
    margin-top: -3px;
  }
  .buf,
  .hov,
  .played {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
  }
  .buf {
    background: rgba(255, 255, 255, 0.3);
  }
  .hov {
    background: rgba(255, 255, 255, 0.25);
  }
  .played {
    background: linear-gradient(90deg, #ff8a8a, var(--accent));
    box-shadow: 0 0 10px rgba(255, 102, 102, 0.6);
  }
  /* Опенинг и эндинг — светлые отрезки на полосе. */
  .seg {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(255, 230, 140, 0.45);
    mix-blend-mode: screen;
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 3px rgba(255, 102, 102, 0.45),
      0 2px 6px rgba(0, 0, 0, 0.5);
    transform: scale(0);
    transition: transform 0.12s;
  }
  .bar:hover .thumb,
  .bar.drag .thumb {
    transform: scale(1);
  }
  .tip {
    position: absolute;
    bottom: 22px;
    transform: translateX(-50%);
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
  }
  .tip b {
    margin-right: 6px;
    font-weight: 600;
    color: #ffe08c;
  }

  /* ---- кнопки: отдельные стеклянные круги и пилюли, как в iOS и новом YouTube ---- */
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sp {
    flex: 1;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .btn {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    color: #fff;
    transition:
      background 0.15s,
      border-color 0.15s,
      transform 0.1s;
  }
  .btn:active {
    transform: scale(0.92);
  }
  .btn.on {
    color: var(--accent);
  }
  /* Мини-плеер: окно 480×270, кнопки поменьше, без названия главы. */
  :global(html.mini) .btn {
    width: 36px;
    height: 36px;
  }
  :global(html.mini) .glass.time,
  :global(html.mini) .vol {
    height: 36px;
  }
  :global(html.mini) .chap {
    display: none;
  }
  .glass.time,
  .vol {
    display: flex;
    align-items: center;
    height: 44px;
    border-radius: 999px;
  }
  /* Кнопка звука внутри пилюли громкости — без своего стекла. Фон и рамку глобального
     .btn снимаем, иначе поверх стекла лежит тёмный непрозрачный круг. */
  .vol .btn {
    width: 42px;
    height: 42px;
    background: transparent;
    border-color: transparent;
  }
  .vol .btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .gear :global(svg) {
    transition: transform 0.3s;
  }
  .gear.spun :global(svg) {
    transform: rotate(60deg);
  }
  .badge {
    position: absolute;
    right: -4px;
    top: -4px;
    padding: 0 4px;
    border-radius: 6px;
    background: var(--accent);
    font-size: 9px;
    font-weight: 700;
    line-height: 14px;
  }
  .time {
    gap: 6px;
    padding: 0 16px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .time i {
    font-style: normal;
    opacity: 0.6;
  }
  .chap {
    color: #ffe08c;
  }

  /* Громкость раскрывается при наведении: круг вытягивается в пилюлю. */
  .vslider {
    position: relative;
    width: 0;
    height: 36px;
    margin-right: 0;
    overflow: hidden;
    cursor: pointer;
    touch-action: none;
    transition:
      width 0.2s,
      margin-right 0.2s;
  }
  .vol:hover .vslider,
  .vol.open .vslider {
    width: 72px;
    margin-right: 14px;
    overflow: visible;
  }
  .vtrack {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 4px;
    margin-top: -2px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.25);
    overflow: hidden;
  }
  .vfill {
    height: 100%;
    background: #fff;
  }
  .vthumb {
    position: absolute;
    top: 50%;
    width: 12px;
    height: 12px;
    margin: -6px 0 0 -6px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }

  /* ---- меню настроек ---- */
  .menu {
    position: absolute;
    right: 0;
    bottom: 58px;
    width: 280px;
    padding: 10px;
    border-radius: 18px;
    /* Меню с текстом темнее остального стекла, иначе на светлой картинке не прочесть. */
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05)),
      rgba(18, 18, 18, calc(var(--glass-tint) * 0.6 + 0.4));
    animation: rise 0.15s ease-out;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
  .mtitle {
    padding: 2px 6px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.7;
  }
  .rates {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .rate {
    height: 30px;
    border-radius: 999px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.08);
    transition: background 0.15s;
  }
  .rate:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  .rate.on {
    background: var(--accent);
    font-weight: 600;
  }
  .msep {
    height: 1px;
    margin: 10px 4px;
    background: rgba(255, 255, 255, 0.12);
  }
  .opt {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 6px;
    border-radius: 10px;
    font-size: 13px;
    cursor: pointer;
  }
  .opt:hover {
    background: rgba(255, 255, 255, 0.07);
  }
  .sw {
    appearance: none;
    position: relative;
    flex: none;
    width: 34px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    cursor: pointer;
    transition: background 0.2s;
  }
  .sw::after {
    content: '';
    position: absolute;
    left: 2px;
    top: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
    transition: transform 0.2s;
  }
  .sw:checked {
    background: var(--accent);
  }
  .sw:checked::after {
    transform: translateX(14px);
  }
  .mhint {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 6px 0;
    font-size: 11px;
    opacity: 0.55;
  }

  /* ---- центр: значок-вспышка и загрузка ---- */
  .pulse {
    position: absolute;
    left: 50%;
    top: 50%;
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    margin: -36px 0 0 -36px;
    border-radius: 50%;
    pointer-events: none;
    animation: pulse 0.65s ease-out forwards;
  }
  .pulse.text {
    width: auto;
    min-width: 72px;
    height: 44px;
    margin: -22px 0 0;
    padding: 0 18px;
    transform: translateX(-50%);
    border-radius: 999px;
    font-size: 15px;
    font-weight: 600;
    animation-name: pulse-text;
  }
  @keyframes pulse {
    from {
      opacity: 1;
      transform: scale(0.85);
    }
    to {
      opacity: 0;
      transform: scale(1.25);
    }
  }
  @keyframes pulse-text {
    0%,
    60% {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  .spin {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 54px;
    height: 54px;
    margin: -27px 0 0 -27px;
    border-radius: 50%;
    border: 4px solid rgba(255, 255, 255, 0.2);
    border-top-color: #fff;
    animation: spin 0.8s linear infinite;
    pointer-events: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
