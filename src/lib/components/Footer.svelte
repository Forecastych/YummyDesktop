<script lang="ts">
  import { openExternal } from '../native'

  // Блоки и ссылки — как в подвале ru.yummyani.me. Всё открывается в системном браузере.
  const SITE = 'https://ru.yummyani.me'

  const resources = [
    { title: 'Discord', href: 'https://discord.com/invite/yummyanime-1103691943881474048' },
    { title: 'Boosty', href: 'https://boosty.to/yummyanime' },
    { title: 'ВКонтакте', href: 'https://vk.com/yummyanime_official' },
    { title: 'Telegram', href: 'https://t.me/yummyanime' },
    { title: 'Pikabu', href: 'https://pikabu.ru/@YummyAnime' },
  ]

  const cols = [
    {
      title: 'Информация о сайте',
      links: [
        { title: 'О сайте', href: `${SITE}/pages/about-yummy` },
        { title: 'Правила сайта', href: `${SITE}/pages/about-yummy?tab=rules` },
        { title: 'Политика конфиденциальности', href: `${SITE}/pages/privacy` },
        { title: 'Информация для правообладателей', href: `${SITE}/pages/copyright` },
        { title: 'API сайта', href: 'https://api.yani.tv' },
        { title: 'Приложения', href: `${SITE}/dev/applications` },
      ],
    },
    {
      title: 'Поддержка и помощь',
      links: [
        { title: 'promotion@yummyani.me', href: 'mailto:promotion@yummyani.me' },
        { title: 'Чат с поддержкой', href: `${SITE}/dialogs?id=2` },
        { title: 'Помощь сайту', href: `${SITE}/pages/want-to-help` },
        { title: 'Поддержка в Telegram', href: 'https://t.me/YummyAnime_support' },
        { title: 'Старый дизайн', href: 'https://old.yummyani.me' },
      ],
    },
  ]

  const year = new Date().getFullYear()

  function open(e: MouseEvent, href: string) {
    e.preventDefault()
    openExternal(href)
  }
</script>

<footer>
  <div class="inner container">
    <div class="col">
      <b class="head">Наши ресурсы</b>
      <ul class="res">
        {#each resources as r (r.href)}
          <li><a href={r.href} onclick={(e) => open(e, r.href)}>{r.title}</a></li>
        {/each}
      </ul>
      <p class="note">
        YummyDesktop — неофициальный клиент. Весь контент и аккаунты — на стороне YummyAnime.
      </p>
    </div>
    {#each cols as c (c.title)}
      <div class="col">
        <b class="head">{c.title}</b>
        <ul>
          {#each c.links as l (l.href)}
            <li><a href={l.href} onclick={(e) => open(e, l.href)}>{l.title}</a></li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
  <div class="copy container">© 2022-{year} YummyAnime. Все права защищены.</div>
</footer>

<style>
  footer {
    margin-top: 16px;
    background: var(--panel);
    border-top: 1px solid var(--line);
    font-size: 13px;
  }
  .inner {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 24px;
    padding-top: 24px;
    padding-bottom: 20px;
  }
  .head {
    display: block;
    margin-bottom: 10px;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--text);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .res {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .res a {
    display: inline-block;
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    background: var(--panel-2);
  }
  a {
    color: var(--muted);
  }
  a:hover {
    color: var(--accent);
  }
  .note {
    margin: 14px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .copy {
    padding-top: 12px;
    padding-bottom: 16px;
    border-top: 1px solid var(--line);
    color: var(--muted);
    font-size: 12px;
  }
  @media (max-width: 800px) {
    .inner {
      grid-template-columns: 1fr;
    }
  }
</style>
