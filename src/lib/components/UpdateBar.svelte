<script lang="ts">
  import { Download, X } from '@lucide/svelte'
  import { installUpdate, updates } from '../stores/updates.svelte'

  const version = __APP_VERSION__
</script>

{#if updates.version && !updates.dismissed}
  <div class="bar">
    <div class="inner container">
      <span class="text">
        Доступна версия <b>{updates.version}</b> (у вас {version}).
        {#if updates.error}<span class="err">{updates.error}</span>{/if}
      </span>
      {#if updates.progress !== null}
        <span class="progress"><span style="width: {Math.round(updates.progress * 100)}%"></span></span>
        <span class="muted">{Math.round(updates.progress * 100)}%</span>
      {:else}
        <button class="btn small primary" onclick={installUpdate}><Download size={14} /> Обновить</button>
        <button class="close" title="Напомнить позже" aria-label="Напомнить позже" onclick={() => (updates.dismissed = true)}>
          <X size={14} />
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .bar {
    background: var(--panel-2);
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
  }
  .text {
    flex: 1;
    min-width: 0;
  }
  .err {
    margin-left: 6px;
    color: var(--accent);
  }
  .progress {
    width: 160px;
    height: 6px;
    border-radius: 3px;
    background: var(--line);
    overflow: hidden;
  }
  .progress span {
    display: block;
    height: 100%;
    background: var(--green);
    transition: width 0.2s;
  }
  .close {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--muted);
  }
  .close:hover {
    background: var(--panel-3);
    color: var(--text);
  }
</style>
