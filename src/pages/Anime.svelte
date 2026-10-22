<script lang="ts">
  import { untrack } from 'svelte'
  import { Bell, BellOff, Check, Eye, Heart, Star } from '@lucide/svelte'
  import { clearCache, peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import { LISTS, type Anime, type AnimeShort, type Collection, type ListId, type UserRecommendation, type Video } from '../lib/api/types'
  import AddToCollection from '../lib/components/AddToCollection.svelte'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import Comments from '../lib/components/Comments.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Player from '../lib/components/Player.svelte'
  import Poster from '../lib/components/Poster.svelte'
  import Row from '../lib/components/Row.svelte'
  import { MIN_USER_VOTES, RATE_COLORS, compact, date, rateColor, rating, userVotes } from '../lib/format'
  import { setTitle } from '../lib/native'
  import { prefetchAnime } from '../lib/prefetch'
  import { errorText, query } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { isFollowed, seen, toggleFollow } from '../lib/stores/follows.svelte'
  import { history, markDone, progressOf } from '../lib/stores/history.svelte'
  import { settings } from '../lib/stores/settings.svelte'

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
  const watchedList = $derived((watched.data ?? []).filter((r) => userVotes(r.likes) >= MIN_USER_VOTES))

  const colls = query<Collection[]>(async (signal) => {
    const id = q.data?.anime_id
    return id ? Api.animeCollections(id, { signal }) : []
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

  let dubbing = $state('')
  let player = $state('')
  let episode = $state('')

  // При открытии тайтла выбираем: то, что смотрел в прошлый раз → любимую озвучку → первую.
  $effect(() => {
    const anime = a
    if (!anime) return
    untrack(() => {
      const last = history.last[anime.anime_id]
      const dubs = [...groups.keys()]
      dubbing =
        [last?.dubbing, settings.preferredDubbing].find((d) => d && groups.has(d)) ?? dubs[0] ?? ''
      pickPlayer(last?.player)
      const wanted = route.query.get('ep')
      const eps = episodes()
      let ep = wanted && eps.some((v) => v.number === wanted) ? wanted : ''
      if (!ep && last) {
        // Если прошлая серия досмотрена — сразу предлагаем следующую.
        const i = eps.findIndex((v) => v.number === last.episode)
        if (i >= 0) ep = progressOf(anime.anime_id, last.episode)?.done && eps[i + 1] ? eps[i + 1].number : last.episode
      }
      episode = ep || eps[0]?.number || ''
      seen(anime.anime_id, anime.episodes?.aired)
      setTitle(`${anime.title} — YummyDesktop`)
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
      if (done) await Api.markWatched(current.video_id, current.duration || 1, current.duration || 1)
      else await Api.unmarkWatched(current.video_id)
    } catch {
      /* локальная отметка уже стоит */
    }
  }

  // ---------- списки, избранное, оценка ----------

  let actionError = $state('')
  let list = $state<ListId | null>(null)
  let fav = $state(false)
  let myRate = $state(0)
  let hoverRate = $state(0)

  $effect(() => {
    list = (a?.user?.list?.list?.id as ListId | undefined) ?? null
    fav = !!a?.user?.list?.is_fav
    myRate = a?.user?.rating ?? 0
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
    if (!a) return
    const prev = list
    list = id
    mutate(
      () => (id == null ? Api.removeFromList(a.anime_id) : Api.setList(a.anime_id, id)),
      () => (list = prev),
    )
  }

  function toggleFav() {
    if (!a) return
    fav = !fav
    mutate(
      () => Api.setFav(a.anime_id, fav),
      () => (fav = !fav),
    )
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
              <span class="big" style:color={rateColor(rating(a))}><Star size={20} fill="currentColor" /> {rating(a)?.toFixed(1)}</span>
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
            {#if a.studios?.length}<dt>Студия</dt><dd>{a.studios.map((s) => s.title).join(', ')}</dd>{/if}
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
                {#each [...groups.keys()] as d (d)}<option value={d}>{d}</option>{/each}
              </select>
            </label>
            <label>
              <span>Плеер</span>
              <select class="select" value={player} onchange={(e) => choosePlayer(e.currentTarget.value)}>
                {#each [...(groups.get(dubbing)?.keys() ?? [])] as p (p)}<option value={p}>{p}</option>{/each}
              </select>
            </label>
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
          {#each watchedList as r (r.anime_id)}<AnimeCard anime={r} />{/each}
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

    {#key a.anime_id}
      <Comments animeId={a.anime_id} total={a.comments_count} />
    {/key}
  </div>
{:else}
  <Loader error={q.error} retry={q.retry} />
{/if}

<style>
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
    border-radius: var(--radius);
  }
  .colls {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 14px;
    padding: 14px;
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
    border-radius: 3px;
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
