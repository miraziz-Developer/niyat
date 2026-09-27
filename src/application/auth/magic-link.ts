import { ApplicationError } from '../intros/intro-request'

export type IssueResult = 'issued' | 'not_eligible' | 'rate_limited'

export interface MagicLinkGateway {
  /** Stores a token hash when the email is invited or registered and under its hourly limit. */
  issue(email: string, tokenHash: string, expiresAt: Date, hourlyLimit: number): Promise<IssueResult>
  /** Consumes an unexpired, unused token and returns the member it signs in (creating the account on first use). */
  consume(tokenHash: string): Promise<{ userId: string } | null>
}

export type MailMessage = { to: string; subject: string; text: string; html: string }

export interface Mailer {
  send(message: MailMessage): Promise<void>
}

export interface SessionIssuer<Created> {
  create(userId: string): Promise<Created>
}

export type TokenCrypto = { randomToken(): string; hash(value: string): string }

export type MagicLinkOptions = {
  appOrigin: string
  ttlMinutes: number
  hourlyLimit: number
  now?: () => number
  /** Receives delivery failures; they are never surfaced to the requester. */
  reportError?: (error: unknown) => void
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase()
  return email.length <= 254 && emailPattern.test(email) ? email : null
}

export class ManageMagicLinks<Created> {
  constructor(
    private readonly gateway: MagicLinkGateway,
    private readonly mailer: Mailer,
    private readonly sessions: SessionIssuer<Created>,
    private readonly crypto: TokenCrypto,
    private readonly options: MagicLinkOptions,
  ) {}

  /**
   * Resolves the same way whether or not the email may sign in, so the endpoint cannot be used
   * to discover who is invited. Only malformed input is reported.
   */
  async request(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail)
    if (!email) throw new ApplicationError('conflict', 'Email address is invalid')
    const token = this.crypto.randomToken()
    const expiresAt = new Date((this.options.now?.() ?? Date.now()) + this.options.ttlMinutes * 60_000)
    const result = await this.gateway.issue(email, this.crypto.hash(token), expiresAt, this.options.hourlyLimit)
    if (result !== 'issued') return
    const link = `${this.options.appOrigin}/?login_token=${token}`
    // Delivery is not awaited: waiting on the mail provider would make invited addresses measurably slower
    // (and a provider outage would turn their 202 into a 500), both of which reveal who is invited.
    void this.mailer.send({
      to: email,
      subject: 'NIYAT’ga kirish havolasi',
      text: `Salom!\n\nNIYAT’ga kirish uchun quyidagi havolani oching (${this.options.ttlMinutes} daqiqa amal qiladi, faqat bir marta ishlaydi):\n\n${link}\n\nAgar bu so‘rovni siz yubormagan bo‘lsangiz, xatga e’tibor bermang — hisobingizga hech kim kirmaydi.`,
      html: `<p>Salom!</p><p>NIYAT’ga kirish uchun tugmani bosing. Havola ${this.options.ttlMinutes} daqiqa amal qiladi va faqat bir marta ishlaydi.</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#c8ff62;color:#10130d;border-radius:8px;font-weight:700;text-decoration:none">NIYAT’ga kirish</a></p><p style="color:#666">Agar bu so‘rovni siz yubormagan bo‘lsangiz, xatga e’tibor bermang — hisobingizga hech kim kirmaydi.</p>`,
    }).catch(error => this.options.reportError?.(error))
  }

  async verify(token: string): Promise<Created> {
    if (!tokenPattern.test(token)) throw invalidLink()
    const consumed = await this.gateway.consume(this.crypto.hash(token))
    if (!consumed) throw invalidLink()
    return this.sessions.create(consumed.userId)
  }
}

function invalidLink() {
  return new ApplicationError('forbidden', 'This sign-in link is invalid, expired or already used')
}
