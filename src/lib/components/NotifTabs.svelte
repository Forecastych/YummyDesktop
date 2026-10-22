<script lang="ts">
  import { route } from '../router.svelte'
  import { auth } from '../stores/auth.svelte'
  import { followsCount } from '../stores/follows.svelte'
  import { notifs } from '../stores/notifications.svelte'

  // Уведомления сайта и локальные подписки на серии — две вкладки одного раздела.
  const fresh = $derived(followsCount())
</script>

<nav class="tabs">
  {#if auth.profile}
    <a href="#/notifications" class:active={route.path === '/notifications'}>
      Уведомления{#if notifs.unread}<span class="n">{notifs.unread}</span>{/if}
    </a>
  {/if}
  <a href="#/follows" class:active={route.path === '/follows'}>
    Подписки на серии{#if fresh}<span class="n">{fresh}</span>{/if}
  </a>
</nav>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    padding: 0 14px;
    border-bottom: 1px solid var(--line);
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px 8px;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    font-size: 14px;
    font-weight: 600;
  }
  a:hover {
    color: var(--text);
  }
  a.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }
  .n {
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }
</style>
