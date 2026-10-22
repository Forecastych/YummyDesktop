import { onNative, setCloseToTray, traySetNotify } from '../native'
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
  /** Системные уведомления: новые серии из «Подписок» и уведомления сайта. Дублируется галочкой в трее. */
  notifyEpisodes: boolean
  /** Крестик прячет окно в трей — приложение продолжает работать и присылать уведомления. */
  closeToTray: boolean
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
  closeToTray: true,
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
  $effect(() => {
    traySetNotify(settings.notifyEpisodes)
  })
  $effect(() => {
    setCloseToTray(settings.closeToTray)
  })
})

onNative<boolean>('tray-notify', (on) => (settings.notifyEpisodes = on))
