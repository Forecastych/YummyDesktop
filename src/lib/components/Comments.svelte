<script lang="ts">
  import { ThumbsDown, ThumbsUp } from '@lucide/svelte'
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
      {:else}
        <div class="text">{@html commentHtml(c.text)}</div>
      {/if}
      <div class="foot">
        <span class="votes"><ThumbsUp size={13} />{c.likes}</span>
        <span class="votes"><ThumbsDown size={13} />{c.dislikes}</span>
        {#if auth.profile}
          <button class="link" onclick={() => (replyTo = c)}>Ответить</button>
        {/if}
        {#if !nested && c.children_count > 0 && !children[c.id]}
          <button class="link" onclick={() => loadChildren(c)}>
            {c.children_count}
            {plural(c.children_count, 'ответ', 'ответа', 'ответов')}
          </button>
        {/if}
      </div>
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
