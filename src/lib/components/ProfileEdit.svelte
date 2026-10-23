<script lang="ts">
  import { ImageUp, Trash2, X } from '@lucide/svelte'
  import { img } from '../api/client'
  import { Api } from '../api/endpoints'
  import type { LinkedService } from '../api/types'
  import { errorText } from '../query.svelte'
  import { auth, changePassword, reloadProfile } from '../stores/auth.svelte'

  interface Props {
    /** Вызывается после любой успешной правки — странице профиля пора перечитать данные. */
    onchanged: () => void
    onclose: () => void
  }
  let { onchanged, onclose }: Props = $props()

  const profile = $derived(auth.profile)

  // Какое действие сейчас выполняется и что ответил сервер — по секциям.
  type Key = 'avatar' | 'banner' | 'password' | LinkedService
  let busy = $state<Key | null>(null)
  let note = $state<{ key: Key; ok: boolean; text: string } | null>(null)

  async function run(key: Key, fn: () => Promise<unknown>, done: string) {
    busy = key
    note = null
    try {
      await fn()
      note = { key, ok: true, text: done }
      await reloadProfile().catch(() => {})
      onchanged()
    } catch (e) {
      note = { key, ok: false, text: errorText(e) }
    } finally {
      busy = null
    }
  }

  // ---- аватар и баннер ----

  const TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const IMAGES = {
    avatar: { title: 'аватар', max: 2, hint: 'JPG, PNG или WebP, 250×250, до 2 МБ' },
    banner: { title: 'баннер', max: 4, hint: 'JPG, PNG или WebP, 1370×170, до 4 МБ' },
  } as const

  let avatarInput = $state<HTMLInputElement>()
  let bannerInput = $state<HTMLInputElement>()

  function upload(kind: 'avatar' | 'banner', input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file || !profile) return
    const spec = IMAGES[kind]
    if (!TYPES.includes(file.type)) {
      note = { key: kind, ok: false, text: 'Нужна картинка: ' + spec.hint }
      return
    }
    if (file.size > spec.max * 1024 * 1024) {
      note = { key: kind, ok: false, text: `Файл больше ${spec.max} МБ` }
      return
    }
    const id = profile.id
    run(kind, () => (kind === 'avatar' ? Api.setAvatar(id, file) : Api.setBanner(id, file)), 'Загружено')
  }

  function remove(kind: 'avatar' | 'banner') {
    if (!profile || !confirm(`Удалить ${IMAGES[kind].title}?`)) return
    const id = profile.id
    run(kind, () => (kind === 'avatar' ? Api.removeAvatar(id) : Api.removeBanner(id)), 'Удалено')
  }

  // ---- пароль ----

  let oldPassword = $state('')
  let newPassword = $state('')
  let repeat = $state('')
  const mismatch = $derived(repeat !== '' && newPassword !== repeat)
  const canChange = $derived(!!oldPassword && !!newPassword && newPassword === repeat && newPassword !== oldPassword)

  function submitPassword(e: SubmitEvent) {
    e.preventDefault()
    if (!canChange) return
    run(
      'password',
      async () => {
        await changePassword(oldPassword, newPassword)
        oldPassword = newPassword = repeat = ''
      },
      'Пароль изменён',
    )
  }

  // ---- привязанные аккаунты ----

  const linked = $derived.by(() => {
    const ids = profile?.ids ?? {}
    return [
      { service: 'shiki', title: 'Shikimori', value: ids.shikimori?.nickname },
      { service: 'vk', title: 'ВКонтакте', value: ids.vk ? `id${ids.vk}` : undefined },
      { service: 'tg', title: 'Telegram', value: ids.tg_nickname ? '@' + ids.tg_nickname : undefined },
      { service: 'discord', title: 'Discord', value: ids.discord?.id ? `ID ${ids.discord.id}` : undefined },
    ] satisfies { service: LinkedService; title: string; value?: string }[]
  })

  function unlink(service: LinkedService, title: string) {
    if (!confirm(`Отвязать ${title} от аккаунта? Привязать заново можно будет только на сайте YummyAnime.`)) return
    run(service, () => Api.unlinkAccount(service), 'Отвязано')
  }

  let dialog: HTMLDialogElement
  $effect(() => {
    dialog.showModal()
    return () => dialog.close()
  })
</script>

