<script lang="ts">
  import { onDestroy } from 'svelte'
  import { ArrowLeft, Globe, KeyRound } from '@lucide/svelte'
  import { Api } from '../lib/api/endpoints'
  import { closeSiteLogin, isTauri, openExternal, startSiteLogin } from '../lib/native'
  import { errorText } from '../lib/query.svelte'
  import { parseResetLink } from '../lib/resetLink'
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
  // Окно присылает токены после каждой загрузки страницы; протухшие от прошлой сессии
  // запоминаем и больше не проверяем, окно остаётся открытым, пока пользователь не войдёт.
  const rejected = new Set<string>()

  async function viaSite(reset = false) {
    error = ''
    if (!isTauri) {
      if (reset) openExternal(RESET_URL)
      return
    }
    try {
      unlisten?.()
      unlisten = await startSiteLogin(async (candidates) => {
        const fresh = candidates.filter((c) => !rejected.has(c))
        if (busy || !fresh.length) return
        busy = true
        const ok = await loginWithCandidates(fresh)
        busy = false
        if (ok) {
          closeSiteLogin().catch(() => {})
          go('/profile', true)
        } else {
          fresh.forEach((c) => rejected.add(c))
          error = 'Сессия на сайте устарела — войдите заново в открывшемся окне.'
        }
      }, reset)
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  // ---- восстановление пароля ----
  // Письмо со ссылкой сайт шлёт только после hCaptcha — эту часть делаем в окне сайта.
  // Новый пароль по ссылке из письма задаём уже здесь: на этом шаге капчи нет.

  const RESET_URL = 'https://old.yummyani.me/login/reset-password'

  let resetting = $state(false)
  let resetLink = $state('')
  let newPassword = $state('')
  let newPassword2 = $state('')
  let resetError = $state('')
  let resetDone = $state(false)

  function openReset() {
    resetting = true
    resetError = ''
    resetDone = false
  }

  async function submitReset(e: SubmitEvent) {
    e.preventDefault()
    if (busy) return
    resetError = ''
    const link = parseResetLink(resetLink)
    if (!link) return (resetError = 'Не нашли в ссылке нужных данных. Вставьте её из письма целиком или откройте в браузере.')
    if (newPassword.length < 6) return (resetError = 'Пароль — не короче 6 символов.')
    if (newPassword !== newPassword2) return (resetError = 'Пароли не совпадают.')
    busy = true
    try {
      const r = await Api.resetPasswordVerify(link.id, link.token, newPassword)
      if (!r?.success) throw new Error('Сайт не принял ссылку — возможно, она устарела. Запросите письмо ещё раз.')
      // Сайт сразу отдаёт токен новой сессии — тогда входить вручную не нужно.
      if (r.token && (await loginWithCandidates([r.token]))) return go('/profile', true)
      resetDone = true
      resetting = false
      password = ''
    } catch (err) {
      resetError = errorText(err)
    } finally {
      busy = false
    }
  }

  onDestroy(() => unlisten?.())
</script>

<div class="container page">
  {#if resetting}
    <section class="block">
      <h1 class="block-title">
        <button class="icon" title="Назад ко входу" onclick={() => (resetting = false)}><ArrowLeft size={16} /></button>
        Восстановление пароля
      </h1>
      <ol class="steps">
        <li>
          Откройте страницу сброса на сайте, введите почту аккаунта и пройдите капчу — придёт письмо со ссылкой.
          <button class="btn" type="button" onclick={() => viaSite(true)}><Globe size={15} /> Открыть сброс на сайте</button>
        </li>
        <li>Скопируйте ссылку из письма и задайте новый пароль здесь. Можно и просто открыть ссылку в браузере.</li>
      </ol>
      <form onsubmit={submitReset}>
        <label>
          <span>Ссылка из письма</span>
          <input class="input" type="url" bind:value={resetLink} placeholder="https://…" required />
        </label>
        <label>
          <span>Новый пароль</span>
          <input class="input" type="password" autocomplete="new-password" bind:value={newPassword} required />
        </label>
        <label>
          <span>Ещё раз</span>
          <input class="input" type="password" autocomplete="new-password" bind:value={newPassword2} required />
        </label>
        {#if resetError}<p class="err">{resetError}</p>{/if}
        <button class="btn primary" disabled={busy}><KeyRound size={15} /> {busy ? 'Меняем…' : 'Сменить пароль'}</button>
      </form>
    </section>
  {:else}
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
      {#if resetDone}<p class="ok">Пароль изменён — войдите с новым.</p>{/if}
      <button class="btn primary" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
      <button class="link forgot" type="button" onclick={openReset}>Не помню пароль</button>
    </form>

    <div class="alt" class:highlight={captcha}>
      {#if captcha}<p>Сайт попросил пройти капчу — войдите через окно сайта, это безопасно и займёт минуту.</p>{/if}
      {#if isTauri}
        <button class="btn" onclick={() => viaSite()}><Globe size={15} /> Войти через сайт</button>
      {/if}
      <p class="muted">
        Пароль уходит только на сервер YummyAnime (api.yani.tv). Приложение хранит лишь токен сессии.
        Нет аккаунта?
        <button class="link" onclick={() => openExternal('https://yummyani.me/register')}>Регистрация на сайте</button>
      </p>
      <p class="muted">Без аккаунта работают история, подписки на серии и всё остальное, кроме списков и комментариев.</p>
    </div>
  </section>
  {/if}
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
  .ok {
    margin: 0;
    color: var(--green);
  }
  .forgot {
    align-self: center;
    font-size: 13px;
  }
  .block-title {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .icon:hover {
    background: var(--panel-2);
    color: var(--text);
  }
  .steps {
    margin: 0;
    padding: 14px 18px 0 36px;
    font-size: 13px;
    line-height: 1.5;
  }
  .steps li + li {
    margin-top: 8px;
  }
  .steps .btn {
    display: flex;
    width: 100%;
    margin-top: 8px;
  }
  .link {
    color: var(--accent);
    text-decoration: underline;
    font-size: inherit;
  }
</style>
