<script lang="ts">
  import { RefreshCw } from '@lucide/svelte'
  import { clearCache } from '../lib/api/client'
  import { isTauri, openExternal } from '../lib/native'
  import { settings, UI_SCALES } from '../lib/stores/settings.svelte'
  import { checkUpdates, installUpdate, updates } from '../lib/stores/updates.svelte'

  let cleared = $state(false)

  function clearApiCache() {
    clearCache()
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith('yd.cache:')) localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
    cleared = true
    setTimeout(() => (cleared = false), 2000)
  }

  const version = __APP_VERSION__
</script>

{#snippet toggle(key: 'autoSkipOpening' | 'autoSkipEnding' | 'autoNext' | 'resume' | 'notifyEpisodes' | 'closeToTray' | 'dataSaver' | 'reduceMotion', title: string, hint = '')}
  <label class="row">
    <span class="text">
      <span>{title}</span>
      {#if hint}<small>{hint}</small>{/if}
    </span>
    <input type="checkbox" class="switch" bind:checked={settings[key]} />
  </label>
{/snippet}

<div class="container page">
  <section class="block">
    <h1 class="block-title">Настройки</h1>

    <h2>Плеер</h2>
    {@render toggle('autoSkipOpening', 'Автоматически пропускать опенинг', 'Если у серии размечен опенинг. Работает в плеере Kodik.')}
    {@render toggle('autoSkipEnding', 'Автоматически пропускать эндинг')}
    {@render toggle('autoNext', 'Автопереход к следующей серии', 'Отсчёт 5 секунд после окончания серии.')}
    {@render toggle('resume', 'Продолжать с места остановки')}

    <h2>Уведомления</h2>
    {@render toggle('notifyEpisodes', 'Уведомления Windows', 'Новые серии из «Подписок» и уведомления сайта (ответы, лайки, друзья). То же, что галочка в меню трея.')}
    {@render toggle('closeToTray', 'Сворачивать в трей при закрытии', 'Крестик прячет окно, приложение работает в фоне. Выйти — правой кнопкой по значку в трее.')}

    <h2>Интерфейс и трафик</h2>
    <label class="row">
      <span class="text">
        <span>Язык описаний и названий</span>
        <small>Как в заголовке Lang у API сайта.</small>
      </span>
      <select class="select narrow" bind:value={settings.lang} onchange={() => clearCache()}>
        <option value="ru">Русский</option>
        <option value="uk">Українська</option>
        <option value="en">English</option>
      </select>
    </label>
    <label class="row">
      <span class="text">
        <span>Масштаб интерфейса</span>
        <small>Ctrl+= и Ctrl+− — крупнее и мельче, Ctrl+0 — по умолчанию.</small>
      </span>
      <select class="select narrow" bind:value={settings.uiScale}>
        {#each UI_SCALES as s (s)}
          <option value={s}>{Math.round(s * 100)}%{s === 1.2 ? ' (по умолчанию)' : ''}</option>
        {/each}
      </select>
    </label>
    {@render toggle('dataSaver', 'Экономия трафика', 'Постеры в меньшем разрешении.')}
    {@render toggle('reduceMotion', 'Без анимаций')}
    <div class="row">
      <span class="text">
        <span>Кэш ответов сервера</span>
        <small>Главная, каталог жанров и расписание сохраняются на диск и открываются мгновенно.</small>
      </span>
      <button class="btn small" onclick={clearApiCache}>{cleared ? 'Очищено' : 'Очистить'}</button>
    </div>

    <h2>Для разработчиков</h2>
    <label class="row">
      <span class="text">
        <span>Токен приложения (X-Application)</span>
        <small>Публичный токен из раздела «Приложения» на сайте. Пусто — используется встроенный в сборку.</small>
      </span>
      <input class="input narrow" type="text" spellcheck="false" placeholder="не задан" bind:value={settings.appToken} />
    </label>

    <h2>О приложении</h2>
    <div class="about">
      <p>
        <b>YummyAnime Desktop {version}</b> — неофициальный десктоп-клиент для
        <button class="link" onclick={() => openExternal('https://yummyani.me')}>YummyAnime</button>. Без рекламы,
        некоммерческий, с открытым исходным кодом.
      </p>
      {#if isTauri}
        <p class="update">
          <button class="btn small" disabled={updates.checking || updates.progress !== null} onclick={checkUpdates}>
            <RefreshCw size={14} /> Проверить обновления
          </button>
          {#if updates.checking}
            <span class="muted">Проверяю…</span>
          {:else if updates.error}
            <span class="err">{updates.error}</span>
          {:else if updates.version}
            <span>Доступна версия {updates.version}</span>
            <button class="btn small primary" disabled={updates.progress !== null} onclick={installUpdate}>Обновить</button>
          {:else if updates.checked}
            <span class="muted">Установлена последняя версия</span>
          {/if}
        </p>
      {/if}
      <p class="muted">
        Весь контент, постеры и видео принадлежат сайту и правообладателям; приложение только показывает их через
        публичное API. История, подписки и настройки хранятся локально на этом компьютере.
      </p>
      <p class="muted">Горячие клавиши: Ctrl+K или / — поиск, Alt+← — назад, F11 — полный экран, Ctrl+= / Ctrl+− / Ctrl+0 — масштаб.</p>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 860px;
    padding-top: 16px;
    padding-bottom: 32px;
  }
  h2 {
    margin: 0;
    padding: 16px 18px 6px;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--accent);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--line);
    cursor: pointer;
  }
  .row:hover {
    background: var(--panel-2);
  }
  .text {
    display: flex;
    flex-direction: column;
  }
  small {
    font-size: 12px;
    color: var(--muted);
  }
  .narrow {
    width: 260px;
    flex: none;
  }
  .switch {
    appearance: none;
    position: relative;
    width: 38px;
    height: 20px;
    flex: none;
    border-radius: 10px;
    background: var(--line-2);
    cursor: pointer;
    transition: background 0.15s;
  }
  .switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .switch:checked {
    background: var(--green);
  }
  .switch:checked::after {
    transform: translateX(18px);
  }
  .about {
    padding: 4px 18px 16px;
    line-height: 1.6;
  }
  .about p {
    margin: 6px 0;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
  }
  .update {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .err {
    color: var(--accent);
  }
</style>
