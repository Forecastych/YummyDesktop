// Подписки на озвучку на сайте (уведомления о новых сериях приходят от сервера).
// API не говорит, подписан ли пользователь, поэтому состояние помним сами.
import { Api } from '../api/endpoints'
import { load, save } from '../storage'

const subs: Record<string, true> = $state(load('dubsubs', {}))

const key = (animeId: number, dubbing: string, player: string) => `${animeId}|${dubbing}|${player}`

export function isDubSubscribed(animeId: number, dubbing: string, player: string) {
  return !!subs[key(animeId, dubbing, player)]
}

/** Подписка ставится на любую серию озвучки в этом плеере. */
export async function toggleDubSub(animeId: number, dubbing: string, player: string, videoId: number) {
  const k = key(animeId, dubbing, player)
  const on = !subs[k]
  await Api.subscribeDubbing(videoId, on)
  if (on) subs[k] = true
  else delete subs[k]
  save('dubsubs', $state.snapshot(subs))
}
