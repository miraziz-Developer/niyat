import { createHash, randomBytes } from 'node:crypto'
import type { TokenCrypto } from '../../application/auth/magic-link'

export const tokenCrypto: TokenCrypto = {
  randomToken: () => randomBytes(32).toString('base64url'),
  hash: value => createHash('sha256').update(value).digest('hex'),
}
