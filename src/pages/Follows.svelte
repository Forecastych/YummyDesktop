<script lang="ts">
  import { BellOff } from '@lucide/svelte'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import { follows, toggleFollow } from '../lib/stores/follows.svelte'
  import { settings } from '../lib/stores/settings.svelte'
  import { auth } from '../lib/stores/auth.svelte'

  const items = $derived(Object.values(follows).sort((a, b) => b.fresh - a.fresh || a.title.localeCompare(b.title)))
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Подписки на новые серии</h1>
    <div class="bar">
      <label class="check">
        <input type="checkbox" bind:checked={settings.notifyEpisodes} />
        Уведомления Windows о новых сериях
      </label>
      <span class="muted">
        Проверка при запуске и каждые 30 минут, пока приложение открыто.
        {#if auth.profile}Онгоинги из списка «Смотрю» добавляются сами.{/if}
      </span>
    </div>
    {#if items.length}
      <div class="grid list">
        {#each items as f (f.id)}
          <div class="item">
            <AnimeCard
              anime={{ anime_id: f.id, anime_url: f.url, title: f.title, poster: f.poster }}
              badge={f.fresh ? `+${f.fresh}` : undefined}
              sub="вышло серий: {f.aired}"
            />
            <button
              class="btn small ghost unf"
              onclick={() => toggleFollow({ anime_id: f.id, anime_url: f.url, title: f.title, poster: f.poster })}
            >
              <BellOff size={13} /> Отписаться
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <div class="empty">
        Подписок пока нет. Откройте онгоинг и нажмите «Следить за сериями» — приложение сообщит, когда выйдет новая
        серия.
      </div>
    {/if}
  </section>
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }
  .check input {
    accent-color: var(--green);
  }
  .list {
    padding: 14px;
  }
  .unf {
    width: 100%;
    margin-top: 4px;
  }
</style>
