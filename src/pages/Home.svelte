<script lang="ts">
  import { untrack } from 'svelte'
  import { ChevronDown, ChevronUp, X } from '@lucide/svelte'
  import { img, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, Feed } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import { ago, date, hm } from '../lib/format'
  import { prefetchAnime } from '../lib/prefetch'
  import { query } from '../lib/query.svelte'
  import { follows } from '../lib/stores/follows.svelte'
  import { feedWatches, recent, removeFromHistory } from '../lib/stores/history.svelte'

  const SEASONS = ['', 'зимы', 'весны', 'лета', 'осени']
  /** Сколько обновлений видно в свёрнутом списке. */
  const UPDATES_COLLAPSED = 8
  let updatesOpen = $state(false)

  const feed = query<Feed>(
    (signal) => Api.feed(untrack(feedWatches), { signal }),
    () => peek<Feed>('/feed', { query: { watches: untrack(feedWatches) }, persist: 'feed' }),
  )

  const cont = $derived(recent(20))
  const fresh = $derived(Object.values(follows).filter((f) => f.fresh > 0))

  // Расписание на сегодня: тайтлы, у которых следующая серия выходит до конца дня.
  const today = $derived.by(() => {
    const items = feed.data?.schedule ?? []
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    const now = Date.now() / 1000 - 6 * 3600
    return items
      .filter((a) => a.episodes && a.episodes.next_date > now && a.episodes.next_date * 1000 <= end.getTime())
      .sort((a, b) => a.episodes!.next_date - b.episodes!.next_date)
      .slice(0, 12)
  })

  function ep(a: AnimeShort) {
    return a.episodes ? `${a.episodes.aired} из ${a.episodes.count || '?'}` : ''
  }
</script>

