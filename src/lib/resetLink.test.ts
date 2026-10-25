import { describe, expect, it } from 'vitest'
import { parseResetLink } from './resetLink'

describe('parseResetLink', () => {
  it('reads id and token from the query', () => {
    expect(parseResetLink('https://old.yummyani.me/login/reset-password?id=42&token=abcdef123456')).toEqual({
      id: 42,
      token: 'abcdef123456',
    })
  })

  it('accepts other key names and surrounding spaces', () => {
    expect(parseResetLink('  https://yummyani.me/reset?user_id=7&hash=0123456789abcdef \n')).toEqual({
      id: 7,
      token: '0123456789abcdef',
    })
  })

  it('reads params from the hash part', () => {
    expect(parseResetLink('https://yummyani.me/#/reset-password?id=5&token=tok_tok_tok')).toEqual({ id: 5, token: 'tok_tok_tok' })
  })

  it('reads id and token from the path tail', () => {
    expect(parseResetLink('https://yummyani.me/reset-password/99/eyJhbGciOi.abc')).toEqual({ id: 99, token: 'eyJhbGciOi.abc' })
  })

  it('rejects junk, missing parts and short tokens', () => {
    expect(parseResetLink('not a link')).toBeNull()
    expect(parseResetLink('https://yummyani.me/reset-password?token=abcdef123456')).toBeNull()
    expect(parseResetLink('https://yummyani.me/reset-password?id=abc&token=abcdef123456')).toBeNull()
    expect(parseResetLink('https://yummyani.me/reset-password?id=1&token=short')).toBeNull()
  })
})
