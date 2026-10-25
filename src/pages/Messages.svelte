<script lang="ts">
  import { untrack } from 'svelte'
  import { ArrowLeft, Copy, Pencil, RotateCw, SendHorizontal, Sticker as StickerIcon, Trash2, X } from '@lucide/svelte'
  import { img } from '../lib/api/client'
  import { Api } from '../lib/api/endpoints'
  import type { Message } from '../lib/api/types'
  import Loader from '../lib/components/Loader.svelte'
  import StickerPicker from '../lib/components/StickerPicker.svelte'
  import { ago, isOnline } from '../lib/format'
  import { openExternal, setTitle } from '../lib/native'
  import { errorText } from '../lib/query.svelte'
  import { go, link } from '../lib/router.svelte'
  import { richText } from '../lib/sanitize'
  import { auth } from '../lib/stores/auth.svelte'
  import { ask } from '../lib/stores/confirm.svelte'
  import { chat, loadDialogs, onChat, plainMessage, readDialog, touchDialog } from '../lib/stores/messages.svelte'
  import { openMenu, type MenuEntry } from '../lib/stores/menu.svelte'
  import { toast } from '../lib/stores/toast.svelte'
  import { code, emojiOnly, soleSticker, splitStickers, stickerUrl, type Sticker } from '../lib/stickers'

  /** Собеседник; 0 — только список диалогов. */
  let { peer = 0 }: { peer?: number } = $props()

  /** pending — ушло на сервер, ждём подтверждения; failed — не ушло, можно повторить. */
  type Msg = Message & { pending?: boolean; failed?: boolean }

  const PAGE = 50

  let items = $state<Msg[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  /** Старше загруженных сообщений нет. */
  let done = $state(false)
  let text = $state('')
  let box = $state<HTMLDivElement>()
  let input = $state<HTMLTextAreaElement>()
  /** Ник и аватар, если диалога ещё нет в списке (пишем впервые). */
  let stranger = $state<{ nickname: string; avatars: Message['avatars']; last_online?: number } | null>(null)

  const me = $derived(auth.profile?.id ?? 0)
  const dialog = $derived(chat.dialogs.find((d) => d.user_id === peer))
  const who = $derived(dialog ?? stranger)

  $effect(() => {
    if (me && !chat.loaded) untrack(loadDialogs)
  })

  $effect(() => {
    setTitle(who ? `${who.nickname} — сообщения` : 'Сообщения')
  })

  // Смена собеседника (или профиль догрузился уже на открытой странице): свой список
  // сообщений, отметка «прочитано», без уведомлений о нём.
  $effect(() => {
    const id = peer
    if (!me) return
    chat.open = id
    untrack(() => openDialog(id))
    return () => {
      if (chat.open === id) chat.open = 0
    }
  })

  let loadSeq = 0
  async function openDialog(id: number) {
    const seq = ++loadSeq
    items = []
    done = false
    error = null
    stranger = null
    text = ''
    editing = null
    if (!id || !me) return
    if (!chat.dialogs.some((d) => d.user_id === id)) {
      Api.user(id)
        .then((u) => seq === loadSeq && (stranger = { nickname: u.nickname, avatars: u.avatars, last_online: u.last_online }))
        .catch(() => {})
    }
    await loadOlder(seq)
    if (seq === loadSeq) {
      readDialog(id)
      input?.focus()
    }
  }

  const byId = (a: Msg, b: Msg) => a.id - b.id

  async function loadOlder(seq = loadSeq) {
    if (loading || done) return
    loading = true
    error = null
    const oldest = items.find((m) => m.id > 0)?.id
    const keep = box ? box.scrollHeight - box.scrollTop : 0
    try {
      const list = await Api.dialogMessages(peer, oldest, PAGE)
      if (seq !== loadSeq) return
      const got = (Array.isArray(list) ? list : []).filter((m) => !items.some((x) => x.id === m.id))
      if (got.length < PAGE) done = true
      items = [...got, ...items].sort(byId)
      // Подгрузили старые сверху — экран остаётся на том же сообщении.
      requestAnimationFrame(() => box && (box.scrollTop = oldest ? box.scrollHeight - keep : box.scrollHeight))
    } catch (e) {
      if (seq === loadSeq) error = errorText(e)
    } finally {
      if (seq === loadSeq) loading = false
    }
  }

  function nearBottom() {
    return !box || box.scrollHeight - box.scrollTop - box.clientHeight < 120
  }

  function stickDown(force = false) {
    if (!force && !nearBottom()) return
    requestAnimationFrame(() => box && (box.scrollTop = box.scrollHeight))
  }

  function onScroll() {
    if (box && box.scrollTop < 80) loadOlder()
  }

  $effect(() =>
    onChat((e) => {
      if (!peer) return
      if (e.event === 'new-message') {
        const m = e.message
        const ours = (m.from_id === peer && m.to_id === me) || (m.from_id === me && m.to_id === peer)
        if (!ours || items.some((x) => x.id === m.id)) return
        const stick = nearBottom()
        // Своё сообщение возвращается эхом — заменяет черновик с тем же текстом.
        const tmp = m.from_id === me ? items.findIndex((x) => x.pending && x.text === m.text) : -1
        if (tmp >= 0) items[tmp] = m
        else items.push(m)
        items.sort(byId)
        if (stick || m.from_id === me) stickDown(true)
        if (m.from_id === peer && document.hasFocus()) readDialog(peer)
      } else if (e.event === 'message-read') {
        if (e.user_id === peer) for (const m of items) if (m.from_id === me) m.read = true
      } else if (e.event === 'message-deleted') {
        items = items.filter((x) => x.id !== e.message?.id)
      } else if (e.event === 'message-edited') {
        const m = items.find((x) => x.id === e.message?.id)
        if (m) Object.assign(m, e.message, { edited: true })
      }
    }),
  )

  // Вернулись в окно с открытым диалогом — непрочитанные в нём считаются прочитанными.
  function onFocus() {
    if (peer && dialog?.unread_count) readDialog(peer)
  }

  let tmpId = 0
  /** raw — готовый текст мимо поля ввода (стикер); набранное в поле при этом остаётся. */
  async function send(retry?: Msg, raw?: string) {
    if (editing && !retry && raw == null) return saveEdit(editing)
    const body = (retry?.text ?? raw ?? text).trim()
    if (!body || !peer) return
    let m: Msg
    if (retry) {
      m = retry
      m.failed = false
      m.pending = true
    } else {
      if (raw == null) text = ''
      m = {
        id: --tmpId,
        from_id: me,
        to_id: peer,
        nickname: auth.profile?.nickname ?? '',
        avatars: auth.profile?.avatars ?? {},
        date: Math.floor(Date.now() / 1000),
        text: body,
        read: false,
        pending: true,
      }
      items.push(m)
      m = items[items.length - 1]
      stickDown(true)
    }
    try {
      const r = await Api.sendMessage(peer, body)
      // Ответ может прийти раньше эха из сокета: тогда подменяем черновик сразу.
      const i = items.indexOf(m)
      if (r && typeof r === 'object' && typeof r.id === 'number' && i >= 0) {
        if (items.some((x) => x.id === r.id)) items.splice(i, 1)
        else items[i] = { ...m, ...r, pending: false }
      }
      // Без сокета (нет связи) строка слева иначе осталась бы со старым текстом.
      if (chat.dialogs.some((d) => d.user_id === peer)) touchDialog({ ...m, text: body }, me, false)
      else loadDialogs()
    } catch {
      m.pending = false
      m.failed = true
    }
  }

  // ---- правка и удаление своих сообщений ----

  /** Сообщение, которое правим в поле ввода; Enter сохраняет, Esc отменяет. */
  let editing = $state<Msg | null>(null)
  let saving = $state(false)

  const editable = (m: Msg) => m.from_id === me && m.id > 0 && !m.pending && !m.deleted

  /** В строке диалога слева — текст последнего сообщения: после правки или удаления он другой. */
  function syncDialog() {
    const d = chat.dialogs.find((x) => x.user_id === peer)
    const last = items.at(-1)
    if (d && last) d.last_message = last.text
  }

  function startEdit(m: Msg) {
    editing = m
    text = m.text
    requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(text.length, text.length)
    })
  }

  function cancelEdit() {
    editing = null
    text = ''
  }

  async function saveEdit(m: Msg) {
    const body = text.trim()
    if (saving) return
    if (!body || body === m.text) return cancelEdit()
    saving = true
    try {
      const r = await Api.editMessage(m.id, body)
      Object.assign(m, { text: r?.text ?? body, edited: true })
      if (editing === m) cancelEdit()
      syncDialog()
    } catch (e) {
      // Текст остаётся в поле — можно поправить и сохранить ещё раз.
      toast(`Не удалось изменить: ${errorText(e)}`, 'error')
    } finally {
      saving = false
    }
  }

  async function remove(m: Msg) {
    const ok = await ask({ title: 'Удалить сообщение?', text: 'Оно пропадёт и у собеседника.', ok: 'Удалить', danger: true })
    if (!ok) return
    try {
      await Api.deleteMessage(m.id)
      items = items.filter((x) => x.id !== m.id)
      if (editing?.id === m.id) cancelEdit()
      syncDialog()
    } catch (e) {
      toast(`Не удалось удалить: ${errorText(e)}`, 'error')
    }
  }

  function msgMenu(e: MouseEvent, m: Msg) {
    if (m.pending || m.failed) return
    const items: MenuEntry[] = [
      { label: 'Копировать текст', icon: Copy, action: () => navigator.clipboard.writeText(m.text).then(() => toast('Скопировано')) },
    ]
    if (editable(m)) {
      // Сообщение из одного стикера править нечего — только удалить.
      if (!soleSticker(m.text)) items.push({ label: 'Изменить', icon: Pencil, action: () => startEdit(m) })
      items.push('sep', { label: 'Удалить', icon: Trash2, danger: true, action: () => remove(m) })
    }
    openMenu(e, items)
  }

  let picker = $state(false)

  /** Стикер уходит сразу отдельным сообщением, смайл встаёт в текст на место курсора. */
  function onPick(s: Sticker) {
    if (s.kind === 'sticker') {
      picker = false
      send(undefined, code(s))
      return
    }
    const at = input?.selectionStart ?? text.length
    const end = input?.selectionEnd ?? at
    text = text.slice(0, at) + code(s) + text.slice(end)
    const caret = at + code(s).length
    requestAnimationFrame(() => input?.setSelectionRange(caret, caret))
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault()
      send()
    } else if (e.key === 'Escape' && editing) {
      e.preventDefault()
      e.stopPropagation()
      cancelEdit()
    } else if (e.key === 'ArrowUp' && !text && !editing) {
      // Как в мессенджерах: стрелка вверх в пустом поле — править своё последнее.
      const last = items.findLast((m) => editable(m) && !soleSticker(m.text))
      if (last) {
        e.preventDefault()
        startEdit(last)
      }
    }
  }

  // Поле растёт вместе с текстом, но не выше пяти строк.
  $effect(() => {
    void text
    if (!input) return
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
    input.style.overflowY = input.scrollHeight > 120 ? 'auto' : 'hidden'
  })

  const SPOILER = /\[(?:спойлер|spoiler)(?:=[^\]]*)?\]([\s\S]*?)\[\/(?:спойлер|spoiler)\]/gi
  /** Текст сообщения кусками: обычный и под спойлером, внутри — BB-коды и ссылки. */
  function parts(t: string) {
    const out: { spoiler: boolean; rich: ReturnType<typeof richText> }[] = []
    let last = 0
    for (const m of t.matchAll(SPOILER)) {
      if (m.index > last) out.push({ spoiler: false, rich: richText(t.slice(last, m.index)) })
      out.push({ spoiler: true, rich: richText(m[1]) })
      last = m.index + m[0].length
    }
    if (last < t.length) out.push({ spoiler: false, rich: richText(t.slice(last)) })
    return out
  }

  const time = (sec: number) => new Date(sec * 1000).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  const day = (sec: number) => new Date(sec * 1000).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
  const newDay = (i: number) => i === 0 || day(items[i - 1].date) !== day(items[i].date)
