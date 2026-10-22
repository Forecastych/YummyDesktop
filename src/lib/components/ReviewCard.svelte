<script lang="ts">
  import { Eye, MessageSquare, ThumbsUp } from '@lucide/svelte'
  import { img } from '../api/client'
  import type { Review } from '../api/types'
  import { ago, compact, rateColor } from '../format'
  import { link } from '../router.svelte'
  import { plainText } from '../sanitize'

  // showAnime — в ленте рецензий; на странице тайтла постер не нужен.
  let { r, showAnime = true }: { r: Review; showAnime?: boolean } = $props()

  const text = $derived(plainText(r.text_preview))
  const title = $derived(text.split('\n')[0])
  const body = $derived(text.slice(title.length).trim())
  const avg = $derived(Math.round(r.rating.average * 10) / 10)
</script>

<article class="rcard">
  {#if showAnime && r.anime}
    <a class="poster" href={link(`/anime/${r.anime.anime_url}`)} title={r.anime.title}>
      <img src={img(r.anime.poster?.small)} alt="" loading="lazy" decoding="async" />
    </a>
  {/if}
  <div class="main">
    <div class="head">
      <a class="author" href={link(`/users/${r.author.id}`)}>
        <img class="ava" src={img(r.author.avatars?.small)} alt="" width="24" height="24" loading="lazy" />
        <b>{r.author.nickname}</b>
      </a>
      <span class="muted">{ago(r.create_date)}</span>
      <span class="score" style:background={rateColor(avg)}>{avg}</span>
    </div>
    {#if showAnime && r.anime}
      <a class="anime" href={link(`/anime/${r.anime.anime_url}`)}>{r.anime.title}</a>
    {/if}
    <a class="text" href={link(`/reviews/${r.review_id}`)}>
      {#if title}<b>{title}</b>{/if}
      {#if body}<span>{body}</span>{/if}
    </a>
    <div class="foot">
      <span><ThumbsUp size={13} />{r.likes?.likes ?? r.total_likes ?? 0}</span>
      <span><Eye size={13} />{compact(r.views ?? 0)}</span>
      {#if r.comments_count}<span><MessageSquare size={13} />{r.comments_count}</span>{/if}
      <a class="read" href={link(`/reviews/${r.review_id}`)}>Читать полностью</a>
    </div>
  </div>
</article>

<style>
  .rcard {
    display: flex;
    gap: 14px;
    padding: 14px;
    border-radius: var(--radius);
    background: var(--panel-2);
  }
  .poster {
    flex: none;
    width: 90px;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--panel-3);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .author {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .author:hover b {
    color: var(--accent);
  }
  .ava {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--panel-3);
  }
  .score {
    margin-left: auto;
    min-width: 32px;
    padding: 2px 6px;
    border-radius: var(--radius);
    background: var(--panel-3);
    color: #222;
    font-weight: 700;
    text-align: center;
  }
  .anime {
    font-weight: 700;
    color: var(--accent);
  }
  .text {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    white-space: pre-line;
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-2);
  }
  .text b {
    color: var(--text);
  }
  .text b + span::before {
    content: '\A';
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-top: auto;
    font-size: 12px;
    color: var(--muted);
  }
  .foot span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .read {
    margin-left: auto;
    font-weight: 700;
    text-transform: uppercase;
  }
  .read:hover {
    color: var(--accent);
  }
</style>
