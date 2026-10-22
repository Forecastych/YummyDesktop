<script lang="ts">
  import { Search, X } from '@lucide/svelte'
  import { img } from '../api/client'
  import { Api } from '../api/endpoints'
  import type { AnimeShort } from '../api/types'
  import { debounce } from '../format'
  import { go } from '../router.svelte'

  let q = $state('')
  let results: AnimeShort[] = $state([])
  let open = $state(false)
  let active = $state(-1)
  let loading = $state(false)
  let input: HTMLInputElement
  let ctrl: AbortController | undefined

  const run = debounce(async (text: string) => {
    ctrl?.abort()
    if (text.trim().length < 2) {
      results = []
      loading = false
      return
    }
    ctrl = new AbortController()
    try {
      results = await Api.search(text.trim(), 8, { signal: ctrl.signal })
      active = -1
    } catch {
      /* отменён или сеть — просто не показываем */
    } finally {
      loading = false
    }
  }, 220)

  function onInput() {
    open = true
    loading = q.trim().length >= 2
    run(q)
  }

  function pick(a: AnimeShort) {
    close()
    go(`/anime/${a.anime_url}`)
  }

  function close() {
    open = false
    active = -1
    input.blur()
  }

  function submit() {
    if (active >= 0 && results[active]) return pick(results[active])
    if (!q.trim()) return
    close()
    go(`/catalog?q=${encodeURIComponent(q.trim())}`)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      active = Math.min(results.length - 1, active + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      active = Math.max(-1, active - 1)
    } else if (e.key === 'Enter') {
      submit()
    } else if (e.key === 'Escape') {
      close()
    }
  }

  // Ctrl+K или «/» — фокус в поиск откуда угодно.
  function globalKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement
    const typing = t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    if (((e.ctrlKey || e.metaKey) && e.code === 'KeyK') || (!typing && e.key === '/')) {
      e.preventDefault()
      input.focus()
      input.select()
    }
  }
</script>

<svelte:window onkeydown={globalKey} />

<div class="search" class:open={open && q.trim().length >= 2}>
  <Search size={16} class="icon" />
  <input
    bind:this={input}
    bind:value={q}
    oninput={onInput}
    onkeydown={onKey}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    placeholder="Найти аниме по названию"
    aria-label="Поиск аниме"
    spellcheck="false"
    autocomplete="off"
  />
  {#if q}
    <button class="clear" aria-label="Очистить" onclick={() => ((q = ''), (results = []), input.focus())}>
      <X size={14} />
    </button>
  {:else}
    <kbd>Ctrl K</kbd>
  {/if}

  {#if open && q.trim().length >= 2}
    <div class="drop" role="listbox">
      {#each results as a, i (a.anime_id)}
        <button
          class="item"
          class:active={i === active}
          role="option"
          aria-selected={i === active}
          onmousedown={(e) => e.preventDefault()}
          onclick={() => pick(a)}
          onmouseenter={() => (active = i)}
        >
          <img src={img(a.poster?.small || a.poster?.medium)} alt="" width="36" height="50" loading="lazy" />
          <span class="meta">
            <span class="t">{a.title}</span>
            <span class="s">
              {[a.type?.shortname, a.year, a.anime_status?.title].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      {:else}
        <div class="none">{loading ? 'Ищем…' : 'Ничего не найдено'}</div>
      {/each}
      {#if results.length}
        <button class="all" onmousedown={(e) => e.preventDefault()} onclick={submit}>Все результаты</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .search {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    max-width: 420px;
    height: 32px;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search :global(.icon) {
    margin: 0 8px 0 10px;
    color: var(--muted);
    flex: none;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: none;
    border: 0;
    outline: 0;
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  input::placeholder {
    text-transform: uppercase;
    font-size: 12px;
    color: var(--muted);
  }
  kbd {
    margin-right: 8px;
    padding: 1px 5px;
    border: 1px solid var(--line);
    border-radius: 3px;
    font-family: inherit;
    font-size: 11px;
    color: var(--muted);
  }
  .clear {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: var(--muted);
  }
  .clear:hover {
    color: var(--text);
  }
  .drop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .item {
    display: flex;
    gap: 10px;
    width: 100%;
    padding: 5px;
    text-align: left;
    border-radius: 3px;
  }
  .item.active {
    background: var(--panel-2);
  }
  .item img {
    width: 36px;
    height: 50px;
    object-fit: cover;
    border-radius: 2px;
    background: var(--panel-2);
    flex: none;
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
  .item.active .t {
    color: var(--accent);
  }
  .s {
    font-size: 11px;
    color: var(--muted);
  }
  .none {
    padding: 12px;
    color: var(--muted);
    text-align: center;
  }
  .all {
    width: 100%;
    padding: 8px;
    margin-top: 2px;
    border-top: 1px solid var(--line);
    font-size: 12px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .all:hover {
    color: var(--accent);
  }
</style>
