<script lang="ts">
  import { ChevronLeft, ChevronRight } from '@lucide/svelte'
  import type { Snippet } from 'svelte'

  // Горизонтальная лента карточек со стрелками, как карусель сезона на сайте.
  let { children, itemWidth = 168 }: { children: Snippet; itemWidth?: number } = $props()

  let track: HTMLDivElement
  let canLeft = $state(false)
  let canRight = $state(true)

  function update() {
    if (!track) return // поздний scroll после размонтирования
    canLeft = track.scrollLeft > 4
    canRight = track.scrollLeft + track.clientWidth < track.scrollWidth - 4
  }

  function scroll(dir: number) {
    track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' })
  }

  $effect(() => {
    update()
    const ro = new ResizeObserver(update)
    ro.observe(track)
    return () => ro.disconnect()
  })
</script>

<div class="row" style:--w="{itemWidth}px">
  <div class="track" bind:this={track} onscroll={update}>
    {@render children()}
  </div>
  {#if canLeft}
    <button class="arrow left" onclick={() => scroll(-1)} aria-label="Назад"><ChevronLeft size={22} /></button>
  {/if}
  {#if canRight}
    <button class="arrow right" onclick={() => scroll(1)} aria-label="Вперёд"><ChevronRight size={22} /></button>
  {/if}
</div>

<style>
  .row {
    position: relative;
  }
  .track {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: var(--w);
    gap: 10px;
    padding: 10px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .track > :global(*) {
    scroll-snap-align: start;
  }
  .arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 34px;
    height: 54px;
    display: grid;
    place-items: center;
    background: var(--overlay);
    color: #fff;
    border-radius: var(--radius);
    opacity: 0;
    transition:
      opacity 0.15s,
      background 0.15s;
  }
  .row:hover .arrow {
    opacity: 1;
  }
  .arrow:hover {
    background: var(--accent);
  }
  .left {
    left: 4px;
  }
  .right {
    right: 4px;
  }
</style>
