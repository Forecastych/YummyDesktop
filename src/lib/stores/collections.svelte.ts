// Коллекции сайта (/collection): свои живут в аккаунте YummyAnime и видны на сайте.
import { clearCache } from '../api/client'
import { Api } from '../api/endpoints'
import type { Collection, CollectionInput } from '../api/types'
import { auth } from './auth.svelte'

export const myCollections = $state({
  list: [] as Collection[],
  loaded: false,
  loading: false,
})
/** Чей список лежит в myCollections: после смены аккаунта он чужой. */
let loadedFor = 0

/** id тайтлов по коллекции — нужны, чтобы PATCH не затёр чужие позиции. */
const idsCache = new Map<number, number[]>()

function invalidate(id?: number) {
  if (id != null) idsCache.delete(id)
  clearCache('/collection')
}

export async function loadMine(force = false) {
  const p = auth.profile
  if (!p) {
    myCollections.list = []
    myCollections.loaded = false
    return
  }
  if (loadedFor !== p.id) {
    myCollections.list = []
    myCollections.loaded = false
    idsCache.clear()
  }
  if (myCollections.loading || (myCollections.loaded && !force)) return
  myCollections.loading = true
  try {
    const all: Collection[] = []
    for (let offset = 0; ; offset += 100) {
      const page = await Api.collections({ owner_id: p.id, sort: 'new', offset, limit: 100 }, {})
      all.push(...page)
      if (page.length < 100) break
    }
    myCollections.list = all
    myCollections.loaded = true
    loadedFor = p.id
  } finally {
    myCollections.loading = false
  }
}

export function isOwner(c: Pick<Collection, 'owner'> | undefined) {
  return !!c && !!auth.profile && c.owner?.id === auth.profile.id
}

/** Все id тайтлов коллекции (API отдаёт максимум 100 за раз). */
export async function animeIds(id: number): Promise<number[]> {
  const hit = idsCache.get(id)
  if (hit) return hit
  const ids: number[] = []
  for (let offset = 0; ; offset += 100) {
    const c = await Api.collection(id, offset, 100)
    ids.push(...c.animes.map((a) => a.anime_id))
    if (c.animes.length < 100) break
  }
  idsCache.set(id, ids)
  return ids
}

export async function createCollection(input: CollectionInput): Promise<number> {
  const r = await Api.createCollection(input)
  invalidate()
  myCollections.loaded = false
  await loadMine(true).catch(() => {})
  return r.id
}

export async function editCollection(id: number, patch: Partial<CollectionInput>) {
  await Api.editCollection(id, patch)
  invalidate(id)
  if (patch.anime_ids) idsCache.set(id, patch.anime_ids)
  const { anime_ids: _ids, ...meta } = patch
  const c = myCollections.list.find((x) => x.id === id)
  if (c) Object.assign(c, meta)
}

export async function deleteCollection(id: number) {
  await Api.deleteCollection(id)
  invalidate(id)
  myCollections.list = myCollections.list.filter((c) => c.id !== id)
}

/** Добавить или убрать тайтл. Возвращает новое состояние: true — тайтл в коллекции. */
export async function toggleAnime(collectionId: number, animeId: number): Promise<boolean> {
  const ids = await animeIds(collectionId)
  const has = ids.includes(animeId)
  const next = has ? ids.filter((x) => x !== animeId) : [...ids, animeId]
  await editCollection(collectionId, { anime_ids: next })
  return !has
}

export async function removeAnimes(collectionId: number, remove: number[]) {
  const ids = await animeIds(collectionId)
  await editCollection(collectionId, { anime_ids: ids.filter((x) => !remove.includes(x)) })
}

export async function vote(c: Collection, action: 1 | -1) {
  const next = c.likes.vote === action ? 0 : action
  const r = await Api.voteCollection(c.id, next)
  c.likes = { ...c.likes, ...r, vote: next }
  invalidate()
}
