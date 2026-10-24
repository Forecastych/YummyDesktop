import {
  Ban,
  Bell,
  BellOff,
  CircleCheck,
  CirclePause,
  CirclePlay,
  Clock,
  Copy,
  ExternalLink,
  Heart,
  HeartOff,
  LogIn,
  Trash2,
} from '@lucide/svelte'
import { LISTS, type AnimeShort, type ListId } from './api/types'
import { openExternal } from './native'
import { go } from './router.svelte'
import { auth } from './stores/auth.svelte'
import { isFollowed, toggleFollow } from './stores/follows.svelte'
import { isFav, listOf, setListFor, toggleFavFor } from './stores/lists.svelte'
import type { MenuEntry, MenuItem } from './stores/menu.svelte'
import { toast } from './stores/toast.svelte'

const SITE = 'https://ru.yummyani.me'

/** Иконки списков — как в выпадашке «Добавить в список» на сайте. */
const LIST_ICON: Record<ListId, MenuItem['icon']> = {
  0: CirclePlay,
  1: Clock,
  2: CircleCheck,
  3: Ban,
  5: CirclePause,
}

/** Пункты ПКМ по тайтлу: «Добавить в список», избранное, подписка, ссылки. */
export function animeMenu(a: AnimeShort): MenuEntry[] {
  const siteUrl = `${SITE}/catalog/item/${a.anime_url}`
  const items: MenuEntry[] = [{ title: a.title }, { group: 'Добавить в список' }]
  const logged = !!auth.profile
  const cur = logged ? listOf(a.anime_id) : null
  for (const l of LISTS) {
    items.push({
      label: l.title,
      icon: LIST_ICON[l.id],
      checked: cur === l.id,
      // Без входа списков нет — ведём на страницу входа, а не прячем пункты молча.
      action: logged
        ? () => setListFor(a, cur === l.id ? null : l.id)
        : () => {
            toast('Списки доступны после входа')
            go('/login')
          },
    })
  }
  if (cur != null) items.push({ label: 'Убрать из списков', icon: Trash2, danger: true, action: () => setListFor(a, null) })
  items.push('sep')
  if (logged) {
    const fav = isFav(a.anime_id)
    items.push({ label: fav ? 'Убрать из избранного' : 'В избранное', icon: fav ? HeartOff : Heart, action: () => toggleFavFor(a) })
  } else {
    items.push({ label: 'Войти, чтобы вести списки', icon: LogIn, action: () => go('/login') })
  }
  const followed = isFollowed(a.anime_id)
  items.push(
    {
      label: followed ? 'Не следить за сериями' : 'Следить за новыми сериями',
      icon: followed ? BellOff : Bell,
      action: () => {
        toggleFollow(a)
        toast(followed ? 'Подписка снята' : 'Пришлём уведомление о новой серии')
      },
    },
    'sep',
    { label: 'Открыть', action: () => go(`/anime/${a.anime_url}`) },
    { label: 'Открыть на сайте', icon: ExternalLink, action: () => openExternal(siteUrl) },
    {
      label: 'Скопировать ссылку',
      icon: Copy,
      action: () =>
        navigator.clipboard.writeText(siteUrl).then(
          () => toast('Ссылка скопирована'),
          () => toast('Не удалось скопировать', 'error'),
        ),
    },
  )
  return items
}
