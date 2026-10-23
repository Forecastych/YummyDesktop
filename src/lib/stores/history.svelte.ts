// Локальная история просмотра: работает без аккаунта, переживает перезапуск.
import { untrack } from 'svelte'
import { Api } from '../api/endpoints'
import type { AnimeShort, Posters, Video } from '../api/types'
import { duration as fmt } from '../format'
import { load, save } from '../storage'
import { auth } from './auth.svelte'

export interface WatchEntry {
  animeId: number
  url: string
  title: string
  poster: Posters
  videoId: number
  episode: string
  dubbing: string
  player: string
  time: number
  duration: number
  updatedAt: number
}

interface Progress {
  time: number
  duration: number
  done: boolean
}

interface HistoryState {
  /** Последняя открытая серия по каждому тайтлу. */
  last: Record<number, WatchEntry>
  /** Прогресс по серии: ключ `${animeId}:${episode}`. */
  progress: Record<string, Progress>
}

const MAX_TITLES = 300
const MAX_PROGRESS = 5000

export const history: HistoryState = $state(load<HistoryState>('history', { last: {}, progress: {} }))

let saveTimer: ReturnType<typeof setTimeout> | undefined
function persist() {
  // Прогресс тикает часто — пишем на диск не чаще раза в 3 секунды.
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => save('history', $state.snapshot(history)), 3000)
}
addEventListener('beforeunload', () => save('history', $state.snapshot(history)))

function prune() {
  const titles = Object.values(history.last)
  if (titles.length > MAX_TITLES) {
    titles.sort((a, b) => a.updatedAt - b.updatedAt)
    for (const t of titles.slice(0, titles.length - MAX_TITLES)) delete history.last[t.animeId]
  }
  const keys = Object.keys(history.progress)
  if (keys.length > MAX_PROGRESS) for (const k of keys.slice(0, keys.length - MAX_PROGRESS)) delete history.progress[k]
}

export function touch(entry: Omit<WatchEntry, 'updatedAt'>) {
  history.last[entry.animeId] = { ...entry, updatedAt: Date.now() }
  prune()
  persist()
}

export function setProgress(animeId: number, episode: string, time: number, duration: number) {
  const key = `${animeId}:${episode}`
  const prev = history.progress[key]
  const done = prev?.done || (duration > 0 && time / duration > 0.85)
  history.progress[key] = { time, duration, done }
  const last = history.last[animeId]
  if (last && last.episode === episode) {
    last.time = time
    last.duration = duration
    last.updatedAt = Date.now()
  }
  persist()
  return done && !prev?.done
}

export function markDone(animeId: number, episode: string, done = true) {
  const key = `${animeId}:${episode}`
  const p = history.progress[key] ?? { time: 0, duration: 0, done }
  history.progress[key] = { ...p, done }
  persist()
}

export function progressOf(animeId: number, episode: string): Progress | undefined {
  return history.progress[`${animeId}:${episode}`]
}

export function recent(limit = 20): WatchEntry[] {
  return Object.values(history.last)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
}

/** Когда пользователь убрал тайтл из истории — чтобы синхронизация не вернула его обратно. */
const removed = load<Record<number, number>>('history-removed', {})

export function removeFromHistory(animeId: number) {
  delete history.last[animeId]
  removed[animeId] = Date.now()
  save('history-removed', removed)
  persist()
}

/** Формат, который ждёт /feed: `video_id:end_time:date`, последние 8. */
export function feedWatches(): string[] {
  return recent(8)
    .filter((e) => e.videoId)
    .map((e) => `${e.videoId}:${Math.floor(e.time)}:${Math.floor(e.updatedAt / 1000)}`)
}

let syncedAt = 0
let syncedFor = 0

/**
 * Подтягивает последние просмотры аккаунта — с сайта и телефона. Серверная запись
 * новее локальной заменяет её; озвучку и плеер страница тайтла найдёт по отметкам серий.
 * То, что смотрели здесь без входа и сайт ещё не знает, уходит на сайт.
 */
