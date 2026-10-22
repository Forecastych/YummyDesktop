<script lang="ts">
  import { ExternalLink, Eye, ThumbsUp } from '@lucide/svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { BloggerVideo } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import { compact, date } from '../lib/format'
  import { openExternal, setTitle } from '../lib/native'
  import { query } from '../lib/query.svelte'
  import { EMBED_SANDBOX, linkify, safeEmbed } from '../lib/sanitize'

  let { id }: { id: number } = $props()
  const video = query<BloggerVideo>((signal) => Api.bloggerVideo(id, { signal }))

  const embed = $derived(safeEmbed(video.data?.iframe_url))
  // Описание с YouTube: ссылки кликабельны, но открываются в системном браузере.
  const desc = $derived(linkify(video.data?.descriptions?.big ?? ''))
  let descOpen = $state(false)
  let spoilerOk = $state(false)

  /** Тот же ролик на YouTube — из адреса встраивания. */
  const watchUrl = $derived.by(() => {
    const m = embed?.match(/\/embed\/([\w-]{6,})/)
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : null
  })

  $effect(() => {
    if (video.data) setTitle(`${video.data.title} — YummyDesktop`)
  })
</script>

{#if video.data}
  {@const v = video.data}
  <div class="container page">
    <article class="block">
      <div class="player">
        {#if v.has_spoiler && !spoilerOk}
          <div class="cover">
            {#if v.previews?.big}<img src={img(v.previews.big)} alt="" />{/if}
            <div class="warn">
              <b>В ролике есть спойлеры</b>
              <button class="btn accent" onclick={() => (spoilerOk = true)}>Всё равно смотреть</button>
            </div>
          </div>
        {:else if embed}
          <iframe
            src={embed}
            title={v.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowfullscreen
            sandbox={EMBED_SANDBOX}
            referrerpolicy="strict-origin-when-cross-origin"
          ></iframe>
        {:else}
          <div class="cover"><div class="warn">Плеер недоступен</div></div>
        {/if}
      </div>
      <div class="info">
        <h1>{v.title}</h1>
        <div class="meta">
          <img class="ava" src={img(v.creator.avatars?.small)} alt="" width="28" height="28" />
          <b>{v.creator.nickname}</b>
          <span class="chip">{v.category.title}</span>
          <span>{date(v.publish_date, true)}</span>
          <span class="stat"><Eye size={13} />{compact(v.views)}</span>
          {#if v.likes}<span class="stat"><ThumbsUp size={13} />{compact(v.likes.likes)}</span>{/if}
          {#if watchUrl}
            <button class="link yt" onclick={() => openExternal(watchUrl)}><ExternalLink size={13} /> Открыть на YouTube</button>
          {/if}
        </div>
        {#if desc.length}
          <div class="desc" class:open={descOpen}>
            {#each desc as part, i (i)}
              {#if part.href}
                <a href={part.href} onclick={(e) => (e.preventDefault(), openExternal(part.href!))}>{part.text}</a>
              {:else}{part.text}{/if}
            {/each}
          </div>
          <button class="more" onclick={() => (descOpen = !descOpen)}>{descOpen ? 'Свернуть' : 'Показать полностью'}</button>
        {/if}
      </div>
    </article>
    {#if v.animes?.length}
      <section class="block">
        <h2 class="block-title">Аниме из видео</h2>
        <Row>
          {#each v.animes as a (a.anime_id)}<AnimeCard anime={a} />{/each}
        </Row>
      </section>
    {/if}
  </div>
{:else}
  <Loader error={video.error} retry={video.retry} />
{/if}

<style>
  .page {
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .player {
    position: relative;
    aspect-ratio: 16 / 9;
    background: #000;
  }
  iframe,
  .cover {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: blur(14px) brightness(0.5);
  }
  .warn {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    color: #fff;
  }
  .info {
    padding: 14px 16px 16px;
  }
  h1 {
    margin: 0 0 10px;
    font-size: 20px;
    line-height: 1.3;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    color: var(--muted);
  }
  .meta b {
    color: var(--text);
  }
  .ava {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--panel-2);
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .yt {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }
  .desc {
    margin-top: 14px;
    max-height: 6.5em;
    overflow: hidden;
    white-space: pre-line;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-2);
    overflow-wrap: anywhere;
  }
  .desc.open {
    max-height: none;
  }
  .desc a {
    color: var(--accent);
  }
  .more {
    margin-top: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    text-transform: uppercase;
  }
  .more:hover {
    color: var(--accent);
  }
</style>
