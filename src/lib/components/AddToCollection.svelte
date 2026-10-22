<script lang="ts">
  import { Check, FolderPlus, Lock, Plus } from '@lucide/svelte'
  import { errorText } from '../query.svelte'
  import { animeIds, createCollection, loadMine, myCollections, toggleAnime } from '../stores/collections.svelte'
  import CollectionEditor from './CollectionEditor.svelte'

  let { anime }: { anime: { anime_id: number } } = $props()

  let open = $state(false)
  let creating = $state(false)
  let error = $state<string | null>(null)
  /** id коллекции → тайтл в ней; undefined — ещё не знаем. */
  let member = $state<Record<number, boolean>>({})
  let pending = $state<Record<number, boolean>>({})
  let root: HTMLDivElement

  async function toggleOpen() {
    open = !open
    if (!open) return
    error = null
    try {
      await loadMine()
      // Состав подгружаем параллельно — список уже виден, галочки дорисуются.
      for (const c of myCollections.list) {
        if (member[c.id] !== undefined) continue
        animeIds(c.id).then(
          (ids) => (member[c.id] = ids.includes(anime.anime_id)),
          () => {},
        )
      }
    } catch (e) {
      error = errorText(e)
    }
  }

  async function toggle(id: number) {
    if (pending[id]) return
    pending[id] = true
    error = null
    try {
      member[id] = await toggleAnime(id, anime.anime_id)
    } catch (e) {
      error = errorText(e)
    } finally {
      pending[id] = false
    }
  }

  function onDoc(e: MouseEvent) {
    if (open && !creating && !root.contains(e.target as Node)) open = false
  }
</script>

<svelte:document onclick={onDoc} />

<div class="wrap" bind:this={root}>
  <button class="btn wide" class:accent={open} onclick={toggleOpen}><FolderPlus size={15} /> В коллекцию</button>
  {#if open}
    <div class="pop">
      {#if myCollections.loading && !myCollections.list.length}
        <div class="muted pad">Загружаю…</div>
      {:else}
        {#each myCollections.list as c (c.id)}
          <button class="row" onclick={() => toggle(c.id)} disabled={pending[c.id]}>
            <span class="box" class:on={member[c.id]}>{#if member[c.id]}<Check size={12} />{/if}</span>
            <span class="t">{c.title}</span>
            {#if !c.public}<Lock size={12} class="muted" />{/if}
          </button>
        {:else}
          <div class="muted pad">Своих коллекций пока нет</div>
        {/each}
      {/if}
      {#if error}<div class="err pad">{error}</div>{/if}
      <button class="row new" onclick={() => (creating = true)}><Plus size={14} /> Новая коллекция</button>
    </div>
  {/if}
</div>

{#if creating}
  <CollectionEditor
    heading="Новая коллекция"
    submitText="Создать"
    onsave={async (v) => {
      const id = await createCollection({ ...v, anime_ids: [anime.anime_id] })
      member[id] = true
    }}
    onclose={() => (creating = false)}
  />
{/if}

<style>
  .wrap {
    position: relative;
  }
  .pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 20;
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    font-size: 13px;
    text-align: left;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .row:disabled {
    opacity: 0.6;
  }
  .t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .box {
    display: grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border: 1px solid var(--line-2);
    border-radius: 3px;
  }
  .box.on {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
  }
  .new {
    border-top: 1px solid var(--line);
    color: var(--green);
  }
  .pad {
    padding: 8px 10px;
    font-size: 13px;
  }
  .err {
    color: var(--accent);
  }
</style>
