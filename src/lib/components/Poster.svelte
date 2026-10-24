<script lang="ts">
  import { ImageOff } from '@lucide/svelte'
  import { img, retryUrl } from '../api/client'
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

  const base = $derived(img(poster?.big || poster?.medium || poster?.fullsize))

  // Сбрасываются при смене адреса, а не объекта: тайтл приходит сначала из кэша, потом
  // свежим с сервера — объект новый, картинка та же, и второго onload уже не будет.
  // Сброс по объекту оставлял загруженный постер невидимым (opacity: 0).
  let loaded = $derived.by(() => (void base, false))
  let failed = $derived.by(() => (void base, false))
  // CDN иногда отвечает ошибкой на первый запрос и тут же отдаёт со второго.
  let attempt = $derived.by(() => (void base, 0))
  const RETRIES = 2

  function onError() {
    if (attempt >= RETRIES) return (failed = true)
    const b = base
    const next = attempt + 1
    setTimeout(() => base === b && (attempt = next), 1200 * next)
  }

  /** Картинка из кэша браузера может догрузиться раньше, чем повесится onload. */
  function seen(el: HTMLImageElement) {
    if (el.complete && el.naturalWidth) loaded = true
  }

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
  const src = $derived(retryUrl(base, attempt))
</script>

<div class="poster" class:loaded>
  {#if !src || failed}
    <!-- Постер не пришёл или не загрузился — серая плашка вместо битой картинки. -->
    <span class="ph" aria-hidden="true"><ImageOff size={28} /></span>
  {:else}
    <img
      {src}
      srcset={attempt ? undefined : srcset}
      {sizes}
      {alt}
      width="250"
      height="350"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchpriority={eager ? 'high' : 'auto'}
      onload={() => (loaded = true)}
      onerror={onError}
      {@attach seen}
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
  .ph {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--line-2);
  }
</style>
