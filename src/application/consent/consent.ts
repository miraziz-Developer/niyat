import { ApplicationError } from '../intros/intro-request'

/** Bump when the terms or privacy notice change materially; members re-accept on their next action. */
export const currentTermsVersion = '2026-09-alpha'

export type Consent = { adultConfirmed: boolean; termsVersion: string | null; acceptedAt: string | null; current: boolean }

export interface ConsentGateway {
  get(actorId: string): Promise<Omit<Consent, 'current'> | null>
  accept(actorId: string, termsVersion: string): Promise<Omit<Consent, 'current'>>
}

export class ManageConsents {
  constructor(private readonly gateway: ConsentGateway) {}

  async get(actorId: string): Promise<Consent> {
    const consent = await this.gateway.get(actorId)
    if (!consent) throw new ApplicationError('not_found', 'Member was not found')
    return withCurrent(consent)
  }

  async accept(actorId: string, input: { adultConfirmed: boolean; termsVersion: string }): Promise<Consent> {
    if (!input.adultConfirmed) throw new ApplicationError('conflict', 'NIYAT private alpha is for adults only')
    if (input.termsVersion !== currentTermsVersion) throw new ApplicationError('conflict', 'These terms are out of date; reload and review the current version')
    return withCurrent(await this.gateway.accept(actorId, input.termsVersion))
  }

  async hasAcceptedCurrent(actorId: string): Promise<boolean> {
    const consent = await this.gateway.get(actorId)
    return Boolean(consent && withCurrent(consent).current)
  }
}

function withCurrent(consent: Omit<Consent, 'current'>): Consent {
  return { ...consent, current: consent.adultConfirmed && consent.termsVersion === currentTermsVersion }
}
