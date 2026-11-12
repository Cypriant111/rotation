import { describe, expect, it } from 'vitest'
import { detectPlatform } from './install'

describe('detectPlatform', () => {
  it('recognises iPhone and iPadOS (desktop UA with touch)', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5)).toBe('ios')
  })

  it('treats a Mac without touch as other', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0)).toBe('other')
  })

  it('recognises Android', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe('android')
  })
})
