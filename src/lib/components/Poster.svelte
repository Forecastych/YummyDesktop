<script lang="ts">
  import { img } from '../api/client'
  import type { Posters } from '../api/types'
  import { settings } from '../stores/settings.svelte'

  interface Props {
    poster: Posters | undefined
    alt: string
    /** CSS-размер для выбора файла из srcset. */
    sizes?: string
    eager?: boolean
  }
  let { poster, alt, sizes = '180px', eager = false }: Props = $props()

  let loaded = $state(false)

  // Браузер сам выберет файл под реальную ширину и плотность экрана.
  const srcset = $derived.by(() => {
    if (!poster) return ''
    const set: [string | undefined, number][] = settings.dataSaver
      ? [
          [poster.medium, 184],
          [poster.big, 250],
        ]
      : [
          [poster.medium, 184],
          [poster.big, 250],
          [poster.huge, 400],
          [poster.mega, 570],
        ]
    return set
      .filter(([u]) => u)
      .map(([u, w]) => `${img(u)} ${w}w`)
      .join(', ')
  })
  const src = $derived(img(poster?.big || poster?.medium || poster?.fullsize))
</script>

<div class="poster" class:loaded>
  {#if src}
    <img
      {src}
      {srcset}
      {sizes}
      {alt}
      width="250"
      height="350"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={eager ? 'high' : 'auto'}
      onload={() => (loaded = true)}
      onerror={() => (loaded = true)}
    />
  {/if}
</div>

<style>
  .poster {
    position: relative;
    aspect-ratio: 5 / 7;
    background: var(--panel-2);
    overflow: hidden;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.25s;
  }
  .loaded img {
    opacity: 1;
  }
</style>
