import type { Mailer, MailMessage } from '../auth/magic-link'

export type NotificationKind = 'intro_requested' | 'intro_accepted' | 'verification_requested' | 'verification_resolved'

export type NotificationPreferences = { introRequests: boolean; introResponses: boolean; outcomes: boolean }
export const defaultPreferences: NotificationPreferences = { introRequests: true, introResponses: true, outcomes: true }

export interface PreferencesGateway {
  get(actorId: string): Promise<NotificationPreferences>
  save(actorId: string, preferences: NotificationPreferences): Promise<NotificationPreferences>
}

export class ManageNotificationPreferences {
  constructor(private readonly gateway: PreferencesGateway) {}
  get(actorId: string) { return this.gateway.get(actorId) }
  save(actorId: string, preferences: NotificationPreferences) { return this.gateway.save(actorId, preferences) }
}

/** A leased outbox row, already joined with the recipient's address and preferences. */
export type NotificationJob = { id: string; kind: NotificationKind; email: string | null; preferences: NotificationPreferences; attempts: number }

export interface NotificationQueue {
  /** Leases due rows so a crashed worker's rows become due again instead of being lost. */
  claim(limit: number): Promise<NotificationJob[]>
  finish(id: string, status: 'sent' | 'skipped' | 'failed', note?: string): Promise<void>
  retry(id: string, error: string, delaySeconds: number): Promise<void>
}

export const maxAttempts = 5

const preferenceFor: Record<NotificationKind, keyof NotificationPreferences> = {
  intro_requested: 'introRequests',
  intro_accepted: 'introResponses',
  verification_requested: 'outcomes',
  verification_resolved: 'outcomes',
}

// Messages never name the other member: identity is revealed only inside the app after consent.
const copy: Record<NotificationKind, { subject: string; body: string; action: string }> = {
  intro_requested: { subject: 'Sizga yangi intro so‘rovi keldi', body: 'Kimdir niyatingiz bilan o‘zaro foydali nuqta ko‘rdi va tanishishni so‘radi. Qabul qilsangizgina ismlar ochiladi.', action: 'So‘rovni ko‘rish' },
  intro_accepted: { subject: 'Intro so‘rovingiz qabul qilindi', body: 'Qarshi tomon rozilik berdi — endi ismlar ikki tomonga ochiq va hamkorlikni boshlashingiz mumkin.', action: 'Hamkorlikni boshlash' },
  verification_requested: { subject: 'Hamkoringiz natijani tasdiqlashingizni so‘radi', body: 'Hamkorlik natijasi tayyor. Uni tasdiqlang yoki qayta ko‘rib chiqishni so‘rang — faqat sizning qaroringiz trust signal yaratadi.', action: 'Natijani ko‘rish' },
  verification_resolved: { subject: 'Natijangiz bo‘yicha qaror chiqdi', body: 'Hamkoringiz natija bo‘yicha qaror berdi. Tafsilotlar Progress bo‘limida.', action: 'Progressni ochish' },
}

export function renderNotification(kind: NotificationKind, to: string, appOrigin: string): MailMessage {
  const { subject, body, action } = copy[kind]
  const footer = 'Bildirishnomalarni Trust markazida o‘chirib qo‘yishingiz mumkin.'
  return {
    to,
    subject,
    text: `${body}\n\n${action}: ${appOrigin}\n\n${footer}`,
    html: `<p>${body}</p><p><a href="${appOrigin}" style="display:inline-block;padding:12px 20px;background:#c8ff62;color:#10130d;border-radius:8px;font-weight:700;text-decoration:none">${action}</a></p><p style="color:#666">${footer}</p>`,
  }
}

export class NotificationDispatcher {
  constructor(private readonly queue: NotificationQueue, private readonly mailer: Mailer, private readonly appOrigin: string) {}

  /** Processes one batch; returns how many rows were handled so the caller can drain a backlog. */
  async runOnce(batchSize = 20): Promise<number> {
    const jobs = await this.queue.claim(batchSize)
    for (const job of jobs) {
      if (!job.email) { await this.queue.finish(job.id, 'skipped', 'no email identity'); continue }
      if (!job.preferences[preferenceFor[job.kind]]) { await this.queue.finish(job.id, 'skipped', 'disabled by recipient'); continue }
      try {
        await this.mailer.send(renderNotification(job.kind, job.email, this.appOrigin))
        await this.queue.finish(job.id, 'sent')
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
        // `attempts` already counts this lease.
        if (job.attempts >= maxAttempts) await this.queue.finish(job.id, 'failed', message)
        else await this.queue.retry(job.id, message, 60 * 2 ** job.attempts)
      }
    }
    return jobs.length
  }
}
