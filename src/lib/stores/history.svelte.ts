// Локальная история просмотра: работает без аккаунта, переживает перезапуск.
import type { Posters } from '../api/types'
import { load, save } from '../storage'

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

export function removeFromHistory(animeId: number) {
  delete history.last[animeId]
  persist()
}

/** Формат, который ждёт /feed: `video_id:end_time:date`, последние 8. */
export function feedWatches(): string[] {
  return recent(8).map((e) => `${e.videoId}:${Math.floor(e.time)}:${Math.floor(e.updatedAt / 1000)}`)
}
