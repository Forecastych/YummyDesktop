<script lang="ts">
  import { Eye, Lock, ThumbsUp } from '@lucide/svelte'
  import { img } from '../api/client'
  import type { Collection } from '../api/types'
  import { compact } from '../format'
  import { link } from '../router.svelte'

  let { c }: { c: Collection } = $props()

  // Три постера веером, как превью коллекции на сайте.
  const previews = $derived(
    (c.poster_previews?.length ? c.poster_previews : c.animes?.map((a) => a.poster) ?? []).slice(0, 3),
  )
</script>

<a class="ccard" href={link(`/collections/${c.id}`)} title={c.title}>
  <div class="stack">
    {#each previews as p, i (i)}
      <img src={img(p.medium || p.big || p.fullsize)} alt="" loading="lazy" decoding="async" style:--i={i} />
    {/each}
    {#if !c.public}<span class="private" title="Видна только вам"><Lock size={12} /></span>{/if}
  </div>
  <div class="body">
    <div class="title">{c.title}</div>
    <div class="meta">
      {#if c.owner}<span class="owner">{c.owner.nickname}</span>{/if}
      <span class="stat"><ThumbsUp size={12} />{compact(c.likes?.likes ?? 0)}</span>
      {#if c.views}<span class="stat"><Eye size={12} />{compact(c.views)}</span>{/if}
    </div>
  </div>
</a>

<style>
  .ccard {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    background: var(--panel-2);
    overflow: hidden;
    content-visibility: auto;
    contain-intrinsic-size: auto 240px;
    transition: background 0.15s;
  }
  .ccard:hover {
    background: var(--panel-3);
  }
  .ccard:hover .title {
    color: var(--accent);
  }
  .stack {
    position: relative;
    height: 170px;
    background: #1c1c1c;
    overflow: hidden;
  }
  .stack img {
    position: absolute;
    top: 14px;
    left: calc(50% - 60px + (var(--i) - 1) * 62px);
    width: 120px;
    height: 170px;
    object-fit: cover;
    border-radius: var(--radius);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    transform: rotate(calc((var(--i) - 1) * 6deg));
    z-index: calc(3 - var(--i));
    transition: transform 0.25s;
  }
  .stack img:nth-child(2) {
    z-index: 3;
    top: 8px;
  }
  .ccard:hover .stack img {
    transform: rotate(calc((var(--i) - 1) * 9deg)) translateY(-3px);
  }
  .private {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 5;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 3px;
    background: var(--overlay);
    color: var(--yellow);
  }
  .body {
    padding: 9px 10px 10px;
  }
  .title {
    font-weight: 600;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 5px;
    font-size: 12px;
    color: var(--muted);
  }
  .owner {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }
</style>
