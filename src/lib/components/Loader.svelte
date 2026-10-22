<script lang="ts">
  import ErrorBlock from './ErrorBlock.svelte'

  let { error = null, retry, small = false }: { error?: string | null; retry?: () => void; small?: boolean } = $props()
</script>

{#if error}
  <ErrorBlock message={error} {retry} {small} />
{:else}
  <div class="state" class:small aria-busy="true"><span class="spin"></span></div>
{/if}

<style>
  .state {
    display: grid;
    place-items: center;
    padding: 48px 16px;
  }
  .state.small {
    padding: 24px 12px;
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
