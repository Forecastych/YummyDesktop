import { SvelteMap, SvelteSet } from 'svelte/reactivity'
import { clearCache } from '../api/client'
import { Api } from '../api/endpoints'
import { LISTS, type AnimeShort, type ListId } from '../api/types'
import { errorText } from '../query.svelte'
import { load, save } from '../storage'
import { auth } from './auth.svelte'
import { toast } from './toast.svelte'

// Где лежит каждый тайтл у пользователя — одна карта на карточки, меню по ПКМ и страницу тайтла.
// Полный список с сервера весит ~1.5 МБ на 800 тайтлов, поэтому он грузится раз за вход,
// а между запусками живёт компактная копия «id → список», чтобы отметки были видны сразу.

interface Snapshot {
  user: number
  lists: [number, ListId][]
  favs: number[]
}

const lists = new SvelteMap<number, ListId>()
const favs = new SvelteSet<number>()
let owner = 0

function fill(s: Snapshot) {
  owner = s.user
  lists.clear()
  favs.clear()
  for (const [id, l] of s.lists) lists.set(id, l)
  for (const id of s.favs) favs.add(id)
}

function persist() {
  if (owner) save('lists', { user: owner, lists: [...lists], favs: [...favs] })
}

$effect.root(() => {
  $effect(() => {
    const uid = auth.profile?.id
    if (!uid) {
      if (auth.ready) fill({ user: 0, lists: [], favs: [] })
      return
    }
    const cached = load<Snapshot | null>('lists', null)
    if (cached?.user === uid) fill(cached)
    Api.userLists(uid)
      .then((all) => {
        if (auth.profile?.id !== uid) return
        fill({
          user: uid,
          lists: all.flatMap((a) => (a.user?.list?.list ? [[a.anime_id, a.user.list.list.id] as [number, ListId]] : [])),
          favs: all.filter((a) => a.user?.list?.is_fav).map((a) => a.anime_id),
        })
        persist()
      })
      .catch(() => {})
  })
})

export const listOf = (id: number): ListId | null => lists.get(id) ?? null
export const isFav = (id: number) => favs.has(id)
export const listTitle = (id: ListId) => LISTS.find((l) => l.id === id)?.title ?? ''

/** Страница тайтла знает точное состояние — подправляем карту, если сервер разошёлся с ней. */
export function noteState(id: number, list: ListId | null, fav: boolean) {
  if (!auth.profile) return
  if (list == null) lists.delete(id)
  else lists.set(id, list)
  if (fav) favs.add(id)
  else favs.delete(id)
}

function invalidate(a: Pick<AnimeShort, 'anime_url'>) {
  if (a.anime_url) clearCache(`/anime/${a.anime_url}`)
  if (owner) clearCache(`/users/${owner}/lists`)
}

/** Оптимистично: отметка ставится сразу, при ошибке сервера откатывается. */
export async function setListFor(a: Pick<AnimeShort, 'anime_id' | 'anime_url'>, list: ListId | null, quiet = false) {
  if (!auth.profile) return false
  const prev = listOf(a.anime_id)
  if (prev === list) return true
  if (list == null) lists.delete(a.anime_id)
  else lists.set(a.anime_id, list)
  try {
    await (list == null ? Api.removeFromList(a.anime_id) : Api.setList(a.anime_id, list))
    invalidate(a)
    persist()
    if (!quiet) toast(list == null ? 'Убрано из списков' : `Добавлено в «${listTitle(list)}»`)
    return true
  } catch (e) {
    if (prev == null) lists.delete(a.anime_id)
    else lists.set(a.anime_id, prev)
    toast(errorText(e), 'error')
    return false
  }
}

export async function toggleFavFor(a: Pick<AnimeShort, 'anime_id' | 'anime_url'>, quiet = false) {
  if (!auth.profile) return false
  const on = !favs.has(a.anime_id)
  const flip = (v: boolean) => (v ? favs.add(a.anime_id) : favs.delete(a.anime_id))
  flip(on)
  try {
    await Api.setFav(a.anime_id, on)
    invalidate(a)
    persist()
    if (!quiet) toast(on ? 'Добавлено в избранное' : 'Убрано из избранного')
    return true
  } catch (e) {
    flip(!on)
    toast(errorText(e), 'error')
    return false
  }
}
