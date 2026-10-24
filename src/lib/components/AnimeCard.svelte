<script lang="ts">
  import { Star, X } from '@lucide/svelte'
  import { animeMenu } from '../animeMenu'
  import type { AnimeShort } from '../api/types'
  import { avgColor, rating } from '../format'
  import { prefetchAnime } from '../prefetch'
  import { link } from '../router.svelte'
  import { openMenu } from '../stores/menu.svelte'
  import Poster from './Poster.svelte'

  interface Props {
    anime: AnimeShort
    /** Подпись сверху (например «12 серия» или место в топе). */
    badge?: string
    sub?: string
    progress?: number
    eager?: boolean
    /** Кнопка-крестик на карточке: убрать из коллекции, «не интересно». */
    onremove?: () => void
    removeTitle?: string
  }
  let { anime, badge, sub, progress, eager = false, onremove, removeTitle = 'Убрать' }: Props = $props()
  const r = $derived(rating(anime))
</script>

<a
  class="card"
  href={link(`/anime/${anime.anime_url}`)}
  use:prefetchAnime={anime.anime_url}
  title={anime.title}
  oncontextmenu={(e) => openMenu(e, animeMenu(anime))}
>
  <Poster poster={anime.poster} alt={anime.title} {eager} />
  {#if badge}<span class="badge">{badge}</span>{/if}
  {#if r}
    <span class="rating" style:color={avgColor(r)}><Star size={11} fill="currentColor" />{r.toFixed(1)}</span>
  {/if}
  <div class="caption">
    <div class="title">{anime.title}</div>
    {#if sub}<div class="sub">{sub}</div>{/if}
  </div>
  {#if onremove}
    <button
      class="remove"
      title={removeTitle}
      aria-label={removeTitle}
      onclick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onremove()
      }}><X size={14} /></button
    >
  {/if}
  {#if progress != null}
    <div class="progress"><i style:width="{Math.min(100, progress * 100)}%"></i></div>
  {/if}
</a>

<style>
  .card {
    position: relative;
    display: block;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--panel-2);
    /* Вне экрана браузер не считает раскладку и не рисует карточку. */
    content-visibility: auto;
    contain-intrinsic-size: auto 250px;
  }
  .card :global(.poster img) {
    transition:
      opacity 0.25s,
      transform 0.3s;
  }
  .card:hover :global(.poster img) {
    transform: scale(1.04);
  }
  .caption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 8px 8px 9px;
    background: var(--overlay);
    text-align: center;
  }
  .title {
    font-size: 13px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card:hover .title {
    color: var(--accent);
  }
  .sub {
    margin-top: 2px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .badge,
  .rating {
    position: absolute;
    top: 6px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 20px;
    padding: 0 6px;
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: 700;
  }
  .badge {
    left: 6px;
    background: var(--accent);
    color: #fff;
  }
  .rating {
    right: 6px;
    background: var(--overlay);
    color: var(--yellow);
  }
  .remove {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 2;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    background: var(--overlay);
    color: #fff;
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  .card:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove:hover {
    background: var(--accent);
  }
  .progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: rgba(255, 255, 255, 0.15);
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--accent);
  }
</style>
