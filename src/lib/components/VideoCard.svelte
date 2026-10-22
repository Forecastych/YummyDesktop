<script lang="ts">
  import { Eye, Play } from '@lucide/svelte'
  import { img } from '../api/client'
  import type { BloggerVideo } from '../api/types'
  import { ago, compact } from '../format'
  import { link } from '../router.svelte'

  let { v }: { v: BloggerVideo } = $props()
  let failed = $derived.by(() => (void v.id, false))
</script>

<!-- Ссылка на ролик и ссылка на блогера — соседи: вложенные <a> браузер разбирает неправильно. -->
<div class="vcard">
  <a class="main" href={link(`/videos/${v.id}`)} title={v.title}>
    <div class="thumb" class:blur={v.has_spoiler}>
      {#if v.previews?.small && !failed}
        <img src={img(v.previews.small)} alt="" loading="lazy" decoding="async" onerror={() => (failed = true)} />
      {/if}
      <span class="play"><Play size={18} fill="currentColor" /></span>
      <span class="cat">{v.category.title}</span>
      {#if v.has_spoiler}<span class="spoiler">Спойлеры</span>{/if}
    </div>
    <div class="title">{v.title}</div>
  </a>
  <div class="meta">
    <a class="author" href={link(`/bloggers/${v.creator.id}`)} title={v.creator.nickname}>
      <img class="ava" src={img(v.creator.avatars?.small)} alt="" width="18" height="18" loading="lazy" />
      <span class="nick">{v.creator.nickname}</span>
    </a>
    <span class="stat"><Eye size={12} />{compact(v.views)}</span>
    <span>{ago(v.publish_date)}</span>
  </div>
</div>

<style>
  .vcard {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    background: var(--panel-2);
    overflow: hidden;
    content-visibility: auto;
    contain-intrinsic-size: auto 220px;
  }
  .vcard:hover {
    background: var(--panel-3);
  }
  .main:hover .title {
    color: var(--accent);
  }
  .thumb {
    position: relative;
    aspect-ratio: 16 / 9;
    background: var(--panel-3);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s;
  }
  .main:hover .thumb img {
    transform: scale(1.04);
  }
  /* Превью со спойлером размыто, как на сайте. */
  .blur img {
    filter: blur(12px) brightness(0.7);
  }
  .play {
    position: absolute;
    inset: 0;
    margin: auto;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--overlay);
    color: #fff;
    opacity: 0.85;
  }
  .main:hover .play {
    background: var(--accent);
    opacity: 1;
  }
  .cat,
  .spoiler {
    position: absolute;
    top: 6px;
    height: 20px;
    padding: 0 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    line-height: 20px;
  }
  .cat {
    left: 6px;
    background: var(--overlay);
    color: #fff;
  }
  .spoiler {
    right: 6px;
    background: var(--accent);
    color: #fff;
  }
  .title {
    margin: 8px 10px 0;
    font-size: 13px;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    min-height: 2.7em;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 6px 10px 10px;
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .ava {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    flex: none;
    background: var(--panel-3);
  }
  .author {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .author:hover .nick {
    color: var(--accent);
  }
  .nick {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stat {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
  }
</style>
