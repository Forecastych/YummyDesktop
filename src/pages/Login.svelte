<script lang="ts">
  import { onDestroy } from 'svelte'
  import { Globe } from '@lucide/svelte'
  import { isTauri, openExternal } from '../lib/native'
  import { startSiteLogin } from '../lib/native'
  import { go } from '../lib/router.svelte'
  import { login, loginWithCandidates } from '../lib/stores/auth.svelte'

  let email = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state('')
  let captcha = $state(false)
  let unlisten: (() => void) | undefined

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    busy = true
    error = ''
    const r = await login(email.trim(), password)
    busy = false
    if (r.ok) return go('/profile', true)
    error = r.message
    captcha = !!r.captcha
  }

  // Сайт защищает вход hCaptcha, которая не работает на чужом домене.
  // Поэтому открываем настоящую страницу входа в отдельном окне и забираем токен из его кук.
  async function viaSite() {
    error = ''
    try {
      unlisten?.()
      unlisten = await startSiteLogin(async (candidates) => {
        busy = true
        const ok = await loginWithCandidates(candidates)
        busy = false
        if (ok) go('/profile', true)
        else error = 'Не удалось получить токен из окна входа. Попробуйте ещё раз.'
      })
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  onDestroy(() => unlisten?.())
</script>

<div class="container page">
  <section class="block">
    <h1 class="block-title">Вход</h1>
    <form onsubmit={submit}>
      <label>
        <span>Почта или логин</span>
        <input class="input" type="text" autocomplete="username" bind:value={email} required />
      </label>
      <label>
        <span>Пароль</span>
        <input class="input" type="password" autocomplete="current-password" bind:value={password} required />
      </label>
      {#if error}<p class="err">{error}</p>{/if}
      <button class="btn primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
    </form>

    <div class="alt" class:highlight={captcha}>
      {#if captcha}<p>Сайт попросил пройти капчу — войдите через окно сайта, это безопасно и займёт минуту.</p>{/if}
      {#if isTauri}
        <button class="btn" onclick={viaSite}><Globe size={15} /> Войти через сайт</button>
      {/if}
      <p class="muted">
        Пароль уходит только на сервер YummyAnime (api.yani.tv). Приложение хранит лишь токен сессии.
        Нет аккаунта?
        <button class="link" onclick={() => openExternal('https://yummyani.me/register')}>Регистрация на сайте</button>
      </p>
      <p class="muted">Без аккаунта работают история, подписки на серии и всё остальное, кроме списков и комментариев.</p>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 460px;
    padding-top: 40px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label span {
    font-size: 12px;
    text-transform: uppercase;
    color: var(--muted);
  }
  .err {
    margin: 0;
    color: var(--accent);
  }
  .alt {
    padding: 14px 18px 18px;
    border-top: 1px solid var(--line);
    font-size: 13px;
    line-height: 1.5;
  }
  .alt.highlight {
    background: var(--accent-soft);
  }
  .alt .btn {
    width: 100%;
    margin-bottom: 8px;
  }
  .alt p {
    margin: 6px 0;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }
</style>
