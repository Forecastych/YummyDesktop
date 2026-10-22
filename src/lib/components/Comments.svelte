<script lang="ts">
  import { Flag, Pencil, ThumbsDown, ThumbsUp, Trash2 } from '@lucide/svelte'
  import { img } from '../api/client'
  import { Api } from '../api/endpoints'
  import type { Comment } from '../api/types'
  import { ago, plural } from '../format'
  import { link } from '../router.svelte'
  import { errorText } from '../query.svelte'
  import { commentHtml } from '../sanitize'
  import { auth } from '../stores/auth.svelte'

  let { animeId, total = 0 }: { animeId: number; total?: number } = $props()

  type Sort = 'nice' | 'new' | 'old'
  const SORTS: { id: Sort; title: string }[] = [
    { id: 'nice', title: 'Лучшие' },
    { id: 'new', title: 'Новые' },
    { id: 'old', title: 'Старые' },
  ]

  let sort: Sort = $state('nice')
  let items: Comment[] = $state([])
  let children: Record<number, Comment[]> = $state({})
  let loading = $state(false)
  let done = $state(false)
  let error = $state<string | null>(null)
  let text = $state('')
  let replyTo: Comment | null = $state(null)
  let sending = $state(false)
  let started = $state(false)
  let root: HTMLElement

  async function more(reset = false) {
    if (loading) return
    loading = true
    error = null
    try {
      const skip = reset ? 0 : items.length
      const r = await Api.comments(animeId, skip, sort)
      const list = r?.comments ?? []
      items = reset ? list : [...items, ...list]
      done = list.length < 20
    } catch (e) {
      error = errorText(e)
    } finally {
      loading = false
    }
  }

  // Комментарии грузим, только когда блок доскроллили — экономим запрос.
  $effect(() => {
    const io = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting && !started) {
          started = true
          more(true)
        }
      },
      { rootMargin: '400px' },
    )
    io.observe(root)
    return () => io.disconnect()
  })

  function setSort(s: Sort) {
    if (s === sort) return
    sort = s
    items = []
    done = false
    more(true)
  }

  async function loadChildren(c: Comment) {
    try {
      const r = await Api.commentChildren(c.id)
      children[c.id] = Array.isArray(r) ? r : (r?.comments ?? [])
    } catch (e) {
      error = errorText(e)
    }
  }

  // ---- голоса, правка, удаление, жалоба ----

  /** Причины жалобы — те же, что в форме сайта. */
  const CLAIM_REASONS: { id: number; title: string }[] = [
    { id: 1, title: 'Спойлер' },
    { id: 3, title: 'Нецензурная лексика' },
    { id: 4, title: 'Оскорбление других участников' },
    { id: 5, title: 'Не по теме или не имеет смысла' },
    { id: 8, title: 'Ссылка на сторонний сайт' },
  ]

  /** Короткая строка под комментарием: «Жалоба отправлена» или текст ошибки. */
  let notes: Record<number, string> = $state({})
  let busy: Record<number, boolean> = $state({})
  let editing: number | null = $state(null)
  let editText = $state('')
  let claiming: number | null = $state(null)
  let claimWhy = $state(CLAIM_REASONS[0].id)

  const mine = (c: Comment) => !!auth.profile && c.user_id === auth.profile.id

  async function act(c: Comment, fn: () => Promise<void>) {
    if (busy[c.id]) return
    busy[c.id] = true
    delete notes[c.id]
    try {
      await fn()
    } catch (e) {
      notes[c.id] = errorText(e)
    } finally {
      delete busy[c.id]
    }
  }

  function vote(c: Comment, v: 1 | -1) {
    const action = c.vote === v ? 0 : v
    act(c, async () => {
      const r = await Api.voteComment(c.id, action)
      c.vote = action
      if (r && typeof r === 'object') {
        c.likes = r.likes ?? c.likes
        c.dislikes = r.dislikes ?? c.dislikes
      }
    })
  }

  function startEdit(c: Comment) {
    claiming = null
    editing = c.id
    editText = c.text
  }

  function saveEdit(c: Comment) {
    const t = editText.trim()
    if (!t) return
    act(c, async () => {
      const r = await Api.editComment(c.id, t)
      c.text = r && typeof r === 'object' && r.text ? r.text : t
      editing = null
    })
  }

  function remove(c: Comment) {
    if (!confirm('Удалить комментарий?')) return
    act(c, async () => {
      await Api.deleteComment(c.id)
      c.deleted_at = Math.floor(Date.now() / 1000)
    })
  }

  function claim(c: Comment) {
    act(c, async () => {
      await Api.claimComment(c.id, claimWhy)
      claiming = null
      notes[c.id] = 'Жалоба отправлена'
    })
  }

  async function submit() {
    const t = text.trim()
    if (!t || sending) return
    sending = true
    try {
      const parent = replyTo ? (replyTo.parent_id || replyTo.id) : undefined
      const c = await Api.addComment(animeId, t, parent)
      text = ''
      if (parent) {
        await loadChildren({ id: parent } as Comment)
      } else if (c && typeof c === 'object' && 'id' in c) {
        items = [c, ...items]
      } else {
        await more(true)
      }
      replyTo = null
    } catch (e) {
      error = errorText(e)
    } finally {
      sending = false
    }
  }
