import { useEffect, useState } from 'react'
import type { NetworkClient } from '../application/ports/network-client'
import { describeError } from './shared/describe-error'

const resendCooldownSeconds = 30

/** Invite-only email sign-in. The server answers the same way for any address, so the copy never claims the email is invited. */
export function LoginPanel({ network, notice }: { network: NetworkClient; notice?: string }) {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function send(address: string) {
    setSending(true)
    setError('')
    try {
      await network.requestMagicLink(address)
      setSentTo(address)
      setCooldown(resendCooldownSeconds)
    } catch (caught) {
      setError(describeError(caught, 'Havola yuborilmadi. Qayta urinib ko‘ring.'))
    } finally {
      setSending(false)
    }
  }

  if (sentTo) {
    return (
      <div className="login-panel" role="status" aria-live="polite">
        <span className="kicker">Pochtangizni tekshiring</span>
        <h2>Havola yuborildi.</h2>
        <p><b>{sentTo}</b> manzili taklif ro‘yxatida bo‘lsa, bir necha daqiqada kirish havolasi keladi. Havola 15 daqiqa amal qiladi va faqat bir marta ishlaydi.</p>
        <p className="login-hint">Xat kelmadimi? “Spam” papkasini tekshiring yoki taklif qilingan emailingizni kiritganingizga ishonch hosil qiling.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="login-actions">
          <button className="quiet-button" disabled={cooldown > 0 || sending} onClick={() => void send(sentTo)}>{cooldown > 0 ? `Qayta yuborish · ${cooldown}s` : sending ? 'Yuborilmoqda…' : 'Qayta yuborish'}</button>
          <button className="link-button" onClick={() => { setSentTo(null); setError('') }}>Boshqa email</button>
        </div>
      </div>
    )
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  return (
    <form className="login-panel" onSubmit={(event) => { event.preventDefault(); if (valid) void send(email.trim()) }} noValidate>
      <span className="kicker">Private alpha · faqat taklif bilan</span>
      <h2>Kirish</h2>
      <p>Taklif qilingan emailingizni kiriting — parol kerak emas, bir martalik kirish havolasini yuboramiz.</p>
      {notice && <p className="form-error" role="alert">{notice}</p>}
      <label className="field">
        <span>Email</span>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="siz@example.uz" required />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary full" disabled={!valid || sending}>{sending ? 'Yuborilmoqda…' : 'Kirish havolasini yuborish'} <span aria-hidden="true">→</span></button>
      <p className="login-hint">Ismingiz va kontaktingiz faqat ikki tomon roziligidan keyin ochiladi.</p>
    </form>
  )
}