<div class="container page">
  {#if fresh.length}
    <section class="block">
      <h2 class="block-title">Вышли новые серии <a class="more" href="#/follows">все подписки</a></h2>
      <Row>
        {#each fresh as f (f.id)}
          <AnimeCard
            anime={{ anime_id: f.id, anime_url: f.url, title: f.title, poster: f.poster }}
            badge="+{f.fresh}"
            sub="{f.aired} серия"
          />
        {/each}
      </Row>
    </section>
  {/if}

  {#if cont.length}
    <section class="block">
      <h2 class="block-title">Продолжить просмотр <a class="more" href="#/history">история</a></h2>
      <Row>
        {#each cont as e (e.animeId)}
          <div class="cont">
            <AnimeCard
              anime={{ anime_id: e.animeId, anime_url: e.url, title: e.title, poster: e.poster }}
              sub="{e.episode} серия · {e.dubbing}"
              progress={e.duration ? e.time / e.duration : undefined}
            />
            <button class="remove" title="Убрать из истории" onclick={() => removeFromHistory(e.animeId)}>
              <X size={14} />
            </button>
          </div>
        {/each}
      </Row>
    </section>
  {/if}

  {#if feed.data}
    {@const f = feed.data}
    <section class="block">
      <h2 class="block-title">
        Аниме {SEASONS[f.top_carousel.season] ?? ''} {f.top_carousel.year}
        <a class="more" href="#/catalog?status=ongoing">все онгоинги</a>
      </h2>
      <Row>
        {#each f.top_carousel.items as a, i (a.anime_id)}
          <AnimeCard anime={a} sub={ep(a)} eager={i < 8} />
        {/each}
      </Row>
    </section>

    <div class="cols">
      <section class="block updates">
        <h2 class="block-title">Обновления аниме</h2>
        <ul>
          {#each updatesOpen ? f.new_videos : f.new_videos.slice(0, UPDATES_COLLAPSED) as v (v.video_id)}
            <li>
              <a href="#/anime/{v.anime_url}?ep={encodeURIComponent(v.ep_title)}" use:prefetchAnime={v.anime_url}>
                <img src={img(v.poster?.small)} alt="" width="40" height="56" loading="lazy" />
                <span class="u-title">{v.title}</span>
                <span class="u-ep">{v.ep_title} серия</span>
                <span class="u-dub">{v.dub_title}</span>
                <span class="u-time">{ago(v.date)}</span>
              </a>
            </li>
          {/each}
        </ul>
        {#if f.new_videos.length > UPDATES_COLLAPSED}
          <button class="expand" aria-expanded={updatesOpen} onclick={() => (updatesOpen = !updatesOpen)}>
            {#if updatesOpen}
              <ChevronUp size={14} /> Свернуть
            {:else}
              <ChevronDown size={14} /> Развернуть (ещё {f.new_videos.length - UPDATES_COLLAPSED})
            {/if}
          </button>
        {/if}
      </section>

      <aside>
        {#if today.length}
          <section class="block">
            <h2 class="block-title">Сегодня выйдут <a class="more" href="#/schedule">расписание</a></h2>
            <ul class="today">
              {#each today as a (a.anime_id)}
                <li>
                  <a href="#/anime/{a.anime_url}" use:prefetchAnime={a.anime_url}>
                    <span class="t-time">{hm(new Date(a.episodes!.next_date * 1000))}</span>
                    <span class="t-title">{a.title}</span>
                    <span class="t-ep">{a.episodes!.aired + 1} серия</span>
                  </a>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <section class="block">
          <h2 class="block-title">Новости <a class="more" href="#/posts">все</a></h2>
          <ul class="news">
            {#each f.posts.items.slice(0, 8) as p (p.id)}
              <li>
                <a href="#/posts/{p.id}">
                  {#if p.preview_image}
                    <img src={img(p.preview_image)} alt="" loading="lazy" width="96" height="54" />
                  {/if}
                  <span>
                    <span class="n-title">{p.title}</span>
                    <span class="n-meta">{p.category.title} · {date(p.created_at)}</span>
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </section>
      </aside>
    </div>

    {#if f.announcements.length}
      <section class="block">
        <h2 class="block-title">Анонсы <a class="more" href="#/catalog?status=announcement">все анонсы</a></h2>
        <Row>
          {#each f.announcements as a (a.anime_id)}
            <AnimeCard anime={a} sub={a.year ? String(a.year) : ''} />
          {/each}
        </Row>
      </section>
    {/if}

    {#if f.new.length}
      <section class="block">
        <h2 class="block-title">Новое на сайте</h2>
        <div class="grid pad">
          {#each f.new as a (a.anime_id)}
            <AnimeCard anime={a} sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')} />
          {/each}
        </div>
      </section>
    {/if}
  {:else}
    <Loader error={feed.error} retry={feed.retry} />
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .cont {
    position: relative;
  }
  .remove {
    position: absolute;
    top: 6px;
    left: 6px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 3px;
    background: var(--overlay);
    color: #fff;
    opacity: 0;
  }
  .cont:hover .remove {
    opacity: 1;
  }
  .remove:hover {
    background: var(--accent);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 380px;
    gap: 16px;
    align-items: start;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .updates li + li,
  .news li + li,
  .today li + li {
    border-top: 1px solid var(--line);
  }
  .updates a {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) 90px minmax(0, 180px) 90px;
    align-items: center;
    gap: 12px;
    padding: 6px 14px;
  }
  .updates a:hover {
    background: var(--panel-2);
  }
  .updates a:hover .u-title {
    color: var(--accent);
  }
  .expand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border-top: 1px solid var(--line);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .expand:hover {
    background: var(--panel-2);
    color: var(--accent);
  }
  .updates img {
    width: 40px;
    height: 56px;
    object-fit: cover;
    border-radius: 2px;
    background: var(--panel-2);
  }
  .u-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .u-ep {
    color: var(--green);
    font-weight: 600;
  }
  .u-dub,
  .u-time {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .u-time {
    text-align: right;
  }
  .today a {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: 10px;
    padding: 8px 14px;
    align-items: center;
  }
  .today a:hover .t-title {
    color: var(--accent);
  }
  .t-time {
    color: var(--yellow);
    font-weight: 600;
  }
  .t-title {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .t-ep {
    font-size: 12px;
    color: var(--muted);
  }
  .news a {
    display: flex;
    gap: 10px;
    padding: 8px 14px;
  }
  .news img {
    width: 96px;
    height: 54px;
    object-fit: cover;
    border-radius: 3px;
    flex: none;
    background: var(--panel-2);
  }
  .news a:hover .n-title {
    color: var(--accent);
  }
  .n-title {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.35;
  }
  .n-meta {
    display: block;
    margin-top: 3px;
    font-size: 11px;
    color: var(--muted);
  }
  .pad {
    padding: 12px;
  }
  @media (max-width: 1150px) {
    .cols {
      grid-template-columns: 1fr;
    }
    .updates a {
      grid-template-columns: 40px minmax(0, 1fr) 80px 90px;
    }
    .u-dub {
      display: none;
    }
  }
</style>
