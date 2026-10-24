import { isTauri } from '../native'
import { settings } from '../stores/settings.svelte'
import { load, save } from '../storage'

const BASE = 'https://api.yani.tv'
const BUILD_APP_TOKEN: string = import.meta.env.VITE_YUMMY_APP_TOKEN ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: number,
  ) {
    super(message)
  }
}

type Query = Record<string, string | number | boolean | (string | number)[] | null | undefined>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Query
  body?: unknown
  /** Сырые байты (аватар, баннер): уходят как есть, без JSON. */
  raw?: Blob
  /** 401 здесь — не потеря сессии (например, неверный текущий пароль), не разлогинивать. */
  keepAuth?: boolean
  /** Сколько мс держать GET-ответ в памяти. 0 — не кэшировать. */
  ttl?: number
  /** Ключ для дискового кэша (stale-while-revalidate между запусками). */
  persist?: string
  signal?: AbortSignal
  /** Дожить до сервера, даже если окно закрывают (позиция в серии при выходе). */
  keepalive?: boolean
}

// ---- авторизация (токен живёт тут, чтобы клиент не зависел от UI-сторов) ----

let authToken: string | null = load<string | null>('token', null)
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null) {
  authToken = token
  if (token) save('token', token)
  else save('token', null)
  clearCache()
}

export function getAuthToken() {
  return authToken
}

export function onAuthLost(cb: () => void) {
  onUnauthorized = cb
}

// ---- кэш ----

interface Entry {
  t: number
  v: unknown
}

const MAX_ENTRIES = 400
const mem = new Map<string, Entry>()
const inflight = new Map<string, Promise<unknown>>()

function remember(key: string, v: unknown) {
  mem.delete(key)
  mem.set(key, { t: Date.now(), v })
  if (mem.size > MAX_ENTRIES) mem.delete(mem.keys().next().value as string)
}

export function clearCache(prefix = '') {
  for (const k of mem.keys()) if (k.includes(prefix)) mem.delete(k)
}

/** Синхронно достать то, что уже лежит в памяти или на диске — для мгновенной отрисовки. */
export function peek<T>(path: string, opts: RequestOptions = {}): T | undefined {
  const hit = mem.get(cacheKey(path, opts.query))
  if (hit) return hit.v as T
  if (opts.persist) return load<{ v: T } | null>('cache:' + opts.persist, null)?.v
  return undefined
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(BASE + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue
      // API принимает массивы через запятую.
      url.searchParams.set(k, Array.isArray(v) ? v.join(',') : String(v))
    }
  }
  return url.toString()
}

function cacheKey(path: string, query?: Query) {
  return `${settings.lang}|${authToken ? 'u' : 'g'}|${buildUrl(path, query)}`
}

function headers(hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/json, image/avif, image/webp',
    Lang: settings.lang,
  }
  const app = settings.appToken || BUILD_APP_TOKEN
  if (app) h['X-Application'] = app
  if (authToken) h.Authorization = `Bearer ${authToken}`
  if (hasBody) h['Content-Type'] = 'application/json'
  return h
}

async function send<T>(path: string, opts: RequestOptions): Promise<T> {
  const method = opts.method ?? 'GET'
  const hasBody = opts.body !== undefined
  const h = headers(hasBody)
  // Картинки API принимает телом запроса, с тем же Content-Type, что ставит сайт.
  if (opts.raw) h['Content-Type'] = 'data/raw'
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: h,
    body: opts.raw ?? (hasBody ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
    keepalive: opts.keepalive,
  })
  let data: any = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok || (data && data.error)) {
    if (res.status === 401 && authToken && !opts.keepAuth) onUnauthorized?.()
    const msg = data?.error || res.statusText || 'Ошибка сети'
    throw new ApiError(res.status, String(msg), data?.error_code)
  }
  return (data && 'response' in data ? data.response : data) as T
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET'
  if (method !== 'GET') return send<T>(path, opts)

  const key = cacheKey(path, opts.query)
  const ttl = opts.ttl ?? 60_000
  const hit = mem.get(key)
  if (hit && Date.now() - hit.t < ttl) return hit.v as T

  // Одинаковые параллельные запросы склеиваются в один.
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const p = send<T>(path, { ...opts, signal: undefined })
    .then((v) => {
      if (ttl > 0) remember(key, v)
      if (opts.persist) save('cache:' + opts.persist, { t: Date.now(), v })
      return v
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)

  // Отмена прерывает ожидание конкретного вызывающего, но не общий запрос:
  // ответ всё равно ляжет в кэш и пригодится при возврате на страницу.
  if (opts.signal) {
    const signal = opts.signal
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException('Aborted', 'AbortError'))
      if (signal.aborted) return abort()
      signal.addEventListener('abort', abort, { once: true })
      ;(p as Promise<T>).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
    })
  }
  return p as Promise<T>
}

export function isAbort(e: unknown) {
  return e instanceof DOMException && e.name === 'AbortError'
}

/**
 * Дисковый кэш картинок в десктопе (src-tauri/src/imgcache.rs): схема yimg, как и cvh,
 * на Windows и Android видна как http://yimg.localhost.
 */
const IMG_PROXY = !isTauri ? '' : /Windows|Android/.test(navigator.userAgent) ? 'http://yimg.localhost/' : 'yimg://localhost/'
/** Те же хосты, что пускает Rust; остальное грузится напрямую. */
const CACHED_HOST = /^(?:[\w-]+\.)*(?:yani\.tv|yummyani\.me|yummy-anime\.ru)$/

/** Картинки приходят протокол-относительными (`//static.yani.tv/...`). */
export function img(url: string | undefined | null): string {
  if (!url) return ''
  const abs = url.startsWith('//') ? 'https:' + url : url
  if (!IMG_PROXY) return abs
  const m = /^https:\/\/([^/]+)\/(.+)$/.exec(abs)
  return m && CACHED_HOST.test(m[1]) ? `${IMG_PROXY}${m[1]}/${m[2]}` : abs
}

/** Тот же адрес, но новый для WebView: упавшую картинку он иначе не перезапросит. */
export function retryUrl(url: string, attempt: number): string {
  if (!url || !attempt) return url
  return `${url}${url.includes('?') ? '&' : '?'}_r=${attempt}`
}
