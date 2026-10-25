// Ссылка из письма «восстановление пароля»: в ней id пользователя и токен сброса,
// их ждёт /profile/reset-password-verify. Точный вид ссылки сайт не документирует,
// поэтому ищем и в query, и в #-части, и в хвосте пути (…/<id>/<token>).

export interface ResetLink {
  id: number
  token: string
}

const ID_KEYS = ['id', 'user_id', 'userId', 'uid', 'user']
const TOKEN_KEYS = ['token', 'reset_token', 'hash', 'code', 't']

function fromParams(p: URLSearchParams): ResetLink | null {
  const id = ID_KEYS.map((k) => p.get(k)).find((v) => v && /^\d+$/.test(v))
  const token = TOKEN_KEYS.map((k) => p.get(k)).find((v) => v && v.length >= 8)
  return id && token ? { id: Number(id), token } : null
}

export function parseResetLink(raw: string): ResetLink | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  const hash = url.hash.slice(1)
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash
  const hit = fromParams(url.searchParams) ?? fromParams(new URLSearchParams(fromHash))
  if (hit) return hit
  // Путь вида /reset-password/123/abcdef… — число, за ним длинный токен.
  const parts = url.pathname.split('/').filter(Boolean)
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^\d+$/.test(parts[i]) && parts[i + 1].length >= 8) return { id: Number(parts[i]), token: decodeURIComponent(parts[i + 1]) }
  }
  return null
}
