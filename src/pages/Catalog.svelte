<script lang="ts" module>
  import type { AnimeShort } from '../lib/api/types'

  // Загруженные страницы по каждому набору фильтров: «назад» из тайтла
  // возвращает ровно ту же ленту, и прокрутка встаёт на место.
  const pages = new Map<string, { items: AnimeShort[]; done: boolean }>()
</script>

<script lang="ts">
  import { untrack } from 'svelte'
  import { ChevronDown, ChevronUp, RotateCcw } from '@lucide/svelte'
  import { Api, type AnimeFilter } from '../lib/api/endpoints'
  import type { Catalog } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import { errorText, query } from '../lib/query.svelte'
  import { go, route } from '../lib/router.svelte'
  import { peek } from '../lib/api/client'

  const PAGE = 36

  const SORTS = [
    { id: 'top', title: 'По рейтингу сайта', forward: true },
    { id: 'rating', title: 'По оценкам', forward: false },
    { id: 'views', title: 'По просмотрам', forward: false },
    { id: 'year', title: 'Сначала новые', forward: false },
    { id: 'id', title: 'Недавно добавленные', forward: false },
    { id: 'title', title: 'По алфавиту', forward: true },
  ] as const
  type SortId = (typeof SORTS)[number]['id']

  const STATUSES = [
    { id: 'ongoing', title: 'Онгоинг' },
    { id: 'released', title: 'Вышел' },
    { id: 'announcement', title: 'Анонс' },
  ]

  const catalog = query<Catalog>(() => Api.catalog(), () => peek<Catalog>('/anime/catalog', { persist: 'catalog' }))

  const nums = (s: string | null) => (s ? s.split(',').map(Number).filter((n) => !Number.isNaN(n)) : [])
  const strs = (s: string | null) => (s ? s.split(',').filter(Boolean) : [])

  // Фильтр живёт в адресе — работают «назад», закладки и ссылки на жанры.
  const filter = $derived.by((): AnimeFilter => {
    const p = route.query
    const sort = (p.get('sort') as SortId) || 'top'
    return {
      q: p.get('q') || undefined,
      genres: nums(p.get('genres')),
      exclude_genres: nums(p.get('exclude_genres')),
      types: strs(p.get('types')),
      status: strs(p.get('status')),
      from_year: Number(p.get('from_year')) || undefined,
      to_year: Number(p.get('to_year')) || undefined,
      sort,
      sort_forward: SORTS.find((s) => s.id === sort)?.forward ?? true,
    }
  })
  const key = $derived(route.query.toString())

  const title = $derived.by(() => {
    if (filter.q) return `Поиск: «${filter.q}»`
    if (filter.status?.length === 1 && filter.status[0] === 'ongoing') return 'Онгоинги'
    if (filter.status?.length === 1 && filter.status[0] === 'announcement') return 'Анонсы'
    return 'Каталог аниме'
  })

  let items: AnimeShort[] = $state([])
  let done = $state(false)
  let loading = $state(false)
  let error = $state<string | null>(null)
  let gen = 0

  $effect(() => {
    const k = key
    untrack(() => {
      gen++
      const saved = pages.get(k)
      items = saved?.items ?? []
      done = saved?.done ?? false
      error = null
      loading = false
      if (!saved) more()
    })
  })

  async function more() {
    if (loading || done) return
    const my = gen
    const k = key
    loading = true
    error = null
    try {
      const list = await Api.list({ ...filter, offset: items.length, limit: PAGE })
      if (my !== gen) return
      items = [...items, ...list]
      done = list.length < PAGE
      pages.set(k, { items: $state.snapshot(items) as AnimeShort[], done })
      if (pages.size > 20) pages.delete(pages.keys().next().value as string)
    } catch (e) {
      if (my === gen) error = errorText(e)
    } finally {
      if (my === gen) loading = false
    }
  }

  let sentinel: HTMLDivElement | undefined = $state()
  $effect(() => {
    if (!sentinel) return
    const io = new IntersectionObserver((es) => es[0].isIntersecting && more(), { rootMargin: '800px' })
    io.observe(sentinel)
    return () => io.disconnect()
  })

  // ---------- панель фильтра ----------

  let open = $state(false)

  function update(patch: Record<string, string | number[] | string[] | undefined>) {
    const p = new URLSearchParams(route.query)
    for (const [k, v] of Object.entries(patch)) {
      const s = Array.isArray(v) ? v.join(',') : (v ?? '')
      if (s) p.set(k, s)
      else p.delete(k)
    }
    const qs = p.toString()
    go('/catalog' + (qs ? '?' + qs : ''), true)
  }

  // Жанр по кругу: не выбран → включить → исключить → не выбран.
  function cycleGenre(id: number) {
    const inc = filter.genres ?? []
    const exc = filter.exclude_genres ?? []
    if (inc.includes(id)) update({ genres: inc.filter((g) => g !== id), exclude_genres: [...exc, id] })
    else if (exc.includes(id)) update({ exclude_genres: exc.filter((g) => g !== id) })
    else update({ genres: [...inc, id] })
  }

  function toggleIn(name: 'types' | 'status', value: string) {
    const cur = (filter[name] as string[]) ?? []
    update({ [name]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] })
  }

  const activeCount = $derived(
    (filter.genres?.length ?? 0) +
      (filter.exclude_genres?.length ?? 0) +
      (filter.types?.length ?? 0) +
      (filter.status?.length ?? 0) +
      (filter.from_year ? 1 : 0) +
      (filter.to_year ? 1 : 0),
  )

  const groups = $derived.by(() => {
    const c = catalog.data
    if (!c) return []
    return c.genres.groups.map((g) => ({ ...g, genres: c.genres.genres.filter((x) => x.group_id === g.id) }))
  })

  const thisYear = new Date().getFullYear()
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">{title}</h1>

    <div class="bar">
      <button class="btn" class:accent={open} onclick={() => (open = !open)}>
        {open ? 'Скрыть фильтр' : 'Раскрыть фильтр'}
        {#if activeCount}<span class="count">{activeCount}</span>{/if}
        {#if open}<ChevronUp size={15} />{:else}<ChevronDown size={15} />{/if}
      </button>
      <div class="statuses">
        {#each STATUSES as s (s.id)}
          <button class="chip" class:on={filter.status?.includes(s.id)} onclick={() => toggleIn('status', s.id)}>
            {s.title}
          </button>
        {/each}
      </div>
      <select class="select sort" value={filter.sort} onchange={(e) => update({ sort: e.currentTarget.value })}>
        {#each SORTS as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
      </select>
      {#if activeCount || filter.q}
        <button class="btn ghost" onclick={() => go('/catalog', true)} title="Сбросить"><RotateCcw size={15} /> Сбросить</button>
      {/if}
    </div>

    {#if open}
      <div class="filters">
        {#if catalog.data}
          <div class="frow">
            <span class="label">Тип</span>
            <div class="chips">
              {#each catalog.data.types as t (t.type.alias)}
                <button class="chip" class:on={filter.types?.includes(t.type.alias)} onclick={() => toggleIn('types', t.type.alias)}>
                  {t.type.name} <small>{t.count}</small>
                </button>
              {/each}
            </div>
          </div>
          <div class="frow">
            <span class="label">Годы</span>
            <div class="years">
              <input
                class="input"
                type="number"
                min="1950"
                max={thisYear + 2}
                placeholder="с"
                value={filter.from_year ?? ''}
                onchange={(e) => update({ from_year: e.currentTarget.value })}
              />
              —
              <input
                class="input"
                type="number"
                min="1950"
                max={thisYear + 2}
                placeholder="по"
                value={filter.to_year ?? ''}
                onchange={(e) => update({ to_year: e.currentTarget.value })}
              />
            </div>
          </div>
          {#each groups as g (g.id)}
            <div class="frow">
              <span class="label">{g.title}</span>
              <div class="chips">
                {#each g.genres as genre (genre.value)}
                  <button
                    class="chip"
                    class:on={filter.genres?.includes(genre.value)}
                    class:off={filter.exclude_genres?.includes(genre.value)}
                    onclick={() => cycleGenre(genre.value)}
                  >
                    {genre.title}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
          <p class="hint">Клик по жанру — включить, второй клик — исключить, третий — снять.</p>
        {:else}
          <Loader error={catalog.error} retry={catalog.retry} />
        {/if}
      </div>
    {/if}

    <div class="grid list">
      {#each items as a, i (a.anime_id)}
        <AnimeCard anime={a} eager={i < 12} sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')} />
      {/each}
    </div>

    {#if error}
      <Loader {error} retry={more} />
    {:else if loading}
      <Loader />
    {:else if done && !items.length}
      <div class="empty">Ничего не найдено. Попробуйте ослабить фильтр.</div>
    {/if}
    {#if !done && !error}<div bind:this={sentinel} class="sentinel"></div>{/if}
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
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    line-height: 18px;
  }
  .statuses,
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .sort {
    margin-left: auto;
    width: auto;
  }
  .chip {
    height: 26px;
    border: 1px solid transparent;
    font-size: 12px;
    font-weight: 400;
    text-transform: none;
    cursor: pointer;
  }
  .chip:hover {
    border-color: var(--line-2);
  }
  .chip.on {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
  }
  .chip.off {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
    text-decoration: line-through;
  }
  .chip small {
    opacity: 0.6;
    margin-left: 3px;
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
  }
  .frow {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }
  .label {
    padding-top: 3px;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .years {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .years .input {
    width: 90px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .list {
    padding: 14px;
  }
  .sentinel {
    height: 1px;
  }
</style>
