// Умные подборки: собираются на десктопе из того, что человек смотрел и оценивал.
//
// Затравки — локальная история, списки аккаунта и оценки. Для каждой берём две выдачи сайта:
// «похожие» (from_ai) и «оценившие это смотрели» (голоса пользователей за связку).
// Кандидат, которого советуют несколько затравок, поднимается выше. Затем поправка на
// жанровый вкус (жанры из «Брошено» тянут вниз) и на рейтинг. Фильтры применяются при
// отрисовке, поэтому их смена не требует пересборки.
import { Api } from '../api/endpoints'
import type { AnimeShort, ListId, UserRecommendation } from '../api/types'
import { MIN_USER_VOTES, userVotes } from '../format'
import { load, save } from '../storage'
import { SENSITIVE_GENRES, TROLL_IDS, suspiciousLink } from '../troll'
import { auth } from './auth.svelte'
import { history } from './history.svelte'

export interface SmartFilter {
  genres: number[]
  exclude_genres: number[]
  from_year?: number
  to_year?: number
  /** 1 зима, 2 весна, 3 лето, 4 осень. */
  seasons: number[]
  min_rating?: number
  /** Скрывать то, что уже есть в списках аккаунта или в локальной истории. */
  hide_mine: boolean
}

/** Урезанный AnimeShort: только то, что нужно для карточки и фильтров, — чтобы влезть в localStorage. */
export type Lite = Pick<AnimeShort, 'anime_id' | 'anime_url' | 'title' | 'poster' | 'year' | 'season' | 'type' | 'anime_status'> & {
  rating?: number
  genres?: number[]
}

export interface Candidate {
  anime: Lite
  score: number
  /** id затравок, которые советуют этот тайтл, — от самой весомой. */
  because: number[]
  ai: boolean
  users: boolean
  votes: number
}

export interface Seed {
  id: number
  url: string
  title: string
  weight: number
}

export interface SeedRow {
  seed: Seed
  similar: number[]
  watched: number[]
}

interface SmartData {
  candidates: Record<number, Candidate>
  rows: SeedRow[]
  seeds: Seed[]
  /** Тайтлы аккаунта и истории на момент сборки — для «скрыть моё». */
  mine: number[]
  builtAt: number
  signature: string
}

const EMPTY: SmartData = { candidates: {}, rows: [], seeds: [], mine: [], builtAt: 0, signature: '' }

export const smart = $state({
  data: load<SmartData>('smart', EMPTY),
  building: false,
  /** 0..1 — для полоски прогресса. */
  progress: 0,
  error: null as string | null,
})

export const smartFilter: SmartFilter = $state(
  load<SmartFilter>('smart.filter', { genres: [], exclude_genres: [], seasons: [], hide_mine: true }),
)

/** «Не интересно» — локально и навсегда. */
export const hidden: Record<number, true> = $state(load('smart.hidden', {}))

$effect.root(() => {
  $effect(() => save('smart.filter', $state.snapshot(smartFilter)))
  $effect(() => save('smart.hidden', $state.snapshot(hidden)))
})

const MAX_SEEDS = 12
const ROW_SEEDS = 4
const PER_SEED = 24
const ENRICH = 200
const STALE = 6 * 3600_000
/** Меняется вместе с правилами отбора — старая подборка из localStorage пересоберётся. */
const RULES = 'v2'
/** Формат: короткометражки и спешлы — «добивка» к сериалу, в общей ленте им место ниже. */
const FORMAT: Record<string, number> = { tv: 1, movie: 1, ona: 0.9, ova: 0.8, special: 0.65, 'short-movie': 0.45, music: 0.4, clip: 0.4 }

// ---------- затравки ----------

interface RawSeed extends Seed {
  negative?: boolean
}

/** Вес списков: избранное и просмотренное говорят о вкусе сильнее «в планах». */
const LIST_WEIGHT: Record<ListId | 4, number> = { 4: 4, 2: 2.5, 0: 2, 1: 0.8, 5: 0.5, 3: -1.5 }

function rated(a: AnimeShort): number | undefined {
  const r = (a as { user?: { rating?: number } }).user?.rating
  return r && r > 0 ? r : undefined
}

