<script lang="ts">
  import { untrack } from 'svelte'
  import {
    CalendarDays,
    CalendarRange,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clapperboard,
    X,
  } from '@lucide/svelte'
  import { img, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, BloggerVideo, Collection, Feed } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import VideoCard from '../lib/components/VideoCard.svelte'
  import { date, hm, plural } from '../lib/format'
  import { prefetchAnime } from '../lib/prefetch'
  import { query } from '../lib/query.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { follows } from '../lib/stores/follows.svelte'
  import { feedWatches, recent, removeFromHistory, syncHistory, watchLine } from '../lib/stores/history.svelte'
  import { picks } from '../lib/stores/smart.svelte'
  import { TROLL_IDS } from '../lib/troll'
  import { glideBy, wheelScroll } from '../lib/wheel'

  const SEASONS = ['', 'зимы', 'весны', 'лета', 'осени']
  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  /** Лента расписания: пара прошедших дней (что вышло) и неделя вперёд. Старше — не показываем. */
  const DAYS_BACK = 2
  const DAYS_AHEAD = 7

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
  const siteRecs = $derived((feed.data?.recommends ?? []).filter((a) => !TROLL_IDS.has(a.anime_id)))
  const localRecs = $derived(siteRecs.length ? [] : picks().slice(0, 20))

  syncHistory()
  const cont = $derived(recent(20))
  const fresh = $derived(Object.values(follows).filter((f) => f.fresh > 0))

  const sched = query<AnimeShort[]>(
    (signal) => Api.schedule({ signal }),
    () => peek<AnimeShort[]>('/anime/schedule', { persist: 'schedule' }),
  )

  // Часы для «выйдет через…» и отметок «вышла»: раз в минуту хватает.
  let now = $state(Date.now() / 1000)
  $effect(() => {
    const id = setInterval(() => (now = Date.now() / 1000), 60_000)
    return () => clearInterval(id)
  })

  interface Slot {
    a: AnimeShort
    t: number
    ep: number
    out: boolean
  }

  /**
   * Дни ленты со всеми сериями дня. Сайт убирает серию, как только она вышла, —
   * здесь она остаётся с пометкой: вышедшая в этот день берётся из prev_date,
   * а next_date из прошлого значит, что серия вышла, но API ещё не перевёл счётчик.
   */
  const days = $derived.by(() => {
    const start = new Date(now * 1000)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - DAYS_BACK)
    const out = Array.from({ length: DAYS_BACK + 1 + DAYS_AHEAD }, (_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      return { date: d, from: d.getTime() / 1000, to: next.getTime() / 1000, slots: [] as Slot[] }
    })
    const dayOf = (t: number) => out.find((d) => t >= d.from && t < d.to)
    for (const a of sched.data ?? feed.data?.schedule ?? []) {
      const e = a.episodes
      if (!e) continue
      const nd = e.next_date ? dayOf(e.next_date) : undefined
      nd?.slots.push({ a, t: e.next_date, ep: e.aired + 1, out: e.next_date <= now })
      const pd = e.prev_date ? dayOf(e.prev_date) : undefined
      if (pd && pd !== nd) pd.slots.push({ a, t: e.prev_date, ep: e.aired, out: true })
    }
    for (const d of out) d.slots.sort((x, y) => x.t - y.t)
    return out
  })

  let dayIdx = $state(DAYS_BACK)
  const day = $derived(days[dayIdx])
  let strip = $state<HTMLElement>()

  /** Дни, сгруппированные по месяцам, — для подписей над лентой. */
  const months = $derived.by(() => {
    const g: { name: string; days: { d: (typeof days)[number]; i: number }[] }[] = []
    days.forEach((d, i) => {
      const name = MONTHS[d.date.getMonth()]
      const last = g.at(-1)
      if (last?.name === name) last.days.push({ d, i })
      else g.push({ name, days: [{ d, i }] })
    })
    return g
  })

  function until(t: number) {
    const m = Math.max(1, Math.round((t - now) / 60))
    if (m < 60) return `через ${m} ${plural(m, 'минуту', 'минуты', 'минут')}`
    const h = Math.round(m / 60)
    if (h < 24) return `через ${h} ${plural(h, 'час', 'часа', 'часов')}`
    const d = Math.round(h / 24)
    return `через ${d} ${plural(d, 'день', 'дня', 'дней')}`
  }

  const dayMonth = (t: number) => new Date(t * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'long' })

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
  <!-- Порядок блоков — как на главной сайта: сезон, история, дальше лента. -->
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
  {/if}

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
              sub={watchLine(e) || e.dubbing}
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
    <div class="cols">
      <section class="block side">
        <h2 class="block-title">
          <CalendarDays size={17} class="ico" /> Расписание онгоингов
          <a class="more" href="#/schedule" title="Всё расписание" aria-label="Всё расписание">
            <CalendarRange size={18} />
          </a>
        </h2>
        <div class="week">
          <button class="arrow" aria-label="Раньше" onclick={() => strip && glideBy(strip, -strip.clientWidth * 0.75)}>
            <ChevronLeft size={18} />
          </button>
          <div class="strip" bind:this={strip} use:wheelScroll>
            {#each months as m (m.name)}
              <div class="month">
                <span class="m-name">{m.name}</span>
                <div class="m-days">
                  {#each m.days as { d, i } (i)}
                    {@const wd = d.date.getDay()}
                    <button
                      class="day"
                      class:sel={i === dayIdx}
                      class:past={d.to <= now}
                      aria-pressed={i === dayIdx}
                      onclick={() => (dayIdx = i)}
                    >
                      <span class="wd" class:weekend={wd === 0 || wd === 6}>{WD[wd]}</span>
                      <span class="dn">{d.date.getDate()}</span>
                      {#if d.slots.length}<span class="cnt">{d.slots.length}</span>{/if}
                    </button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
          <button class="arrow" aria-label="Позже" onclick={() => strip && glideBy(strip, strip.clientWidth * 0.75)}>
            <ChevronRight size={18} />
          </button>
        </div>
        {#if day.slots.length}
          <ul class="rows">
            {#each day.slots as s (`${s.a.anime_id}:${s.t}`)}
              <li>
                <a class="row" class:out={s.out} href="#/anime/{s.a.anime_url}" use:prefetchAnime={s.a.anime_url}>
                  <img src={img(s.a.poster?.small)} alt="" width="50" height="70" loading="lazy" />
                  <span class="r-body">
                    <span class="r-title">{s.a.title}</span>
                    <span class="r-sub">
                      {#if s.out}
                        <Check size={14} /> {s.ep} серия вышла
                      {:else}
                        {s.ep} серия выйдет {until(s.t)}
                      {/if}
                    </span>
                  </span>
                  <span class="r-side">{hm(new Date(s.t * 1000))}</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else if !sched.data && !feed.data?.schedule.length}
          <Loader small error={sched.error} retry={sched.retry} />
        {:else}
          <p class="hint">В этот день серий по расписанию нет</p>
        {/if}
      </section>

      <section class="block side">
        <h2 class="block-title"><Clapperboard size={17} class="ico" /> Обновления аниме</h2>
        <ul class="rows">
          {#each f.new_videos as v (v.video_id)}
            <li>
              <a
                class="row"
                href="#/anime/{v.anime_url}?ep={encodeURIComponent(v.ep_title)}"
                use:prefetchAnime={v.anime_url}
              >
                <img src={img(v.poster?.small)} alt="" width="50" height="70" loading="lazy" />
                <span class="r-body">
                  <span class="r-title">{v.title}</span>
                  <span class="r-sub">
                    Добавлена {v.ep_title} серия ({[v.dub_title, v.player_title].filter(Boolean).join(', ')})
                  </span>
                </span>
                <span class="r-side">
                  <span class="r-date">{dayMonth(v.date)}</span>
                  {hm(new Date(v.date * 1000))}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
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
    border-radius: var(--radius-sm);
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
  /* «Расписание» и «Обновления» — две колонки одной высоты, у каждой свой скролл, как на сайте. */
  .cols {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .side {
    display: flex;
    flex-direction: column;
    height: 540px;
  }
  .block-title :global(.ico) {
    flex: none;
    margin-right: 7px;
  }
  .block-title .more {
    display: grid;
    place-items: center;
  }
  .rows {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: 10px;
    margin: 0;
    padding: 15px;
    list-style: none;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    height: 70px;
    border-radius: var(--radius);
    background: var(--panel-3);
    overflow: hidden;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row:hover .r-title {
    color: var(--accent);
  }
  .row img {
    flex: none;
    width: 50px;
    height: 70px;
    margin-right: 10px;
    object-fit: cover;
    border-radius: var(--radius-img);
    background: var(--line);
  }
  .r-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 10px 10px 10px 0;
  }
  .r-title,
  .r-sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .r-title {
    font-weight: 600;
  }
  .r-sub {
    font-size: 13px;
    font-weight: 500;
    color: var(--muted);
  }
  .r-side {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin: 0 15px 0 5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .r-date {
    text-transform: capitalize;
  }
  /* Вышедшая серия остаётся в списке дня, но видно, что она уже есть. */
  .row.out img {
    opacity: 0.55;
  }
  .row.out .r-sub {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--green);
  }
  .row.out .r-side {
    color: var(--muted);
  }
  .week {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 22px;
    align-items: end;
    gap: 6px;
    padding: 12px 10px 0;
  }
  .arrow {
    display: grid;
    place-items: center;
    height: 60px;
    border-radius: var(--radius-sm);
    color: var(--muted);
  }
  .arrow:hover {
    background: var(--panel-3);
    color: var(--text);
  }
  .strip {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .m-name {
    display: block;
    height: 20px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-2);
  }
  .m-days {
    display: flex;
    padding-top: 5px;
  }
  .day {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 70px;
    height: 60px;
    margin-right: 10px;
    border-radius: 15px;
    background: var(--panel-3);
    color: var(--text);
  }
  .day:hover {
    background: var(--line);
  }
  .day.sel {
    background: #6c6c6c;
  }
  .day.sel::after {
    content: '';
    position: absolute;
    left: 16px;
    right: 16px;
    bottom: 0;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--green);
  }
  .day.past:not(.sel) .dn {
    color: var(--muted);
  }
  .wd {
    font-size: 14px;
    font-weight: 600;
  }
  .wd.weekend {
    color: var(--accent);
  }
  .dn {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.2;
  }
  .cnt {
    position: absolute;
    top: -5px;
    right: -8px;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 10px;
    background: var(--green);
    color: #fff;
    font-size: 13px;
    line-height: 19px;
    text-align: center;
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
    border-radius: var(--radius-img);
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
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
