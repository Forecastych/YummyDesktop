<script lang="ts">
  import { untrack } from 'svelte'
  import { Plus } from '@lucide/svelte'
  import { Api } from '../lib/api/endpoints'
  import type { Collection } from '../lib/api/types'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import CollectionEditor from '../lib/components/CollectionEditor.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import { errorText } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { createCollection } from '../lib/stores/collections.svelte'

  const PAGE = 24
  const TABS = [
    { id: 'best', title: 'Лучшие' },
    { id: 'new', title: 'Новые' },
    { id: 'mine', title: 'Мои' },
  ] as const
  type Tab = (typeof TABS)[number]['id']

  const tab = $derived((route.query.get('tab') as Tab) || 'best')

  let items: Collection[] = $state([])
  let done = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let gen = 0

  $effect(() => {
    void tab
    void auth.profile
    untrack(() => {
      gen++
      items = []
      done = false
      error = null
      loading = false
      more()
    })
  })

  async function more() {
    if (loading || done) return
    if (tab === 'mine' && !auth.profile) return
    const my = gen
    loading = true
    error = null
    try {
      const q = tab === 'mine' ? { owner_id: auth.profile!.id, sort: 'new' as const } : { sort: tab }
      const list = await Api.collections({ ...q, offset: items.length, limit: PAGE })
      if (my !== gen) return
      const seen = new Set(items.map((c) => c.id))
      items = [...items, ...list.filter((c) => !seen.has(c.id))]
      done = list.length < PAGE
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

  let creating = $state(false)
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Коллекции</h1>
    <div class="bar">
      <div class="tabs">
        {#each TABS as t (t.id)}
          <button class="btn small" class:accent={tab === t.id} onclick={() => go(`/collections?tab=${t.id}`, true)}>{t.title}</button>
        {/each}
      </div>
      {#if auth.profile}
        <button class="btn primary small" onclick={() => (creating = true)}><Plus size={14} /> Создать коллекцию</button>
      {/if}
    </div>

    {#if tab === 'mine' && !auth.profile}
      <div class="empty">Свои коллекции хранятся в аккаунте YummyAnime. <a href="#/login" style="color:var(--accent)">Войти</a></div>
    {:else}
      <div class="grid list">
        {#each items as c (c.id)}<CollectionCard {c} />{/each}
      </div>
      {#if error}
        <Loader {error} retry={more} />
      {:else if loading}
        <Loader />
      {:else if done && !items.length}
        <div class="empty">{tab === 'mine' ? 'Коллекций пока нет — создайте первую.' : 'Пусто'}</div>
      {/if}
      {#if !done}<div bind:this={sentinel}></div>{/if}
    {/if}
  </section>
</div>

{#if creating}
  <CollectionEditor
    heading="Новая коллекция"
    submitText="Создать"
    onsave={async (v) => {
      const id = await createCollection({ ...v, anime_ids: [] })
      go(`/collections/${id}`)
    }}
    onclose={() => (creating = false)}
  />
{/if}

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .tabs {
    display: flex;
    gap: 6px;
  }
  .list {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    padding: 14px;
  }
</style>
