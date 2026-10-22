<script lang="ts">
  import { Trash2 } from '@lucide/svelte'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import { ago } from '../lib/format'
  import { recent, removeFromHistory, syncHistory } from '../lib/stores/history.svelte'

  syncHistory()

  const items = $derived(recent(300))

  function clearAll() {
    if (!confirm('Очистить всю историю просмотра? Отметки о просмотренных сериях останутся.')) return
    for (const e of items) removeFromHistory(e.animeId)
  }
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">
      История просмотра
      {#if items.length}
        <button class="more" onclick={clearAll}><Trash2 size={13} /> очистить</button>
      {/if}
    </h1>
    {#if items.length}
      <div class="grid list">
        {#each items as e (e.animeId)}
          <div class="item">
            <AnimeCard
              anime={{ anime_id: e.animeId, anime_url: e.url, title: e.title, poster: e.poster }}
              sub="{e.episode ? `${e.episode} серия · ` : ''}{ago(Math.floor(e.updatedAt / 1000))}"
              progress={e.duration ? e.time / e.duration : undefined}
            />
            <div class="dub">{e.dubbing}</div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">
        Здесь появятся тайтлы, которые вы начали смотреть.<br />История хранится только на этом компьютере и
        работает без аккаунта.
      </div>
    {/if}
  </section>
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .list {
    padding: 14px;
  }
  .dub {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
