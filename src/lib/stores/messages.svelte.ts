// Личные сообщения. Сокет сайта держим, пока есть вход (и окно в трее тоже) —
// по нему приходят новые сообщения, прочтения, правки и удаления.
// Протокол восстановлен по бандлу сайта: JSON с полем event, пинг раз в 30 с.
import { getAuthToken } from '../api/client'
import { Api } from '../api/endpoints'
import type { Dialog, Message, Profile } from '../api/types'
import { notify } from '../native'
import { errorText } from '../query.svelte'
import { auth } from './auth.svelte'
import { settings } from './settings.svelte'
import { stickersPlain } from '../stickers'

const HOSTS = ['socket1.yani.tv', 'socket2.yani.tv', 'socket3.yani.tv']
const PING_EVERY = 30_000
const PONG_WAIT = 10_000
/** Сервер закрывает с 1008, если токен не принят: переподключаться бессмысленно до нового токена. */
const POLICY = 1008

export type ChatEvent =
  | { event: 'new-message'; message: Message }
  | { event: 'message-read'; user_id: number }
  | { event: 'message-deleted'; message: Message }
  | { event: 'message-edited'; message: Message }

export const chat = $state({
  unread: 0,
  dialogs: [] as Dialog[],
  loaded: false,
  loading: false,
  error: null as string | null,
  /** Диалог, открытый на экране (0 — никакой): о его сообщениях не уведомляем, пока окно в фокусе. */
  open: 0,
  online: false,
})

const listeners = new Set<(e: ChatEvent) => void>()

/** Подписка страницы диалога на события сокета. */
export function onChat(cb: (e: ChatEvent) => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Текст без BB-кодов и кодов стикеров — для превью и уведомлений. */
export const plainMessage = (text: string) =>
  stickersPlain(text)
    .replace(/\[(?:спойлер|spoiler)(?:=[^\]]*)?\][\s\S]*?\[\/(?:спойлер|spoiler)\]/gi, '(спойлер)')
    .replace(/\[\/?[a-zа-я]+(?:=[^\]]*)?\]/gi, '')
    .trim()

export function syncUnread(p: Profile | null) {
  chat.unread = Number(p?.messages?.unread_count) || 0
}

export async function loadDialogs() {
  if (!auth.profile) return
  chat.loading = true
  chat.error = null
  try {
    const r = await Api.dialogs(0, 50)
    chat.dialogs = r?.dialogs ?? []
    chat.loaded = true
  } catch (e) {
    chat.error = errorText(e)
  } finally {
    chat.loading = false
  }
}

/** Отметить диалог прочитанным: и на сервере, и в счётчике. */
export async function readDialog(peer: number) {
  const d = chat.dialogs.find((x) => x.user_id === peer)
  if (d?.unread_count) {
    chat.unread = Math.max(0, chat.unread - d.unread_count)
    d.unread_count = 0
  }
  await Api.readDialog(peer).catch(() => {})
}

/** Обновить строку диалога (или поднять новую наверх) по свежему сообщению — из сокета или после своей отправки. */
export function touchDialog(m: Message, me: number, incoming: boolean) {
  const peer = incoming ? m.from_id : m.to_id
  const i = chat.dialogs.findIndex((x) => x.user_id === peer)
  const d: Dialog =
    i >= 0
      ? chat.dialogs[i]
      : { user_id: peer, nickname: incoming ? m.nickname : '', avatars: incoming ? m.avatars : {}, date: 0, last_message: '', unread_count: 0 }
  d.date = m.date
  d.last_message = m.text
  if (incoming && !(chat.open === peer && document.hasFocus())) d.unread_count++
  if (i >= 0) chat.dialogs.splice(i, 1)
  chat.dialogs.unshift(d)
  // Новый собеседник, которому написали мы сами: ник и аватар подтянет следующий loadDialogs.
  if (!incoming && !d.nickname && me) loadDialogs()
}

function handle(e: ChatEvent) {
  const me = auth.profile?.id ?? 0
  if (e.event === 'new-message') {
    const m = e.message
    if (!m || m.to_id === 0) return // общий чат сайта
    const incoming = m.from_id !== me
    touchDialog(m, me, incoming)
    if (incoming) {
      const watching = chat.open === m.from_id && document.hasFocus()
      if (!watching) {
        chat.unread++
        if (settings.notifyMessages) notify(m.nickname || 'Новое сообщение', plainMessage(m.text) || 'Сообщение').catch(() => {})
      }
    }
  }
  for (const cb of listeners) cb(e)
}

// ---- сокет ----

let ws: WebSocket | null = null
let tries = 0
let pingTimer: ReturnType<typeof setInterval> | undefined
let pongTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
/** Токен, который сервер отверг: с ним больше не стучимся. */
let rejected: string | null = null

function stop() {
  clearInterval(pingTimer)
  clearTimeout(pongTimer)
  clearTimeout(retryTimer)
  if (ws) {
    ws.onclose = ws.onmessage = ws.onerror = ws.onopen = null
    ws.close()
    ws = null
  }
  chat.online = false
}

function connect() {
  stop()
  const token = getAuthToken()
  if (!token || token === rejected || !auth.profile) return
  const qs = new URLSearchParams({ token, accept: 'application/json,image/webp', lang: settings.lang })
  const host = HOSTS[Math.floor(Math.random() * HOSTS.length)]
  const sock = new WebSocket(`wss://${host}/socket?${qs}`)
  ws = sock
  sock.onopen = () => {
    tries = 0
    chat.online = true
    pingTimer = setInterval(() => {
      sock.send(JSON.stringify({ event: 'ping' }))
      clearTimeout(pongTimer)
      pongTimer = setTimeout(() => sock.close(), PONG_WAIT)
    }, PING_EVERY)
  }
  sock.onmessage = (ev) => {
    let data: any
    try {
      data = JSON.parse(String(ev.data))
    } catch {
      return
    }
    if (data?.event === 'pong') return clearTimeout(pongTimer)
    if (typeof data?.event === 'string') handle(data as ChatEvent)
  }
  sock.onclose = (ev) => {
    clearInterval(pingTimer)
    clearTimeout(pongTimer)
    ws = null
    chat.online = false
    if (ev.code === POLICY) {
      rejected = token
      return
    }
    // Случайная задержка: после падения сервера клиенты не ломятся все разом.
    const delay = Math.random() * Math.min(30_000, 1000 * 2 ** tries++)
    retryTimer = setTimeout(connect, delay)
  }
}

export function startMessages() {
  $effect.root(() => {
    // Профиль перечитывается целиком, а переподключаться надо только при смене аккаунта.
    const uid = $derived(auth.profile?.id ?? 0)
    $effect(() => syncUnread(auth.profile))
    $effect(() => {
      if (uid) connect()
      else {
        stop()
        chat.dialogs = []
        chat.loaded = false
      }
    })
  })
  // Сеть вернулась — не ждём таймер переподключения.
  addEventListener('online', () => {
    if (!ws && auth.profile) {
      tries = 0
      connect()
    }
  })
}
