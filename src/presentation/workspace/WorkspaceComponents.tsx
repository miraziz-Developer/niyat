import { useState, type ReactNode } from 'react'
import type { Match } from '../../domain/model/entities'
import { Dialog } from '../shared/Dialog'
import { MutualExchange, PersonSummary } from '../shared/MatchSummary'

export function MiniMark() {
  return <span className="mini-mark" aria-hidden="true">✦</span>
}

export function SectionTitle({ code, title, description, action }: { code: string; title: string; description: string; action?: ReactNode }) {
  return <header className="product-heading"><div><span className="kicker">{code}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

export function CompactMatch({ match, onClick }: { match: Match; onClick: () => void }) {
  return (
    <button className="compact-match" onClick={onClick} aria-label={`${match.person.name}, moslik ${match.score}%. Batafsil ko‘rish`}>
      <span className="person-avatar" style={{ background: match.person.accent }} aria-hidden="true">{match.person.initials}</span>
      <div><b>{match.person.name}</b><small>{match.person.role} · {match.person.city}</small></div>
      <p>{match.youReceive[0] || 'yangi perspektiva'} <i aria-hidden="true">⇄</i> {match.theyReceive[0] || 'yangi aloqa'}</p>
      <strong>{match.score}<small>%</small></strong>
    </button>
  )
}

export const introScopes = ['15 daqiqalik tanishuv', 'Maslahat so‘rash', 'Hamkorlikni o‘rganish'] as const

type DrawerProps = {
  match: Match
  alreadySent: boolean
  busy: boolean
  onRequest: (scope: string, message: string) => void
  onBlock: () => void
  onReport: (reason: string) => void
  /** Server mode only: records whether the match was useful. */
  onRate?: (useful: boolean) => void
  onClose: () => void
}

const reportReasons = [
  { code: 'spam', label: 'Spam yoki reklama' },
  { code: 'fake', label: 'Soxta niyat' },
  { code: 'inappropriate', label: 'Nomaqbul kontent' },
]

export function MatchDrawer({ match, alreadySent, busy, onRequest, onBlock, onReport, onRate, onClose }: DrawerProps) {
  const [scope, setScope] = useState<string>(introScopes[0])
  const [message, setMessage] = useState(match.opening)
  const [confirm, setConfirm] = useState<'none' | 'block' | 'report'>('none')
  const anonymous = match.person.initials === '?'

  return (
    <Dialog backdropClassName="drawer-backdrop" panelClassName="match-drawer" label={`${match.person.name} bilan moslik`} onClose={onClose}>
      <button aria-label="Yopish" className="close" onClick={onClose}>×</button>
      <span className="kicker">Moslik kuchi · {match.score}%</span>
      <PersonSummary person={match.person} large />
      <h3>{match.person.intent.title}</h3>
      {match.person.intent.outcome && <p className="drawer-outcome">{match.person.intent.outcome}</p>}
      <MutualExchange match={match} compact />
      <div className="drawer-section">
        <h4>Nega mos</h4>
        <div className="reason-list">{match.reasons.length ? match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>) : <span>Aniq almashinuv bor</span>}</div>
      </div>
      {match.limitations && match.limitations.length > 0 && (
        <div className="drawer-section">
          <h4>E’tibor bering</h4>
          <div className="limitation-list">{match.limitations.map((limitation) => <span key={limitation}>△ {limitation}</span>)}</div>
        </div>
      )}

      {onRate && (
        <div className="feedback-row" role="group" aria-label="Bu kesishma foydalimi?">
          <span>Bu kesishma foydalimi?</span>
          <button aria-pressed={match.feedback === true} className={match.feedback === true ? 'active' : ''} onClick={() => onRate(true)}>Ha, foydali</button>
          <button aria-pressed={match.feedback === false} className={match.feedback === false ? 'active' : ''} onClick={() => onRate(false)}>Yo‘q</button>
        </div>
      )}

      {alreadySent ? (
        <div className="sent-state" role="status"><span aria-hidden="true">✓</span><span>So‘rov yuborilgan. Qarshi tomon qabul qilsa, ismlar ikki tomonga ochiladi va hamkorlik boshlash mumkin bo‘ladi.</span></div>
      ) : (
        <form className="composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) onRequest(scope, message.trim()) }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="kicker" style={{ marginBottom: 10 }}>Intro maqsadi</legend>
            <div className="scope-options">
              {introScopes.map(option => <label key={option}><input type="radio" name="intro-scope" checked={scope === option} onChange={() => setScope(option)} /><span>{option}</span></label>)}
            </div>
          </fieldset>
          <label className="field">
            <span>Xabar<small>Tahrirlashingiz mumkin</small></span>
            <textarea value={message} maxLength={2000} onChange={(event) => setMessage(event.target.value)} />
          </label>
          <button className="primary full" disabled={busy || !message.trim()}>{busy ? 'Yuborilmoqda…' : 'Rozilik bilan intro so‘rash'} <span aria-hidden="true">→</span></button>
          <small className="consent-note">{anonymous ? 'Ismingiz ham, uning ismi ham faqat u qabul qilgach ochiladi.' : 'Kontakt faqat qarshi tomon qabul qilgach ochiladi.'}</small>
        </form>
      )}

      {confirm === 'block' && (
        <div className="confirm-box" role="alertdialog" aria-label="Bloklashni tasdiqlash">
          <p>Bloklansa, u sizni match’larda ko‘rmaydi va kutilayotgan intro’lar yopiladi. Bu amalni hozircha qaytarib bo‘lmaydi.</p>
          <div><button className="danger-button" disabled={busy} onClick={onBlock}>Ha, bloklash</button><button className="ghost-button" onClick={() => setConfirm('none')}>Bekor qilish</button></div>
        </div>
      )}
      {confirm === 'report' && (
        <div className="confirm-box neutral" role="group" aria-label="Shikoyat sababi">
          <p>Sababni tanlang. Shikoyat moderatorga boradi; qarshi tomon kim yuborganini bilmaydi.</p>
          <div>{reportReasons.map(reason => <button key={reason.code} className="ghost-button" disabled={busy} onClick={() => { onReport(reason.code); setConfirm('none') }}>{reason.label}</button>)}<button className="link-button" onClick={() => setConfirm('none')}>Bekor qilish</button></div>
        </div>
      )}
      {confirm === 'none' && (
        <div className="safety-actions">
          <button className="ghost-button" onClick={() => setConfirm('report')}>Shikoyat qilish</button>
          <button className="danger-button" onClick={() => setConfirm('block')}>Bloklash</button>
        </div>
      )}
    </Dialog>
  )
}

export function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button role="switch" aria-checked={active} className="toggle-row" onClick={onClick}><span>{label}</span><i className={active ? 'on' : ''} aria-hidden="true"><b /></i></button>
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><MiniMark /><h3>{title}</h3><p>{text}</p>{action}</div>
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeleton-stack" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index} style={{ height: index === 0 ? 112 : 76 }} />)}
      <span className="sr-only">Yuklanmoqda…</span>
    </div>
  )
}
