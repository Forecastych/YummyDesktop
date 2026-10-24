import { imgCacheSetLimit, onNative, setCloseToTray, setZoom, traySetNotify } from '../native'
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
  /** Громкость своих кнопок плеера — одна на все плееры и серии. */
  playerVolume: number
  playerMuted: boolean
  /** Системные уведомления: новые серии из «Подписок» и уведомления сайта. Дублируется галочкой в трее. */
  notifyEpisodes: boolean
  /** Уведомление Windows о личном сообщении, если окно не в фокусе или открыт другой диалог. */
  notifyMessages: boolean
  /** Статус «Смотрит …» в Discord. */
  discordRpc: boolean
  /** ID приложения Discord (Developer Portal). Пусто — берётся из сборки. */
  discordClientId: string
  /** Крестик прячет окно в трей — приложение продолжает работать и присылать уведомления. */
  closeToTray: boolean
  /** Последняя выбранная озвучка — подставляется в новых тайтлах, если есть. */
  preferredDubbing: string
  preferredPlayer: string
  /** Экономия трафика: постеры меньшего размера, без фоновых баннеров. */
  dataSaver: boolean
  reduceMotion: boolean
  /** Прозрачность «жидкого стекла» (кнопки плеера, всплывашки), %: 100 — почти прозрачное. */
  glassClarity: number
  /** Масштаб интерфейса: 1 — как в браузере на 100%. */
  uiScale: number
  /** Потолок дискового кэша картинок, МБ. Сверх него удаляются давно не открывавшиеся. */
  imageCacheMb: number
}

const defaults: Settings = {
  lang: 'ru',
  appToken: '',
  autoSkipOpening: false,
  autoSkipEnding: false,
  autoNext: true,
  resume: true,
  playerVolume: 1,
  playerMuted: false,
  notifyEpisodes: true,
  notifyMessages: true,
  discordRpc: true,
  discordClientId: '',
  closeToTray: true,
  preferredDubbing: '',
  preferredPlayer: '',
  dataSaver: false,
  reduceMotion: false,
  glassClarity: 65,
  uiScale: 1.2,
  imageCacheMb: 300,
}

export const GLASS_CLARITY = { min: 10, max: 90, def: defaults.glassClarity }

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
  $effect(() => {
    setZoom(settings.uiScale)
  })
  $effect(() => {
    // Прозрачнее — меньше тонировки и размытия. 65% — прежний вид: тон 0.35, размытие 14px.
    const k = (100 - settings.glassClarity) / 100
    const root = document.documentElement.style
    root.setProperty('--glass-tint', k.toFixed(2))
    root.setProperty('--glass-blur', `${Math.round(6 + k * 23)}px`)
  })
  $effect(() => {
    imgCacheSetLimit(settings.imageCacheMb)
  })
})

export const UI_SCALES = [1, 1.1, 1.2, 1.3, 1.4, 1.5]
export const IMAGE_CACHE_SIZES = [100, 300, 500, 1000]

/** Ctrl+= / Ctrl+- — шаг по UI_SCALES, Ctrl+0 — по умолчанию. */
export function stepScale(dir: -1 | 0 | 1) {
  if (dir === 0) return void (settings.uiScale = defaults.uiScale)
  const i = UI_SCALES.findIndex((s) => s >= settings.uiScale - 0.001)
  const cur = i < 0 ? UI_SCALES.length - 1 : i
  settings.uiScale = UI_SCALES[Math.max(0, Math.min(UI_SCALES.length - 1, cur + dir))]
}

onNative<boolean>('tray-notify', (on) => (settings.notifyEpisodes = on))
