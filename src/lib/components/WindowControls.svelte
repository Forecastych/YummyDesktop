<script lang="ts">
  import { onMount } from 'svelte'
  import { isTauri } from '../native'

  // Своя рамка окна (decorations: false): системная белая плашка с крестиком убрана,
  // тянуть окно можно за пустое место шапки, двойной клик — развернуть.
  type Win = Awaited<ReturnType<typeof getWin>>
  let win: Win | undefined
  let maximized = $state(false)

  async function getWin() {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    return getCurrentWindow()
  }

  onMount(() => {
    if (!isTauri) return
    let un: (() => void) | undefined
    let dead = false
    getWin().then(async (w) => {
      win = w
      maximized = await w.isMaximized()
      const off = await w.onResized(async () => (maximized = await w.isMaximized()))
      if (dead) off()
      else un = off
    })
    return () => {
      dead = true
      un?.()
    }
  })
</script>

{#if isTauri}
  <div class="controls" data-tauri-drag-region="false">
    <button title="Свернуть" aria-label="Свернуть" onclick={() => win?.minimize()}>
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" /></svg>
    </button>
    <button
      title={maximized ? 'Восстановить' : 'Развернуть'}
      aria-label={maximized ? 'Восстановить' : 'Развернуть'}
      onclick={() => win?.toggleMaximize()}
    >
      {#if maximized}
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" /></svg>
      {:else}
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M.5 .5h9v9h-9z" /></svg>
      {/if}
    </button>
    <button class="close" title="Закрыть" aria-label="Закрыть" onclick={() => win?.close()}>
      <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" /></svg>
    </button>
  </div>
{/if}

<style>
  .controls {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
  }
  button {
    display: grid;
    place-items: center;
    width: 46px;
    color: var(--text-2);
    transition: background 0.1s, color 0.1s;
  }
  button:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  button:active {
    background: rgba(255, 255, 255, 0.16);
  }
  .close:hover {
    background: #e81123;
  }
  .close:active {
    background: #b50c1b;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
    shape-rendering: crispEdges;
  }
  .close svg {
    shape-rendering: geometricPrecision;
  }
</style>
