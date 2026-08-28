import { describe, expect, it } from 'vitest'
import {
  PlaintextKeyRefused,
  hasPlaintextFallback,
  packSecret,
  unpackSecret,
  type SecretBox
} from '@shared/secrets'

function memoryBox(available: boolean): SecretBox {
  const store = new Map<string, string>()
  return {
    isAvailable: () => available,
    encrypt: (value: string) => {
      const token = `enc:${value}`
      store.set(token, value)
      return token
    },
    decrypt: (enc: string) => {
      const value = store.get(enc)
      if (value === undefined) throw new Error('missing')
      return value
    }
  }
}

describe('secret packing', () => {
  it('refuses to pack a key when OS encryption is unavailable', () => {
    expect(() => packSecret('sk-test', memoryBox(false))).toThrow(PlaintextKeyRefused)
  })

  it('never unpacks a plaintext fallback field', () => {
    const box = memoryBox(true)
    expect(unpackSecret({ plain: 'sk-leaked' }, box)).toBe('')
    expect(hasPlaintextFallback({ plain: 'sk-leaked' })).toBe(true)
    const packed = packSecret('sk-real', box)
    expect(packed.plain).toBeUndefined()
    expect(unpackSecret(packed, box)).toBe('sk-real')
  })
})
