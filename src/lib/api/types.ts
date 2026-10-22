// Типы ответов api.yani.tv — только поля, которые реально использует клиент.

export interface Posters {
  small?: string
  medium?: string
  big?: string
  huge?: string
  mega?: string
  fullsize?: string
}

export interface Ref {
  id: number
  title: string
  url?: string
  alias?: string
}

export interface AnimeType {
  name: string
  value: number
  shortname: string
  alias: string
}

export interface AnimeStatus {
  value: 0 | 1 | 2
  title: string
  alias: 'released' | 'ongoing' | 'announcement'
}

export interface Episodes {
  count: number
  aired: number
  next_date: number
  prev_date: number
}

export interface UserListState {
  is_fav: boolean
  list: { id: ListId; title: string; href: string } | null
}

export interface AnimeShort {
  anime_id: number
  anime_url: string
  title: string
  description?: string
  poster: Posters
  rating?: { average: number; counters: number; [k: string]: number } | number
  year?: number
  type?: AnimeType
  anime_status?: AnimeStatus
  episodes?: Episodes
  genres?: (Ref & { alias: string })[]
  min_age?: { value: number; title: string; title_long: string }
  views?: number
  season?: number
  top?: { global: number; category: number }
}

export interface VideoData {
  player: string
  dubbing: string
  player_id: number
}

export interface Skip {
  time: number
  length: number
}

export interface Video {
  video_id: number
  data: VideoData
  number: string
  index: number
  date: number
  iframe_url: string
  duration: number
  views: number
  skips: { opening: Skip | null; ending: Skip | null }
}

export interface ViewingOrderItem extends AnimeShort {
  data: { text: string; id: number; index: number }
}

export interface Anime extends AnimeShort {
  duration?: number
  other_titles?: string[]
  translates?: { value: number; title: string; href: string }[]
  creators?: Ref[]
  studios?: Ref[]
  original?: string
  viewing_order?: ViewingOrderItem[]
  videos?: Video[]
  comments_count?: number
  reviews_count?: number
  blocked_in?: string[]
  remote_ids?: Record<string, number | string>
  user?: { list?: UserListState; rating?: number }
}

export interface FeedVideo {
  ep_title: string
  anime_id: number
  anime_url: string
  title: string
  poster: Posters
  date: number
  dub_title: string
  player_title: string
  video_id: number
}

export interface PostCategory {
  title: string
  id: number
  uri: string
}

export interface UserShort {
  id: number
  nickname: string
  avatars: { small?: string; big?: string; full?: string }
  roles?: string[]
}

export interface PostShort {
  id: number
  title: string
  created_at: number
  category: PostCategory
  content_preview?: string
  preview_image?: string
  user: UserShort
}

export interface Post extends PostShort {
  content: string
  views: number
  animes?: AnimeShort[]
}

export interface Feed {
  announcements: AnimeShort[]
  recommends: AnimeShort[]
  last_watches: unknown[]
  top_carousel: { season: number; year: number; items: AnimeShort[] }
  new: AnimeShort[]
  new_videos: FeedVideo[]
  schedule: AnimeShort[]
  posts: { items: PostShort[]; types: PostCategory[] }
  blogger?: { videos: { items: BloggerVideo[]; categories: VideoCategory[] }; people: { items: UserShort[] } }
  collections?: Collection[]
}

export interface VideoCategory {
  id: string
  title: string
}

/** Ролик видеоблогера сайта (сейчас все — встраиваемый YouTube). */
export interface BloggerVideo {
  id: number
  title: string
  has_spoiler: boolean
  creator: UserShort
  descriptions?: { big?: string; small?: string }
  category: VideoCategory
  previews: { small?: string; big?: string }
  iframe_url: string
  publish_date: number
  likes?: Likes
  views: number
  language?: string
  comments_count?: number
  animes?: AnimeShort[]
}

export interface Genre {
  title: string
  href: string
  value: number
  group_id: number
}

export interface GenreList {
  genres: Genre[]
  groups: { title: string; id: number }[]
}

export interface Catalog {
  genres: GenreList
  types: { count: number; type: AnimeType }[]
}

export interface Comment {
  id: number
  name: string
  user_id: number
  avatars: { small?: string; big?: string }
  text: string
  time: number
  likes: number
  dislikes: number
  vote: -1 | 0 | 1
  parent_id: number
  children_count: number
  deleted_at: number
  roles: string[]
}

export interface Profile {
  id: number
  nickname: string
  avatars: { small?: string; big?: string; full?: string }
  banner?: { cropped?: string; full?: string }
  about?: string
  notifications?: { count: number }
  messages?: { unread_count: number }
}

/** 0 смотрю, 1 в планах, 2 просмотрено, 3 брошено, 5 отложено. */
export type ListId = 0 | 1 | 2 | 3 | 5

export const LISTS: { id: ListId; title: string }[] = [
  { id: 0, title: 'Смотрю' },
  { id: 1, title: 'В планах' },
  { id: 2, title: 'Просмотрено' },
  { id: 5, title: 'Отложено' },
  { id: 3, title: 'Брошено' },
]

export interface Likes {
  likes: number
  dislikes: number
  vote?: -1 | 0 | 1
}

export interface Collection {
  id: number
  title: string
  description: string
  language: 'ru' | 'en' | 'uk'
  public: boolean
  create_date: number
  views?: number
  comments_count?: number
  likes: Likes
  owner: UserShort
  poster_previews?: Posters[]
  animes: AnimeShort[]
}

export interface CollectionInput {
  title: string
  description: string
  public: boolean
  anime_ids: number[]
  language?: 'ru' | 'en' | 'uk'
}

/** Элемент «оценившие X смотрели»: голоса пользователей за связку. */
export type UserRecommendation = AnimeShort & { likes?: Likes }

// ---- пользователи ----

export interface User extends UserShort {
  about?: string
  banner?: { cropped?: string; full?: string }
  register_date: number
  last_online: number
  days_online?: number
  banned?: boolean
  sex?: 0 | 1 | 2
  oldNicknames?: string[]
  friend_status?: string | null
  watches?: {
    /** spent_time — секунды просмотра на сайте по типу аниме. */
    sum: { alias: string; name: string; shortname: string; spent_time: number }[]
    /** Последние 180 дней, по суткам. duration — секунды. */
    history: { when: number; duration: number; ep_count: number }[]
  }
}

/** Аниме из /users/{id}/lists — с отметкой, в каком оно списке. */
export type ListedAnime = AnimeShort & { user?: { list?: UserListState; rating?: number } }

export interface UserStats {
  genres: (Ref & { count: number })[]
  ratings: { rating: number; count: number }[]
  /** count — секунды хронометража тайтлов этого типа в списках. */
  types: { count: number; type: AnimeType }[]
}

export type FriendList = 'friends' | 'followers' | 'following'

export type Friend = UserShort & { last_online?: number; list?: string }

// ---- рецензии ----

export interface Review {
  review_id: number
  anime_id: number
  user_id: number
  create_date: number
  update_date?: number
  rating: { average: number; category: Record<string, number> }
  text_preview: string
  text_html?: string
  views: number
  likes?: Likes
  total_likes?: number
  comments_count?: number
  author: UserShort
  anime?: AnimeShort
}

// ---- видеоблогеры ----

/** Ответ `/bloggers/{id}`. categories — общий список категорий сайта, а не только те, где у блогера есть ролики. */
export interface Blogger extends UserShort {
  /** Число подписчиков. */
  subscriptions: number
  is_subscribed: boolean
  videos_count: number
  categories: VideoCategory[]
}
