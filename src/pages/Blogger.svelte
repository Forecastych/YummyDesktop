<script lang="ts">
  import { untrack } from 'svelte'
  import { Bell, BellOff, User } from '@lucide/svelte'
  import { clearCache, img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { Blogger } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import VideoCard from '../lib/components/VideoCard.svelte'
  import { plural } from '../lib/format'
  import { setTitle } from '../lib/native'
  import { pager } from '../lib/pager.svelte'
  import { errorText, query } from '../lib/query.svelte'
  import { go, link, route } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'

  let { id }: { id: number } = $props()
  const blogger = query<Blogger>((signal) => Api.blogger(id, { signal }))

  const SORTS = [
    { id: 'new', title: 'Новые' },
    { id: 'top', title: 'Популярные' },
    { id: 'old', title: 'Старые' },
  ] as const
  const PAGE = 30

  const category = $derived(route.query.get('category') ?? '')
  const sort = $derived((SORTS.find((s) => s.id === route.query.get('sort')) ?? SORTS[0]).id)

  const videos = pager(
    (offset) => Api.bloggerVideosOf(id, { category: category || undefined, sort, offset, limit: PAGE }),
    PAGE,
    (v) => v.id,
  )

  $effect(() => {
    void category
    void sort
    untrack(() => videos.reset())
  })

  function setQuery(key: 'category' | 'sort', value: string) {
    const q = new URLSearchParams(route.query)
    if (value) q.set(key, value)
    else q.delete(key)
    const s = q.toString()
    go(s ? `/bloggers/${id}?${s}` : `/bloggers/${id}`, true)
  }

  let sentinel: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!sentinel) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && videos.more(), { rootMargin: '600px' })
    io.observe(sentinel)
    return () => io.disconnect()
  })

  // ---------- подписка ----------

  let subscribed = $state(false)
  let subscribers = $state(0)
  let busy = $state(false)
  let subError = $state<string | null>(null)

  $effect(() => {
    subscribed = !!blogger.data?.is_subscribed
    subscribers = blogger.data?.subscriptions ?? 0
  })

  async function toggleSubscribe() {
    if (busy) return
    const on = !subscribed
    busy = true
    subError = null
    subscribed = on
    subscribers += on ? 1 : -1
    try {
      await Api.subscribeBlogger(id, on)
      clearCache(`/bloggers/${id}`)
    } catch (e) {
      subscribed = !on
      subscribers += on ? -1 : 1
      subError = errorText(e)
    } finally {
      busy = false
    }
  }

  $effect(() => {
    if (blogger.data) setTitle(`${blogger.data.nickname} — видео блогера — YummyDesktop`)
  })
</script>

{#if blogger.data}
  {@const b = blogger.data}
  <div class="container page">
    <section class="block">
      <div class="head">
        <img class="ava" src={img(b.avatars?.big)} alt="" width="96" height="96" />
        <div class="who">
          <h1>{b.nickname}</h1>
          <div class="stats">
            <span>{b.videos_count} {plural(b.videos_count, 'видео', 'видео', 'видео')}</span>
            <span>· {subscribers} {plural(subscribers, 'подписчик', 'подписчика', 'подписчиков')}</span>
          </div>
          {#if subError}<div class="err">{subError}</div>{/if}
        </div>
        <div class="actions">
          <a class="btn small" href={link(`/users/${b.id}`)}><User size={14} /> Профиль</a>
          {#if auth.profile && auth.profile.id !== b.id}
            <button class="btn small" class:accent={!subscribed} disabled={busy} onclick={toggleSubscribe}>
              {#if subscribed}<BellOff size={14} /> Отписаться{:else}<Bell size={14} /> Подписаться{/if}
            </button>
          {:else if !auth.profile}
            <span class="muted hint">Подписаться можно после входа</span>
          {/if}
        </div>
      </div>
    </section>

    <section class="block">
      <div class="bar">
        <div class="tabs">
          <button class="btn small" class:accent={!category} onclick={() => setQuery('category', '')}>Все</button>
          {#each b.categories as c (c.id)}
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
        {#each videos.items as v (v.id)}<VideoCard {v} />{/each}
      </div>
      {#if videos.error}
        <Loader error={videos.error} retry={videos.more} />
      {:else if videos.loading}
        <Loader />
      {:else if videos.done && !videos.items.length}
        <p class="empty">{category ? 'В этой категории у блогера нет видео' : 'У блогера пока нет видео'}</p>
      {/if}
      {#if !videos.done && !videos.error}<div bind:this={sentinel} style="height:1px"></div>{/if}
    </section>
  </div>
{:else}
  <Loader error={blogger.error} retry={blogger.retry} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 20px;
  }
  .ava {
    flex: none;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    border: 3px solid var(--accent);
    object-fit: cover;
    background: var(--panel-3);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 24px;
    overflow-wrap: anywhere;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-2);
  }
  .err {
    margin-top: 6px;
    font-size: 12px;
    color: var(--accent);
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    flex: none;
  }
  .actions .btn {
    gap: 6px;
  }
  .hint {
    font-size: 12px;
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
