<script lang="ts">
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { Post } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import { compact, date } from '../lib/format'
  import { link } from '../lib/router.svelte'
  import { openExternal } from '../lib/native'
  import { query } from '../lib/query.svelte'
  import { sanitize } from '../lib/sanitize'

  let { id }: { id: number } = $props()
  const post = query<Post>((signal) => Api.post(id, { signal }))
  const html = $derived(post.data ? sanitize(post.data.content) : '')

  // Внешние ссылки открываем в системном браузере, а не внутри приложения.
  function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a[data-external]') as HTMLAnchorElement | null
    if (!a) return
    e.preventDefault()
    openExternal(a.href)
  }
</script>

{#if post.data}
  {@const p = post.data}
  <div class="container page">
    <article class="block">
      <h1 class="block-title">{p.title}</h1>
      <div class="meta">
        <a class="author" href={link(`/users/${p.user.id}`)}>
          <img src={img(p.user.avatars?.small)} alt="" width="28" height="28" />
          <b>{p.user.nickname}</b>
        </a>
        <span>{date(p.created_at, true)}</span>
        <span class="chip">{p.category.title}</span>
        {#if p.views}<span>{compact(p.views)} просмотров</span>{/if}
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="content" onclick={onClick}>{@html html}</div>
    </article>
    {#if p.animes?.length}
      <section class="block">
        <h2 class="block-title">Аниме из статьи</h2>
        <Row>
          {#each p.animes as a (a.anime_id)}<AnimeCard anime={a} />{/each}
        </Row>
      </section>
    {/if}
  </div>
{:else}
  <Loader error={post.error} retry={post.retry} />
{/if}

<style>
  .page {
    max-width: 960px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  h1.block-title {
    font-size: 16px;
    text-transform: none;
  }
  .meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 18px;
    font-size: 13px;
    color: var(--muted);
    border-bottom: 1px solid var(--line);
  }
  .author {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .author:hover b {
    text-decoration: underline;
  }
  .meta img {
    width: 28px;
    height: 28px;
    border-radius: 50%;
  }
  .meta b {
    color: var(--accent);
  }
  .content {
    padding: 16px 18px 20px;
    line-height: 1.7;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .content :global(img) {
    height: auto;
    margin: 10px auto;
    border-radius: var(--radius);
  }
  .content :global(iframe) {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    height: auto;
    margin: 12px 0;
    border: 0;
    border-radius: var(--radius);
  }
  .content :global(a) {
    color: var(--accent);
    text-decoration: underline;
  }
  .content :global(blockquote) {
    margin: 10px 0;
    padding: 6px 14px;
    border-left: 3px solid var(--accent);
    background: var(--panel-2);
  }
  .content :global(p) {
    margin: 0 0 12px;
  }
</style>
