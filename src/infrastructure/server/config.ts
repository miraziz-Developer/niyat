export type MailConfig = { transport: 'resend'; apiKey: string; from: string } | { transport: 'console' }

export type ServerConfig = {
  databaseUrl: string
  production: boolean
  poolSize: number
  port: number
  host: string
  /** local: private-alpha dev bootstrap (never in production). email: invite-only magic links. */
  authMode: 'local' | 'email'
  /** Browser origin used in sign-in links and required on sign-in POSTs. Enables magic links when set. */
  appOrigin: string | null
  mail: MailConfig
  trustProxy: boolean
  secureCookies: boolean
}

/** Validates the environment once at startup so misconfiguration fails loudly instead of at the first login. */
export function loadConfig(env: Record<string, string | undefined>): ServerConfig {
  const production = env.NODE_ENV === 'production'
  const databaseUrl = env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL is required')

  const authMode = env.AUTH_MODE ?? (production ? 'email' : 'local')
  if (authMode !== 'local' && authMode !== 'email') throw new Error('AUTH_MODE must be local or email')
  if (production && authMode === 'local') throw new Error('AUTH_MODE=local is forbidden in production')

  const appOrigin = env.APP_ORIGIN ? parseOrigin(env.APP_ORIGIN) : null
  if (authMode === 'email' && !appOrigin) throw new Error('APP_ORIGIN is required when AUTH_MODE=email')
  if (production && appOrigin && !appOrigin.startsWith('https://')) throw new Error('APP_ORIGIN must use https in production')

  let mail: MailConfig = { transport: 'console' }
  if (env.RESEND_API_KEY) {
    if (!env.MAIL_FROM) throw new Error('MAIL_FROM is required with RESEND_API_KEY')
    mail = { transport: 'resend', apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM }
  } else if (production && appOrigin) {
    throw new Error('RESEND_API_KEY and MAIL_FROM are required in production; the console mailer would print sign-in links to logs')
  }

  const poolSize = Number(env.DATABASE_POOL_SIZE ?? 10)
  if (!Number.isInteger(poolSize) || poolSize < 2) throw new Error('DATABASE_POOL_SIZE must be an integer of at least 2')
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port')

  return {
    databaseUrl, production, poolSize, port, host: env.HOST ?? '127.0.0.1', authMode, appOrigin, mail,
    trustProxy: env.TRUST_PROXY === 'true',
    secureCookies: appOrigin?.startsWith('https://') ?? false,
  }
}

function parseOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('APP_ORIGIN must be an absolute URL') }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('APP_ORIGIN must use http or https')
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN must be an origin without a path, e.g. https://niyat.uz')
  return url.origin
}