</script>

{#snippet item(c: Comment, nested = false)}
  <div class="comment" class:nested>
    <img class="ava" src={img(c.avatars?.small)} alt="" width="40" height="40" loading="lazy" />
    <div class="body">
      <div class="head">
        <a class="name" href={link(`/users/${c.user_id}`)}>{c.name}</a>
        {#if c.roles?.includes('moderator')}<span class="chip accent">модератор</span>{/if}
        <span class="time">{ago(c.time)}</span>
      </div>
      {#if c.deleted_at}
        <div class="text muted">Комментарий удалён</div>
      {:else if editing === c.id}
        <form class="edit" onsubmit={(e) => (e.preventDefault(), saveEdit(c))}>
          <textarea
            class="input"
            bind:value={editText}
            rows="3"
            maxlength="3000"
            onkeydown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) saveEdit(c)
              if (e.key === 'Escape') editing = null
            }}
          ></textarea>
          <div class="actions">
            <button type="button" class="link" onclick={() => (editing = null)}>отменить</button>
            <button class="btn primary small" disabled={busy[c.id] || !editText.trim()}>Сохранить</button>
          </div>
        </form>
      {:else}
        <div class="text">{@html commentHtml(c.text)}</div>
      {/if}
      <div class="foot">
        {#if auth.profile && !c.deleted_at && !mine(c)}
          <button class="votes" class:up={c.vote === 1} title="Нравится" disabled={busy[c.id]} onclick={() => vote(c, 1)}>
            <ThumbsUp size={13} />{c.likes}
          </button>
          <button class="votes" class:down={c.vote === -1} title="Не нравится" disabled={busy[c.id]} onclick={() => vote(c, -1)}>
            <ThumbsDown size={13} />{c.dislikes}
          </button>
        {:else}
          <span class="votes"><ThumbsUp size={13} />{c.likes}</span>
          <span class="votes"><ThumbsDown size={13} />{c.dislikes}</span>
        {/if}
        {#if auth.profile && !c.deleted_at}
          <button class="link" onclick={() => (replyTo = c)}>Ответить</button>
          {#if mine(c)}
            <button class="link icon" title="Изменить" onclick={() => startEdit(c)}><Pencil size={12} /></button>
            <button class="link icon" title="Удалить" disabled={busy[c.id]} onclick={() => remove(c)}><Trash2 size={12} /></button>
          {:else}
            <button
              class="link icon"
              title="Пожаловаться"
              onclick={() => ((claiming = claiming === c.id ? null : c.id), (editing = null))}
            >
              <Flag size={12} />
            </button>
          {/if}
        {/if}
        {#if !nested && c.children_count > 0 && !children[c.id]}
          <button class="link" onclick={() => loadChildren(c)}>
            {c.children_count}
            {plural(c.children_count, 'ответ', 'ответа', 'ответов')}
          </button>
        {/if}
        {#if notes[c.id]}<span class="note">{notes[c.id]}</span>{/if}
      </div>
      {#if claiming === c.id}
        <form class="claim" onsubmit={(e) => (e.preventDefault(), claim(c))}>
          <select class="select" bind:value={claimWhy}>
            {#each CLAIM_REASONS as r (r.id)}<option value={r.id}>{r.title}</option>{/each}
          </select>
          <button class="btn small primary" disabled={busy[c.id]}>Пожаловаться</button>
          <button type="button" class="link" onclick={() => (claiming = null)}>отменить</button>
        </form>
      {/if}
      {#if children[c.id]}
        {#each children[c.id] as ch (ch.id)}
          {@render item(ch, true)}
        {/each}
      {/if}
    </div>
  </div>
{/snippet}

<section class="block" bind:this={root}>
  <h2 class="block-title">
    Комментарии{#if total}<span class="count">{total}</span>{/if}
    <span class="tabs">
      {#each SORTS as s (s.id)}
        <button class:active={sort === s.id} onclick={() => setSort(s.id)}>{s.title}</button>
      {/each}
    </span>
  </h2>

  <div class="inner">
    {#if auth.profile}
      <form class="write" onsubmit={(e) => (e.preventDefault(), submit())}>
        {#if replyTo}
          <div class="reply">
            Ответ для <b>{replyTo.name}</b>
            <button type="button" class="link" onclick={() => (replyTo = null)}>отменить</button>
          </div>
        {/if}
        <textarea
          class="input"
          bind:value={text}
          rows="3"
          maxlength="3000"
          placeholder="Напишите комментарий… Спойлеры прячьте в [спойлер]…[/спойлер]"
          onkeydown={(e) => e.key === 'Enter' && e.ctrlKey && submit()}
        ></textarea>
        <div class="actions">
          <span class="muted">Ctrl+Enter — отправить</span>
          <button class="btn primary small" disabled={sending || !text.trim()}>Отправить</button>
        </div>
      </form>
    {:else}
      <p class="muted"><a href="#/login" class="accent-link">Войдите</a>, чтобы оставлять комментарии.</p>
    {/if}

    {#each items as c (c.id)}
      {@render item(c)}
    {:else}
      {#if !loading && started && !error}<div class="empty">Комментариев пока нет</div>{/if}
    {/each}

    {#if error}<p class="muted">{error}</p>{/if}
    {#if loading}
      <div class="empty">Загрузка…</div>
    {:else if started && !done && items.length}
      <button class="btn more" onclick={() => more()}>Показать ещё</button>
    {/if}
  </div>
</section>

<style>
  .inner {
    padding: 12px 14px;
  }
  .count {
    margin-left: 8px;
    color: var(--muted);
    font-weight: 400;
  }
  .tabs {
    position: absolute;
    right: 14px;
    display: flex;
    gap: 2px;
    text-transform: none;
  }
  .tabs button {
    padding: 2px 8px;
    font-size: 12px;
    color: var(--muted);
    border-radius: 3px;
  }
  .tabs button.active {
    color: #fff;
    background: var(--panel-2);
  }
  .write {
    margin-bottom: 14px;
  }
  .write textarea {
    width: 100%;
    resize: vertical;
    min-height: 70px;
    padding: 8px 10px;
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 6px;
    font-size: 12px;
  }
  .reply {
    margin-bottom: 6px;
    font-size: 13px;
  }
  .comment {
    display: flex;
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .comment.nested {
    border-top: 0;
    padding-bottom: 0;
  }
  .ava {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--panel-2);
    flex: none;
  }
  .nested .ava {
    width: 30px;
    height: 30px;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name {
    font-weight: 600;
    color: var(--accent);
  }
  .name:hover {
    text-decoration: underline;
  }
  .time {
    font-size: 12px;
    color: var(--muted);
  }
  .text {
    margin-top: 4px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .votes {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: inherit;
    font-size: 12px;
  }
  button.votes:hover {
    color: var(--text);
  }
  .votes.up {
    color: var(--green);
  }
  .votes.down {
    color: var(--accent);
  }
  .icon {
    display: inline-flex;
    align-items: center;
  }
  .note {
    color: var(--text-2);
  }
  .edit {
    margin-top: 4px;
  }
  .edit textarea {
    width: 100%;
    resize: vertical;
    min-height: 60px;
    padding: 8px 10px;
  }
  .claim {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .link {
    color: var(--muted);
    font-size: 12px;
  }
  .link:hover,
  .accent-link {
    color: var(--accent);
  }
  .more {
    display: block;
    margin: 10px auto 0;
  }
</style>
