import { load, save } from '../storage'

export interface Settings {
  /** Язык контента API. */
  lang: 'ru' | 'en' | 'uk'
  /** Публичный токен приложения (X-Application). Пусто — берётся из сборки. */
  appToken: string
  autoSkipOpening: boolean
  autoSkipEnding: boolean
  autoNext: boolean
  resume: boolean
  notifyEpisodes: boolean
  /** Последняя выбранная озвучка — подставляется в новых тайтлах, если есть. */
  preferredDubbing: string
  preferredPlayer: string
  /** Экономия трафика: постеры меньшего размера, без фоновых баннеров. */
  dataSaver: boolean
  reduceMotion: boolean
}

const defaults: Settings = {
  lang: 'ru',
  appToken: '',
  autoSkipOpening: false,
  autoSkipEnding: false,
  autoNext: true,
  resume: true,
  notifyEpisodes: true,
  preferredDubbing: '',
  preferredPlayer: '',
  dataSaver: false,
  reduceMotion: false,
}

export const settings: Settings = $state({ ...defaults, ...load<Partial<Settings>>('settings', {}) })

$effect.root(() => {
  $effect(() => {
    save('settings', $state.snapshot(settings))
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion)
  })
})
