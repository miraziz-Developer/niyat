import { describe, expect, it } from 'vitest'
import { loadConfig } from './config'

const base = { DATABASE_URL: 'postgresql://x' }

describe('server configuration', () => {
  it('defaults to the local bootstrap in development with a console mailer', () => {
    expect(loadConfig(base)).toMatchObject({ authMode: 'local', appOrigin: null, mail: { transport: 'console' }, secureCookies: false })
  })

  it('requires email auth, an https origin and a real mailer in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', AUTH_MODE: 'local' })).toThrow('forbidden in production')
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow('APP_ORIGIN is required')
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'http://niyat.uz' })).toThrow('https')
    expect(() => loadConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://niyat.uz' })).toThrow('RESEND_API_KEY')
    expect(loadConfig({ ...base, NODE_ENV: 'production', APP_ORIGIN: 'https://niyat.uz/', RESEND_API_KEY: 're_x', MAIL_FROM: 'NIYAT <kirish@niyat.uz>', TRUST_PROXY: 'true' }))
      .toMatchObject({ authMode: 'email', appOrigin: 'https://niyat.uz', secureCookies: true, trustProxy: true, mail: { transport: 'resend' } })
  })

  it('rejects origins with paths and invalid numbers', () => {
    expect(() => loadConfig({ ...base, APP_ORIGIN: 'https://niyat.uz/app' })).toThrow('without a path')
    expect(() => loadConfig({ ...base, DATABASE_POOL_SIZE: '1' })).toThrow('DATABASE_POOL_SIZE')
    expect(() => loadConfig({ ...base, RESEND_API_KEY: 're_x' })).toThrow('MAIL_FROM')
  })
})
