import { api, type RequestOptions } from './client'
import type {
  Anime,
  AnimeShort,
  BloggerVideo,
  Catalog,
  Collection,
  CollectionInput,
  Comment,
  Feed,
  Friend,
  FriendList,
  GenreList,
  Likes,
  LinkedService,
  ListedAnime,
  ListId,
  Post,
  PostShort,
  Profile,
  Review,
  User,
  UserRecommendation,
  UserStats,
  Video,
} from './types'

const MIN = 60_000
const HOUR = 60 * MIN

type Sig = { signal?: AbortSignal }

export interface AnimeFilter {
  q?: string
  genres?: number[]
  exclude_genres?: number[]
  types?: string[]
  status?: string[]
  translates?: string[]
  season?: number[]
  from_year?: number
  to_year?: number
  min_rating?: number
  sort?: 'title' | 'year' | 'rating' | 'rating_counters' | 'views' | 'top' | 'random' | 'id'
  sort_forward?: boolean
  ids?: number[]
  offset?: number
  limit?: number
}

export const Api = {
  feed: (watches: string[] = [], o: Sig = {}) =>
    api<Feed>('/feed', { query: { watches }, ttl: 2 * MIN, persist: 'feed', ...o }),

  anime: (url: string | number, o: Sig = {}) =>
    api<Anime>(`/anime/${url}`, { query: { need_videos: true }, ttl: 5 * MIN, ...o }),

  videos: (id: number, o: Sig = {}) => api<Video[]>(`/anime/${id}/videos`, { ttl: 5 * MIN, ...o }),

  recommendations: (id: number, o: Sig = {}) =>
    api<AnimeShort[]>(`/anime/${id}/recommendations`, { query: { limit: 12 }, ttl: 30 * MIN, ...o }),

  /** from_ai=false — «оценившие этот тайтл смотрели»: связки, за которые голосовали пользователи. */
  similar: (id: number, fromUsers: boolean, limit = 24, o: Sig = {}) =>
    api<UserRecommendation[]>(`/anime/${id}/recommendations`, {
      query: { limit, from_ai: !fromUsers },
      ttl: 6 * HOUR,
      ...o,
    }),

  /** Убрать тайтл из рекомендаций сайта (нужен вход). */
  hideRecommendation: (id: number) => api<boolean>(`/anime/${id}/recommend`, { method: 'DELETE' }),

  list: (f: AnimeFilter, o: Sig & Pick<RequestOptions, 'ttl'> = {}) =>
    api<AnimeShort[]>('/anime', { query: f as RequestOptions['query'], ttl: 5 * MIN, ...o }),

  search: (q: string, limit = 8, o: Sig = {}) =>
    api<AnimeShort[]>('/anime', { query: { q, limit }, ttl: 5 * MIN, ...o }),

  genres: () => api<GenreList>('/anime/genres', { ttl: 24 * HOUR, persist: 'genres' }),

  catalog: () => api<Catalog>('/anime/catalog', { ttl: HOUR, persist: 'catalog' }),

  schedule: (o: Sig = {}) => api<AnimeShort[]>('/anime/schedule', { ttl: 10 * MIN, persist: 'schedule', ...o }),

  comments: (id: number, skip = 0, sort: 'new' | 'old' | 'nice' = 'nice', o: Sig = {}) =>
    api<{ comments: Comment[] }>(`/comments/anime/${id}`, { query: { limit: 20, skip, sort }, ttl: MIN, ...o }),

  commentChildren: (id: number) => api<{ comments: Comment[] } | Comment[]>(`/comments/${id}/children`, { ttl: MIN }),

  addComment: (animeId: number, text: string, parent?: number) =>
    api<Comment>(`/comments/anime/${animeId}`, {
      method: 'POST',
      body: parent ? { text, parent_comment: parent, reply_to_comment: parent } : { text },
    }),

  posts: (skip = 0, category?: string, o: Sig = {}) =>
    api<PostShort[]>('/posts', { query: { limit: 20, skip, category, sort: 'new' }, ttl: 5 * MIN, ...o }),

  post: (id: number, o: Sig = {}) => api<Post>(`/posts/${id}`, { ttl: 10 * MIN, ...o }),

  // ---- видео блогеров ----

  /** Сервер отдаёт не больше 30 роликов за раз. */
  bloggerVideos: (q: { category?: string; sort?: 'new' | 'old' | 'top'; offset?: number; limit?: number }, o: Sig = {}) =>
    api<BloggerVideo[]>('/bloggers/video', { query: { limit: 30, ...q }, ttl: 5 * MIN, ...o }),

  bloggerVideo: (id: number, o: Sig = {}) => api<BloggerVideo>(`/bloggers/video/${id}`, { ttl: 10 * MIN, ...o }),

  // ---- коллекции ----

  collections: (q: { sort?: 'new' | 'best' | 'old'; owner_id?: number; offset?: number; limit?: number }, o: Sig = {}) =>
    api<Collection[]>('/collection', { query: { limit: 24, ...q }, ttl: 2 * MIN, ...o }),

  collection: (id: number, offset = 0, limit = 100, o: Sig = {}) =>
    api<Collection>(`/collection/${id}`, { query: { offset, limit }, ttl: MIN, ...o }),

  animeCollections: (animeId: number, o: Sig = {}) =>
    api<Collection[]>(`/anime/${animeId}/collections`, { query: { limit: 6 }, ttl: 10 * MIN, ...o }),

  createCollection: (c: CollectionInput) =>
    api<{ id: number }>('/collection', { method: 'POST', body: { language: 'ru', ...c } }),

  editCollection: (id: number, c: Partial<CollectionInput>) =>
    api<boolean>(`/collection/${id}`, { method: 'PATCH', body: c }),

  deleteCollection: (id: number) => api<boolean>(`/collection/${id}`, { method: 'DELETE' }),

  voteCollection: (id: number, action: 1 | -1 | 0) =>
    action
      ? api<Likes>(`/collection/${id}/vote`, { method: 'PUT', body: { action } })
      : api<Likes>(`/collection/${id}/vote`, { method: 'DELETE' }),

  // ---- аккаунт ----

  login: (login: string, password: string, captcha?: string) =>
    api<{ success: boolean; token: string }>('/profile/login', {
      method: 'POST',
      body: { login, password, need_json: true, ...(captcha ? { recaptcha_response: captcha } : {}) },
    }),

  refreshToken: () => api<{ token: string }>('/profile/token', { ttl: 0 }),

  logout: () => api<unknown>('/profile/logout', { method: 'POST' }),

  profile: () => api<Profile>('/profile', { ttl: 0 }),

  // ---- редактирование профиля ----

  /** jpeg/png/webp, 250×250, до 2 МБ. */
  setAvatar: (userId: number, file: Blob) => api<boolean>(`/users/${userId}/avatar`, { method: 'PUT', raw: file }),

  removeAvatar: (userId: number) => api<boolean>(`/users/${userId}/avatar`, { method: 'DELETE' }),

  /** jpeg/png/webp, 1370×170, до 4 МБ. */
  setBanner: (userId: number, file: Blob) => api<boolean>(`/users/${userId}/banner`, { method: 'PUT', raw: file }),

  removeBanner: (userId: number) => api<boolean>(`/users/${userId}/banner`, { method: 'DELETE' }),

  /** Сервер отвечает новым токеном. */
  changePassword: (old_password: string, new_password: string) =>
    api<{ success: boolean; token: string }>('/profile/password', {
      method: 'PATCH',
      body: { old_password, new_password, need_json: true },
      keepAuth: true,
    }),

  unlinkAccount: (service: LinkedService) => api<unknown>(`/profile/login/${service}`, { method: 'DELETE' }),

  userList: (userId: number, list: ListId | 4, o: Sig = {}) =>
    api<AnimeShort[]>(`/users/${userId}/lists/${list}`, { ttl: MIN, ...o }),

  // ---- пользователи ----

  user: (id: number, o: Sig = {}) => api<User>(`/users/id${id}`, { ttl: MIN, ...o }),

  /** Все списки разом: в каждом элементе есть user.list — так считаются вкладки. */
  userLists: (id: number, o: Sig = {}) => api<ListedAnime[]>(`/users/${id}/lists`, { ttl: MIN, ...o }),

  userStats: async (id: number, o: Sig = {}): Promise<UserStats> => {
    const opt = { ttl: 10 * MIN, ...o }
    const [genres, ratings, types] = await Promise.all([
      api<UserStats['genres']>(`/users/${id}/stats/genres`, opt),
      api<UserStats['ratings']>(`/users/${id}/stats/ratings`, opt),
      api<UserStats['types']>(`/users/${id}/stats/types-v2`, opt),
    ])
    return { genres, ratings, types }
  },

  userFriends: (id: number, list: FriendList, offset = 0, o: Sig = {}) =>
    api<Friend[]>(`/users/${id}/friends/${list}`, { query: { limit: 100, offset }, ttl: MIN, ...o }),

  userReviews: (id: number, offset = 0, o: Sig = {}) =>
    api<Review[]>(`/users/${id}/reviews`, { query: { limit: 20, offset }, ttl: MIN, ...o }),

  userCollections: (id: number, offset = 0, o: Sig = {}) =>
    api<Collection[]>(`/users/${id}/collections`, { query: { limit: 24, offset }, ttl: MIN, ...o }),

  searchUsers: (nickname: string, o: Sig = {}) =>
    api<{ items: User[] }>('/users', { query: { nickname, limit: 20 }, ttl: MIN, ...o }),

  // ---- рецензии ----

  reviews: (q: { sort?: 'new' | 'old' | 'top'; offset?: number; limit?: number }, o: Sig = {}) =>
    api<Review[]>('/reviews', { query: { limit: 20, ...q }, ttl: 5 * MIN, ...o }),

  review: (id: number, o: Sig = {}) => api<Review>(`/reviews/${id}`, { ttl: 5 * MIN, ...o }),

  voteReview: (id: number, action: -1 | 0 | 1) =>
    action
      ? api<Likes>(`/reviews/${id}/vote`, { method: 'PUT', body: { action } })
      : api<Likes>(`/reviews/${id}/vote`, { method: 'DELETE' }),

  setList: (id: number, list: ListId) =>
    api<unknown>(`/anime/${id}/list`, { method: 'PUT', body: { list, date: Math.floor(Date.now() / 1000) } }),

  removeFromList: (id: number) => api<unknown>(`/anime/${id}/list`, { method: 'DELETE' }),

  setFav: (id: number, fav: boolean) => api<unknown>(`/anime/${id}/list/fav`, { method: fav ? 'PUT' : 'DELETE' }),

  rate: (id: number, rate: number) =>
    rate > 0
      ? api<unknown>(`/anime/${id}/rate`, { method: 'PUT', body: { rate } })
      : api<unknown>(`/anime/${id}/rate`, { method: 'DELETE' }),

  markWatched: (videoId: number, time: number, duration: number) =>
    api<unknown>(`/video/${videoId}`, {
      method: 'PUT',
      body: { time: Math.floor(time), duration: Math.floor(duration), date: Math.floor(Date.now() / 1000) },
    }),

  unmarkWatched: (videoId: number) => api<unknown>(`/video/${videoId}`, { method: 'DELETE' }),
}
