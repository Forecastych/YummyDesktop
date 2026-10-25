<script lang="ts">
  import { Bell, ChevronDown, History, LogIn, MessageCircle, Settings } from '@lucide/svelte'
  import { img } from '../api/client'
  import { route } from '../router.svelte'
  import { auth } from '../stores/auth.svelte'
  import { followsCount } from '../stores/follows.svelte'
  import { chat } from '../stores/messages.svelte'
  import { notifs } from '../stores/notifications.svelte'
  import { isTauri } from '../native'
  import SearchBox from './SearchBox.svelte'
  import WindowControls from './WindowControls.svelte'

  interface NavItem {
    title: string
    href: string
    children?: { title: string; href: string }[]
  }

  const nav: NavItem[] = [
    { title: 'Главная', href: '/' },
    {
      title: 'Аниме',
      href: '/catalog',
      children: [
        { title: 'Каталог', href: '/catalog' },
        { title: 'Онгоинги', href: '/catalog?status=ongoing' },
        { title: 'Анонсы', href: '/catalog?status=announcement' },
        { title: 'Расписание', href: '/schedule' },
      ],
    },
    { title: 'ТОП-100', href: '/top' },
    { title: 'Случайное', href: '/random' },
    {
      title: 'Подборки',
      href: '/for-you',
      children: [
        { title: 'Для вас', href: '/for-you' },
        { title: 'Коллекции', href: '/collections' },
        { title: 'Мои коллекции', href: '/collections?tab=mine' },
        { title: 'Рецензии', href: '/reviews' },
      ],
    },
    {
      title: 'Новости',
      href: '/posts',
      children: [
        { title: 'Новости аниме', href: '/posts?category=anime_news' },
        { title: 'Новости сайта', href: '/posts?category=site_news' },
        { title: 'Статьи', href: '/posts?category=articles' },
        { title: 'Интервью', href: '/posts?category=interview' },
      ],
    },
    { title: 'Видео', href: '/videos' },
  ]

  const section = $derived('/' + (route.path.split('/')[1] ?? ''))
  const isActive = (href: string) => section === href || (href === '/catalog' && section === '/schedule')
  const current = $derived(nav.find((i) => isActive(i.href))?.title ?? 'Разделы')
  const fresh = $derived(followsCount() + (auth.profile ? notifs.unread : 0))
</script>

