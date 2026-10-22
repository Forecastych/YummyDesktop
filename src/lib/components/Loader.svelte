<script lang="ts">
  let { error = null, retry }: { error?: string | null; retry?: () => void } = $props()
</script>

{#if error}
  <div class="state">
    <p>{error}</p>
    {#if retry}<button class="btn small" onclick={retry}>Повторить</button>{/if}
  </div>
{:else}
  <div class="state" aria-busy="true"><span class="spin"></span></div>
{/if}

<style>
  .state {
    display: grid;
    place-items: center;
    gap: 10px;
    padding: 48px 16px;
    color: var(--muted);
    text-align: center;
  }
  .spin {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 3px solid var(--line);
    border-top-color: var(--accent);
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
