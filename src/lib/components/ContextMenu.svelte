<script lang="ts">
  import { Check } from '@lucide/svelte'
  import { closeMenu, menu, type MenuItem } from '../stores/menu.svelte'

  let el: HTMLDivElement | undefined = $state()
  let left = $state(0)
  let top = $state(0)

  // Меню не должно вылезать за край окна: прижимаем к краю или открываем в другую сторону.
  $effect(() => {
    if (!menu.open || !el) return
    const { x, y } = menu
    const r = el.getBoundingClientRect()
    const pad = 6
    left = x + r.width + pad > innerWidth ? Math.max(pad, x - r.width) : x
    top = y + r.height + pad > innerHeight ? Math.max(pad, innerHeight - r.height - pad) : y
    el.focus()
  })

  function run(it: MenuItem) {
    closeMenu()
    it.action()
  }

  function onKey(e: KeyboardEvent) {
    if (!menu.open) return
    if (e.key === 'Escape') return closeMenu()
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const btns = [...(el?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length
    btns[next]?.focus()
  }

  // Системное меню WebView («Обновить», «Печать», «Проверить») в приложении не нужно —
  // оставляем его только там, где оно полезно: поля ввода и выделенный текст.
  function onContext(e: MouseEvent) {
    const t = e.target as HTMLElement | null
    if (menu.open && !el?.contains(t)) closeMenu()
    if (t?.closest('input, textarea, [contenteditable="true"]')) return
    if (getSelection()?.toString()) return
    e.preventDefault()
  }

  function onDown(e: PointerEvent) {
    if (menu.open && !el?.contains(e.target as Node)) closeMenu()
  }
</script>

<svelte:window
  onkeydown={onKey}
  oncontextmenu={onContext}
  onpointerdown={onDown}
  onblur={closeMenu}
  onresize={closeMenu}
  onscrollcapture={closeMenu}
  onhashchange={closeMenu}
/>

{#if menu.open}
  <div class="menu" bind:this={el} role="menu" tabindex="-1" style:left="{left}px" style:top="{top}px">
    {#each menu.items as it, i (i)}
      {#if it === 'sep'}
        <hr />
      {:else if 'title' in it}
        <div class="head">{it.title}</div>
      {:else if 'group' in it}
        <div class="group">{it.group}</div>
      {:else}
        <button
          role={it.checked == null ? 'menuitem' : 'menuitemradio'}
          aria-checked={it.checked}
          class:danger={it.danger}
          class:on={it.checked}
          disabled={it.disabled}
          onclick={() => run(it)}
        >
          <span class="ico">
            {#if it.icon}<it.icon size={15} />{:else if it.checked}<Check size={15} />{/if}
          </span>
          <span class="label">{it.label}</span>
          {#if it.checked && it.icon}<span class="tick"><Check size={14} /></span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 100;
    min-width: 210px;
    max-width: 300px;
    padding: 5px;
    border-radius: 12px;
    background: rgba(44, 44, 44, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 12px 32px rgba(0, 0, 0, 0.5);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    backdrop-filter: blur(18px) saturate(160%);
    outline: none;
    animation: pop 0.1s ease-out;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }
  .head {
    padding: 6px 10px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .group {
    padding: 4px 10px 3px;
    font-size: 11px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--muted);
    opacity: 0.8;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 10px 0 6px;
    border-radius: 7px;
    font-size: 13px;
    text-align: left;
    white-space: nowrap;
  }
  button:hover,
  button:focus-visible {
    background: rgba(255, 255, 255, 0.1);
    outline: none;
  }
  button:disabled {
    opacity: 0.45;
  }
  .danger {
    color: var(--accent);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 18px;
    flex: none;
    color: var(--text-2);
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .on,
  .on .ico,
  .tick,
  .ico :global(.lucide-check) {
    color: var(--accent);
  }
  .on {
    background: rgba(255, 255, 255, 0.05);
  }
  .tick {
    display: grid;
    margin-left: 8px;
  }
  hr {
    height: 1px;
    margin: 4px 6px;
    border: 0;
    background: rgba(255, 255, 255, 0.1);
  }
</style>
