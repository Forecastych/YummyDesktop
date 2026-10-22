<script lang="ts" generics="T">
  import type { Pager } from '../pager.svelte'
  import Loader from './Loader.svelte'

  // Хвост бесконечного списка: спиннер, ошибка с повтором и невидимый
  // датчик, который просит следующую страницу заранее, за 600px до конца.
  let { p, empty = 'Пусто' }: { p: Pager<T>; empty?: string } = $props()

  let sentinel: HTMLDivElement | undefined = $state()
  // Наблюдатель пересоздаётся после каждой загрузки: если датчик всё ещё в зоне
  // (страница короче экрана), новый сразу сообщит об этом и попросит ещё.
  $effect(() => {
    if (!sentinel || p.loading) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && p.more(), { rootMargin: '600px' })
    io.observe(sentinel)
    return () => io.disconnect()
  })
</script>

{#if p.error}
  <Loader error={p.error} retry={p.more} small />
{:else if p.loading}
  <Loader small />
{:else if p.done && !p.items.length}
  <p class="empty">{empty}</p>
{/if}
{#if !p.done && !p.error}<div bind:this={sentinel} style="height:1px"></div>{/if}