</script>

<svelte:window onfocus={onFocus} />

<div class="container page">
  {#if !auth.profile}
    <section class="block">
      <div class="empty">Личные сообщения доступны после <a class="accent-link" href="#/login">входа</a>.</div>
    </section>
  {:else}
    <section class="block chat" class:has-peer={peer}>
      <aside class="dialogs">
        <div class="head">
          <h2>Сообщения</h2>
          <button class="icon" title="Обновить" onclick={loadDialogs} disabled={chat.loading}><RotateCw size={15} /></button>
        </div>
        {#if chat.dialogs.length}
          <ul>
            {#each chat.dialogs as d (d.user_id)}
              <li>
                <a href={link(`/messages/${d.user_id}`)} class:active={d.user_id === peer} class:unread={d.unread_count}>
                  <img src={img(d.avatars?.small)} alt="" width="40" height="40" loading="lazy" />
                  <span class="meta">
                    <span class="row">
                      <b>{d.nickname}</b>
                      <span class="when">{ago(d.date)}</span>
                    </span>
                    <span class="row">
                      <span class="last">{plainMessage(d.last_message)}</span>
                      {#if d.unread_count}<span class="n">{d.unread_count}</span>{/if}
                    </span>
                  </span>
                  {#if isOnline(d.last_online)}<i class="on" title="В сети"></i>{/if}
                </a>
              </li>
            {/each}
          </ul>
        {:else if chat.loading || chat.error}
          <Loader small error={chat.error} retry={loadDialogs} />
        {:else}
          <div class="empty">Диалогов пока нет. Написать можно со страницы пользователя.</div>
        {/if}
        <p class="hint muted">
          {chat.online ? 'Пока приложение запущено (и в трее), о новых сообщениях сообщит Windows.' : 'Нет связи с чатом сайта, переподключаемся…'}
        </p>
      </aside>

      <div class="thread">
        {#if !peer}
          <div class="pick muted">Выберите диалог слева</div>
        {:else}
          <header>
            <button class="icon back" title="К диалогам" onclick={() => go('/messages')}><ArrowLeft size={16} /></button>
            {#if who}
              <a class="who" href={link(`/users/${peer}`)}>
                <img src={img(who.avatars?.small)} alt="" width="32" height="32" />
                <span>
                  <b>{who.nickname}</b>
                  <small class="muted">{isOnline(who.last_online) ? 'в сети' : who.last_online ? `был(а) ${ago(who.last_online)}` : ''}</small>
                </span>
              </a>
            {/if}
          </header>

          <div class="msgs" bind:this={box} onscroll={onScroll}>
            {#if loading && !items.length}
              <Loader />
            {:else if error}
              <Loader {error} retry={() => loadOlder()} />
            {:else if !items.length}
              <div class="pick muted">Сообщений пока нет — напишите первым.</div>
            {/if}
            {#each items as m, i (m.id)}
              {@const one = soleSticker(m.text)}
              {@const emo = emojiOnly(m.text)}
              {#if newDay(i)}<div class="day">{day(m.date)}</div>{/if}
              <div class="msg" class:mine={m.from_id === me} class:pending={m.pending} class:failed={m.failed} class:editing={editing === m}>
                <div class="bubble" class:sticker={one} class:big={emo > 0 && emo <= 3} role="none" oncontextmenu={(e) => msgMenu(e, m)}>
                  {#if one}
                    <img class="st" src={stickerUrl(one)} alt={one.emoji} title={code(one)} width="160" height="160" loading="lazy" />
                  {:else}
                    {#each parts(m.text) as p, j (j)}
                      <!-- Спойлер раскрывается фокусом, как в комментариях (см. .spoiler в app.css). -->
                      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                      <span class:spoiler={p.spoiler} tabindex={p.spoiler ? 0 : undefined}>
                        {#each p.rich as r, k (k)}
                          <span class:b={r.b} class:i={r.i} class:u={r.u} class:s={r.s}
                            >{#if r.href}<a href={r.href} onclick={(e) => (e.preventDefault(), openExternal(r.href!))}>{r.text}</a
                              >{:else}{#each splitStickers(r.text) as x, q (q)}{#if typeof x === 'string'}{x}{:else}<img
                                    class="emo"
                                    src={stickerUrl(x)}
                                    alt={x.emoji}
                                    title={code(x)}
                                  />{/if}{/each}{/if}</span
                          >
                        {/each}
                      </span>
                    {/each}
                  {/if}
                  <span class="stamp">
                    {#if m.edited}изм. ·{/if}
                    {time(m.date)}
                    {#if m.from_id === me && !m.pending && !m.failed}<span class="tick" class:read={m.read}>{m.read ? '✓✓' : '✓'}</span>{/if}
                  </span>
                </div>
                {#if m.failed}
                  <button class="retry" onclick={() => send(m)}>Не отправлено — повторить</button>
                {/if}
              </div>
            {/each}
          </div>

          {#if editing}
            <div class="edit-bar">
              <Pencil size={14} />
              <span><b>Редактирование</b> <span class="muted">{plainMessage(editing.text)}</span></span>
              <button class="icon" type="button" title="Отменить (Esc)" onclick={cancelEdit}><X size={15} /></button>
            </div>
          {/if}
          <form class="compose" onsubmit={(e) => (e.preventDefault(), send())}>
            {#if picker}<StickerPicker {onPick} onClose={() => (picker = false)} />{/if}
            <button
              class="icon sticker-btn"
              class:open={picker}
              type="button"
              title="Стикеры и смайлы"
              data-sticker-toggle
              onclick={() => (picker = !picker)}><StickerIcon size={18} /></button
            >
            <textarea
              bind:this={input}
              bind:value={text}
              rows="1"
              maxlength="2000"
              placeholder="Сообщение… (Enter — отправить, Shift+Enter — новая строка)"
              onkeydown={onKey}
            ></textarea>
            <button class="btn primary" type="submit" title={editing ? 'Сохранить' : 'Отправить'} disabled={!text.trim() || saving}
              >{#if editing}<Pencil size={16} />{:else}<SendHorizontal size={16} />{/if}</button
            >
          </form>
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .page {
    padding-top: 16px;
    padding-bottom: 16px;
  }
  .chat {
    display: grid;
    grid-template-columns: 320px 1fr;
    height: calc(100vh - var(--header-h) - 32px);
    min-height: 420px;
    overflow: hidden;
    padding: 0;
  }
  .dialogs {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .head h2 {
    margin: 0;
    font-size: 16px;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .icon:hover:not(:disabled) {
    background: var(--panel-2);
    color: var(--text);
  }
  ul {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  li a {
    position: relative;
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 14px;
    color: inherit;
    text-decoration: none;
    border-bottom: 1px solid var(--line);
  }
  li a:hover {
    background: var(--panel-2);
  }
  li a.active {
    background: var(--panel-3);
    box-shadow: inset 3px 0 var(--accent);
  }
  li img,
  .who img {
    flex: none;
    border-radius: 50%;
    object-fit: cover;
    background: var(--panel-2);
  }
  .meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .row b {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
  }
  .when {
    flex: none;
    color: var(--muted);
    font-size: 11px;
  }
  .last {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 13px;
  }
  .unread .last {
    color: var(--text-2);
  }
  .n {
    flex: none;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }
  .on {
    position: absolute;
    left: 43px;
    top: 38px;
    width: 10px;
    height: 10px;
    border: 2px solid var(--panel);
    border-radius: 50%;
    background: var(--green);
  }
  .hint {
    margin: 0;
    padding: 10px 14px;
    border-top: 1px solid var(--line);
    font-size: 12px;
  }
  .thread {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .pick {
    margin: auto;
    padding: 24px;
    text-align: center;
  }
  .thread header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
  }
  .back {
    display: none;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    color: inherit;
    text-decoration: none;
  }
  .who span {
    display: flex;
    flex-direction: column;
  }
  .who small {
    font-size: 12px;
  }
  .msgs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px;
    overflow-y: auto;
  }
  .day {
    align-self: center;
    margin: 10px 0 6px;
    padding: 2px 10px;
    border-radius: 10px;
    background: var(--panel-2);
    color: var(--muted);
    font-size: 12px;
  }
  .msg {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 72%;
  }
  .msg.mine {
    align-self: flex-end;
    align-items: flex-end;
  }
  .bubble {
    padding: 7px 11px;
    border-radius: 14px 14px 14px 4px;
    background: var(--panel-2);
    font-size: 14px;
    line-height: 1.4;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mine .bubble {
    border-radius: 14px 14px 4px 14px;
    background: var(--accent-soft);
  }
  .pending .bubble {
    opacity: 0.6;
  }
  .failed .bubble {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .bubble a {
    color: var(--accent);
  }
  /* Сообщение из одного стикера — картинка без пузыря, время поверх угла. */
  .bubble.sticker {
    position: relative;
    padding: 0;
    background: none;
    line-height: 0;
  }
  .st {
    width: 160px;
    height: 160px;
    object-fit: contain;
  }
  .sticker .stamp {
    position: absolute;
    right: 4px;
    bottom: 4px;
    float: none;
    margin: 0;
    padding: 2px 6px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    line-height: 1.2;
  }
  .emo {
    /* app.css делает img блочными — смайлу нужно стоять в строке текста. */
    display: inline-block;
    width: 1.5em;
    height: 1.5em;
    margin: -0.25em 0.05em;
    object-fit: contain;
    vertical-align: middle;
  }
  /* Только смайлы, до трёх штук, — крупнее, как в мессенджерах. */
  .bubble.big {
    font-size: 26px;
    line-height: 1.2;
  }
  .bubble.big .emo {
    width: 2em;
    height: 2em;
    margin: 0;
  }
  .bubble.big .stamp {
    font-size: 11px;
  }
  .b {
    font-weight: 700;
  }
  .i {
    font-style: italic;
  }
  .u {
    text-decoration: underline;
  }
  .s {
    text-decoration: line-through;
  }
  .stamp {
    float: right;
    margin: 6px 0 -4px 10px;
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }
  .tick.read {
    color: var(--green);
  }
  .editing .bubble {
    box-shadow: inset 0 0 0 1px var(--line-2);
  }
  .edit-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px;
    border-top: 1px solid var(--line);
    color: var(--accent);
    font-size: 13px;
  }
  .edit-bar > span {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .edit-bar + .compose {
    border-top: 0;
  }
  .retry {
    margin-top: 2px;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
  }
  .compose {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 10px 14px;
    border-top: 1px solid var(--line);
  }
  textarea {
    box-sizing: border-box;
    flex: 1;
    resize: none;
    min-height: 38px;
    max-height: 120px;
    padding: 9px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    line-height: 1.4;
  }
  textarea:focus {
    outline: none;
    border-color: var(--line-2);
  }
  .compose .btn {
    height: 38px;
  }
  .sticker-btn {
    width: 38px;
    height: 38px;
  }
  /* Не .on — так здесь зовётся точка «в сети» у аватара. */
  .sticker-btn.open {
    background: var(--panel-2);
    color: var(--accent);
  }

  /* Узкое окно: одна колонка — список или диалог. */
  @media (max-width: 860px) {
    .chat {
      grid-template-columns: 1fr;
    }
    .chat.has-peer .dialogs,
    .chat:not(.has-peer) .thread {
      display: none;
    }
    .dialogs {
      border-right: 0;
    }
    .back {
      display: grid;
    }
  }
</style>
