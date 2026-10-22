<script lang="ts">
  import { Eye, ThumbsDown, ThumbsUp } from '@lucide/svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { Likes, Review } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import { compact, date, rateColor } from '../lib/format'
  import { openExternal, setTitle } from '../lib/native'
  import { errorText, query } from '../lib/query.svelte'
  import { link } from '../lib/router.svelte'
  import { sanitize } from '../lib/sanitize'
  import { auth } from '../lib/stores/auth.svelte'

  let { id }: { id: number } = $props()
  const review = query<Review>((signal) => Api.review(id, { signal }))
  const html = $derived(review.data ? sanitize(review.data.text_html ?? review.data.text_preview) : '')

  let likes = $derived<Likes>(review.data?.likes ?? { likes: review.data?.total_likes ?? 0, dislikes: 0, vote: 0 })
  let voting = $state(false)
  let voteError = $state<string | null>(null)

  async function vote(v: 1 | -1) {
    if (voting) return
    voting = true
    voteError = null
    try {
      likes = await Api.voteReview(id, likes.vote === v ? 0 : v)
    } catch (e) {
      voteError = errorText(e)
    } finally {
      voting = false
    }
  }

  $effect(() => {
    const r = review.data
    if (r) setTitle(`Рецензия на «${r.anime?.title ?? 'аниме'}» — YummyDesktop`)
  })

  function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a[data-external]') as HTMLAnchorElement | null
    if (!a) return
    e.preventDefault()
    openExternal(a.href)
  }
</script>

{#if review.data}
  {@const r = review.data}
  {@const avg = Math.round(r.rating.average * 10) / 10}
  <div class="container page">
    <article class="block">
      <div class="top">
        {#if r.anime}
          <a class="poster" href={link(`/anime/${r.anime.anime_url}`)}>
            <img src={img(r.anime.poster?.medium ?? r.anime.poster?.small)} alt="" />
          </a>
        {/if}
        <div class="info">
          <span class="muted small">Рецензия на</span>
          {#if r.anime}<a class="anime" href={link(`/anime/${r.anime.anime_url}`)}>{r.anime.title}</a>{/if}
          <a class="author" href={link(`/users/${r.author.id}`)}>
            <img src={img(r.author.avatars?.small)} alt="" width="28" height="28" />
            <b>{r.author.nickname}</b>
            <span class="muted">{date(r.create_date, true)}</span>
          </a>
          <div class="cats">
            {#each Object.entries(r.rating.category) as [name, value] (name)}
              <div class="cat">
                <span>{name.trim()}</span>
                <span class="bar"><i style:width="{value * 10}%" style:background={rateColor(value)}></i></span>
                <b>{value}</b>
              </div>
            {/each}
          </div>
        </div>
        <div class="avg" style:background={rateColor(avg)} title="Итоговая оценка">{avg}</div>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="content" onclick={onClick}>{@html html}</div>
      <div class="foot">
        <button class="btn small" class:accent={likes.vote === 1} disabled={!auth.profile || voting} onclick={() => vote(1)}>
          <ThumbsUp size={14} />{likes.likes}
        </button>
        <button class="btn small" class:accent={likes.vote === -1} disabled={!auth.profile || voting} onclick={() => vote(-1)}>
          <ThumbsDown size={14} />{likes.dislikes}
        </button>
        {#if !auth.profile}<span class="muted small">Оценивать рецензии можно после входа</span>{/if}
        {#if voteError}<span class="err small">{voteError}</span>{/if}
        <span class="views"><Eye size={14} />{compact(r.views ?? 0)}</span>
      </div>
    </article>
  </div>
{:else}
  <Loader error={review.error} retry={review.retry} />
{/if}

<style>
  .page {
    max-width: 960px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .top {
    display: flex;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
  }
  .poster {
    flex: none;
    width: 120px;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--panel-3);
  }
  .poster img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .small {
    font-size: 12px;
  }
  .anime {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.3;
  }
  .anime:hover {
    color: var(--accent);
  }
  .author {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .author img {
    border-radius: 50%;
    background: var(--panel-3);
  }
  .author:hover b {
    color: var(--accent);
  }
  .cats {
    display: grid;
    gap: 4px;
    max-width: 420px;
    margin-top: 6px;
    font-size: 12px;
  }
  .cat {
    display: grid;
    grid-template-columns: 140px 1fr 24px;
    align-items: center;
    gap: 8px;
    color: var(--text-2);
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--panel-3);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
  }
  .cat b {
    text-align: right;
  }
  .avg {
    flex: none;
    align-self: flex-start;
    min-width: 54px;
    padding: 10px;
    border-radius: var(--radius);
    background: var(--panel-3);
    color: #222;
    font-size: 22px;
    font-weight: 800;
    text-align: center;
  }
  .content {
    padding: 16px 18px 20px;
    line-height: 1.7;
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .content :global(img) {
    height: auto;
    max-width: 100%;
    margin: 10px auto;
    border-radius: var(--radius);
  }
  .content :global(a) {
    color: var(--accent);
    text-decoration: underline;
  }
  .content :global(blockquote) {
    margin: 10px 0;
    padding: 6px 14px;
    border-left: 3px solid var(--accent);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--line);
  }
  .foot .btn {
    gap: 6px;
  }
  .err {
    color: var(--accent);
  }
  .views {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: 13px;
    color: var(--muted);
  }
</style>
