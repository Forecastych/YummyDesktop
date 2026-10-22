<script lang="ts">
  import { ThumbsDown, ThumbsUp } from '@lucide/svelte'
  import type { Likes } from '../api/types'
  import { errorText } from '../query.svelte'
  import { auth } from '../stores/auth.svelte'

  // Повторное нажатие на ту же кнопку снимает голос (action 0).
  let {
    likes: initial,
    vote,
    compact = false,
  }: { likes?: Likes; vote: (action: -1 | 0 | 1) => Promise<Likes>; compact?: boolean } = $props()

  let likes = $derived<Likes>(initial ?? { likes: 0, dislikes: 0, vote: 0 })
  let busy = $state(false)
  let error = $state<string | null>(null)

  async function onVote(v: 1 | -1) {
    if (busy) return
    busy = true
    error = null
    try {
      likes = await vote(likes.vote === v ? 0 : v)
    } catch (e) {
      error = errorText(e)
    } finally {
      busy = false
    }
  }

  const hint = $derived(auth.profile ? undefined : 'Голосовать можно после входа')
</script>

<span class="votes" class:compact>
  <button class="btn small" class:accent={likes.vote === 1} disabled={!auth.profile || busy} title={hint ?? 'Нравится'} onclick={() => onVote(1)}>
    <ThumbsUp size={compact ? 12 : 14} />{likes.likes}
  </button>
  <button class="btn small" class:accent={likes.vote === -1} disabled={!auth.profile || busy} title={hint ?? 'Не нравится'} onclick={() => onVote(-1)}>
    <ThumbsDown size={compact ? 12 : 14} />{likes.dislikes}
  </button>
  {#if error}<span class="err" title={error}>{compact ? '!' : error}</span>{/if}
</span>

<style>
  .votes {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .votes .btn {
    gap: 5px;
  }
  .compact .btn {
    padding: 2px 8px;
    font-size: 12px;
  }
  .err {
    color: var(--accent);
    font-size: 12px;
  }
</style>