async function gatherSeeds(): Promise<{ seeds: RawSeed[]; mine: Set<number> }> {
  const all = new Map<number, RawSeed>()
  const mine = new Set<number>()
  const add = (s: RawSeed) => {
    const prev = all.get(s.id)
    if (!prev) all.set(s.id, s)
    else if (s.negative || prev.negative) all.set(s.id, { ...prev, negative: true, weight: Math.min(prev.weight, s.weight) })
    else prev.weight += s.weight
  }

  // Локальная история: чем больше серий досмотрено и чем свежее — тем весомее.
  const done = new Map<number, number>()
  for (const [k, p] of Object.entries(history.progress)) {
    if (!p.done) continue
    const id = Number(k.slice(0, k.indexOf(':')))
    done.set(id, (done.get(id) ?? 0) + 1)
  }
  for (const e of Object.values(history.last)) {
    mine.add(e.animeId)
    const ageDays = (Date.now() - e.updatedAt) / 86_400_000
    const eps = done.get(e.animeId) ?? 0
    const weight = (1 + Math.min(eps, 12) / 4) * Math.pow(0.5, ageDays / 60)
    add({ id: e.animeId, url: e.url, title: e.title, weight })
  }

  // Списки аккаунта. Оценка, если сайт её отдал, умножает вес: 10 — вдвое, 3 — в минус.
  const p = auth.profile
  if (p) {
    const ids = [4, 2, 0, 1, 5, 3] as const
    const lists = await Promise.all(ids.map((l) => Api.userList(p.id, l).catch(() => [] as AnimeShort[])))
    lists.forEach((items, i) => {
      const base = LIST_WEIGHT[ids[i]]
      for (const a of items) {
        mine.add(a.anime_id)
        const r = rated(a)
        let weight = base
        if (r) weight = r >= 6 ? base * (0.5 + (r - 5) / 3.5) : -Math.abs(base) * ((6 - r) / 3)
        add({ id: a.anime_id, url: a.anime_url, title: a.title, weight, negative: weight < 0 })
      }
    })
  }
  return { seeds: [...all.values()], mine }
}

// ---------- сборка ----------

function lite(a: AnimeShort): Lite {
  const r = typeof a.rating === 'number' ? a.rating : a.rating?.average
  return {
    anime_id: a.anime_id,
    anime_url: a.anime_url,
    title: a.title,
    poster: { medium: a.poster?.medium, big: a.poster?.big, huge: a.poster?.huge },
    year: a.year,
    season: a.season,
    type: a.type,
    anime_status: a.anime_status,
    rating: r || undefined,
    genres: a.genres?.length ? a.genres.map((g) => g.id) : undefined,
  }
}

/** Параллельно, но не больше `n` запросов разом — API отвечает 429 на залп. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, tick?: () => void): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const k = i++
      out[k] = await fn(items[k])
      tick?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

/** Тянет жанры/год/рейтинг пачками по 50 — в выдаче рекомендаций жанров нет. */
async function enrich(ids: number[]): Promise<Map<number, AnimeShort>> {
  const m = new Map<number, AnimeShort>()
  const chunks: number[][] = []
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))
  await pool(chunks, 2, async (chunk) => {
    const list = await Api.list({ ids: chunk, limit: chunk.length }, { ttl: 6 * 3600_000 }).catch(() => [])
    for (const a of list) m.set(a.anime_id, a)
  })
  return m
}

let running: Promise<void> | null = null

export function buildSmart(force = false): Promise<void> {
  if (running) return running
  running = build(force).finally(() => (running = null))
  return running
}

