import { ApiError, getAuthToken, onAuthLost, setAuthToken } from '../api/client'
import { Api } from '../api/endpoints'
import type { Profile } from '../api/types'
import { load, save } from '../storage'

export const auth = $state({
  profile: null as Profile | null,
  ready: false,
})

const REFRESH_EVERY = 2 * 24 * 3600_000

function logoutLocal() {
  setAuthToken(null)
  auth.profile = null
}

onAuthLost(logoutLocal)

async function applyToken(token: string) {
  setAuthToken(token)
  save('tokenAt', Date.now())
  auth.profile = await Api.profile()
}

export async function initAuth() {
  try {
    if (!getAuthToken()) return
    // Токен живёт 2 недели, обновлять просят раз в 2–3 дня.
    if (Date.now() - load<number>('tokenAt', 0) > REFRESH_EVERY) {
      const r = await Api.refreshToken().catch(() => null)
      if (r?.token) {
        setAuthToken(r.token)
        save('tokenAt', Date.now())
      }
    }
    auth.profile = await Api.profile()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) logoutLocal()
  } finally {
    auth.ready = true
  }
}

export type LoginResult = { ok: true } | { ok: false; captcha?: boolean; message: string }

export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const r = await Api.login(email, password)
    if (!r?.token) return { ok: false, message: 'Сервер не вернул токен' }
    await applyToken(r.token)
    return { ok: true }
  } catch (e) {
    if (e instanceof ApiError) {
      // 420 — сайт хочет hCaptcha, которая на чужом домене не заработает.
      if (e.status === 420) return { ok: false, captcha: true, message: 'Сайт запросил капчу.' }
      if (e.status === 401 || e.status === 403 || e.status === 400)
        return { ok: false, message: 'Неверная почта или пароль' }
      return { ok: false, message: e.message }
    }
    return { ok: false, message: 'Нет соединения с сервером' }
  }
}

/** Проверяет кандидатов из кук окна входа через сайт; первый рабочий становится токеном. */
export async function loginWithCandidates(candidates: string[]): Promise<boolean> {
  for (const c of candidates) {
    try {
      await applyToken(c)
      return true
    } catch {
      setAuthToken(null)
    }
  }
  return false
}

export async function logout() {
  await Api.logout().catch(() => {})
  logoutLocal()
}

export async function reloadProfile() {
  auth.profile = await Api.profile()
}

/** После смены пароля сервер выдаёт новый токен — переходим на него. */
export async function changePassword(oldPassword: string, newPassword: string) {
  const r = await Api.changePassword(oldPassword, newPassword)
  if (r && r.success === false) throw new ApiError(400, 'Пароль не изменён')
  if (r?.token) {
    setAuthToken(r.token)
    save('tokenAt', Date.now())
  }
}
