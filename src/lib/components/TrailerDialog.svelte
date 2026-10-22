<script lang="ts" module>
  export interface TrailerItem {
    id: number
    src: string
    label: string
  }
</script>

<script lang="ts">
  import { ExternalLink, X } from '@lucide/svelte'
  import { openExternal } from '../native'

  let { title, items, onclose }: { title: string; items: TrailerItem[]; onclose: () => void } = $props()

  // svelte-ignore state_referenced_locally
  let current = $state(items[0])

  /** Ссылка для браузера: YouTube без VPN во фрейме часто не открывается. */
  function watchUrl(src: string) {
    const m = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/)
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : src
  }

  let dialog: HTMLDialogElement
  $effect(() => {
    dialog.showModal()
    return () => dialog.close()
  })
</script>

<dialog bind:this={dialog} onclose={onclose} onclick={(e) => e.target === dialog && onclose()}>
  <div class="head">
    <h2>{title}</h2>
    <button class="x" aria-label="Закрыть" onclick={onclose}><X size={18} /></button>
  </div>
  {#if items.length > 1}
    <div class="tabs">
      {#each items as t (t.id)}
        <button class="btn small" class:primary={t === current} onclick={() => (current = t)}>{t.label}</button>
      {/each}
    </div>
  {/if}
  <div class="frame">
    {#key current.src}
      <iframe
        src={current.src}
        title={current.label}
        allow="autoplay; fullscreen; encrypted-media"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    {/key}
    <div class="foot">
      <span class="muted">Не загружается? Сервис трейлера может быть недоступен без VPN.</span>
      <button class="btn small" onclick={() => openExternal(watchUrl(current.src))}>
        <ExternalLink size={13} /> Открыть в браузере
      </button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(960px, calc(100vw - 32px));
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.75);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px 8px;
    border-bottom: 3px solid var(--accent);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    color: var(--muted);
  }
  .x:hover {
    color: #fff;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 16px 0;
  }
  .frame {
    padding: 12px 16px 16px;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
    font-size: 12px;
  }
  iframe {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    border: 0;
    border-radius: 3px;
    background: #000;
  }
</style>
