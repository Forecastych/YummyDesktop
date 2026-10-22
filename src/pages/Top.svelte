<script lang="ts">
  import { peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import { query } from '../lib/query.svelte'

  const TYPES = [
    { id: '', title: 'Все' },
    { id: 'tv', title: 'Сериалы' },
    { id: 'movie', title: 'Фильмы' },
    { id: 'ova', title: 'OVA' },
    { id: 'ona', title: 'ONA' },
  ]
  let type = $state('')

  const filter = $derived({ sort: 'top' as const, sort_forward: true, limit: 100, types: type ? [type] : [] })
  const top = query<AnimeShort[]>(
    (signal) => Api.list(filter, { signal, ttl: 30 * 60_000 }),
    () => peek<AnimeShort[]>('/anime', { query: filter }),
  )
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">ТОП-100 аниме</h1>
    <div class="tabs">
      {#each TYPES as t (t.id)}
        <button class="btn small" class:accent={type === t.id} onclick={() => (type = t.id)}>{t.title}</button>
      {/each}
    </div>
    {#if top.data}
      <div class="grid list">
        {#each top.data as a, i (a.anime_id)}
          <AnimeCard anime={a} badge="#{i + 1}" eager={i < 12} sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')} />
        {/each}
      </div>
    {:else}
      <Loader error={top.error} retry={top.retry} />
    {/if}
  </section>
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .tabs {
    display: flex;
    justify-content: center;
    gap: 6px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .list {
    padding: 14px;
  }
</style>
