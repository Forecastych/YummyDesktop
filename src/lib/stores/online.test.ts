import { flushSync } from 'svelte'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Свой счётчик, не vi.fn: vitest сбрасывает историю моков перед каждым тестом.
const calls = { n: 0 }
const markOnline = () => (calls.n++, Promise.resolve())
const handlers: Record<string, () => void> = {}

vi.mock('../api/endpoints', () => ({ Api: { markOnline } }))
vi.mock('../native', () => ({
  onNative: (event: string, cb: () => void) => {
    handlers[event] = cb
    return Promise.resolve(() => {})
  },
}))
vi.mock('./auth.svelte', () => ({ auth: { profile: { id: 1 } } }))

const MIN = 60_000

// Ждём не только таймер, но и await внутри ping, после которого ставится следующий круг.
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('online heartbeat', () => {
  beforeAll(async () => {
    vi.useFakeTimers()
    const { startOnline } = await import('./online.svelte')
    startOnline()
    flushSync()
    await advance(0)
  })

  it('pings right away and every 4.5 minutes while the window is shown', async () => {
    expect(calls.n).toBe(1)
    await advance(4.5 * MIN)
    expect(calls.n).toBe(2)
  })

  it('stays silent while the window is in the tray', async () => {
    handlers['tray-hidden']()
    await advance(20 * MIN)
    expect(calls.n).toBe(2)
  })

  it('pings again as soon as the window comes back', async () => {
    handlers['tray-shown']()
    await advance(0)
    expect(calls.n).toBe(3)
    // Быстрый повторный показ не дублирует отметку.
    handlers['tray-hidden']()
    handlers['tray-shown']()
    await advance(0)
    expect(calls.n).toBe(3)
    await advance(4.5 * MIN)
    expect(calls.n).toBe(4)
  })
})
