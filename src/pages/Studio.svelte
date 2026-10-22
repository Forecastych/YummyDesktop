<script lang="ts">
  import { untrack } from 'svelte'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, Ref } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import More from '../lib/components/More.svelte'
  import { setTitle } from '../lib/native'
  import { pager } from '../lib/pager.svelte'
  import { query } from '../lib/query.svelte'

  let { slug }: { slug: string } = $props()

  const SORTS = [
    { id: 'views', title: 'Популярные', forward: false },
    { id: 'rating', title: 'По рейтингу', forward: false },
    { id: 'year', title: 'Новые', forward: false },
    { id: 'title', title: 'По названию', forward: true },
  ] as const
  const PAGE = 30

  let sort = $state<(typeof SORTS)[number]>(SORTS[0])
  const studio = query<Ref>((signal) => Api.studio(slug, { signal }))

  const list = pager<AnimeShort>(
    (offset) =>
      Api.list({
        studio_ids: [studio.data!.id],
        sort: sort.id,
        sort_forward: sort.forward,
        offset,
        limit: PAGE,
      }),
    PAGE,
    (a) => a.anime_id,
  )

  // Список грузится только когда известен id студии; смена сортировки — заново.
  $effect(() => {
    if (!studio.data) return
    void sort
    untrack(() => list.reset())
  })

  $effect(() => {
    if (studio.data) setTitle(`${studio.data.title} — YummyDesktop`)
  })
</script>

{#if studio.data}
  <div class="container page">
    <section class="block">
      <div class="head">
        <h1 class="block-title">Студия {studio.data.title}</h1>
        <div class="sorts">
          {#each SORTS as s (s.id)}
            <button class="btn small" class:accent={sort.id === s.id} onclick={() => (sort = s)}>{s.title}</button>
          {/each}
        </div>
      </div>
      <div class="grid list">
        {#each list.items as a, i (a.anime_id)}
          <AnimeCard anime={a} eager={i < 12} sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')} />
        {/each}
      </div>
      <More p={list} empty="У студии пока нет тайтлов в каталоге" />
    </section>
  </div>
{:else}
  <Loader error={studio.error} retry={studio.retry} />
{/if}

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    padding-right: 14px;
  }
  .sorts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .list {
    padding: 14px;
  }
</style>
