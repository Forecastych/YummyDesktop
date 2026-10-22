<script lang="ts">
  import { untrack } from 'svelte'
  import { Api } from '../lib/api/endpoints'
  import More from '../lib/components/More.svelte'
  import ReviewCard from '../lib/components/ReviewCard.svelte'
  import { pager } from '../lib/pager.svelte'
  import { go, route } from '../lib/router.svelte'

  const SORTS = [
    { id: 'new', title: 'Новые' },
    { id: 'top', title: 'Лучшие' },
    { id: 'old', title: 'Старые' },
  ] as const
  const PAGE = 20

  const sort = $derived((SORTS.find((s) => s.id === route.query.get('sort')) ?? SORTS[0]).id)
  const p = pager((offset) => Api.reviews({ sort, offset, limit: PAGE }), PAGE, (r) => r.review_id)

  $effect(() => {
    void sort
    untrack(p.reset)
  })
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Рецензии</h1>
    <div class="bar">
      {#each SORTS as s (s.id)}
        <button class="btn small" class:accent={sort === s.id} onclick={() => go(s.id === 'new' ? '/reviews' : `/reviews?sort=${s.id}`, true)}>
          {s.title}
        </button>
      {/each}
    </div>
    <div class="list">
      {#each p.items as r (r.review_id)}<ReviewCard {r} />{/each}
    </div>
    <More {p} empty="Рецензий пока нет" />
  </section>
</div>

<style>
  .page {
    max-width: 1000px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .bar {
    display: flex;
    gap: 6px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
  }
  .list {
    display: grid;
    gap: 10px;
    padding: 12px;
  }
  .list:empty {
    display: none;
  }
</style>
