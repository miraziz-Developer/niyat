import type { ReactNode } from 'react'
import type { Match } from '../../domain/model/entities'
import { Dialog } from '../shared/Dialog'
import { MutualExchange, PersonSummary } from '../shared/MatchSummary'

export function MiniMark() {
  return <span className="mini-mark">✦</span>
}

export function SectionTitle({ code, title, description, action }: { code: string; title: string; description: string; action?: ReactNode }) {
  return <header className="product-heading"><div><span className="kicker">{code}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

export function CompactMatch({ match, onClick }: { match: Match; onClick: () => void }) {
  return (
    <button className="compact-match" onClick={onClick}>
      <span className="person-avatar" style={{ background: match.person.accent }}>{match.person.initials}</span>
      <div><b>{match.person.name}</b><small>{match.person.role} · {match.person.city}</small></div>
      <p>{match.youReceive[0] || 'yangi perspektiva'} <i>⇄</i> {match.theyReceive[0] || 'yangi aloqa'}</p>
      <strong>{match.score}<small>%</small></strong>
    </button>
  )
}

export function MatchDrawer({ match, alreadySent, busy, onRequest, onBlock, onReport, onClose }: { match: Match; alreadySent: boolean; busy: boolean; onRequest: () => void; onBlock: () => void; onReport: () => void; onClose: () => void }) {
  return (
    <Dialog backdropClassName="drawer-backdrop" panelClassName="match-drawer" label={`${match.person.name} bilan moslik`} onClose={onClose}>
      <button aria-label="Yopish" className="close" onClick={onClose}>×</button>
      <span className="kicker">MATCH STRENGTH · {match.score}</span>
      <PersonSummary person={match.person} large />
      <h3>{match.person.intent.title}</h3>
      {match.person.intent.outcome && <p className="drawer-outcome">{match.person.intent.outcome}</p>}
      <MutualExchange match={match} compact />
      <div className="reason-list">{match.reasons.map((reason) => <span key={reason}>✓ {reason}</span>)}</div>
      {match.limitations && match.limitations.length > 0 && <div className="limitation-list" aria-label="Cheklovlar">{match.limitations.map((limitation) => <span key={limitation}>△ {limitation}</span>)}</div>}
      <div className="message"><span>TAKLIF ETILGAN INTRO</span><p>{match.opening}</p></div>
      <button className="primary full" disabled={alreadySent || busy} onClick={onRequest}>
        {alreadySent ? '✓ So‘rov yuborilgan' : busy ? 'Yuborilmoqda…' : 'Rozilik bilan intro so‘rash →'}
      </button>
      <small className="consent-note">Ism va kontakt faqat qarshi tomon qabul qilgach ochiladi.</small>
      <div className="safety-actions">
        <button disabled={busy} onClick={onReport}>Shikoyat qilish</button>
        <button className="danger" disabled={busy} onClick={onBlock}>Bloklash</button>
      </div>
    </Dialog>
  )
}

export function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button aria-pressed={active} className="toggle-row" onClick={onClick}><span>{label}</span><i className={active ? 'on' : ''}><b /></i></button>
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><MiniMark /><h3>{title}</h3><p>{text}</p></div>
}