async function build(force: boolean) {
  smart.building = true
  smart.progress = 0
  smart.error = null
  try {
    const { seeds: raw, mine } = await gatherSeeds()
    const positive = raw.filter((s) => !s.negative && s.weight > 0).sort((a, b) => b.weight - a.weight)
    const negative = raw.filter((s) => s.negative)
    const seeds = positive.slice(0, MAX_SEEDS)
    const signature = RULES + '|' + seeds.map((s) => s.id).join(',') + '|' + negative.map((s) => s.id).join(',')

    if (!force && signature === smart.data.signature && Date.now() - smart.data.builtAt < STALE) return
    if (!seeds.length) {
      smart.data = { ...EMPTY, mine: [...mine], builtAt: Date.now(), signature }
      save('smart', smart.data)
      return
    }

    const total = seeds.length * 2 + 2
    let doneSteps = 0
    const tick = () => (smart.progress = ++doneSteps / total)

    const jobs = seeds.flatMap((s) => [
      { s, users: false },
      { s, users: true },
    ])
    const results = await pool(
      jobs,
      3,
      (j) => Api.similar(j.s.id, j.users, PER_SEED).catch(() => [] as UserRecommendation[]),
      tick,
    )

    const maxW = seeds[0].weight
    const seedIds = new Set(raw.map((s) => s.id))
    const cands = new Map<number, Candidate & { contrib: Map<number, number> }>()

    jobs.forEach((j, k) => {
      const w = j.s.weight / maxW
      results[k].forEach((a, rank) => {
        if (seedIds.has(a.anime_id) || TROLL_IDS.has(a.anime_id)) return
        let gain: number
        let votes = 0
        if (j.users) {
          votes = userVotes(a.likes)
          if (votes < MIN_USER_VOTES || suspiciousLink(a, a.likes)) return
          // Доверие растёт с числом голосов: 2 голоса — шутка двух людей, 30 — консенсус.
          gain = (w * 1.2 * (votes / (votes + 4))) / (1 + rank * 0.08)
        } else {
          gain = w / (1 + rank * 0.12)
        }
        let c = cands.get(a.anime_id)
        if (!c) {
          c = { anime: lite(a), score: 0, because: [], ai: false, users: false, votes: 0, contrib: new Map() }
          cands.set(a.anime_id, c)
        }
        c.score += gain
        c.votes += votes
        if (j.users) c.users = true
        else c.ai = true
        c.contrib.set(j.s.id, (c.contrib.get(j.s.id) ?? 0) + gain)
      })
    })

    // Жанровый профиль по затравкам; «Брошено» и низкие оценки вычитаются.
    const top = [...cands.values()].sort((a, b) => b.score - a.score).slice(0, ENRICH)
    const info = await enrich([...top.map((c) => c.anime.anime_id), ...raw.map((s) => s.id)])
    tick()

    const profile = new Map<number, number>()
    for (const s of raw) {
      const g = info.get(s.id)?.genres
      if (!g?.length) continue
      const w = s.negative ? s.weight : s.weight / maxW
      for (const x of g) profile.set(x.id, (profile.get(x.id) ?? 0) + w / Math.sqrt(g.length))
    }
    const peak = Math.max(1e-6, ...[...profile.values()].map(Math.abs))

    for (const [id, c] of cands) {
      const full = info.get(c.anime.anime_id)
      // Эротику и «не японское» советуем, только если такие жанры есть в затравках со знаком плюс.
      if (full?.genres?.some((g) => SENSITIVE_GENRES.has(g.alias) && !((profile.get(g.id) ?? 0) > 0))) {
        cands.delete(id)
        continue
      }
      if (full) c.anime = lite(full)
      const g = c.anime.genres
      let affinity = 0
      if (g?.length) affinity = g.reduce((n, id) => n + (profile.get(id) ?? 0), 0) / peak / Math.sqrt(g.length)
      const quality = c.anime.rating ? Math.min(1.25, Math.max(0.4, 0.5 + 0.1 * (c.anime.rating - 5))) : 0.7
      const format = FORMAT[c.anime.type?.alias ?? ''] ?? 0.9
      const agreement = 1 + 0.15 * (c.contrib.size - 1)
      c.score *= (1 + 0.5 * Math.max(-1, Math.min(1.5, affinity))) * quality * format * agreement
      c.because = [...c.contrib.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    }

    const candidates: Record<number, Candidate> = {}
    for (const { contrib: _, ...c } of [...cands.values()].sort((a, b) => b.score - a.score).slice(0, 400))
      candidates[c.anime.anime_id] = c

    const rows: SeedRow[] = seeds.slice(0, ROW_SEEDS).map((s) => {
      const k = jobs.findIndex((j) => j.s.id === s.id && !j.users)
      const keep = (list: AnimeShort[]) => list.map((a) => a.anime_id).filter((id) => candidates[id])
      return { seed: { ...s }, similar: keep(results[k]), watched: keep(results[k + 1]) }
    })

    smart.data = {
      candidates,
      rows,
      seeds: seeds.map(({ id, url, title, weight }) => ({ id, url, title, weight })),
      mine: [...mine],
      builtAt: Date.now(),
      signature,
    }
    save('smart', $state.snapshot(smart.data))
    tick()
  } catch (e) {
    smart.error = e instanceof Error ? e.message : 'Не удалось собрать подборку'
  } finally {
    smart.building = false
  }
}

/** Пересобирает в фоне, пока приложение открыто: при старте и раз в 6 часов. */
export function startSmartBuilder() {
  setTimeout(() => buildSmart(), 25_000)
  setInterval(() => buildSmart(), STALE)
}

// ---------- выдача ----------

export function passes(a: Lite, f: SmartFilter = smartFilter, mine?: Set<number>): boolean {
  if (hidden[a.anime_id] || TROLL_IDS.has(a.anime_id)) return false
  if (f.hide_mine && mine?.has(a.anime_id)) return false
  if (f.genres.length && !f.genres.every((g) => a.genres?.includes(g))) return false
  if (f.exclude_genres.length && a.genres?.some((g) => f.exclude_genres.includes(g))) return false
  if (f.from_year && (!a.year || a.year < f.from_year)) return false
  if (f.to_year && (!a.year || a.year > f.to_year)) return false
  if (f.seasons.length && (!a.season || !f.seasons.includes(a.season))) return false
  if (f.min_rating && (a.rating ?? 0) < f.min_rating) return false
  return true
}

/** «Моё» = снимок со сборки + то, что открыто после неё. */
export function mineSet(): Set<number> {
  const s = new Set(smart.data.mine)
  for (const id of Object.keys(history.last)) s.add(Number(id))
  return s
}

export function picks(): Candidate[] {
  const mine = mineSet()
  return Object.values(smart.data.candidates)
    .filter((c) => passes(c.anime, smartFilter, mine))
    .sort((a, b) => b.score - a.score)
}

export function seedTitle(id: number): string {
  return smart.data.seeds.find((s) => s.id === id)?.title ?? ''
}

export function hide(id: number) {
  hidden[id] = true
  // На сайте — чтобы и его рекомендации перестали это советовать.
  if (auth.profile) Api.hideRecommendation(id).catch(() => {})
}

export function filterCount(f: SmartFilter = smartFilter) {
  return f.genres.length + f.exclude_genres.length + f.seasons.length + (f.from_year ? 1 : 0) + (f.to_year ? 1 : 0) + (f.min_rating ? 1 : 0)
}
