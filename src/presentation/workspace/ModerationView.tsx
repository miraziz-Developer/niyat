import { useCallback, useEffect, useState } from 'react'
import type { DecisionInput, ModerationReport, ReportStatus } from '../../application/moderation/moderation'
import type { NetworkClient } from '../../application/ports/network-client'
import { describeError } from '../shared/describe-error'
import { formatShortDate } from '../shared/format-date'
import { EmptyState, LoadingState, SectionTitle } from './WorkspaceComponents'

const filters: Array<{ id: string; label: string; statuses: ReportStatus[] }> = [
  { id: 'queue', label: 'Navbat', statuses: ['open', 'reviewing'] },
  { id: 'closed', label: 'Yopilgan', statuses: ['resolved', 'dismissed'] },
]

const subjectLabels = { user: 'A’zo', intent: 'Niyat', intro_request: 'Intro so‘rovi' } as const
const reasonLabels: Record<string, string> = { spam: 'Spam yoki reklama', fake: 'Soxta niyat', inappropriate: 'Nomaqbul kontent' }
const statusLabels: Record<ReportStatus, string> = { open: 'Yangi', reviewing: 'Ko‘rib chiqilmoqda', resolved: 'Hal qilindi', dismissed: 'Rad etildi' }

export function ModerationView({ network, notify }: { network: NetworkClient; notify: (message: string, tone?: 'success' | 'error') => void }) {
  const [filter, setFilter] = useState(filters[0])
  const [reports, setReports] = useState<ModerationReport[] | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try { setReports(await network.listReports(filter.statuses)) } catch (caught) { setError(describeError(caught)) }
  }, [network, filter])

  useEffect(() => { setReports(null); void load() }, [load])

  return <section className="product-view">
    <SectionTitle code="Moderatsiya · faqat xodimlar" title="Shikoyatlar navbati." description="Eng eskisi birinchi. Shikoyat qilgan odam kimligi ko‘rsatilmaydi; izohlar faqat moderatorlarga ko‘rinadi." />
    <div className="filter-row" role="group" aria-label="Holat">
      {filters.map(item => <button key={item.id} aria-pressed={filter.id === item.id} className={filter.id === item.id ? 'active' : ''} onClick={() => setFilter(item)}>{item.label}</button>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!reports && !error && <LoadingState rows={3} />}
    {reports && reports.length === 0 && <EmptyState title={filter.id === 'queue' ? 'Navbat bo‘sh' : 'Yopilgan shikoyat yo‘q'} text="Yangi shikoyat kelganda shu yerda paydo bo‘ladi." />}
    {reports && reports.length > 0 && <div className="request-list">{reports.map(report => <ReportCard key={report.id} report={report} onDecide={async input => {
      try {
        await network.decideReport(report.id, input)
        notify(input.suspend ? 'Qaror saqlandi — a’zo to‘xtatildi' : 'Qaror saqlandi')
        await load()
      } catch (caught) { notify(describeError(caught), 'error') }
    }} />)}</div>}
  </section>
}

function ReportCard({ report, onDecide }: { report: ModerationReport; onDecide: (input: DecisionInput) => Promise<void> }) {
  const [note, setNote] = useState('')
  const [suspend, setSuspend] = useState(false)
  const [busy, setBusy] = useState(false)
  const open = report.status === 'open' || report.status === 'reviewing'
  const canSuspend = Boolean(report.subjectUserId) && report.subjectUserStatus === 'active'

  async function decide(status: DecisionInput['status']) {
    setBusy(true)
    await onDecide({ status, note: note.trim(), suspend: status === 'resolved' && suspend })
    setBusy(false)
  }

  return <article className="report-card">
    <div className="report-head">
      <span className={`badge ${open ? 'pending' : 'declined'}`}>{statusLabels[report.status]}</span>
      <small>{subjectLabels[report.subjectType]} · {formatShortDate(report.createdAt)}</small>
    </div>
    <h3>{reasonLabels[report.reasonCode] ?? report.reasonCode}</h3>
    <p className="report-subject">{report.subjectLabel ?? 'Obyekt o‘chirilgan yoki topilmadi'}{report.subjectUserStatus && report.subjectUserStatus !== 'active' ? ` · a’zo holati: ${report.subjectUserStatus}` : ''}</p>
    {report.details && <p className="report-details">“{report.details}”</p>}
    {report.decisions.length > 0 && <ul className="report-history">{report.decisions.map(decision => <li key={decision.decidedAt}>{formatShortDate(decision.decidedAt)} · {statusLabels[decision.status]}{decision.suspendedUserId ? ' · a’zo to‘xtatildi' : ''}{decision.note ? ` — ${decision.note}` : ''}</li>)}</ul>}
    {open && <div className="report-actions">
      <label className="field"><span>Moderator izohi<small>Faqat moderatorlar ko‘radi</small></span><textarea value={note} maxLength={2000} onChange={event => setNote(event.target.value)} placeholder="Qaror sababi…" /></label>
      {canSuspend && <label className="check-row"><input type="checkbox" checked={suspend} onChange={event => setSuspend(event.target.checked)} /><span>A’zoni to‘xtatish — barcha sessiyalari yopiladi va u match’lardan chiqadi (faqat “Hal qilindi” bilan).</span></label>}
      <div className="data-actions">
        {report.status === 'open' && <button className="ghost-button" disabled={busy} onClick={() => void decide('reviewing')}>Ko‘rib chiqishni boshlash</button>}
        <button className={suspend ? 'danger-button' : 'quiet-button'} disabled={busy} onClick={() => void decide('resolved')}>{suspend ? 'Hal qilish va to‘xtatish' : 'Hal qilindi'}</button>
        <button className="ghost-button" disabled={busy || suspend} onClick={() => void decide('dismissed')}>Rad etish</button>
      </div>
    </div>}
  </article>
}
