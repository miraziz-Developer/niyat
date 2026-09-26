import { describe, expect, it } from 'vitest'
import { NetworkError } from '../../application/ports/network-client'
import { describeError } from './describe-error'

describe('describeError', () => {
  it('prefers specific codes, then status, then a transport message', () => {
    expect(describeError(new NetworkError(429, 'rate_limited', 'x'))).toContain('limit')
    expect(describeError(new NetworkError(403, 'forbidden', 'x'))).toBe('Bu amalga ruxsatingiz yo‘q.')
    expect(describeError(new NetworkError(503, 'unavailable', 'x'))).toContain('Serverda')
    expect(describeError(new TypeError('Failed to fetch'))).toContain('aloqa yo‘q')
    expect(describeError(new Error('boom'), 'Saqlanmadi')).toBe('Saqlanmadi')
  })
})