{#snippet status(key: Key)}
  {#if note?.key === key}<p class="note" class:ok={note.ok}>{note.text}</p>{/if}
{/snippet}

<dialog bind:this={dialog} onclose={onclose} onclick={(e) => e.target === dialog && onclose()}>
  <div class="body">
    <div class="head">
      <h2>Редактировать профиль</h2>
      <button type="button" class="x" onclick={onclose} aria-label="Закрыть"><X size={18} /></button>
    </div>

    {#if profile}
      <section>
        <h3>Аватар</h3>
        <div class="media">
          <img class="ava" src={img(profile.avatars?.big)} alt="" width="72" height="72" />
          <div class="side">
            <div class="buttons">
              <button class="btn small" disabled={!!busy} onclick={() => avatarInput?.click()}>
                <ImageUp size={14} />
                {busy === 'avatar' ? 'Загружаю…' : 'Загрузить'}
              </button>
              <button class="btn small ghost" disabled={!!busy} onclick={() => remove('avatar')}>
                <Trash2 size={14} /> Удалить
              </button>
            </div>
            <small>{IMAGES.avatar.hint}</small>
          </div>
        </div>
        <input bind:this={avatarInput} type="file" accept={TYPES.join(',')} hidden onchange={(e) => upload('avatar', e.currentTarget)} />
        {@render status('avatar')}
      </section>

      <section>
        <h3>Баннер</h3>
        <div
          class="banner"
          style:background-image={profile.banner?.full ? `url(${img(profile.banner.full)})` : undefined}
        >
          {#if !profile.banner?.full}<span class="muted">Баннер не загружен</span>{/if}
        </div>
        <div class="buttons">
          <button class="btn small" disabled={!!busy} onclick={() => bannerInput?.click()}>
            <ImageUp size={14} />
            {busy === 'banner' ? 'Загружаю…' : 'Загрузить'}
          </button>
          {#if profile.banner?.full}
            <button class="btn small ghost" disabled={!!busy} onclick={() => remove('banner')}>
              <Trash2 size={14} /> Удалить
            </button>
          {/if}
          <small>{IMAGES.banner.hint}</small>
        </div>
        <input bind:this={bannerInput} type="file" accept={TYPES.join(',')} hidden onchange={(e) => upload('banner', e.currentTarget)} />
        {@render status('banner')}
      </section>

      <section>
        <h3>Пароль</h3>
        <form onsubmit={submitPassword}>
          <input class="input" type="password" autocomplete="current-password" placeholder="Текущий пароль" bind:value={oldPassword} />
          <input class="input" type="password" autocomplete="new-password" placeholder="Новый пароль" bind:value={newPassword} />
          <input
            class="input"
            class:bad={mismatch}
            type="password"
            autocomplete="new-password"
            placeholder="Новый пароль ещё раз"
            bind:value={repeat}
          />
          {#if mismatch}<p class="note">Пароли не совпадают</p>{/if}
          <div class="buttons">
            <button class="btn small primary" disabled={!!busy || !canChange}>
              {busy === 'password' ? 'Сохраняю…' : 'Сменить пароль'}
            </button>
          </div>
        </form>
        {@render status('password')}
      </section>

      <section>
        <h3>Привязанные аккаунты</h3>
        {#each linked as l (l.service)}
          <div class="link-row">
            <span class="name">{l.title}</span>
            <span class="value" class:muted={!l.value}>{l.value ?? 'не привязан'}</span>
            {#if l.value}
              <button class="btn small ghost" disabled={!!busy} onclick={() => unlink(l.service, l.title)}>
                {busy === l.service ? 'Отвязываю…' : 'Отвязать'}
              </button>
            {/if}
          </div>
          {@render status(l.service)}
        {/each}
        <small>Привязать аккаунт можно в настройках профиля на сайте YummyAnime.</small>
      </section>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px 18px 18px;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 3px solid var(--accent);
  }
  h2 {
    margin: 0;
    font-size: 15px;
    text-transform: uppercase;
  }
  .x {
    color: var(--muted);
  }
  .x:hover {
    color: #fff;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  section:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    color: var(--accent);
  }
  small {
    font-size: 12px;
    color: var(--muted);
  }
  .media {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .ava {
    flex: none;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    object-fit: cover;
    background: var(--panel-3);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .banner {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 60px;
    border-radius: var(--radius-img);
    background: var(--panel-2) center / cover no-repeat;
    font-size: 12px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .input.bad {
    border-color: var(--accent);
  }
  .note {
    margin: 0;
    font-size: 13px;
    color: var(--accent);
  }
  .note.ok {
    color: var(--green);
  }
  .link-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 30px;
  }
  .name {
    width: 90px;
    flex: none;
    font-weight: 600;
  }
  .value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
</style>
