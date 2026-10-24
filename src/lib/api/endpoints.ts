import { api, type RequestOptions } from './client'
import type {
  Anime,
  AnimeShort,
  Blogger,
  BloggerVideo,
  Catalog,
  Collection,
  CollectionInput,
  Comment,
  Feed,
  Friend,
  FriendList,
  GenreList,
  Dialog,
  LastWatch,
  Likes,
  LinkedService,
  ListedAnime,
  Message,
  ListId,
  ListTime,
  Post,
  PostCategory,
  PostShort,
  Profile,
  Notification,
  Ref,
  Review,
  Trailer,
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
  /** Подбор по id Шикимори (ответ содержит remote_ids.shikimori_id). */
  shikimori_ids?: number[]
  studio_ids?: number[]
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

  /** Голос за связку «оценившие этот тайтл смотрели и similarId». */
  voteRecommendation: (id: number, similarId: number, action: -1 | 0 | 1) =>
    action
      ? api<Likes>(`/anime/${id}/recommend/${similarId}/vote`, { method: 'PUT', body: { action } })
      : api<Likes>(`/anime/${id}/recommend/${similarId}/vote`, { method: 'DELETE' }),

  /** Распределение оценок пользователей 1–10. */
  animeRates: (id: number, o: Sig = {}) =>
    api<{ rating: number; count: number }[]>(`/anime/${id}/rates`, { ttl: 30 * MIN, ...o }),

  /** Сколько пользователей держат тайтл в каждом списке (list_id 4 — любимые). */
  animeListCounts: (id: number, o: Sig = {}) =>
    api<{ list_id: number; count: number }[]>(`/anime/${id}/lists`, { ttl: 30 * MIN, ...o }),

  /** slug — последняя часть studio.url («/catalog/studio/mappa» → «mappa»). */
  studio: (slug: string, o: Sig = {}) => api<Ref>(`/anime/studio/${slug}`, { ttl: 24 * HOUR, ...o }),

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

  voteComment: (id: number, action: -1 | 0 | 1) =>
    action
      ? api<{ likes: number; dislikes: number }>(`/comments/${id}/vote`, { method: 'PUT', body: { action } })
      : api<{ likes: number; dislikes: number }>(`/comments/${id}/vote`, { method: 'DELETE' }),

  editComment: (id: number, text: string) => api<Comment>(`/comments/${id}`, { method: 'PATCH', body: { text } }),

  deleteComment: (id: number) => api<boolean>(`/comments/${id}`, { method: 'DELETE', body: {} }),

  /** Причины — как в форме жалобы на сайте (см. CLAIM_REASONS). */
  claimComment: (id: number, why: number) => api<boolean>(`/comments/${id}/claim`, { method: 'PUT', body: { why } }),

  animeReviews: async (id: number, offset = 0, limit = 10, o: Sig = {}) => {
    const r = await api<Review[] | { reviews: Review[] }>(`/anime/${id}/reviews`, {
      query: { offset, limit, sort: 'top' },
      ttl: 5 * MIN,
      ...o,
    })
    return Array.isArray(r) ? r : (r?.reviews ?? [])
  },

  trailers: (id: number, o: Sig = {}) => api<Trailer[]>(`/anime/${id}/trailers`, { ttl: HOUR, ...o }),

  posts: (skip = 0, category?: string, o: Sig = {}) =>
    api<PostShort[]>('/posts', { query: { limit: 20, skip, category, sort: 'new' }, ttl: 5 * MIN, ...o }),

  post: (id: number, o: Sig = {}) => api<Post>(`/posts/${id}`, { ttl: 10 * MIN, ...o }),

  postCategories: () => api<PostCategory[]>('/posts/categories', { ttl: 24 * HOUR, persist: 'post-categories' }),

  votePost: (id: number, action: -1 | 0 | 1) =>
    action
      ? api<Likes>(`/posts/${id}/vote`, { method: 'PUT', body: { action } })
      : api<Likes>(`/posts/${id}/vote`, { method: 'DELETE' }),

  // ---- видео блогеров ----

  /** Сервер отдаёт не больше 30 роликов за раз. */
  bloggerVideos: (q: { category?: string; sort?: 'new' | 'old' | 'top'; offset?: number; limit?: number }, o: Sig = {}) =>
    api<BloggerVideo[]>('/bloggers/video', { query: { limit: 30, ...q }, ttl: 5 * MIN, ...o }),

  bloggerVideo: (id: number, o: Sig = {}) => api<BloggerVideo>(`/bloggers/video/${id}`, { ttl: 10 * MIN, ...o }),

  // ---- блогеры: страница, подписка, лайки роликов ----

  blogger: (id: number, o: Sig = {}) => api<Blogger>(`/bloggers/${id}`, { ttl: MIN, ...o }),

  /** Ролики одного блогера — тот же список, что `/bloggers/video`, с фильтром blogger_id. */
  bloggerVideosOf: (
    bloggerId: number,
    q: { category?: string; sort?: 'new' | 'old' | 'top'; offset?: number; limit?: number },
    o: Sig = {},
  ) => api<BloggerVideo[]>('/bloggers/video', { query: { limit: 30, blogger_id: bloggerId, ...q }, ttl: 5 * MIN, ...o }),

  /** Ролики блогеров о тайтле (сортировки сервер не принимает). */
  animeBloggerVideos: (animeId: number, offset = 0, limit = 12, o: Sig = {}) =>
    api<BloggerVideo[]>(`/anime/${animeId}/bloggervideos`, { query: { offset, limit }, ttl: 10 * MIN, ...o }),

  /** Так подписывается сайт: PUT с { subscribe: true }, отписка — DELETE. */
  subscribeBlogger: (id: number, on: boolean) =>
    on
      ? api<unknown>(`/bloggers/${id}/subscribe`, { method: 'PUT', body: { subscribe: true } })
      : api<unknown>(`/bloggers/${id}/subscribe`, { method: 'DELETE' }),

  voteBloggerVideo: (id: number, action: 1 | -1 | 0) =>
    action
      ? api<Likes>(`/bloggers/video/${id}/vote`, { method: 'PUT', body: { action } })
      : api<Likes>(`/bloggers/video/${id}/vote`, { method: 'DELETE' }),

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
  userLists: (id: number, o: Sig & Pick<RequestOptions, 'ttl'> = {}) => api<ListedAnime[]>(`/users/${id}/lists`, { ttl: MIN, ...o }),

  userStats: async (id: number, o: Sig = {}): Promise<UserStats> => {
    const opt = { ttl: 10 * MIN, ...o }
    const [genres, ratings, types] = await Promise.all([
      api<UserStats['genres']>(`/users/${id}/stats/genres`, opt),
      api<UserStats['ratings']>(`/users/${id}/stats/ratings`, opt),
      api<UserStats['types']>(`/users/${id}/stats/types-v2`, opt),
    ])
    return { genres, ratings, types }
  },

  /** Хронометраж тайтлов в каждом списке, в секундах. */
  userListTime: (id: number, o: Sig = {}) =>
    api<ListTime[]>(`/users/${id}/stats/lists`, { ttl: 10 * MIN, ...o }),

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

  /** Пачкой в списки (импорт): list и rate на каждый тайтл. */
  addToLists: (uid: number, animes: { id: number; list: ListId; rate?: number }[]) =>
    api<unknown>(`/users/${uid}/lists`, { method: 'POST', body: { animes } }),

  removeFromList: (id: number) => api<unknown>(`/anime/${id}/list`, { method: 'DELETE' }),

  setFav: (id: number, fav: boolean) => api<unknown>(`/anime/${id}/list/fav`, { method: fav ? 'PUT' : 'DELETE' }),

  rate: (id: number, rate: number) =>
    rate > 0
      ? api<unknown>(`/anime/${id}/rate`, { method: 'PUT', body: { rate } })
      : api<unknown>(`/anime/${id}/rate`, { method: 'DELETE' }),

  /**
   * Позиция в серии — как шлёт сайт: time — где остановились, times — секунды, которые
   * реально проиграли (из них сайт считает время просмотра). Сайт решает сам, досмотрена ли серия.
   */
  markWatched: (videoId: number, time: number, times: number[] = [], keepalive = false) =>
    api<unknown>(`/video/${videoId}`, { method: 'PUT', body: { time: Math.floor(time), times }, keepalive }),

  unmarkWatched: (videoId: number) => api<unknown>(`/video/${videoId}`, { method: 'DELETE' }),

  /** Последние просмотры аккаунта — с сайта и телефона тоже. */
  lastWatches: (watches: string[] = []) => api<LastWatch[]>('/video/last-watches', { query: { watches }, ttl: 0 }),

  /** Досылает аккаунту просмотры, сделанные без входа (тот же вызов есть у сайта). */
  uploadWatches: (videos: { videoId: number; time: number; date: number }[]) =>
    api<unknown>('/video', { method: 'POST', body: { videos } }),

  /** Подписка на новые серии конкретной озвучки в конкретном плеере (любая её серия). */
  subscribeDubbing: (videoId: number, on: boolean) =>
    api<boolean>(`/video/${videoId}/subscribe`, { method: on ? 'PUT' : 'DELETE' }),

  // ---- уведомления сайта ----

  notifications: (offset = 0, limit = 30) =>
    api<Notification[]>('/profile/notifications', { query: { offset, limit }, ttl: 0 }),

  readNotifications: () => api<unknown>('/profile/notifications/read', { method: 'POST' }),

  readNotification: (id: number) => api<unknown>(`/profile/notifications/${id}/read`, { method: 'POST' }),

  deleteNotification: (id: number) => api<unknown>(`/profile/notifications/${id}`, { method: 'DELETE' }),

  clearNotifications: () => api<unknown>('/profile/notifications', { method: 'DELETE' }),

  // ---- личные сообщения ----

  dialogs: (offset = 0, limit = 30) =>
    api<{ dialogs: Dialog[] }>('/dialogs', { query: { offset, limit }, ttl: 0 }),

  /** Последние сообщения диалога; startFrom — id самого старого из уже загруженных. */
  dialogMessages: (userId: number, startFrom?: number, limit = 50) =>
    api<Message[]>(`/dialogs/${userId}/messages`, { query: { limit, start_from: startFrom }, ttl: 0 }),

  sendMessage: (userId: number, message: string, answerTo?: number) =>
    api<Message>(`/dialogs/${userId}/messages`, { method: 'POST', body: { message, answer_msg_id: answerTo ?? null } }),

  readDialog: (userId: number) => api<unknown>(`/dialogs/${userId}/messages/read`, { method: 'POST' }),
}
