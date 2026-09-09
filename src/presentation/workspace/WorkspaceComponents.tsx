import type { ReactNode } from 'react'
import type { Match } from '../../domain/model/entities'
import { Dialog } from '../shared/Dialog'

export function MiniMark() {
  return <span className="mini-mark">✦</span>
}

export function SectionTitle({ code, title, description, action }: { code: string; title: string; description: string; action?: ReactNode }) {
  return <header className="product-heading"><div><span className="kicker">{code}</span><h1>{title}</h1><p>{description}</p></div>{action}</header>
}

export function CompactMatch({ match, onClick }: { match: Match; onClick: () => void }) {
  return <button className="compact-match" onClick={onClick}><span className="person-avatar" style={{ background: match.person.accent }}>{match.person.initials}</span><div><b>{match.person.name}</b><small>{match.person.role} · {match.person.city}</small></div><p>{match.youReceive[0] || 'yangi perspektiva'} <i>⇄</i> {match.theyReceive[0] || 'yangi aloqa'}</p><strong>{match.score}<small>%</small></strong></button>
}

export function MatchDrawer({ match, alreadySent, onRequest, onClose }: { match: Match; alreadySent: boolean; onRequest: () => void; onClose: () => void }) {
  return <Dialog backdropClassName="drawer-backdrop" panelClassName="match-drawer" label={`${match.person.name} bilan moslik`} onClose={onClose}><button aria-label="Yopish" className="close" onClick={onClose}>×</button><span className="kicker">MATCH STRENGTH · {match.score}</span><div className="modal-person"><div className="person-avatar large" style={{ background: match.person.accent }}>{match.person.initials}</div><div><h2>{match.person.name}</h2><p>{match.person.role} · {match.person.city}</p></div></div><h3>{match.person.intent.title}</h3><p className="drawer-outcome">{match.person.intent.outcome}</p><div className="mutual-box"><div><span>SEN OLASAN</span><b>{match.youReceive.join(' · ') || 'Yangi perspektiva'}</b></div><i>⇄</i><div><span>ULAR OLADI</span><b>{match.theyReceive.join(' · ') || 'Yangi aloqa'}</b></div></div><div className="reason-list">{match.reasons.map(reason => <span key={reason}>✓ {reason}</span>)}</div><div className="message"><span>TAKLIF ETILGAN INTRO</span><p>{match.opening}</p></div><button className="primary full" disabled={alreadySent} onClick={onRequest}>{alreadySent ? '✓ So‘rov yuborilgan' : 'Rozilik bilan intro so‘rash →'}</button><small className="consent-note">Kontakt faqat qarshi tomon qabul qilgach ochiladi.</small></Dialog>
}

export function Toggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button aria-pressed={active} className="toggle-row" onClick={onClick}><span>{label}</span><i className={active ? 'on' : ''}><b /></i></button>
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><MiniMark /><h3>{title}</h3><p>{text}</p></div>
}