// Безопасная обёртка над localStorage: квота и битый JSON не должны ронять UI.

const PREFIX = 'yd.'

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Квота кончилась — чистим кэш ответов API, пользовательские данные не трогаем.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith(PREFIX + 'cache:')) localStorage.removeItem(k)
      }
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* ничего не поделать */
    }
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}
