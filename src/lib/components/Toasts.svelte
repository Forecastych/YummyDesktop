<script lang="ts">
  import { toasts } from '../stores/toast.svelte'
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as t (t.id)}
    <div class="toast glass" class:error={t.kind === 'error'}>{t.text}</div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: 22px;
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    animation: rise 0.18s ease-out;
  }
  .toast.error {
    border-color: rgba(255, 120, 120, 0.6);
    background: rgba(120, 30, 30, 0.55);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
</style>
