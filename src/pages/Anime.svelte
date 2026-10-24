<script lang="ts">
  import { untrack } from 'svelte'
  import { Bell, BellOff, BellRing, Check, Clapperboard, Eye, Heart, Star } from '@lucide/svelte'
  import { clearCache, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import {
    LISTS,
    type Anime,
    type AnimeShort,
    type Collection,
    type ListId,
    type Trailer,
    type UserRecommendation,
    type Video,
  } from '../lib/api/types'
  import AddToCollection from '../lib/components/AddToCollection.svelte'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import Comments from '../lib/components/Comments.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Player from '../lib/components/Player.svelte'
  import Poster from '../lib/components/Poster.svelte'
  import ReviewCard from '../lib/components/ReviewCard.svelte'
  import Row from '../lib/components/Row.svelte'
  import TrailerDialog, { type TrailerItem } from '../lib/components/TrailerDialog.svelte'
  import Votes from '../lib/components/Votes.svelte'
  import { MIN_USER_VOTES, RATE_COLORS, avgColor, compact, date, rateColor, rating, userVotes } from '../lib/format'
  import { setTitle } from '../lib/native'
  import { pager } from '../lib/pager.svelte'
  import { prefetchAnime } from '../lib/prefetch'
  import { errorText, query } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { isDubSubscribed, toggleDubSub } from '../lib/stores/dubsubs.svelte'
  import { isFollowed, seen, toggleFollow } from '../lib/stores/follows.svelte'
  import { isFav, listOf, noteState, setListFor, toggleFavFor } from '../lib/stores/lists.svelte'
  import { history, markDone, mergeWatched, progressOf } from '../lib/stores/history.svelte'
  import { settings } from '../lib/stores/settings.svelte'
  import { suspiciousLink } from '../lib/troll'
  import type { BloggerVideo } from '../lib/api/types'
  import VideoCard from '../lib/components/VideoCard.svelte'

  let { url }: { url: string } = $props()

  const q = query<Anime>(
    (signal) => Api.anime(url, { signal }),
    () => peek<Anime>(`/anime/${url}`, { query: { need_videos: true } }),
  )
  const a = $derived(q.data)

  const recs = query<AnimeShort[]>(async (signal) => {
    const id = q.data?.anime_id
    return id ? Api.recommendations(id, { signal }) : []
  })

  // «Оценившие также смотрели» — голоса пользователей, а не подбор сайта.
  const watched = query<UserRecommendation[]>(async (signal) => {
    const id = q.data?.anime_id
    return id ? Api.similar(id, true, 24, { signal }) : []
  })
  const watchedList = $derived(
    (watched.data ?? []).filter((r) => userVotes(r.likes) >= MIN_USER_VOTES && !suspiciousLink(r, r.likes)),
  )

  const LIST_TITLES: [number, string][] = [
    [0, 'Смотрят'],
    [1, 'В планах'],
    [2, 'Просмотрели'],
    [5, 'Отложили'],
    [3, 'Бросили'],
    [4, 'В любимых'],
  ]
  const rateStats = query(async (signal) => {
    const id = q.data?.anime_id
    if (!id) return null
    const [rates, lists] = await Promise.all([Api.animeRates(id, { signal }), Api.animeListCounts(id, { signal })])
    const m = new Map(rates.map((r) => [r.rating, r.count]))
    const rows = Array.from({ length: 10 }, (_, i) => ({ rating: 10 - i, count: m.get(10 - i) ?? 0 }))
    const byList = new Map(lists.map((l) => [l.list_id, l.count]))
    return {
      rows,
      total: rows.reduce((s, r) => s + r.count, 0),
      max: Math.max(1, ...rows.map((r) => r.count)),
      lists: LIST_TITLES.map(([id, title]) => ({ title, count: byList.get(id) ?? 0 })),
    }
  })

  const colls = query<Collection[]>(async (signal) => {
    const id = q.data?.anime_id
    return id ? Api.animeCollections(id, { signal }) : []
  })

  const trailers = query<Trailer[]>(async (signal) => {
    const id = q.data?.anime_id
    return id ? Api.trailers(id, { signal }) : []
  })
  /** Во фрейм — только https: ссылку присылает сервер, протокол может быть любым. */
  function httpsUrl(u: string) {
    try {
      const x = new URL(u.startsWith('//') ? `https:${u}` : u)
      if (x.protocol !== 'https:') return ''
      // Домен без cookie YouTube реже отдаёт «замок» во встроенном окне.
      const yt = x.hostname.match(/(^|\.)youtube\.com$/) && x.pathname.match(/^\/embed\/([\w-]+)/)
      return yt ? `https://www.youtube-nocookie.com/embed/${yt[1]}` : x.href
    } catch {
      return ''
    }
  }
  const trailerItems = $derived<TrailerItem[]>(
    (trailers.data ?? [])
      .map((t, i) => ({
        id: t.trailer_id || i,
        src: httpsUrl(t.iframe_url || ''),
        label: [t.number && `Трейлер ${t.number}`, t.dubbing].filter(Boolean).join(' · ') || `Трейлер ${i + 1}`,
      }))
      .filter((t) => t.src),
  )
  let showTrailer = $state(false)

  const REVIEWS_PAGE = 10
  const reviews = pager(
    (offset) => (q.data ? Api.animeReviews(q.data.anime_id, offset, REVIEWS_PAGE) : Promise.resolve([])),
    REVIEWS_PAGE,
    (r) => r.review_id,
  )
  $effect(() => {
    if (a?.anime_id) untrack(() => reviews.reset())
  })

  // ---------- видео блогеров о тайтле ----------

  const BLOGGER_PAGE = 12
  const bloggerVideos = pager<BloggerVideo>(
    (offset) => (a ? Api.animeBloggerVideos(a.anime_id, offset, BLOGGER_PAGE) : Promise.resolve([])),
    BLOGGER_PAGE,
    (v) => v.id,
  )
  $effect(() => {
    if (a?.anime_id) untrack(() => bloggerVideos.reset())
  })

  // ---------- озвучки, плееры, серии ----------

  const epNum = (v: Video) => {
    const n = parseFloat(v.number)
    return Number.isNaN(n) ? 1e9 + v.index : n
  }

  /** dubbing → player → серии по порядку. */
  const groups = $derived.by(() => {
    const m = new Map<string, Map<string, Video[]>>()
    for (const v of a?.videos ?? []) {
      let byPlayer = m.get(v.data.dubbing)
      if (!byPlayer) m.set(v.data.dubbing, (byPlayer = new Map()))
      let list = byPlayer.get(v.data.player)
      if (!list) byPlayer.set(v.data.player, (list = []))
      list.push(v)
    }
    for (const byPlayer of m.values()) for (const list of byPlayer.values()) list.sort((x, y) => epNum(x) - epNum(y))
    return m
  })

  /** Просмотры озвучки: сумма по всем её сериям во всех плеерах. */
  const dubViews = $derived.by(() => {
    const views = new Map<string, number>()
    for (const [d, byPlayer] of groups) {
      let sum = 0
      for (const list of byPlayer.values()) for (const v of list) sum += v.views || 0
      views.set(d, sum)
    }
    return views
  })
  /** Озвучки по популярности. */
  const dubs = $derived([...groups.keys()].sort((x, y) => dubViews.get(y)! - dubViews.get(x)!))
  const totalViews = $derived([...dubViews.values()].reduce((n, v) => n + v, 0))
  /** Доля выбора, как на сайте: «AniLibria — 34%». */
  function dubLabel(d: string) {
    const share = totalViews ? (dubViews.get(d)! / totalViews) * 100 : 0
    if (!share) return d
    return `${d} — ${share < 1 ? '<1' : Math.round(share)}%`
  }

  let dubbing = $state('')
  let player = $state('')
  let episode = $state('')

  // При открытии тайтла выбираем: то, что смотрел в прошлый раз → любимую озвучку → первую.
  $effect(() => {
    const anime = a
    if (!anime) return
    untrack(() => {
      mergeWatched(anime, anime.videos)
      const last = history.last[anime.anime_id]
      // Запись из истории аккаунта (смотрел на сайте) может не знать озвучку и плеер —
      // берём их из серии по id.
      const lastVideo = last?.videoId ? anime.videos?.find((v) => v.video_id === last.videoId) : undefined
      const lastEp = last?.episode || lastVideo?.number || ''
      dubbing =
        [last?.dubbing || lastVideo?.data.dubbing, settings.preferredDubbing].find((d) => d && groups.has(d)) ??
        dubs[0] ??
        ''
      pickPlayer(last?.player || lastVideo?.data.player)
      const wanted = route.query.get('ep')
      const eps = episodes()
      let ep = wanted && eps.some((v) => v.number === wanted) ? wanted : ''
      if (!ep && lastEp) {
        // Если прошлая серия досмотрена — сразу предлагаем следующую.
        const i = eps.findIndex((v) => v.number === lastEp)
        if (i >= 0) ep = progressOf(anime.anime_id, lastEp)?.done && eps[i + 1] ? eps[i + 1].number : lastEp
      }
      episode = ep || eps[0]?.number || ''
      seen(anime.anime_id, anime.episodes?.aired)
      setTitle(anime.title)
    })
  })

  function pickPlayer(prefer?: string) {
    const players = [...(groups.get(dubbing)?.keys() ?? [])]
    player =
      [prefer, settings.preferredPlayer].find((p) => p && players.includes(p)) ??
      players.find((p) => /kodik/i.test(p)) ??
      players[0] ??
      ''
  }

  function episodes(): Video[] {
    return groups.get(dubbing)?.get(player) ?? []
  }
  const eps = $derived(groups.get(dubbing)?.get(player) ?? [])
  const current = $derived(eps.find((v) => v.number === episode) ?? eps[0])
  const nextEp = $derived(current ? eps[eps.indexOf(current) + 1] : undefined)

  function chooseDubbing(d: string) {
    dubbing = d
    settings.preferredDubbing = d
    pickPlayer(player)
    if (!episodes().some((v) => v.number === episode)) episode = episodes()[0]?.number ?? ''
  }

  function choosePlayer(p: string) {
    player = p
    settings.preferredPlayer = p
    if (!episodes().some((v) => v.number === episode)) episode = episodes()[0]?.number ?? ''
  }

  function chooseEpisode(n: string) {
    episode = n
    go(`/anime/${url}?ep=${encodeURIComponent(n)}`, true)
  }

  function playNext() {
    if (nextEp) chooseEpisode(nextEp.number)
  }

  const isDone = (n: string) => !!a && !!progressOf(a.anime_id, n)?.done

  async function toggleDone() {
    if (!a || !current) return
    const done = !isDone(current.number)
    markDone(a.anime_id, current.number, done)
    if (!auth.profile) return
    try {
      if (done) await Api.markWatched(current.video_id, current.duration || 1)
      else await Api.unmarkWatched(current.video_id)
    } catch {
      /* локальная отметка уже стоит */
    }
  }

  // ---------- списки, избранное, оценка ----------

  let actionError = $state('')
  let myRate = $state(0)
  let hoverRate = $state(0)

  // Список и избранное — из общего стора: карточки и меню по ПКМ меняют их же.
  const list = $derived(a ? listOf(a.anime_id) : null)
  const fav = $derived(a ? isFav(a.anime_id) : false)

  $effect(() => {
    myRate = a?.user?.rating ?? 0
    const x = a
    if (x) untrack(() => noteState(x.anime_id, (x.user?.list?.list?.id as ListId | undefined) ?? null, !!x.user?.list?.is_fav))
  })

  async function mutate(fn: () => Promise<unknown>, rollback: () => void) {
    actionError = ''
    try {
      await fn()
      clearCache(`/anime/${url}`)
    } catch (e) {
      rollback()
      actionError = errorText(e)
    }
  }

  function setList(id: ListId | null) {
    if (a) setListFor(a, id, true)
  }

  function toggleFav() {
    if (a) toggleFavFor(a, true)
  }

  function rate(n: number) {
    if (!a) return
    const prev = myRate
    myRate = n === myRate ? 0 : n
    mutate(
      () => Api.rate(a.anime_id, myRate),
      () => (myRate = prev),
    )
  }

  let fullDesc = $state(false)
  const followed = $derived(!!a && isFollowed(a.anime_id))

  // Подписка на озвучку — серверная: уведомление придёт и на сайт, и в приложение.
  const dubSubbed = $derived(!!a && isDubSubscribed(a.anime_id, dubbing, player))
  let dubSubError = $state('')
  async function toggleDubSubscription() {
    if (!a || !current) return
    dubSubError = ''
    try {
      await toggleDubSub(a.anime_id, dubbing, player, current.video_id)
    } catch (e) {
      dubSubError = errorText(e)
    }
  }

  function nextDate(ts: number) {
    return ts ? date(ts, true) : ''
  }
</script>

{#if a}
  <div class="container page">
    <section class="block">
      <h1 class="block-title">{a.title}</h1>
      <div class="info">
        <div class="side">
          <Poster poster={a.poster} alt={a.title} sizes="250px" eager />
          <a class="btn primary wide" href="#watch" onclick={(e) => (e.preventDefault(), document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' }))}>
            Смотреть
          </a>
          {#if a.anime_status?.alias !== 'released'}
            <button class="btn wide" class:accent={followed} onclick={() => toggleFollow(a)}>
              {#if followed}<BellOff size={15} /> Отписаться{:else}<Bell size={15} /> Следить за сериями{/if}
            </button>
          {/if}
          {#if trailerItems.length}
            <button class="btn wide" onclick={() => (showTrailer = true)}><Clapperboard size={15} /> Трейлер</button>
          {/if}
          {#if auth.profile}
            <select
              class="select wide"
              value={list ?? ''}
              onchange={(e) => {
                const v = e.currentTarget.value
                setList(v === '' ? null : (Number(v) as ListId))
              }}
            >
              <option value="">Добавить в список</option>
              {#each LISTS as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
            </select>
            <button class="btn wide" class:accent={fav} onclick={toggleFav}>
              <Heart size={15} fill={fav ? 'currentColor' : 'none'} />
              {fav ? 'В избранном' : 'В избранное'}
            </button>
            <AddToCollection anime={a} />
          {/if}
          {#if actionError}<p class="err">{actionError}</p>{/if}
        </div>

        <div class="main">
          {#if a.other_titles?.length}
            <p class="other">{a.other_titles.join(' / ')}</p>
          {/if}

          <div class="score">
            {#if rating(a)}
              <span class="big" style:color={avgColor(rating(a))}><Star size={20} fill="currentColor" /> {rating(a)?.toFixed(1)}</span>
              {#if typeof a.rating === 'object'}
                <span class="muted">{compact(a.rating.counters)} голосов</span>
              {/if}
            {/if}
            {#if a.views}<span class="muted"><Eye size={14} /> {compact(a.views)}</span>{/if}
            {#if a.top?.global}<span class="chip yellow">#{a.top.global} в топе</span>{/if}
          </div>

          {#if auth.profile}
            <div class="rate" role="group" aria-label="Ваша оценка" onmouseleave={() => (hoverRate = 0)}>
              <span class="muted">Ваша оценка:</span>
              {#each { length: 10 } as _, i}
                <button
                  aria-pressed={myRate === i + 1}
                  aria-label="Оценка {i + 1}"
                  class:on={(hoverRate || myRate) > i}
                  style:color={(hoverRate || myRate) > i ? RATE_COLORS[i] : undefined}
                  onmouseenter={() => (hoverRate = i + 1)}
                  onclick={() => rate(i + 1)}
                >
                  <Star size={16} fill="currentColor" />
                </button>
              {/each}
              {#if myRate}<b style:color={rateColor(myRate)}>{myRate}</b>{/if}
            </div>
          {/if}

          <dl>
            {#if a.type}<dt>Тип</dt><dd>{a.type.name}</dd>{/if}
            {#if a.anime_status}
              <dt>Статус</dt>
              <dd class:ongoing={a.anime_status.alias === 'ongoing'}>{a.anime_status.title}</dd>
            {/if}
            {#if a.episodes}
              <dt>Эпизоды</dt>
              <dd>
                {a.episodes.aired} из {a.episodes.count || '?'}
                {#if a.episodes.next_date}<span class="muted"> · следующая {nextDate(a.episodes.next_date)}</span>{/if}
              </dd>
            {/if}
            {#if a.year}<dt>Год</dt><dd><a href="#/catalog?from_year={a.year}&to_year={a.year}">{a.year}</a></dd>{/if}
            {#if a.genres?.length}
              <dt>Жанры</dt>
              <dd class="links">
                {#each a.genres as g (g.id)}<a href="#/catalog?genres={g.id}">{g.title}</a>{/each}
              </dd>
            {/if}
            {#if a.studios?.length}
              <dt>Студия</dt>
              <dd class="links">
                {#each a.studios as s (s.id)}
                  {@const slug = s.url?.split('/').filter(Boolean).pop()}
                  {#if slug}<a href="#/studio/{slug}">{s.title}</a>{:else}<span>{s.title}</span>{/if}
                {/each}
              </dd>
            {/if}
            {#if a.original}<dt>Первоисточник</dt><dd>{a.original}</dd>{/if}
            {#if a.creators?.length}
              <dt>Режиссёр</dt><dd>{a.creators.map((c) => c.title.trim()).join(', ')}</dd>
            {/if}
            {#if a.translates?.length}<dt>Озвучка</dt><dd>{a.translates.map((t) => t.title).join(', ')}</dd>{/if}
            {#if a.min_age}<dt>Возраст</dt><dd>{a.min_age.title_long}</dd>{/if}
          </dl>

          {#if a.description}
            <div class="desc" class:full={fullDesc}>{a.description}</div>
            {#if a.description.length > 500}
              <button class="link" onclick={() => (fullDesc = !fullDesc)}>{fullDesc ? 'Свернуть' : 'Читать полностью'}</button>
            {/if}
          {/if}
        </div>
      </div>
    </section>

    <section class="block" id="watch">
      <h2 class="block-title">Смотреть онлайн</h2>
      {#if groups.size}
        <div class="watch">
          <div class="selectors">
            <label>
              <span>Озвучка</span>
              <select class="select" value={dubbing} onchange={(e) => chooseDubbing(e.currentTarget.value)}>
                {#each dubs as d (d)}<option value={d}>{dubLabel(d)}</option>{/each}
              </select>
            </label>
            <label>
              <span>Плеер</span>
              <select class="select" value={player} onchange={(e) => choosePlayer(e.currentTarget.value)}>
                {#each [...(groups.get(dubbing)?.keys() ?? [])] as p (p)}<option value={p}>{p}</option>{/each}
              </select>
            </label>
            {#if current && auth.profile && a.anime_status?.alias !== 'released'}
              <button
                class="btn small"
                class:accent={dubSubbed}
                title="Сайт пришлёт уведомление, когда в этой озвучке выйдет новая серия"
                onclick={toggleDubSubscription}
              >
                {#if dubSubbed}<BellRing size={14} /> Слежу за озвучкой{:else}<Bell size={14} /> Следить за озвучкой{/if}
              </button>
              {#if dubSubError}<span class="err">{dubSubError}</span>{/if}
            {/if}
            {#if current}
              <button class="btn small mark" class:primary={isDone(current.number)} onclick={toggleDone}>
                <Check size={14} />
                {isDone(current.number) ? 'Просмотрено' : 'Отметить просмотренной'}
              </button>
            {/if}
          </div>

          {#if eps.length > 1}
            <div class="episodes">
              {#each eps as v (v.video_id)}
                <button
                  class="ep"
                  class:active={v === current}
                  class:done={isDone(v.number)}
                  title={isDone(v.number) ? 'Просмотрено' : ''}
                  onclick={() => chooseEpisode(v.number)}
                >
                  {v.number}
                </button>
              {/each}
            </div>
          {/if}

          {#if current}
            <Player anime={a} video={current} hasNext={!!nextEp} onNext={playNext} />
          {/if}
        </div>
      {:else}
        <div class="empty">
          {a.anime_status?.alias === 'announcement' ? 'Это анонс — серий пока нет.' : 'Видео для этого тайтла недоступны.'}
          {#if a.blocked_in?.length}<br />Заблокировано правообладателем в регионе.{/if}
        </div>
      {/if}
    </section>

    {#if a.viewing_order && a.viewing_order.length > 1}
      <section class="block">
        <h2 class="block-title">Порядок просмотра</h2>
        <ol class="order">
          {#each a.viewing_order as o (o.anime_id)}
            <li class:current={o.anime_id === a.anime_id}>
              <a href="#/anime/{o.anime_url}" use:prefetchAnime={o.anime_url}>
                <span class="o-title">{o.title}</span>
                <span class="muted">{[o.type?.shortname, o.year, o.data?.text].filter(Boolean).join(' · ')}</span>
              </a>
            </li>
          {/each}
        </ol>
      </section>
    {/if}

    {#if rateStats.data && (rateStats.data.total || rateStats.data.lists.some((l) => l.count))}
      {@const st = rateStats.data}
      <section class="block">
        <h2 class="block-title">Оценки и списки</h2>
        <div class="stats">
          {#if st.total}
            <div class="bars">
              {#each st.rows as r (r.rating)}
                <span class="lbl">{r.rating}</span>
                <span class="bar"><i style:width="{(r.count / st.max) * 100}%" style:background={RATE_COLORS[r.rating - 1]}></i></span>
                <span class="num">{compact(r.count)}</span>
              {/each}
            </div>
          {/if}
          <ul class="list-counts">
            {#each st.lists as l (l.title)}
              <li><span class="muted">{l.title}</span><b>{compact(l.count)}</b></li>
            {/each}
          </ul>
        </div>
      </section>
    {/if}

    {#if recs.data?.length}
      <section class="block">
        <h2 class="block-title">Похожие аниме</h2>
        <Row>
          {#each recs.data as r (r.anime_id)}<AnimeCard anime={r} />{/each}
        </Row>
      </section>
    {/if}

    {#if watchedList.length}
      <section class="block">
        <h2 class="block-title">Оценившие также смотрели</h2>
        <Row>
          {#each watchedList as r (r.anime_id)}
            <div class="rec">
              <AnimeCard anime={r} />
              <Votes compact likes={r.likes} vote={(action) => Api.voteRecommendation(a.anime_id, r.anime_id, action)} />
            </div>
          {/each}
        </Row>
      </section>
    {/if}

    {#if colls.data?.length}
      <section class="block">
        <h2 class="block-title">Входит в коллекции</h2>
        <div class="colls">
          {#each colls.data as c (c.id)}<CollectionCard {c} />{/each}
        </div>
      </section>
    {/if}

    {#if reviews.items.length}
      <section class="block">
        <h2 class="block-title">Рецензии</h2>
        <div class="reviews">
          {#each reviews.items as r (r.review_id)}<ReviewCard {r} showAnime={false} />{/each}
        </div>
        {#if !reviews.done}
          <div class="more-reviews">
            <button class="btn small" disabled={reviews.loading} onclick={reviews.more}>
              {reviews.loading ? 'Загрузка…' : 'Показать ещё'}
            </button>
          </div>
        {/if}
      </section>
    {/if}

    {#if bloggerVideos.items.length}
      <section class="block">
        <h2 class="block-title">Видео блогеров</h2>
        <div class="bvideos">
          {#each bloggerVideos.items as v (v.id)}<VideoCard {v} />{/each}
        </div>
        {#if bloggerVideos.error}
          <Loader error={bloggerVideos.error} retry={bloggerVideos.more} />
        {:else if !bloggerVideos.done}
          <div class="bvideos-more">
            <button class="btn small" disabled={bloggerVideos.loading} onclick={bloggerVideos.more}>
              {bloggerVideos.loading ? 'Загрузка…' : 'Показать ещё'}
            </button>
          </div>
        {/if}
      </section>
    {/if}

    {#key a.anime_id}
      <Comments animeId={a.anime_id} total={a.comments_count} />
    {/key}
  </div>
  {#if showTrailer}
    <TrailerDialog title={a.title} items={trailerItems} onclose={() => (showTrailer = false)} />
  {/if}
{:else}
  <Loader error={q.error} retry={q.retry} />
{/if}

<style>
  .rec {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .stats {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 10px 24px;
    padding: 14px;
  }
  .stats .bars {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px 10px;
    font-size: 12px;
  }
  .stats .lbl {
    color: var(--text-2);
  }
  .stats .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--panel-3);
    overflow: hidden;
  }
  .stats .bar i {
    display: block;
    height: 100%;
    min-width: 2px;
  }
  .stats .num {
    min-width: 32px;
    text-align: right;
    color: var(--muted);
  }
  .list-counts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .list-counts li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  @media (max-width: 700px) {
    .stats {
      grid-template-columns: 1fr;
    }
  }
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  h1.block-title {
    font-size: 16px;
  }
  .info {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 20px;
    padding: 16px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .side :global(.poster) {
    border-radius: var(--radius-img);
  }
  .colls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
    padding: 14px;
  }
  .bvideos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    padding: 12px;
  }
  .bvideos-more {
    display: flex;
    justify-content: center;
    padding: 0 12px 12px;
  }
  .wide {
    width: 100%;
    justify-content: center;
  }
  .err {
    margin: 0;
    color: var(--accent);
    font-size: 12px;
  }
  .other {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 13px;
  }
  .score {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 10px;
  }
  .score span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .big {
    font-size: 22px;
    font-weight: 700;
    color: var(--yellow);
  }
  .rate {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 12px;
  }
  .rate .muted {
    margin-right: 6px;
  }
  .rate button {
    color: var(--line-2);
    padding: 1px;
  }
  .rate button.on {
    color: var(--yellow);
  }
  .rate b {
    margin-left: 6px;
    color: var(--yellow);
  }
  dl {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    gap: 6px 12px;
    margin: 0 0 14px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  dd a {
    color: var(--accent);
  }
  dd a:hover {
    text-decoration: underline;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }
  .ongoing {
    color: var(--green);
  }
  .desc {
    line-height: 1.6;
    white-space: pre-line;
    color: var(--text-2);
    max-height: 7.5em;
    overflow: hidden;
    mask-image: linear-gradient(#000 60%, transparent);
  }
  .desc.full {
    max-height: none;
    mask-image: none;
  }
  .link {
    margin-top: 6px;
    color: var(--accent);
    font-size: 13px;
  }
  .watch {
    padding: 12px 14px 16px;
  }
  .selectors {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-bottom: 10px;
  }
  .selectors label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 200px;
  }
  .selectors label span {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .mark {
    margin-left: auto;
  }
  .episodes {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 132px;
    overflow-y: auto;
    margin-bottom: 10px;
  }
  .ep {
    min-width: 40px;
    height: 30px;
    padding: 0 8px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }
  .ep:hover {
    border-color: var(--green);
  }
  .ep.done {
    color: var(--muted);
    background: var(--panel-3);
  }
  .ep.active {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
    font-weight: 600;
  }
  .reviews {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
  }
  .more-reviews {
    display: flex;
    justify-content: center;
    padding: 0 14px 14px;
  }
  .order {
    margin: 0;
    padding: 8px 14px 8px 40px;
  }
  .order li {
    padding: 5px 0;
  }
  .order a {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .order a:hover .o-title {
    color: var(--accent);
  }
  .order .current .o-title {
    color: var(--green);
    font-weight: 600;
  }
  .order .muted {
    font-size: 12px;
  }
  @media (max-width: 900px) {
    .info {
      grid-template-columns: 180px minmax(0, 1fr);
    }
  }
</style>
