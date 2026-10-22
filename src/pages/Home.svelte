<script lang="ts">
  import { untrack } from 'svelte'
  import { ChevronDown, ChevronUp, X } from '@lucide/svelte'
  import { img, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, BloggerVideo, Collection, Feed } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import VideoCard from '../lib/components/VideoCard.svelte'
  import { ago, date, hm } from '../lib/format'
  import { prefetchAnime } from '../lib/prefetch'
  import { query } from '../lib/query.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { follows } from '../lib/stores/follows.svelte'
  import { feedWatches, recent, removeFromHistory } from '../lib/stores/history.svelte'
  import { picks } from '../lib/stores/smart.svelte'

  const SEASONS = ['', 'зимы', 'весны', 'лета', 'осени']
  /** Сколько обновлений видно в свёрнутом списке. */
  const UPDATES_COLLAPSED = 8
  let updatesOpen = $state(false)

  const feed = query<Feed>(
    (signal) => Api.feed(untrack(feedWatches), { signal }),
    () => peek<Feed>('/feed', { query: { watches: untrack(feedWatches) }, persist: 'feed' }),
  )

  /** Блок из ленты, а если его там нет или лента упала — своим запросом. Пока лента грузится, ждём её. */
  function fromFeed<T>(pick: (f: Feed) => T[] | undefined, load: (signal: AbortSignal) => Promise<T[]>) {
    return query<T[]>((signal) => {
      const items = feed.data && pick(feed.data)
      if (items?.length) return Promise.resolve(items)
      if (!feed.data && !feed.error) return new Promise<T[]>(() => {})
      return load(signal)
    })
  }

  const videos = fromFeed<BloggerVideo>(
    (f) => f.blogger?.videos.items,
    (signal) => Api.bloggerVideos({ limit: 12 }, { signal }),
  )
  const colls = fromFeed<Collection>(
    (f) => f.collections,
    (signal) => Api.collections({ sort: 'best', limit: 12 }, { signal }),
  )

  // Рекомендации сайта приходят только вошедшим; иначе — своя подборка «Для вас» по истории.
  const siteRecs = $derived(feed.data?.recommends ?? [])
  const localRecs = $derived(siteRecs.length ? [] : picks().slice(0, 20))

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

  /** Лента отдаёт год карусели двумя цифрами («26»). */
  const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

  function ep(a: AnimeShort) {
    return a.episodes ? `${a.episodes.aired} из ${a.episodes.count || '?'}` : ''
  }
</script>

{#snippet videoBlock()}
  <section class="block">
    <h2 class="block-title">Видео <a class="more" href="#/videos">все</a></h2>
    {#if videos.data?.length}
      <Row itemWidth={280}>
        {#each videos.data as v (v.id)}<VideoCard {v} />{/each}
      </Row>
    {:else}
      <Loader small error={videos.error} retry={videos.retry} />
    {/if}
  </section>
{/snippet}

{#snippet collBlock()}
  <section class="block">
    <h2 class="block-title">Коллекции <a class="more" href="#/collections">все</a></h2>
    {#if colls.data?.length}
      <Row itemWidth={220}>
        {#each colls.data as c (c.id)}<CollectionCard {c} />{/each}
      </Row>
    {:else}
      <Loader small error={colls.error} retry={colls.retry} />
    {/if}
  </section>
{/snippet}

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
        Аниме {SEASONS[f.top_carousel.season] ?? ''} {fullYear(f.top_carousel.year)}
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
        <section class="block">
          <h2 class="block-title">Сегодня выйдут <a class="more" href="#/schedule">расписание</a></h2>
          {#if today.length}
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
          {:else}
            <p class="hint">На сегодня новых серий по расписанию нет</p>
          {/if}
        </section>
      </aside>
    </div>

    <section class="block">
      <h2 class="block-title">Рекомендации <a class="more" href="#/for-you">все</a></h2>
      {#if siteRecs.length}
        <Row>
          {#each siteRecs as a (a.anime_id)}<AnimeCard anime={a} sub={a.year ? String(a.year) : ''} />{/each}
        </Row>
      {:else if localRecs.length}
        <Row>
          {#each localRecs as c (c.anime.anime_id)}
            <AnimeCard anime={c.anime as AnimeShort} sub={c.anime.year ? String(c.anime.year) : ''} />
          {/each}
        </Row>
      {:else}
        <div class="invite">
          {#if auth.profile}
            <p>Оцените или добавьте в списки несколько тайтлов — и здесь появятся рекомендации.</p>
            <a class="btn small" href="#/for-you">Подборка «Для вас»</a>
          {:else}
            <p>Войдите, чтобы получить персональные рекомендации, или посмотрите пару тайтлов — подборка соберётся по истории.</p>
            <div class="invite-btns">
              <a class="btn small accent" href="#/login">Войти</a>
              <a class="btn small" href="#/for-you">Подборка «Для вас»</a>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    {#if f.posts.items.length}
      <section class="block">
        <h2 class="block-title">Новости <a class="more" href="#/posts">все</a></h2>
        <Row itemWidth={260}>
          {#each f.posts.items as p (p.id)}
            <a class="ncard" href="#/posts/{p.id}">
              <div class="n-img">
                {#if p.preview_image}<img src={img(p.preview_image)} alt="" loading="lazy" decoding="async" />{/if}
              </div>
              <span class="n-title">{p.title}</span>
              <span class="n-meta">{p.category.title} · {date(p.created_at)}</span>
            </a>
          {/each}
        </Row>
      </section>
    {/if}

    {@render videoBlock()}

    {#if f.announcements.length}
      <section class="block">
        <h2 class="block-title">Анонсы <a class="more" href="#/catalog?status=announcement">все</a></h2>
        <Row>
          {#each f.announcements as a (a.anime_id)}
            <AnimeCard anime={a} sub={a.year ? String(a.year) : ''} />
          {/each}
        </Row>
      </section>
    {/if}

    {@render collBlock()}

    {#if f.new.length}
      <section class="block">
        <h2 class="block-title">Новое на сайте <a class="more" href="#/catalog?sort=id">все новинки</a></h2>
        <div class="grid pad">
          {#each f.new as a (a.anime_id)}
            <AnimeCard anime={a} sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')} />
          {/each}
        </div>
        <!-- Лента отдаёт только 18 новинок; дальше — каталог «Недавно добавленные», как на сайте. -->
        <a class="expand" href="#/catalog?sort=id">Показать ещё <ChevronDown size={14} /></a>
      </section>
    {/if}
  {:else}
    <section class="block"><Loader error={feed.error} retry={feed.retry} /></section>
    <!-- У этих блоков свои запросы: если упала только лента, они всё равно загрузятся. -->
    {#if feed.error}
      {@render videoBlock()}
      {@render collBlock()}
    {/if}
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
  .hint {
    margin: 0;
    padding: 16px 14px;
    color: var(--muted);
    font-size: 13px;
  }
  .invite {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 28px 16px;
    text-align: center;
    color: var(--muted);
  }
  .invite p {
    margin: 0;
    max-width: 520px;
  }
  .invite-btns {
    display: flex;
    gap: 8px;
  }
  .ncard {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .n-img {
    aspect-ratio: 16 / 9;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--panel-2);
  }
  .n-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
  }
  .ncard:hover .n-img img {
    transform: scale(1.04);
  }
  .ncard:hover .n-title {
    color: var(--accent);
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
