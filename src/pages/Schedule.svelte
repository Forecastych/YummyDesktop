<script lang="ts">
  import { img, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import { hm, weekday } from '../lib/format'
  import { prefetchAnime } from '../lib/prefetch'
  import { query } from '../lib/query.svelte'
  import { follows } from '../lib/stores/follows.svelte'

  const sched = query<AnimeShort[]>(
    (signal) => Api.schedule({ signal }),
    () => peek<AnimeShort[]>('/anime/schedule', { persist: 'schedule' }),
  )

  let onlyMine = $state(false)

  // Раскладываем по дням недели, начиная с сегодняшнего.
  const days = $derived.by(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const out = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return { from: d.getTime() / 1000, title: i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : weekday(d.getTime() / 1000), date: d, items: [] as AnimeShort[] }
    })
    for (const a of sched.data ?? []) {
      const t = a.episodes?.next_date
      if (!t) continue
      if (onlyMine && !follows[a.anime_id]) continue
      const i = Math.floor((t - out[0].from) / 86400)
      if (i >= 0 && i < 7) out[i].items.push(a)
    }
    for (const d of out) d.items.sort((x, y) => x.episodes!.next_date - y.episodes!.next_date)
    return out
  })
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Расписание выхода серий</h1>
    <div class="bar">
      <label class="check"><input type="checkbox" bind:checked={onlyMine} /> Только мои подписки</label>
      <span class="muted">Время — по часам вашего компьютера</span>
    </div>
    {#if sched.data}
      <div class="days">
        {#each days as d (d.from)}
          <div class="day">
            <h3>
              {d.title}
              <small>{d.date.toLocaleDateString('ru', { day: 'numeric', month: 'long' })}</small>
            </h3>
            {#each d.items as a (a.anime_id)}
              <a class="item" class:mine={follows[a.anime_id]} href="#/anime/{a.anime_url}" use:prefetchAnime={a.anime_url}>
                <img src={img(a.poster?.small)} alt="" width="34" height="48" loading="lazy" />
                <span class="meta">
                  <span class="t">{a.title}</span>
                  <span class="s">
                    <b>{hm(new Date(a.episodes!.next_date * 1000))}</b> · {a.episodes!.aired + 1} серия{a.episodes!.count ? ` из ${a.episodes!.count}` : ''}
                  </span>
                </span>
              </a>
            {:else}
              <div class="none">—</div>
            {/each}
          </div>
        {/each}
      </div>
    {:else}
      <Loader error={sched.error} retry={sched.retry} />
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
    justify-content: space-between;
    align-items: center;
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
  .days {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1px;
    background: var(--line);
  }
  .day {
    background: var(--panel);
    padding-bottom: 6px;
  }
  h3 {
    margin: 0;
    padding: 10px 12px 6px;
    font-size: 13px;
    text-transform: uppercase;
    color: var(--accent);
  }
  h3 small {
    margin-left: 6px;
    color: var(--muted);
    text-transform: none;
    font-weight: 400;
  }
  .item {
    display: flex;
    gap: 8px;
    padding: 5px 12px;
  }
  .item:hover {
    background: var(--panel-2);
  }
  .item:hover .t {
    color: var(--accent);
  }
  .item.mine .t {
    color: var(--green);
  }
  img {
    width: 34px;
    height: 48px;
    object-fit: cover;
    border-radius: 2px;
    flex: none;
    background: var(--panel-2);
  }
  .meta {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 0;
  }
  .t {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .s {
    font-size: 12px;
    color: var(--muted);
  }
  .s b {
    color: var(--yellow);
  }
  .none {
    padding: 6px 12px;
    color: var(--muted);
  }
</style>