export async function syncHistory() {
  const id = auth.profile?.id
  if (!id || (id === syncedFor && Date.now() - syncedAt < 60_000)) return
  syncedAt = Date.now()
  syncedFor = id
  // Без своих watches — чтобы в ответе была только история аккаунта, а не эхо локальной.
  const list = await Api.lastWatches().catch(() => null)
  if (!Array.isArray(list) || auth.profile?.id !== id) return
  const server = new Map<number, number>()
  for (const w of list) {
    if (!w?.anime_id) continue
    const at = (w.date || 0) * 1000
    server.set(w.anime_id, Math.max(server.get(w.anime_id) ?? 0, at))
    const local = history.last[w.anime_id]
    if ((local && local.updatedAt >= at) || (removed[w.anime_id] ?? 0) >= at) continue
    const episode = w.screenshot?.episode || w.ep_title?.match(/\d+(?:\.\d+)?/)?.[0] || ''
    // id серии сервер не отдаёт; та же серия — значит, озвучку и плеер можно взять из локальной записи.
    const same = !!local && (w.video_id ? local.videoId === w.video_id : !!episode && local.episode === episode)
    const duration = w.duration || (same ? local.duration : 0)
    history.last[w.anime_id] = {
      animeId: w.anime_id,
      url: w.anime_url,
      title: w.title,
      poster: w.poster,
      videoId: w.video_id || (same ? local.videoId : 0),
      episode: episode || (same ? local.episode : ''),
      dubbing: same ? local.dubbing : '',
      player: same ? local.player : '',
      time: w.end_time || 0,
      duration,
      updatedAt: at,
    }
    if (episode && duration) mergeProgress(w.anime_id, episode, w.end_time || 0, duration)
  }
  prune()
  persist()

  // Сайт помнит не всю историю: старше его самой старой записи ничего не досылаем.
  const oldest = list.length ? Math.min(...server.values()) : 0
  const videos = Object.values(history.last)
    .filter((e) => e.videoId && e.time > 0 && e.updatedAt > oldest && e.updatedAt - (server.get(e.animeId) ?? 0) > 1000)
    .map((e) => ({ videoId: e.videoId, time: Math.floor(e.time), date: Math.floor(e.updatedAt / 1000) }))
  if (videos.length) Api.uploadWatches(videos).catch(() => {})
}

// Вход в аккаунт (и старт с сохранённым токеном) — сразу сверяемся с сайтом.
$effect.root(() => {
  $effect(() => {
    if (auth.profile?.id) untrack(syncHistory)
  })
})

function mergeProgress(animeId: number, episode: string, time: number, duration: number) {
  const key = `${animeId}:${episode}`
  const prev = history.progress[key]
  if (prev && prev.time >= time) return
  history.progress[key] = {
    time,
    duration: duration || prev?.duration || 0,
    done: !!prev?.done || (duration > 0 && time / duration > 0.85),
  }
}

/**
 * Отметки серий с сайта (`watched` у видео тайтла, только вошедшим): дописывает прогресс
 * по сериям и, если сайт знает более свежий просмотр, переключает тайтл на его серию.
 */
export function mergeWatched(anime: AnimeShort, videos: Video[] | undefined) {
  let latest: Video | undefined
  for (const v of videos ?? []) {
    if (!v.watched?.date) continue
    mergeProgress(anime.anime_id, v.number, v.watched.end_time || 0, v.duration)
    if (!latest || v.watched.date > latest.watched!.date) latest = v
  }
  if (!latest) return
  const at = latest.watched!.date * 1000
  const local = history.last[anime.anime_id]
  if ((removed[anime.anime_id] ?? 0) >= at) return
  // Запись из syncHistory знает только номер серии — дописываем id, озвучку и плеер.
  const fill = !!local && !local.videoId && local.episode === latest.number
  if (local && local.updatedAt >= at && !fill) return
  history.last[anime.anime_id] = {
    animeId: anime.anime_id,
    url: anime.anime_url,
    title: anime.title,
    poster: anime.poster,
    videoId: latest.video_id,
    episode: latest.number,
    dubbing: latest.data.dubbing,
    player: latest.data.player,
    time: latest.watched!.end_time || 0,
    duration: latest.duration || local?.duration || 0,
    updatedAt: Math.max(at, local?.updatedAt ?? 0),
  }
  persist()
}

/** «8 серия · 12:05 / 23:39» — как в истории просмотра на сайте. */
export function watchLine(e: WatchEntry) {
  const parts: string[] = []
  if (e.episode) parts.push(`${e.episode} серия`)
  if (e.time > 0) parts.push(e.duration ? `${fmt(e.time)} / ${fmt(e.duration)}` : fmt(e.time))
  return parts.join(' · ')
}
