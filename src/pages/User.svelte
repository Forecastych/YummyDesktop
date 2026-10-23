<script lang="ts">
  import { untrack } from 'svelte'
  import { LogOut, Pencil } from '@lucide/svelte'
  import { clearCache, img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import { LISTS, type FriendList, type ListedAnime, type ListId, type ListTime, type User, type UserStats } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionCard from '../lib/components/CollectionCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import ProfileEdit from '../lib/components/ProfileEdit.svelte'
  import More from '../lib/components/More.svelte'
  import ReviewCard from '../lib/components/ReviewCard.svelte'
  import Row from '../lib/components/Row.svelte'
  import { ago, date, isOnline, plural, RATE_COLORS, roleTitles, spent } from '../lib/format'
  import { openExternal, setTitle } from '../lib/native'
  import { pager } from '../lib/pager.svelte'
  import { query } from '../lib/query.svelte'
  import { go, link, route } from '../lib/router.svelte'
  import { richText } from '../lib/sanitize'
  import { auth } from '../lib/stores/auth.svelte'
  import { recent, removeFromHistory, syncHistory, watchLine } from '../lib/stores/history.svelte'
  import { wheelScroll } from '../lib/wheel'

  // own — свой профиль (/profile): плюс кнопка выхода.
  let { id, own = false, onlogout }: { id: number; own?: boolean; onlogout?: () => void } = $props()

  const user = query<User>((signal) => Api.user(id, { signal }))
  const stats = query<UserStats>((signal) => Api.userStats(id, { signal }))
  const lists = query<ListedAnime[]>((signal) => Api.userLists(id, { signal }))
  const listSeconds = query<ListTime[]>((signal) => Api.userListTime(id, { signal }))
  const listTime = $derived.by(() => {
    const rows = (listSeconds.data ?? []).filter((r) => r.seconds > 0)
    return { rows, max: Math.max(1, ...rows.map((r) => r.seconds)) }
  })

  $effect(() => {
    if (user.data) setTitle(user.data.nickname)
  })

  // ---- история просмотра: API отдаёт её только владельцу, так что показываем лишь в своём профиле ----

  const mine = $derived(own || auth.profile?.id === id)
  $effect(() => {
    if (mine) untrack(syncHistory)
  })
  const watched = $derived(mine ? recent(20) : [])

  // ---- редактирование своего профиля ----

  let editing = $state(false)

  function profileChanged() {
    clearCache(`/users/id${id}`)
    user.retry()
  }

  // ---- вкладки: состояние в адресе, чтобы «назад» возвращал туда же ----

  const TABS = [
    { id: 'lists', title: 'Списки' },
    { id: 'reviews', title: 'Рецензии' },
    { id: 'collections', title: 'Коллекции' },
    { id: 'friends', title: 'Друзья' },
  ] as const
  type Tab = (typeof TABS)[number]['id']
  const tab = $derived<Tab>(TABS.find((t) => t.id === route.query.get('tab'))?.id ?? 'lists')

  function setQuery(patch: Record<string, string | null>) {
    const q = new URLSearchParams(route.query)
    for (const [k, v] of Object.entries(patch)) v ? q.set(k, v) : q.delete(k)
    const s = q.toString()
    go(s ? `${route.path}?${s}` : route.path, true)
  }

  // ---- списки ----

  type ListTab = ListId | 4
  const LIST_TABS: { id: ListTab; title: string }[] = [...LISTS, { id: 4, title: 'Избранное' }]
  const listTab = $derived<ListTab>((Number(route.query.get('list') ?? 0) as ListTab) || 0)

  const byList = $derived.by(() => {
    const m = new Map<ListTab, ListedAnime[]>(LIST_TABS.map((t) => [t.id, []]))
    for (const a of lists.data ?? []) {
      const l = a.user?.list
      if (l?.list) m.get(l.list.id)?.push(a)
      if (l?.is_fav) m.get(4)!.push(a)
    }
    return m
  })

  // ---- рецензии, коллекции, друзья: подгружаются, только когда открыта вкладка ----

  const reviews = pager((offset) => Api.userReviews(id, offset), 20, (r) => r.review_id)
  const colls = pager((offset) => Api.userCollections(id, offset), 24, (c) => c.id)

  const FRIEND_TABS: { id: FriendList; title: string }[] = [
    { id: 'friends', title: 'Друзья' },
    { id: 'followers', title: 'Подписчики' },
    { id: 'following', title: 'Подписки' },
  ]
  const friendTab = $derived<FriendList>(FRIEND_TABS.find((t) => t.id === route.query.get('friends'))?.id ?? 'friends')
  const friends = pager((offset) => Api.userFriends(id, friendTab, offset), 100, (f) => f.id)

  $effect(() => {
    if (tab === 'reviews') untrack(() => !reviews.items.length && !reviews.done && reviews.reset())
  })
  $effect(() => {
    // Коллекции пользователя API отдаёт только вошедшим.
    if (tab === 'collections' && auth.profile) untrack(() => !colls.items.length && !colls.done && colls.reset())
  })
  $effect(() => {
    void friendTab
    if (tab === 'friends') untrack(friends.reset)
  })

  // ---- статистика ----

  const watchTime = $derived((user.data?.watches?.sum ?? []).reduce((s, x) => s + x.spent_time, 0))
  const history = $derived(user.data?.watches?.history ?? [])
  const halfYear = $derived(history.reduce((s, h) => ({ eps: s.eps + h.ep_count, sec: s.sec + h.duration }), { eps: 0, sec: 0 }))
  const ratedCount = $derived((stats.data?.ratings ?? []).reduce((s, r) => s + r.count, 0))

  /** Сетка активности: недели столбцами, дни строками с понедельника. */
  const heat = $derived.by(() => {
    if (!history.length) return null
    const max = Math.max(...history.map((h) => h.duration))
    const lead = (new Date(history[0].when * 1000).getDay() + 6) % 7
    const cells = history.map((h) => ({
      ...h,
      level: h.duration ? Math.min(4, Math.ceil((h.duration / (max || 1)) * 4)) : 0,
    }))
    return { lead, cells }
  })

  const ratings = $derived.by(() => {
    const m = new Map((stats.data?.ratings ?? []).map((r) => [r.rating, r.count]))
    const rows = Array.from({ length: 10 }, (_, i) => ({ rating: 10 - i, count: m.get(10 - i) ?? 0 }))
    return { rows, max: Math.max(1, ...rows.map((r) => r.count)) }
  })

  const genres = $derived.by(() => {
    const list = (stats.data?.genres ?? []).slice(0, 10)
    return { list, max: Math.max(1, ...list.map((g) => g.count)) }
  })

  const types = $derived.by(() => {
    const list = (stats.data?.types ?? []).filter((t) => t.count > 0)
    const total = list.reduce((s, t) => s + t.count, 0)
    return list.map((t) => ({ ...t, share: total ? (t.count / total) * 100 : 0 }))
  })
  const TYPE_COLORS = ['#f66', '#f7af5a', '#3cce7b', '#5ab0f7', '#b98af7', '#f3d554', '#9aa']

  const about = $derived(richText(user.data?.about ?? '').filter((p) => p.text))
  let aboutOpen = $state(false)
  const aboutLong = $derived((user.data?.about?.length ?? 0) > 400 || (user.data?.about?.split('\n').length ?? 0) > 6)
  const pct = (n: number) => (n > 0 && n < 1 ? '<1' : String(Math.round(n)))
</script>

{#snippet friendCard(f: { id: number; nickname: string; avatars: { small?: string }; last_online?: number })}
  <a class="friend" href={link(`/users/${f.id}`)}>
    <img src={img(f.avatars?.small)} alt="" width="40" height="40" loading="lazy" />
    <span class="fname">{f.nickname}</span>
    {#if isOnline(f.last_online)}<span class="online">в сети</span>
    {:else if f.last_online}<span class="muted">{ago(f.last_online)}</span>{/if}
  </a>
{/snippet}

{#if user.data}
  {@const u = user.data}
  {@const roles = roleTitles(u.roles)}
  <div class="container page">
    <section class="block">
      <div class="head" style:background-image={u.banner?.full ? `url(${img(u.banner.full)})` : undefined}>
        <img class="ava" src={img(u.avatars?.big)} alt="" width="110" height="110" />
        <div class="who">
          <h1>{u.nickname}</h1>
          <div class="chips">
            {#each roles as r (r)}<span class="chip accent">{r}</span>{/each}
            {#if u.banned}<span class="chip">Заблокирован</span>{/if}
          </div>
          <div class="seen">
            {#if isOnline(u.last_online)}<span class="online">в сети</span>
            {:else}<span>Последний визит {ago(u.last_online)}</span>{/if}
            <span>· На сайте с {date(u.register_date)}</span>
            {#if u.days_online}<span>· {u.days_online} {plural(u.days_online, 'активный день', 'активных дня', 'активных дней')}</span>{/if}
          </div>
          {#if u.oldNicknames?.length}<div class="old">Ранее: {u.oldNicknames.join(', ')}</div>{/if}
        </div>
        {#if own}
          <button class="btn small" onclick={() => (editing = true)}><Pencil size={14} /> Редактировать</button>
        {/if}
        {#if own}
          <button class="btn small" onclick={onlogout}><LogOut size={14} /> Выйти</button>
        {/if}
      </div>
      {#if about.length}
        <div class="about-wrap">
          <p class="about" class:clamp={aboutLong && !aboutOpen}>
            {#each about as part, i (i)}
              <span class:b={part.b} class:i={part.i} class:u={part.u} class:s={part.s}
                >{#if part.href}<a href={part.href} onclick={(e) => (e.preventDefault(), openExternal(part.href!))}>{part.text}</a
                  >{:else}{part.text}{/if}</span
              >
            {/each}
          </p>
          {#if aboutLong}
            <button class="more-btn" onclick={() => (aboutOpen = !aboutOpen)}>{aboutOpen ? 'Свернуть' : 'Показать полностью'}</button>
          {/if}
        </div>
      {/if}
      <div class="tiles">
        <div class="tile"><b>{spent(watchTime)}</b><span>просмотрено на сайте</span></div>
        <div class="tile"><b>{halfYear.eps}</b><span>{plural(halfYear.eps, 'серия', 'серии', 'серий')} за полгода</span></div>
        <div class="tile"><b>{lists.data?.length ?? '—'}</b><span>в списках</span></div>
        <div class="tile"><b>{byList.get(4)?.length ?? 0}</b><span>в избранном</span></div>
        <div class="tile"><b>{ratedCount}</b><span>{plural(ratedCount, 'оценка', 'оценки', 'оценок')}</span></div>
      </div>
    </section>

    <div class="cols">
      <section class="block">
        <h2 class="block-title">Активность за полгода</h2>
        {#if heat}
          <div class="heat-wrap" use:wheelScroll>
            <div class="heat">
              {#each { length: heat.lead }, i (i)}<i class="pad"></i>{/each}
              {#each heat.cells as c (c.when)}
                <i
                  class="l{c.level}"
                  title="{date(c.when)}: {c.ep_count} {plural(c.ep_count, 'серия', 'серии', 'серий')}{c.duration ? `, ${spent(c.duration)}` : ''}"
                ></i>
              {/each}
            </div>
            <div class="legend">
              Меньше <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> Больше
            </div>
          </div>
        {:else}
          <p class="empty">Нет данных</p>
        {/if}
        {#if types.length}
          <h3 class="sub">Что смотрит</h3>
          <div class="types">
            {#each types as t, i (t.type.alias)}
              <i style:width="{t.share}%" style:background={TYPE_COLORS[i % TYPE_COLORS.length]} title="{t.type.name}: {pct(t.share)}%"></i>
            {/each}
          </div>
          <div class="types-legend">
            {#each types as t, i (t.type.alias)}
              <span><i style:background={TYPE_COLORS[i % TYPE_COLORS.length]}></i>{t.type.name} {pct(t.share)}%</span>
            {/each}
          </div>
        {/if}
        {#if listTime.rows.length}
          <h3 class="sub">Хронометраж по спискам</h3>
          <div class="bars">
            {#each listTime.rows as r (r.list.id)}
              <a class="lbl" href={link(`/users/${id}?list=${r.list.id}`)}>{r.list.title}</a>
              <span class="bar"><i style:width="{(r.seconds / listTime.max) * 100}%"></i></span>
              <span class="num">{spent(r.seconds)}</span>
            {/each}
          </div>
        {/if}
      </section>

      <section class="block">
        <h2 class="block-title">Оценки</h2>
        {#if stats.data}
          {#if ratedCount}
            <div class="bars">
              {#each ratings.rows as r (r.rating)}
                <span class="lbl">{r.rating}</span>
                <span class="bar"><i style:width="{(r.count / ratings.max) * 100}%" style:background={RATE_COLORS[r.rating - 1]}></i></span>
                <span class="num">{r.count}</span>
              {/each}
            </div>
          {:else}
            <p class="empty">Оценок пока нет</p>
          {/if}
        {:else}
          <Loader small error={stats.error} retry={stats.retry} />
        {/if}
      </section>

      <section class="block">
        <h2 class="block-title">Любимые жанры</h2>
        {#if stats.data}
          {#if genres.list.length}
            <div class="bars genres">
              {#each genres.list as g (g.id)}
                <a class="lbl" href={link(`/catalog?genres=${g.id}`)}>{g.title}</a>
                <span class="bar"><i style:width="{(g.count / genres.max) * 100}%"></i></span>
                <span class="num">{g.count}</span>
              {/each}
            </div>
          {:else}
            <p class="empty">Пока не из чего считать</p>
          {/if}
        {:else}
          <Loader small error={stats.error} retry={stats.retry} />
        {/if}
      </section>
    </div>

    {#if watched.length}
      <section class="block">
        <h2 class="block-title">История просмотра <a class="more" href="#/history">вся история</a></h2>
        <Row>
          {#each watched as e (e.animeId)}
            <AnimeCard
              anime={{ anime_id: e.animeId, anime_url: e.url, title: e.title, poster: e.poster }}
              sub={watchLine(e) || e.dubbing}
              progress={e.duration ? e.time / e.duration : undefined}
              onremove={() => removeFromHistory(e.animeId)}
              removeTitle="Убрать из истории"
            />
          {/each}
        </Row>
      </section>
    {/if}

    <section class="block">
      <div class="tabs">
        {#each TABS as t (t.id)}
          <button class="tab" class:active={tab === t.id} onclick={() => setQuery({ tab: t.id === 'lists' ? null : t.id })}>
            {t.title}
          </button>
        {/each}
      </div>

      {#if tab === 'lists'}
        <div class="subtabs">
          {#each LIST_TABS as t (t.id)}
            <button class="btn small" class:accent={listTab === t.id} onclick={() => setQuery({ list: t.id ? String(t.id) : null })}>
              {t.title}
              {#if lists.data}<span class="count">{byList.get(t.id)?.length ?? 0}</span>{/if}
            </button>
          {/each}
        </div>
        {#if lists.data}
          {@const items = byList.get(listTab) ?? []}
          {#if items.length}
            <div class="grid pad">
              {#each items as a (a.anime_id)}
                <AnimeCard anime={a} sub={a.user?.rating ? `Оценка: ${a.user.rating}` : ''} />
              {/each}
            </div>
          {:else}
            <p class="empty">Список пуст</p>
          {/if}
        {:else}
          <Loader error={lists.error} retry={lists.retry} />
        {/if}
      {:else if tab === 'reviews'}
        <div class="rlist">
          {#each reviews.items as r (r.review_id)}<ReviewCard {r} />{/each}
        </div>
        <More p={reviews} empty="Рецензий пока нет" />
      {:else if tab === 'collections'}
        {#if auth.profile}
          <div class="cgrid">
            {#each colls.items as c (c.id)}<CollectionCard {c} />{/each}
          </div>
          <More p={colls} empty="Коллекций пока нет" />
        {:else}
          <p class="empty">Коллекции пользователя видны после <a href="#/login">входа</a></p>
        {/if}
      {:else}
        <div class="subtabs">
          {#each FRIEND_TABS as t (t.id)}
            <button class="btn small" class:accent={friendTab === t.id} onclick={() => setQuery({ friends: t.id === 'friends' ? null : t.id })}>
              {t.title}
            </button>
          {/each}
        </div>
        <div class="fgrid">
          {#each friends.items as f (f.id)}{@render friendCard(f)}{/each}
        </div>
        <More p={friends} empty="Никого нет" />
      {/if}
    </section>
  </div>
{:else}
  <Loader error={user.error} retry={user.retry} />
{/if}

{#if own && editing}
  <ProfileEdit onchanged={profileChanged} onclose={() => (editing = false)} />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 28px 20px;
    background: var(--panel-2) center / cover no-repeat;
    box-shadow: inset 0 0 0 2000px rgba(0, 0, 0, 0.5);
  }
  .ava {
    flex: none;
    width: 110px;
    height: 110px;
    border-radius: 50%;
    border: 3px solid var(--accent);
    object-fit: cover;
    background: var(--panel-3);
  }
  .who {
    flex: 1;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 24px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }
  .chips:empty {
    display: none;
  }
  .seen {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    font-size: 13px;
    color: var(--text-2);
  }
  .online {
    color: var(--green);
    font-weight: 700;
  }
  .old {
    margin-top: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .about-wrap {
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
  }
  .about {
    margin: 0;
    white-space: pre-line;
    overflow-wrap: anywhere;
    color: var(--text-2);
  }
  .about.clamp {
    max-height: 7.5em;
    overflow: hidden;
    mask-image: linear-gradient(#000 60%, transparent);
  }
  .about .b {
    font-weight: 700;
    color: var(--text);
  }
  .about .i {
    font-style: italic;
  }
  .about .u {
    text-decoration: underline;
  }
  .about .s {
    text-decoration: line-through;
  }
  .more-btn {
    margin-top: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
  }
  .about a {
    color: var(--accent);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 14px 20px;
    border-right: 1px solid var(--line);
  }
  .tile:last-child {
    border-right: 0;
  }
  .tile b {
    font-size: 20px;
  }
  .tile span {
    font-size: 12px;
    color: var(--muted);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .heat-wrap {
    padding: 14px;
    overflow-x: auto;
  }
  .heat {
    display: grid;
    grid-template-rows: repeat(7, 11px);
    grid-auto-flow: column;
    grid-auto-columns: 11px;
    gap: 3px;
  }
  .heat i,
  .legend i {
    display: block;
    width: 11px;
    height: 11px;
    border-radius: 2px;
  }
  .heat .pad {
    visibility: hidden;
  }
  .l0 {
    background: var(--panel-3);
  }
  .l1 {
    background: rgba(255, 102, 102, 0.3);
  }
  .l2 {
    background: rgba(255, 102, 102, 0.55);
  }
  .l3 {
    background: rgba(255, 102, 102, 0.8);
  }
  .l4 {
    background: var(--accent);
  }
  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
    margin-top: 8px;
    font-size: 11px;
    color: var(--muted);
  }
  .sub {
    margin: 0;
    padding: 0 14px 8px;
    font-size: 13px;
    color: var(--text-2);
  }
  .types {
    display: flex;
    height: 10px;
    margin: 0 14px;
    border-radius: 5px;
    overflow: hidden;
    background: var(--panel-3);
  }
  .types i {
    display: block;
    height: 100%;
  }
  .types-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 8px 14px 14px;
    font-size: 12px;
    color: var(--text-2);
  }
  .types-legend span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .types-legend i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .bars {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px 10px;
    padding: 14px;
    font-size: 12px;
  }
  .bars .lbl {
    color: var(--text-2);
    white-space: nowrap;
  }
  .genres .lbl:hover {
    color: var(--accent);
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--panel-3);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    min-width: 2px;
    background: var(--accent);
  }
  .num {
    min-width: 24px;
    text-align: right;
    color: var(--muted);
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
  }
  .tab {
    padding: 12px 14px;
    font-weight: 700;
    color: var(--muted);
    border-bottom: 2px solid transparent;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .subtabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px;
  }
  .count {
    margin-left: 6px;
    opacity: 0.7;
  }
  .pad {
    padding: 0 14px 14px;
  }
  .rlist {
    display: grid;
    gap: 10px;
    padding: 12px;
  }
  .cgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    padding: 12px;
  }
  .fgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    padding: 0 12px 12px;
  }
  .rlist:empty,
  .cgrid:empty,
  .fgrid:empty {
    display: none;
  }
  .friend {
    display: grid;
    grid-template-columns: 40px 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: var(--radius);
    background: var(--panel-2);
    font-size: 12px;
  }
  .friend:hover {
    background: var(--panel-3);
  }
  .friend img {
    grid-row: span 2;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--panel-3);
  }
  .fname {
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty a {
    color: var(--accent);
  }
  @media (max-width: 1100px) {
    .cols {
      grid-template-columns: 1fr 1fr;
    }
    .cols > :first-child {
      grid-column: span 2;
    }
  }
  @media (max-width: 700px) {
    .cols {
      grid-template-columns: 1fr;
    }
    .cols > :first-child {
      grid-column: auto;
    }
    .head {
      flex-wrap: wrap;
    }
  }
</style>