<!-- В Tauri шапка — это и заголовок окна: за пустое место её можно тянуть. -->
<header class:framed={isTauri} data-tauri-drag-region="deep">
  <div class="inner container">
    <a class="logo" href="#/" aria-label="На главную">
      <img class="mark" src="/favicon.png" alt="" draggable="false" /><span class="name">YummyAnime <b>Desktop</b></span>
    </a>

    <nav class="full">
      {#each nav as item (item.href)}
        <div class="nav-item" class:has-children={item.children}>
          <a href="#{item.href}" class:active={isActive(item.href)}>
            {item.title}
            {#if item.children}<ChevronDown size={13} />{/if}
          </a>
          {#if item.children}
            <div class="menu" data-tauri-drag-region="false">
              {#each item.children as c (c.href)}
                <a href="#{c.href}" onclick={(e) => e.currentTarget.blur()}>{c.title}</a>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </nav>

    <!-- Узкое окно: все разделы в одном выпадающем меню, иначе пункты наезжают на поиск и кнопки. -->
    <nav class="compact">
      <div class="nav-item">
        <button type="button" class="active">{current} <ChevronDown size={13} /></button>
        <div class="menu" data-tauri-drag-region="false">
          {#each nav as item, i (item.href)}
            <!-- Группы с подпунктами отделены чертой от соседей. -->
            {#if i && (item.children || nav[i - 1].children)}<span class="sep"></span>{/if}
            {#if item.children}
              {#each item.children as c (c.href)}
                <a href="#{c.href}" onclick={(e) => e.currentTarget.blur()}>{c.title}</a>
              {/each}
            {:else}
              <a href="#{item.href}" class:active={isActive(item.href)} onclick={(e) => e.currentTarget.blur()}>{item.title}</a>
            {/if}
          {/each}
        </div>
      </div>
    </nav>

    <div class="search-wrap"><SearchBox /></div>

    <div class="tools">
      <a class="tool" href="#/history" title="История просмотра" class:active={section === '/history'}>
        <History size={18} />
      </a>
      <a
        class="tool"
        href={auth.profile ? '#/notifications' : '#/follows'}
        title={auth.profile ? 'Уведомления и подписки' : 'Подписки на новые серии'}
        class:active={section === '/follows' || section === '/notifications'}
      >
        <Bell size={18} />
        {#if fresh}<span class="dot">{fresh > 99 ? '99+' : fresh}</span>{/if}
      </a>
      {#if auth.profile}
        <a class="tool" href="#/messages" title="Сообщения" class:active={section === '/messages'}>
          <MessageCircle size={18} />
          {#if chat.unread}<span class="dot">{chat.unread > 99 ? '99+' : chat.unread}</span>{/if}
        </a>
      {/if}
      <a class="tool" href="#/settings" title="Настройки" class:active={section === '/settings'}>
        <Settings size={18} />
      </a>
      {#if auth.profile}
        <a class="avatar" href="#/profile" title={auth.profile.nickname}>
          <img src={img(auth.profile.avatars?.small)} alt="" width="28" height="28" />
        </a>
      {:else}
        <a class="btn primary small" href="#/login" title="Войти"><LogIn size={14} /> <span class="label">Войти</span></a>
      {/if}
    </div>
  </div>
  <WindowControls />
</header>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 40;
    height: var(--header-h);
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
    user-select: none;
  }
  /* Место под кнопки окна (3 × 46px) — контейнер центрируется в оставшейся ширине. */
  header.framed {
    padding-right: 138px;
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 100%;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: none;
  }
  .mark {
    width: 28px;
    height: 28px;
  }
  .name {
    font-size: 15px;
    font-weight: 600;
  }
  .name b {
    color: var(--accent);
    font-weight: 600;
  }
  nav {
    display: flex;
    height: 100%;
  }
  .nav-item {
    position: relative;
    height: 100%;
  }
  .nav-item > :is(a, button) {
    display: flex;
    align-items: center;
    gap: 3px;
    height: 100%;
    padding: 0 11px;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-2);
    border-bottom: 3px solid transparent;
    border-top: 3px solid transparent;
  }
  .nav-item > a:hover,
  .nav-item:hover > :is(a, button) {
    color: #fff;
  }
  .nav-item > .active {
    color: #fff;
    border-bottom-color: var(--accent);
  }
  .menu {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 180px;
    padding: 4px 0;
    background: var(--panel);
    border: 1px solid var(--line);
    border-top: 0;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
    visibility: hidden;
    opacity: 0;
    transform: translateY(-4px);
    transition:
      opacity 0.12s,
      transform 0.12s,
      visibility 0.12s;
  }
  /* Не :focus-within: после клика мышью фокус остаётся на пункте и меню висит открытым. */
  .nav-item:hover .menu,
  .nav-item:has(:focus-visible) .menu {
    visibility: visible;
    opacity: 1;
    transform: none;
  }
  .menu a {
    display: block;
    padding: 8px 14px;
    font-size: 13px;
  }
  .menu a:hover,
  .menu a.active {
    background: var(--panel-2);
    color: var(--accent);
  }
  .sep {
    display: block;
    margin: 4px 0;
    border-top: 1px solid var(--line);
  }
  .compact {
    display: none;
  }
  .compact .menu {
    max-height: calc(100vh - var(--header-h));
    overflow-y: auto;
  }
  .search-wrap {
    flex: 1;
    display: flex;
    justify-content: flex-end;
    min-width: 160px;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
  }
  .tool {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    color: var(--text-2);
  }
  .tool:hover,
  .tool.active {
    color: #fff;
    background: var(--panel-2);
  }
  .dot {
    position: absolute;
    top: 3px;
    right: 2px;
    min-width: 15px;
    height: 15px;
    padding: 0 3px;
    border-radius: 8px;
    background: var(--accent);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    line-height: 15px;
    text-align: center;
  }
  .avatar img {
    width: 28px;
    height: 28px;
    margin-left: 6px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--panel-2);
  }
  .tools .btn {
    margin-left: 6px;
  }
  /* Пороги замерены в окне приложения (с кнопками окна, 138px): меню — 630px, ужатое — 555,
     поиск — от 160, значки с «Войти» — 200, название — 175. Уже порога элементы наезжают друг на друга. */
  @media (max-width: 1420px) {
    .name {
      display: none;
    }
  }
  @media (max-width: 1240px) {
    .nav-item > :is(a, button) {
      padding: 0 8px;
      font-size: 12px;
    }
  }
  @media (max-width: 1170px) {
    .full {
      display: none;
    }
    .compact {
      display: flex;
    }
  }
  /* Минимальное окно при крупном масштабе — около 600px. */
  @media (max-width: 720px) {
    .inner {
      gap: 10px;
    }
    .search-wrap {
      min-width: 120px;
    }
    .tools .label {
      display: none;
    }
  }
</style>
