<script lang="ts">
  import { untrack } from 'svelte'
  import { Api } from '../lib/api/endpoints'
  import type { BloggerVideo } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import VideoCard from '../lib/components/VideoCard.svelte'
  import { errorText } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'

  // Категории те же, что отдаёт лента (feed.blogger.videos.categories).
  const CATS = [
    { id: '', title: 'Все' },
    { id: 'review', title: 'Обзоры' },
    { id: 'top', title: 'Топы' },
    { id: 'amv', title: 'AMV' },
    { id: 'news', title: 'Новости' },
    { id: 'quiz', title: 'Викторины' },
    { id: 'other', title: 'Другое' },
  ]
  const SORTS = [
    { id: 'new', title: 'Новые' },
    { id: 'top', title: 'Популярные' },
    { id: 'old', title: 'Старые' },
  ] as const
  const PAGE = 30

  const category = $derived(route.query.get('category') ?? '')
  const sort = $derived((SORTS.find((s) => s.id === route.query.get('sort')) ?? SORTS[0]).id)

  let items: BloggerVideo[] = $state([])
  let done = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let gen = 0

  $effect(() => {
    void category
    void sort
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
      const list = await Api.bloggerVideos({ category: category || undefined, sort, offset: items.length, limit: PAGE })
      if (my !== gen) return
      // Пока листаешь, сверху могут добавить ролик — без дублей по id.
      const seen = new Set(items.map((v) => v.id))
      items = [...items, ...list.filter((v) => !seen.has(v.id))]
      done = list.length < PAGE
    } catch (e) {
      if (my === gen) error = errorText(e)
    } finally {
      if (my === gen) loading = false
    }
  }

  function setQuery(key: 'category' | 'sort', value: string) {
    const q = new URLSearchParams(route.query)
    if (value) q.set(key, value)
    else q.delete(key)
    const s = q.toString()
    go(s ? `/videos?${s}` : '/videos', true)
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
    <h1 class="block-title">Видео</h1>
    <div class="bar">
      <div class="tabs">
        {#each CATS as c (c.id)}
          <button class="btn small" class:accent={category === c.id} onclick={() => setQuery('category', c.id)}>
            {c.title}
          </button>
        {/each}
      </div>
      <select class="select sort" value={sort} onchange={(e) => setQuery('sort', e.currentTarget.value === 'new' ? '' : e.currentTarget.value)}>
        {#each SORTS as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
      </select>
    </div>
    <div class="grid">
      {#each items as v (v.id)}<VideoCard {v} />{/each}
    </div>
    {#if error}
      <Loader {error} retry={more} />
    {:else if loading}
      <Loader />
    {:else if done && !items.length}
      <p class="empty">В этой категории пока нет видео</p>
    {/if}
    {#if !done && !error}<div bind:this={sentinel} style="height:1px"></div>{/if}
  </section>
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }
  .sort {
    width: 160px;
    flex: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
    padding: 12px;
  }
  .empty {
    padding: 32px;
    text-align: center;
    color: var(--muted);
  }
</style>
