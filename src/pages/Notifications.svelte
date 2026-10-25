<script lang="ts">
  import { CheckCheck, Trash2, X } from '@lucide/svelte'
  import type { Notification } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import NotifTabs from '../lib/components/NotifTabs.svelte'
  import { ago } from '../lib/format'
  import { openExternal } from '../lib/native'
  import { errorText } from '../lib/query.svelte'
  import { go } from '../lib/router.svelte'
  import { internalLink, sanitize } from '../lib/sanitize'
  import { auth } from '../lib/stores/auth.svelte'
  import { ask } from '../lib/stores/confirm.svelte'
  import {
    clearAllNotifications,
    loadNotifications,
    markAllRead,
    markRead,
    notifs,
    removeNotification,
  } from '../lib/stores/notifications.svelte'

  const SITE = 'https://yummyani.me'
  let actionError = $state('')

  $effect(() => {
    if (auth.profile?.id) loadNotifications()
  })

  /** Куда ведёт уведомление: свою страницу открываем в приложении, остальное — в браузере. */
  function target(uri: string): { app?: string; web?: string } {
    if (!uri) return {}
    let u: URL
    try {
      u = new URL(uri, SITE)
    } catch {
      return {}
    }
    if (u.protocol !== 'https:') return {}
    const inApp = internalLink(u.href)
    if (inApp) return { app: inApp.slice(1) }
    const m = u.pathname.match(/^\/(users|reviews|posts|collections)\/(\d+)/)
    if (m && /yumm?y-?ani/.test(u.hostname)) return { app: `/${m[1]}/${m[2]}` }
    return { web: u.href }
  }

  function open(n: Notification) {
    markRead(n)
    const t = target(n.click_uri)
    if (t.app) go(t.app)
    else if (t.web) openExternal(t.web)
  }

  async function run(fn: () => Promise<unknown>) {
    actionError = ''
    try {
      await fn()
    } catch (e) {
      actionError = errorText(e)
    }
  }
</script>

<div class="container page">
  <section class="block">
    <NotifTabs />
    {#if !auth.profile}
      <div class="empty">Уведомления сайта доступны после <a class="accent-link" href="#/login">входа</a>.</div>
    {:else}
      <div class="bar">
        <span class="muted">Пока приложение запущено (и свёрнуто в трей), новые уведомления приходят в Windows.</span>
        {#if notifs.items.length}
          <span class="acts">
            <button class="btn small" disabled={!notifs.unread} onclick={() => run(markAllRead)}>
              <CheckCheck size={14} /> Прочитать все
            </button>
            <button
              class="btn small ghost"
              onclick={async () =>
                (await ask({ title: 'Удалить все уведомления?', ok: 'Удалить', danger: true })) && run(clearAllNotifications)}
            >
              <Trash2 size={14} /> Очистить
            </button>
          </span>
        {/if}
      </div>
      {#if actionError}<p class="err">{actionError}</p>{/if}

      {#if notifs.items.length}
        <ul class="list">
          {#each notifs.items as n (n.id)}
            <li class:unread={!n.viewed}>
              <button class="item" onclick={() => open(n)}>
                <span class="title">{@html sanitize(n.title_html || '')}</span>
                {#if n.text_html}<span class="text">{@html sanitize(n.text_html)}</span>{/if}
                <span class="time">{ago(n.date)}</span>
              </button>
              <button class="del" title="Удалить" onclick={() => run(() => removeNotification(n))}><X size={14} /></button>
            </li>
          {/each}
        </ul>
      {:else if notifs.loading || notifs.error}
        <Loader error={notifs.error} retry={loadNotifications} />
      {:else}
        <div class="empty">Уведомлений нет.</div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 32px;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  .acts {
    display: flex;
    gap: 6px;
  }
  .err {
    margin: 8px 14px 0;
    color: var(--accent);
    font-size: 13px;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: flex-start;
    border-bottom: 1px solid var(--line);
  }
  li.unread {
    background: var(--panel-2);
    box-shadow: inset 3px 0 var(--accent);
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 14px;
    text-align: left;
  }
  .item:hover .title {
    color: var(--accent);
  }
  .title {
    font-weight: 600;
  }
  .text {
    color: var(--text-2);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  /* Ссылки внутри HTML уведомления не кликаются отдельно — ведёт вся строка. */
  .item :global(a) {
    pointer-events: none;
    color: inherit;
  }
  .item :global(img) {
    max-height: 60px;
  }
  .time {
    font-size: 12px;
    color: var(--muted);
  }
  .del {
    padding: 12px 14px;
    color: var(--muted);
  }
  .del:hover {
    color: var(--accent);
  }
  .accent-link {
    color: var(--accent);
  }
</style>
