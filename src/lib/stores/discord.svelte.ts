// Статус «Смотрит …» в Discord. Плеер присылает, что сейчас идёт, — здесь решаем,
// показывать ли это вообще, и не дёргаем Rust одинаковыми статусами.
import { discordSet } from '../native'
import { settings } from './settings.svelte'

export interface Watching {
  title: string
  url: string
  poster?: string
  episode: string
  dubbing: string
  /** Идёт воспроизведение: start/end — когда серия началась и закончится, мс. */
  playing?: { start: number; end: number }
  paused: boolean
}

const SITE = 'https://ru.yummyani.me'
/** Своё приложение Discord, если в настройках не указано другое. */
const BUILT_IN_ID: string = import.meta.env.VITE_DISCORD_CLIENT_ID ?? ''

let last = ''
let connectedId = ''

/** Discord режет строки короче 2 и длиннее 128 символов. */
const clip = (s: string) => (s.length > 128 ? s.slice(0, 127) + '…' : s.padEnd(2, ' '))

/** Обновить статус; null — ничего не смотрим. */
export function presence(w: Watching | null) {
  const id = settings.discordRpc ? (settings.discordClientId.trim() || BUILT_IN_ID) : ''
  if (!id) {
    // Выключили или нечем подключаться — закрываем канал, Discord сам уберёт статус.
    if (connectedId) discordSet('', null)
    connectedId = ''
    last = ''
    return
  }
  const activity = w && {
    type: 3, // «Смотрит»
    details: clip(w.title),
    state: clip(`${w.paused ? 'Пауза · ' : ''}Серия ${w.episode}${w.dubbing ? ' · ' + w.dubbing : ''}`),
    ...(w.playing && { timestamps: { start: w.playing.start, end: w.playing.end } }),
    assets: {
      large_image: w.poster?.startsWith('https://') ? w.poster : 'logo',
      large_text: clip(w.title),
    },
    buttons: [{ label: 'Смотреть на YummyAnime', url: `${SITE}/catalog/item/${w.url}` }],
  }
  const key = id + JSON.stringify(activity)
  if (key === last) return
  last = key
  connectedId = id
  discordSet(id, activity)
}
