<script lang="ts">
  import { Eye, Lock, Pencil, ThumbsDown, ThumbsUp, Trash2 } from '@lucide/svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { AnimeShort, Collection } from '../lib/api/types'
  import AnimeCard from '../lib/components/AnimeCard.svelte'
  import CollectionEditor from '../lib/components/CollectionEditor.svelte'
  import Loader from '../lib/components/Loader.svelte'
  import { compact, date } from '../lib/format'
  import { setTitle } from '../lib/native'
  import { errorText, query } from '../lib/query.svelte'
  import { go, link } from '../lib/router.svelte'
  import { auth } from '../lib/stores/auth.svelte'
  import { deleteCollection, editCollection, isOwner, removeAnimes, vote } from '../lib/stores/collections.svelte'

  let { id }: { id: number } = $props()

  const PAGE = 100

  const q = query<Collection>((signal) => Api.collection(id, 0, PAGE, { signal }))

  // Коллекция и её тайтлы — локальная копия: правки владельца видны сразу.
  let c = $state<Collection | null>(null)
  let animes = $state<AnimeShort[]>([])
  let done = $state(true)
  let loadingMore = $state(false)
  let actionError = $state<string | null>(null)

  $effect(() => {
    const d = q.data
    if (!d) return
    c = { ...d }
    animes = d.animes
    done = d.animes.length < PAGE
    setTitle(d.title)
  })

  async function more() {
    if (loadingMore || done) return
    loadingMore = true
    try {
      const next = await Api.collection(id, animes.length, PAGE)
      animes = [...animes, ...next.animes]
      done = next.animes.length < PAGE
    } catch (e) {
      actionError = errorText(e)
    } finally {
      loadingMore = false
    }
  }

  const own = $derived(isOwner(c ?? undefined))
  let editing = $state(false)

  async function onVote(action: 1 | -1) {
    if (!c) return
    actionError = null
    try {
      await vote(c, action)
    } catch (e) {
      actionError = errorText(e)
    }
  }

  async function remove(a: AnimeShort) {
    actionError = null
    try {
      await removeAnimes(id, [a.anime_id])
      animes = animes.filter((x) => x.anime_id !== a.anime_id)
    } catch (e) {
      actionError = errorText(e)
    }
  }

  async function destroy() {
    if (!c || !confirm(`Удалить коллекцию «${c.title}»? Это нельзя отменить.`)) return
    try {
      await deleteCollection(id)
      go('/collections?tab=mine', true)
    } catch (e) {
      actionError = errorText(e)
    }
  }
</script>

{#if c}
  <div class="container page">
    <section class="block">
      <h1 class="block-title">
        {#if !c.public}<Lock size={15} />{/if}
        {c.title}
      </h1>
      <div class="head">
        <div class="info">
          {#if c.description}<p class="desc">{c.description}</p>{/if}
          <div class="meta">
            {#if c.owner}
              <a class="owner" href={link(`/users/${c.owner.id}`)}>
                {#if c.owner.avatars?.small}<img src={img(c.owner.avatars.small)} alt="" width="22" height="22" />{/if}
                {c.owner.nickname}
              </a>
            {/if}
            {#if c.create_date}<span class="muted">{date(c.create_date)}</span>{/if}
            {#if c.views}<span class="muted stat"><Eye size={13} />{compact(c.views)}</span>{/if}
          </div>
        </div>
        <div class="actions">
          <div class="votes">
            <button class="btn small" class:primary={c.likes.vote === 1} disabled={!auth.profile} onclick={() => onVote(1)} title={auth.profile ? 'Нравится' : 'Войдите, чтобы голосовать'}>
              <ThumbsUp size={14} />{c.likes.likes}
            </button>
            <button class="btn small" class:accent={c.likes.vote === -1} disabled={!auth.profile} onclick={() => onVote(-1)} title={auth.profile ? 'Не нравится' : 'Войдите, чтобы голосовать'}>
              <ThumbsDown size={14} />{c.likes.dislikes}
            </button>
          </div>
          {#if own}
            <button class="btn small" onclick={() => (editing = true)}><Pencil size={14} /> Изменить</button>
            <button class="btn small ghost" onclick={destroy}><Trash2 size={14} /> Удалить</button>
          {/if}
        </div>
      </div>
      {#if actionError}<p class="err">{actionError}</p>{/if}

      {#if animes.length}
        <div class="grid list">
          {#each animes as a, i (a.anime_id)}
            <AnimeCard
              anime={a}
              eager={i < 12}
              sub={[a.type?.shortname, a.year].filter(Boolean).join(' · ')}
              onremove={own ? () => remove(a) : undefined}
              removeTitle="Убрать из коллекции"
            />
          {/each}
        </div>
        {#if !done}
          <div class="more"><button class="btn" onclick={more} disabled={loadingMore}>{loadingMore ? 'Загружаю…' : 'Показать ещё'}</button></div>
        {/if}
      {:else}
        <div class="empty">
          {own ? 'Коллекция пуста. Добавляйте тайтлы кнопкой «В коллекцию» на странице аниме.' : 'Коллекция пуста'}
        </div>
      {/if}
    </section>
  </div>

  {#if editing}
    <CollectionEditor
      heading="Редактировать коллекцию"
      initial={c}
      onsave={async (v) => {
        await editCollection(id, v)
        if (c) Object.assign(c, v)
      }}
      onclose={() => (editing = false)}
    />
  {/if}
{:else}
  <Loader error={q.error} retry={q.retry} />
{/if}

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .block-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .head {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 14px;
    border-bottom: 1px solid var(--line);
  }
  .info {
    flex: 1;
    min-width: 260px;
  }
  .desc {
    margin: 0 0 10px;
    white-space: pre-line;
    color: var(--text-2);
    line-height: 1.5;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 13px;
  }
  .owner {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .owner img {
    border-radius: 50%;
    object-fit: cover;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .votes {
    display: flex;
    gap: 4px;
    margin-right: 6px;
  }
  .votes .btn {
    gap: 5px;
  }
  .err {
    margin: 10px 14px 0;
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
