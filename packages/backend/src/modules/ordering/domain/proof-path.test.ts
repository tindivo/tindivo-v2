import { describe, expect, it } from 'vitest'
import { proofObjectPath } from './proof-path'

const base = { userId: 'u1', orderId: 'o1', attempt: 2, now: 1_700_000_000_000 }

describe('proofObjectPath', () => {
  it('arma <usuario>/<pedido>/attempt-<n>-<ts>.<ext>', () => {
    expect(proofObjectPath({ ...base, contentType: 'image/jpeg' })).toBe(
      'u1/o1/attempt-2-1700000000000.jpg',
    )
  })

  it('la extensión sale del tipo', () => {
    const ext = (contentType: Parameters<typeof proofObjectPath>[0]['contentType']) =>
      proofObjectPath({ ...base, contentType })
        .split('.')
        .pop()
    expect(ext('image/png')).toBe('png')
    expect(ext('image/webp')).toBe('webp')
    expect(ext('image/heic')).toBe('heic')
    expect(ext('image/heif')).toBe('heif')
  })
})
