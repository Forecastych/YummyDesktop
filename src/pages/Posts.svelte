<script lang="ts">
  import { untrack } from 'svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { PostCategory, PostShort } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import { date } from '../lib/format'
  import { errorText, query } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'

  // Пока категории не пришли (или сервер не ответил) — известный набор.
  const FALLBACK = [
    { id: 'anime_news', title: 'Новости аниме' },
    { id: 'site_news', title: 'Новости сайта' },
    { id: 'articles', title: 'Статьи' },
    { id: 'interview', title: 'Интервью' },
  ]
  const cats = query<PostCategory[]>(() => Api.postCategories())
  const CATS = $derived([
    { id: '', title: 'Все' },
    ...(cats.data?.length
      ? cats.data.map((c) => ({ id: c.uri, title: c.title.charAt(0).toUpperCase() + c.title.slice(1) }))
      : FALLBACK),
  ])

  const category = $derived(route.query.get('category') ?? '')
  let items: PostShort[] = $state([])
  let done = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let gen = 0

  $effect(() => {
    void category
    untrack(() => {
      gen++
      items = []
      done = false
      loading = false
      more()
    })
  })

  async function more() {
    if (loading || done) return
    const my = gen
    loading = true
    error = null
    try {
      const list = await Api.posts(items.length, category || undefined)
      if (my !== gen) return
      items = [...items, ...list]
      done = list.length < 20
    } catch (e) {
      if (my === gen) error = errorText(e)
    } finally {
      if (my === gen) loading = false
    }
  }

  let sentinel: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!sentinel) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && more(), { rootMargin: '600px' })
    io.observe(sentinel)
    return () => io.disconnect()
  })
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Новости и статьи</h1>
    <div class="tabs">
      {#each CATS as c (c.id)}
        <button class="btn small" class:accent={category === c.id} onclick={() => go(c.id ? `/posts?category=${c.id}` : '/posts', true)}>
          {c.title}
        </button>
      {/each}
    </div>
    <div class="list">
      {#each items as p (p.id)}
        <a class="post" href="#/posts/{p.id}">
          {#if p.preview_image}
            <img src={img(p.preview_image)} alt="" loading="lazy" width="240" height="135" />
          {:else}
            <div class="noimg"></div>
          {/if}
          <div class="text">
            <h2>{p.title}</h2>
            <div class="meta">
              <span class="chip">{p.category.title}</span>
              {date(p.created_at, true)} · {p.user.nickname}
            </div>
            {#if p.content_preview}<p>{p.content_preview}</p>{/if}
          </div>
        </a>
      {/each}
    </div>
    {#if error}
      <Loader {error} retry={more} />
    {:else if loading}
      <Loader />
    {/if}
    {#if !done && !error}<div bind:this={sentinel} style="height:1px"></div>{/if}
  </section>
</div>

<style>
  .page {
    max-width: 1000px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .post {
    display: flex;
    gap: 16px;
    padding: 14px;
    border-bottom: 1px solid var(--line);
    content-visibility: auto;
    contain-intrinsic-size: auto 165px;
  }
  .post:hover h2 {
    color: var(--accent);
  }
  img,
  .noimg {
    width: 240px;
    height: 135px;
    object-fit: cover;
    border-radius: var(--radius);
    flex: none;
    background: var(--panel-2);
  }
  .text {
    min-width: 0;
  }
  h2 {
    margin: 0 0 6px;
    font-size: 16px;
    line-height: 1.35;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  p {
    margin: 8px 0 0;
    color: var(--text-2);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
