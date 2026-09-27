import type { Mailer, MailMessage } from '../../application/auth/magic-link'

/** Sends through the Resend HTTP API. The key stays server-side and is never logged. */
export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, private readonly from: string, private readonly fetcher: typeof fetch = fetch) {}

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error(`Mail provider rejected the message (${response.status})`)
  }
}

/** Development only: prints the message, including the sign-in link, to the server log. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (line: string) => void = console.log) {}

  async send(message: MailMessage): Promise<void> {
    this.log(`[mail] to=${message.to} subject="${message.subject}"\n${message.text}`)
  }
}
