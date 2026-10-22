// Отслеживание новых серий. Проверяем только пока приложение открыто:
// при старте и раз в 30 минут, одним запросом на все тайтлы.
import { Api } from '../api/endpoints'
import type { AnimeShort, Posters } from '../api/types'
import { notify } from '../native'
import { load, save } from '../storage'
import { auth } from './auth.svelte'
import { rememberNotified, wasNotified } from './notified'
import { settings } from './settings.svelte'

export interface Follow {
  id: number
  url: string
  title: string
  poster: Posters
  aired: number
  /** Сколько новых серий вышло с последнего открытия тайтла. */
  fresh: number
}

export const follows: Record<number, Follow> = $state(load('follows', {}))

function persist() {
  save('follows', $state.snapshot(follows))
}

export function isFollowed(id: number) {
  return id in follows
}

export function toggleFollow(a: AnimeShort) {
  if (follows[a.anime_id]) delete follows[a.anime_id]
  else
    follows[a.anime_id] = {
      id: a.anime_id,
      url: a.anime_url,
      title: a.title,
      poster: a.poster,
      aired: a.episodes?.aired ?? 0,
      fresh: 0,
    }
  persist()
}

/** Пользователь открыл тайтл — счётчик новинок сбрасывается. */
export function seen(id: number, aired?: number) {
  const f = follows[id]
  if (!f) return
  f.fresh = 0
  if (aired != null) f.aired = aired
  persist()
}

const INTERVAL = 30 * 60_000
let timer: ReturnType<typeof setInterval> | undefined

async function check() {
  // Онгоинги из списка «Смотрю» подписываются автоматически.
  if (auth.profile) {
    const watching = await Api.userList(auth.profile.id, 0).catch(() => [] as AnimeShort[])
    for (const a of watching) {
      if (a.anime_status?.alias === 'ongoing' && !follows[a.anime_id]) toggleFollow(a)
    }
  }
  const ids = Object.keys(follows).map(Number)
  if (!ids.length) return
  const fresh: Follow[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const list = await Api.list({ ids: chunk, limit: chunk.length }, { ttl: 0 }).catch(() => [] as AnimeShort[])
    for (const a of list) {
      const f = follows[a.anime_id]
      const aired = a.episodes?.aired ?? 0
      if (f && aired > f.aired) {
        f.fresh += aired - f.aired
        f.aired = aired
        fresh.push(f)
      }
    }
  }
  persist()
  // О серии подписанной озвучки уже мог сообщить сайт.
  const shown = fresh.filter((f) => !wasNotified(f.title))
  if (!settings.notifyEpisodes || !shown.length) return
  for (const f of shown) rememberNotified(f.title)
  if (shown.length === 1) {
    await notify('Новая серия', `${shown[0].title} — вышла ${shown[0].aired}-я серия`)
  } else {
    await notify(`Новые серии: ${shown.length}`, shown.map((f) => f.title).slice(0, 4).join(', '))
  }
}

export function startFollowChecker() {
  if (timer) return
  setTimeout(() => check().catch(() => {}), 15_000)
  timer = setInterval(() => check().catch(() => {}), INTERVAL)
}

export const followsCount = () => Object.values(follows).reduce((n, f) => n + (f.fresh > 0 ? 1 : 0), 0)
