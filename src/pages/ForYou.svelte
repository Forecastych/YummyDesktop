<script lang="ts">
  import { ChevronDown, ChevronUp, FolderPlus, RefreshCw, RotateCcw, Sparkles } from '@lucide/svelte'
  import { peek } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, Catalog } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionEditor from '../lib/components/CollectionEditor.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import Row from '../lib/components/Row.svelte'
  import { ago, plural } from '../lib/format'
  import { query } from '../lib/query.svelte'
  import { go } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { createCollection } from '../lib/stores/collections.svelte'
  import {
    buildSmart,
    filterCount,
    hide,
    mineSet,
    passes,
    picks,
    seedTitle,
    smart,
    smartFilter,
    type Candidate,
    type Lite,
  } from '../lib/stores/smart.svelte'

  const STEP = 48
  const SEASONS = [
    { id: 1, title: 'Зима' },
    { id: 2, title: 'Весна' },
    { id: 3, title: 'Лето' },
    { id: 4, title: 'Осень' },
  ]
  const RATINGS = [6, 7, 7.5, 8, 8.5]

  const catalog = query<Catalog>(() => Api.catalog(), () => peek<Catalog>('/anime/catalog', { persist: 'catalog' }))

  // Устаревшую подборку пересобираем при заходе; свежая отдаётся мгновенно из кэша.
  buildSmart()

  const list = $derived(picks())
  let shown = $state(STEP)
  const mine = $derived(mineSet())

  const rows = $derived(
    smart.data.rows
      .map((r) => {
        const pick = (ids: number[]) =>
          ids.map((id) => smart.data.candidates[id]).filter((c) => c && passes(c.anime, smartFilter, mine))
        return { ...r, similar: pick(r.similar), watched: pick(r.watched) }
      })
      .filter((r) => r.similar.length || r.watched.length),
  )

  function reason(c: Candidate): string {
    const t = seedTitle(c.because[0])
    if (!t) return ''
    const more = c.because.length > 1 ? ` и ещё ${c.because.length - 1}` : ''
    return c.users && !c.ai ? `Смотрели оценившие «${t}»${more}` : `Похоже на «${t}»${more}`
  }

  const asShort = (a: Lite) => a as unknown as AnimeShort

  // ---------- фильтр ----------

  let open = $state(false)

  function cycleGenre(id: number) {
    const f = smartFilter
    if (f.genres.includes(id)) {
      f.genres = f.genres.filter((g) => g !== id)
      f.exclude_genres = [...f.exclude_genres, id]
    } else if (f.exclude_genres.includes(id)) f.exclude_genres = f.exclude_genres.filter((g) => g !== id)
    else f.genres = [...f.genres, id]
    shown = STEP
  }

  function toggleSeason(id: number) {
    const s = smartFilter.seasons
    smartFilter.seasons = s.includes(id) ? s.filter((x) => x !== id) : [...s, id]
  }

  function reset() {
    Object.assign(smartFilter, { genres: [], exclude_genres: [], seasons: [], from_year: undefined, to_year: undefined, min_rating: undefined })
  }

  const groups = $derived.by(() => {
    const c = catalog.data
    if (!c) return []
    return c.genres.groups.map((g) => ({ ...g, genres: c.genres.genres.filter((x) => x.group_id === g.id) }))
  })

  const thisYear = new Date().getFullYear()
  const num = (v: string) => (v ? Number(v) : undefined)

  // ---------- сохранить на сайт ----------

  let saving = $state(false)
  const defaultTitle = $derived(
    smart.data.seeds[0] ? `Для меня: в духе «${smart.data.seeds[0].title}»` : 'Подобрано для меня',
  )
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title"><Sparkles size={16} /> Подобрано для вас</h1>

    <div class="bar">
      <div class="status muted">
        {#if smart.building}
          Собираю подборку… {Math.round(smart.progress * 100)}%
        {:else if smart.data.seeds.length}
          По {smart.data.seeds.length}
          {plural(smart.data.seeds.length, 'тайтлу', 'тайтлам', 'тайтлам')}, что вы смотрели и оценили · обновлено {ago(Math.floor(smart.data.builtAt / 1000))}
        {/if}
      </div>
      <button class="btn" class:accent={open} onclick={() => (open = !open)}>
        Фильтр
        {#if filterCount()}<span class="count">{filterCount()}</span>{/if}
        {#if open}<ChevronUp size={15} />{:else}<ChevronDown size={15} />{/if}
      </button>
      <label class="check">
        <input type="checkbox" bind:checked={smartFilter.hide_mine} />
        Скрыть моё
      </label>
      <button class="btn ghost" onclick={() => buildSmart(true)} disabled={smart.building} title="Пересобрать">
        <RefreshCw size={15} class={smart.building ? 'spin' : ''} /> Обновить
      </button>
      {#if auth.profile && list.length}
        <button class="btn" onclick={() => (saving = true)} title="Сохранить текущую выдачу коллекцией в аккаунте">
          <FolderPlus size={15} /> В коллекцию
        </button>
      {/if}
    </div>
    {#if smart.building}<div class="progress"><i style:width="{smart.progress * 100}%"></i></div>{/if}

    {#if open}
      <div class="filters">
        <div class="frow">
          <span class="label">Годы</span>
          <div class="years">
            <input class="input" type="number" min="1950" max={thisYear + 2} placeholder="с" value={smartFilter.from_year ?? ''} onchange={(e) => (smartFilter.from_year = num(e.currentTarget.value))} />
            —
            <input class="input" type="number" min="1950" max={thisYear + 2} placeholder="по" value={smartFilter.to_year ?? ''} onchange={(e) => (smartFilter.to_year = num(e.currentTarget.value))} />
          </div>
        </div>
        <div class="frow">
          <span class="label">Сезон</span>
          <div class="chips">
            {#each SEASONS as s (s.id)}
              <button class="chip" class:on={smartFilter.seasons.includes(s.id)} onclick={() => toggleSeason(s.id)}>{s.title}</button>
            {/each}
          </div>
        </div>
        <div class="frow">
          <span class="label">Рейтинг</span>
          <div class="chips">
            <button class="chip" class:on={!smartFilter.min_rating} onclick={() => (smartFilter.min_rating = undefined)}>Любой</button>
            {#each RATINGS as r (r)}
              <button class="chip" class:on={smartFilter.min_rating === r} onclick={() => (smartFilter.min_rating = r)}>от {r}</button>
            {/each}
          </div>
        </div>
        {#if catalog.data}
          {#each groups as g (g.id)}
            <div class="frow">
              <span class="label">{g.title}</span>
              <div class="chips">
                {#each g.genres as genre (genre.value)}
                  <button
                    class="chip"
                    class:on={smartFilter.genres.includes(genre.value)}
                    class:off={smartFilter.exclude_genres.includes(genre.value)}
                    onclick={() => cycleGenre(genre.value)}
                  >
                    {genre.title}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
          <p class="hint">
            Клик по жанру — только с ним, второй — исключить, третий — снять. Фильтр запоминается.
            {#if filterCount()}<button class="link" onclick={reset}><RotateCcw size={12} /> Сбросить</button>{/if}
          </p>
        {:else}
          <Loader error={catalog.error} retry={catalog.retry} />
        {/if}
      </div>
    {/if}

    {#if list.length}
      <div class="grid list">
        {#each list.slice(0, shown) as c, i (c.anime.anime_id)}
          <AnimeCard
            anime={asShort(c.anime)}
            eager={i < 12}
            sub={reason(c)}
            onremove={() => hide(c.anime.anime_id)}
            removeTitle="Не интересно"
          />
        {/each}
      </div>
      {#if list.length > shown}
        <div class="more"><button class="btn" onclick={() => (shown += STEP)}>Показать ещё</button></div>
      {/if}
    {:else if smart.building}
      <Loader />
    {:else if smart.error}
      <Loader error={smart.error} retry={() => buildSmart(true)} />
    {:else if !smart.data.seeds.length}
      <div class="empty">
        Подборка собирается из того, что вы смотрите и оцениваете.<br />
        Посмотрите пару серий или {auth.profile ? 'добавьте тайтлы в списки' : 'войдите в аккаунт — возьмём ваши списки'}.
        <br /><a href="#/top" style="color:var(--accent)">Начать с ТОП-100</a>
      </div>
    {:else}
      <div class="empty">Под такой фильтр ничего не нашлось. Ослабьте его или нажмите «Обновить».</div>
    {/if}
  </section>

  {#each rows as r (r.seed.id)}
    {#if r.similar.length}
      <section class="block">
        <h2 class="block-title">Похоже на «{r.seed.title}» <a class="more-link" href="#/anime/{r.seed.url}">к тайтлу</a></h2>
        <Row>
          {#each r.similar as c (c.anime.anime_id)}<AnimeCard anime={asShort(c.anime)} />{/each}
        </Row>
      </section>
    {/if}
    {#if r.watched.length}
      <section class="block">
        <h2 class="block-title">Оценившие «{r.seed.title}» также смотрели</h2>
        <Row>
          {#each r.watched as c (c.anime.anime_id)}
            <AnimeCard anime={asShort(c.anime)} badge={c.votes > 1 ? `+${c.votes}` : undefined} />
          {/each}
        </Row>
      </section>
    {/if}
  {/each}
</div>

{#if saving}
  <CollectionEditor
    heading="Сохранить подборку на сайт"
    submitText="Сохранить"
    initial={{ title: defaultTitle, description: 'Собрано в YummyAnime Desktop по моим спискам и оценкам.', public: false }}
    onsave={async (v) => {
      const id = await createCollection({ ...v, anime_ids: list.slice(0, Math.min(shown, 100)).map((c) => c.anime.anime_id) })
      go(`/collections/${id}`)
    }}
    onclose={() => (saving = false)}
  />
{/if}

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .block-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .more-link {
    margin-left: auto;
    font-size: 12px;
    font-weight: 400;
    text-transform: none;
    color: var(--muted);
  }
  .more-link:hover {
    color: var(--accent);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .status {
    flex: 1;
    min-width: 200px;
    font-size: 13px;
  }
  .count {
    display: inline-grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    cursor: pointer;
  }
  .progress {
    height: 3px;
    background: var(--panel-2);
  }
  .progress i {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 0.3s;
  }
  :global(.spin) {
    animation: rot 0.9s linear infinite;
  }
  @keyframes rot {
    to {
      transform: rotate(360deg);
    }
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-bottom: 1px solid var(--line);
    background: var(--panel-2);
  }
  .frow {
    display: flex;
    gap: 12px;
  }
  .label {
    flex: none;
    width: 110px;
    padding-top: 4px;
    font-size: 12px;
    color: var(--muted);
    text-transform: uppercase;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
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
  .years {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .years .input {
    width: 90px;
    height: 30px;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: 8px;
    color: var(--accent);
  }
  .list {
    padding: 14px;
  }
  .more {
    display: flex;
    justify-content: center;
    padding: 0 0 16px;
  }
</style>
