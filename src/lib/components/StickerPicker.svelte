<script lang="ts">
  import { load, save } from '../storage'
  import { code, PACKS, stickerUrl, type Sticker } from '../stickers'

  /** onPick получает стикер или смайл; закрывать ли окно — решает вызывающий. */
  let { onPick, onClose }: { onPick: (s: Sticker) => void; onClose: () => void } = $props()

  const RECENT_MAX = 16
  const RECENT = 'stickers:recent'

  const known = new Map(PACKS.flatMap((p) => p.items.map((s) => [code(s), s] as const)))
  const saved = load<string[]>(RECENT, []).flatMap((c) => known.get(c) ?? [])
  let recent = $state(saved)
  let tab = $state(saved.length ? 'recent' : PACKS[0]?.id)
  let el = $state<HTMLDivElement>()

  const shown = $derived(tab === 'recent' ? recent : (PACKS.find((p) => p.id === tab)?.items.filter((s) => !s.gone) ?? []))
  const emojiTab = $derived(tab !== 'recent' && PACKS.find((p) => p.id === tab)?.kind === 'emoji')

  function pick(s: Sticker) {
    recent = [s, ...recent.filter((x) => x !== s)].slice(0, RECENT_MAX)
    save(RECENT, recent.map(code))
    onPick(s)
  }

  function outside(e: PointerEvent) {
    // Кнопка, которая открыла окно, сама его и закроет — её не считаем «снаружи».
    const t = e.target as Element
    if (el && !el.contains(t) && !t.closest?.('[data-sticker-toggle]')) onClose()
  }
</script>

<svelte:window onpointerdown={outside} onkeydown={(e) => e.key === 'Escape' && onClose()} />

<!-- Окно живёт внутри формы ввода: у кнопок type="button", иначе любой клик отправит сообщение. -->
<div class="picker" bind:this={el}>
  <nav>
    {#if recent.length}
      <button type="button" class:on={tab === 'recent'} title="Недавние" onclick={() => (tab = 'recent')}>
        <img src={stickerUrl(recent[0])} alt="" />
      </button>
    {/if}
    {#each PACKS as p (p.id)}
      <button type="button" class:on={tab === p.id} title={p.title} onclick={() => (tab = p.id)}>
        <img src={stickerUrl(p.items[0])} alt="" />
      </button>
    {/each}
  </nav>
  <div class="grid" class:emoji={emojiTab}>
    {#each shown as s (code(s))}
      <button type="button" title={s.emoji} onclick={() => pick(s)}>
        <img src={stickerUrl(s)} alt={s.emoji} loading="lazy" />
      </button>
    {/each}
  </div>
</div>

<style>
  .picker {
    position: absolute;
    right: 14px;
    bottom: calc(100% + 6px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    width: 360px;
    max-width: calc(100% - 28px);
    height: 340px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
    overflow: hidden;
  }
  nav {
    display: flex;
    gap: 2px;
    padding: 6px;
    border-bottom: 1px solid var(--line);
  }
  nav button {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
  }
  nav button.on,
  nav button:hover {
    background: var(--panel-2);
  }
  nav button.on {
    box-shadow: inset 0 -2px var(--accent);
  }
  nav img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
  .grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    align-content: start;
    gap: 4px;
    padding: 8px;
    overflow-y: auto;
  }
  .grid.emoji {
    grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  }
  .grid button {
    aspect-ratio: 1;
    padding: 4px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
  }
  .grid button:hover {
    background: var(--panel-2);
  }
  .grid img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
