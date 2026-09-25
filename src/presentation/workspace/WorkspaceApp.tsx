import { useEffect, useMemo, useState } from 'react'
import { completeMilestone, createCollaboration } from '../../application/collaborations/manage-collaboration'
import { rankMatches } from '../../application/matching/rank-matches'
import { requestOutcomeVerification, resolveOutcomeVerification } from '../../application/outcomes/manage-outcome-verification'
import { createIntroRequest, transitionIntroRequest } from '../../application/requests/manage-intro-request'
import type { Circle, Collaboration, Intent, IntroRequest, Match, OutcomeVerification, Person, TrustSignal } from '../../domain/model/entities'
import { OutcomeVerificationApi } from '../../infrastructure/http/outcome-verification-api'
import { usePersistentState } from '../shared/use-persistent-state'
import { storageKeys } from '../shared/storage-keys'
import { useTransientNotice } from '../shared/use-transient-notice'
import { CompactMatch, EmptyState, MatchDrawer, MiniMark, SectionTitle, Toggle } from './WorkspaceComponents'
import { workspaceNavigation, type WorkspaceSection } from './workspace.types'
import { mapCollaboration, mapTrustSignal, mapVerification } from './server-workspace-mappers'

type WorkspaceData = {
  people: Person[]
  circles: Circle[]
  initialRequests: IntroRequest[]
}

type ProductAppProps = {
  intent: Intent
  data: WorkspaceData
  onEdit: () => void
  onExit: () => void
}

export default function ProductApp({ intent, data, onEdit, onExit }: ProductAppProps) {
  const { people, circles, initialRequests } = data
  const [section, setSection] = useState<WorkspaceSection>('today')
  const [requests, setRequests] = usePersistentState<IntroRequest[]>(storageKeys.introRequests, initialRequests)
  const [joined, setJoined] = usePersistentState<string[]>(storageKeys.joinedCircles, ['c1'])
  const [saved, setSaved] = usePersistentState<string[]>(storageKeys.savedMatches, [])
  const [collaborations, setCollaborations] = usePersistentState<Collaboration[]>(storageKeys.collaborations, [])
  const [verifications, setVerifications] = usePersistentState<OutcomeVerification[]>(storageKeys.outcomeVerifications, [])
  const [trustSignals, setTrustSignals] = usePersistentState<TrustSignal[]>(storageKeys.trustSignals, [])
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)
  const [serverState, setServerState] = useState<'local' | 'loading' | 'connected' | 'error'>(import.meta.env.VITE_API_MODE === 'server' ? 'loading' : 'local')
  const [actorId, setActorId] = useState('')
  const api = useMemo(() => new OutcomeVerificationApi(), [])
  const { notice, showNotice } = useTransientNotice()
  const matches = useMemo(() => rankMatches(intent, people), [intent, people])
  const pendingCount = requests.filter((request) => request.status === 'pending' && request.direction === 'incoming').length

  useEffect(() => {
    if (import.meta.env.VITE_API_MODE !== 'server') return
    api.load().then(workspace => {
      setActorId(workspace.userId)
      setRequests(workspace.introRequests.map(request => ({ id: request.id, personId: request.senderId === workspace.userId ? request.receiverId : request.senderId, direction: request.senderId === workspace.userId ? 'outgoing' : 'incoming', scope: request.scope, status: request.status === 'cancelled' || request.status === 'expired' ? 'declined' : request.status, sentAt: request.createdAt })))
      setCollaborations(workspace.collaborations.map(item => mapCollaboration(item, workspace.userId)))
      setVerifications(workspace.collaborations.flatMap(item => item.verification ? [mapVerification(item.verification, workspace.userId)] : []))
      setTrustSignals(workspace.trustSignals.map(mapTrustSignal))
      setServerState('connected')
    }).catch(() => setServerState('error'))
  }, [api, setCollaborations, setRequests, setTrustSignals, setVerifications])

  function createRequest(match: Match) {
    if (requests.some((request) => request.personId === match.person.id && request.direction === 'outgoing')) return
    setRequests((current) => [createIntroRequest(match.person.id, '15 daqiqalik tanishuv', Date.now()), ...current])
    showNotice('Intro so‘rovi xavfsiz yuborildi')
  }

  function updateRequest(id: string, status: IntroRequest['status']) {
    setRequests((current) => current.map((request) => request.id === id ? transitionIntroRequest(request, status) : request))
    showNotice(status === 'accepted' ? 'Rozilik berildi — suhbat xonasi ochildi' : 'So‘rov yopildi')
  }

  async function startCollaboration(request: IntroRequest) {
    if (collaborations.some((collaboration) => collaboration.introRequestId === request.id)) return

    if (serverState === 'connected') {
      try {
        const value = await api.createCollaboration(request.id, request.scope, ['Birinchi uchrashuvni o‘tkazish', 'Keyingi amaliy qadamni yakunlash'])
        setCollaborations(current => [mapCollaboration(value, actorId), ...current])
        setSection('progress')
        showNotice('Hamkorlik serverda yaratildi')
      } catch (error) { showNotice(error instanceof Error ? error.message : 'Server xatosi') }
      return
    }

    const collaboration = createCollaboration(
      request,
      request.scope,
      ['Birinchi uchrashuvni o‘tkazish', 'Keyingi amaliy qadamni yakunlash'],
      Date.now(),
    )
    setCollaborations((current) => [collaboration, ...current])
    setSection('progress')
    showNotice('Hamkorlik boshlandi — birinchi milestone tayyor')
  }

  async function finishMilestone(collaborationId: string, milestoneId: string) {
    if (serverState === 'connected') {
      try {
        const value = await api.completeMilestone(collaborationId, milestoneId)
        setCollaborations(current => current.map(item => item.id === collaborationId ? mapCollaboration(value, actorId) : item))
        showNotice('Milestone serverda bajarildi')
      } catch (error) { showNotice(error instanceof Error ? error.message : 'Server xatosi') }
      return
    }
    setCollaborations((current) => current.map((collaboration) => collaboration.id === collaborationId
      ? completeMilestone(collaboration, milestoneId, Date.now())
      : collaboration))
    showNotice('Milestone bajarildi')
  }

  async function submitOutcome(collaborationId: string, evidence: string) {
    const collaboration = collaborations.find((candidate) => candidate.id === collaborationId)
    if (!collaboration || verifications.some((verification) => verification.collaborationId === collaborationId && verification.status === 'pending')) return

    if (serverState === 'connected') {
      try {
        const result = await api.requestVerification(collaborationId, evidence)
        setCollaborations(current => current.map(item => item.id === collaborationId ? { ...item, status: result.collaboration.status } : item))
        setVerifications(current => [mapVerification(result.verification, actorId), ...current])
        showNotice('Natija hamkorga server orqali yuborildi')
      } catch (error) { showNotice(error instanceof Error ? error.message : 'Server xatosi') }
      return
    }
    const result = requestOutcomeVerification(collaboration, evidence, Date.now())
    setCollaborations((current) => current.map((candidate) => candidate.id === collaborationId ? result.collaboration : candidate))
    setVerifications((current) => [result.verification, ...current])
    showNotice('Natija hamkorga tasdiqlash uchun yuborildi')
  }

  function resolveOutcome(verificationId: string, decision: 'confirmed' | 'disputed') {
    if (serverState === 'connected') { showNotice('Qarorni faqat hamkor o‘z sessiyasidan bera oladi'); return }
    const verification = verifications.find((candidate) => candidate.id === verificationId)
    const collaboration = verification && collaborations.find((candidate) => candidate.id === verification.collaborationId)
    if (!verification || !collaboration) return

    const result = resolveOutcomeVerification(collaboration, verification, decision, Date.now())
    setCollaborations((current) => current.map((candidate) => candidate.id === collaboration.id ? result.collaboration : candidate))
    setVerifications((current) => current.map((candidate) => candidate.id === verification.id ? result.verification : candidate))
    if (result.trustSignal) setTrustSignals((current) => current.some((signal) => signal.id === result.trustSignal?.id) ? current : [result.trustSignal!, ...current])
    showNotice(decision === 'confirmed' ? 'Natija tasdiqlandi — trust signal yaratildi' : 'Natija qayta ko‘rib chiqish uchun qaytarildi')
  }

  return (
    <div className="product-shell">
      <aside className="side-nav">
        <button className="side-brand" onClick={() => setSection('today')}><MiniMark /><b>niyat</b></button>
        <div className="side-caption">WORKSPACE</div>
        <div className="side-links">
          {workspaceNavigation.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><i>{item.icon}</i>{item.label}{item.id === 'requests' && pendingCount > 0 && <em>{pendingCount}</em>}</button>)}
        </div>
        <div className="active-intent-mini">
          <span>FAOL NIYAT</span><b>{intent.title}</b><div><i /></div><small>Keyingi review · 4 kun</small>
        </div>
        <button className="side-profile" onClick={() => setSection('trust')}><span>M</span><div><b>Miraziz</b><small>Builder · verified</small></div><i>···</i></button>
      </aside>

      <div className="product-body">
        {serverState === 'loading' && <div className="api-status" role="status">Server ma’lumotlari yuklanmoqda…</div>}
        {serverState === 'connected' && <div className="api-status connected" role="status">● SERVERGA ULANGAN</div>}
        {serverState === 'error' && <div className="api-status error" role="alert">Server sessiyasi topilmadi. Qayta kiring yoki local demo rejimini ishlating.</div>}
        <div className="mobile-product-nav">
          {workspaceNavigation.slice(0, 5).map(item => <button aria-label={item.label} className={section === item.id ? 'active' : ''} key={item.id} onClick={() => setSection(item.id)}>{item.icon}<small>{item.label}</small></button>)}
        </div>

        {section === 'today' && <TodayView intent={intent} matches={matches} onOpenMatch={setActiveMatch} onNavigate={setSection} onEdit={onEdit} />}
        {section === 'discover' && <DiscoverView matches={matches} saved={saved} onSave={(id) => setSaved((current) => current.includes(id) ? current.filter(x => x !== id) : [...current, id])} onOpenMatch={setActiveMatch} />}
        {section === 'requests' && <RequestsView requests={requests} people={people} collaborations={collaborations} onUpdate={updateRequest} onStartCollaboration={startCollaboration} />}
        {section === 'circles' && <CirclesView circles={circles} joined={joined} onJoin={(circle) => { setJoined((current) => current.includes(circle.id) ? current : [...current, circle.id]); showNotice(`“${circle.title}” circle’iga qo‘shilding`) }} />}
        {section === 'progress' && <ProgressView collaborations={collaborations} verifications={verifications} people={people} serverConnected={serverState === 'connected'} onCompleteMilestone={finishMilestone} onSubmitOutcome={submitOutcome} onResolveOutcome={resolveOutcome} />}
        {section === 'trust' && <TrustView trustSignals={trustSignals} people={people} onExit={onExit} toast={showNotice} />}
      </div>

      {activeMatch && <MatchDrawer match={activeMatch} alreadySent={requests.some(r => r.personId === activeMatch.person.id && r.direction === 'outgoing')} onRequest={() => createRequest(activeMatch)} onClose={() => setActiveMatch(null)} />}
      {notice && <div className="toast">✓ {notice}</div>}
    </div>
  )
}

function TodayView({ intent, matches, onOpenMatch, onNavigate, onEdit }: { intent: Intent; matches: Match[]; onOpenMatch: (match: Match) => void; onNavigate: (section: WorkspaceSection) => void; onEdit: () => void }) {
  const [done, setDone] = useState(false)
  return <section className="product-view">
    <SectionTitle code="SESHANBA · 09 SENTABR" title="Xayrli tong, Miraziz." description="Bugun niyatingni natijaga yaqinlashtiradigan bitta muhim ish bor." action={<button className="quiet-button" onClick={onEdit}>Niyatni tahrirlash</button>} />
    <div className={`mission ${done ? 'mission-done' : ''}`}><div className="mission-number">01</div><div className="mission-copy"><span>BUGUNGI QADAM · ≈ 15 DAQIQA</span><h2>{done ? 'Bugungi qadam bajarildi.' : 'Eng kuchli match bilan tanishuvni boshla.'}</h2><p>{done ? 'Zo‘r. Endi real javob kelishini kutamiz; keraksiz notification yubormaymiz.' : `${matches[0].person.name} sen qidirayotgan ${matches[0].youReceive[0] ?? 'tajriba'}ni bera oladi. Sen ham unga foydali bo‘la olasan.`}</p></div><button onClick={() => { if (!done) onOpenMatch(matches[0]); setDone(true) }}>{done ? '✓' : 'Boshlash →'}</button></div>
    <div className="dashboard-grid">
      <div className="panel wide"><div className="panel-title"><span>YANGI KESISHMALAR</span><button onClick={() => onNavigate('discover')}>Barchasi →</button></div>{matches.slice(0, 3).map(match => <CompactMatch key={match.person.id} match={match} onClick={() => onOpenMatch(match)} />)}</div>
      <div className="panel"><div className="panel-title"><span>FAOL NIYAT</span><button onClick={onEdit}>Tahrirlash</button></div><div className="intent-focus"><MiniMark /><h3>{intent.title}</h3><p>{intent.outcome}</p><div className="progress-line"><i style={{ width: '38%' }} /></div><small>38% · Aniqlash bosqichi</small></div></div>
      <div className="panel"><div className="panel-title"><span>BU HAFTA</span><button onClick={() => onNavigate('progress')}>Hisobot →</button></div><div className="weekly-stats"><div><b>3</b><span>foydali aloqa</span></div><div><b>1</b><span>uchrashuv</span></div><div><b>1</b><span>milestone</span></div></div><p className="insight">↗ Eng kuchli signal: AI va identity kesishmasi</p></div>
    </div>
  </section>
}

function DiscoverView({ matches, saved, onSave, onOpenMatch }: { matches: Match[]; saved: string[]; onSave: (id: string) => void; onOpenMatch: (match: Match) => void }) {
  const [filter, setFilter] = useState<'all' | 'strong' | 'saved'>('all')
  const visible = matches.filter(m => filter === 'all' || (filter === 'strong' ? m.score >= 65 : saved.includes(m.person.id)))
  return <section className="product-view"><SectionTitle code="DISCOVER · CHEKLANGAN FEED" title="Bugungi kashfiyotlar." description="Cheksiz scroll yo‘q. Faqat niyatingga aloqador, tushuntirilgan imkoniyatlar." />
    <div className="filter-row"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Barchasi</button><button className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Kuchli match</button><button className={filter === 'saved' ? 'active' : ''} onClick={() => setFilter('saved')}>Saqlangan · {saved.length}</button></div>
    <div className="discovery-list">{visible.length ? visible.map(match => <article className="discovery-card" key={match.person.id}><CompactMatch match={match} onClick={() => onOpenMatch(match)} /><div className="discovery-reason"><span>NIMA UCHUN</span>{match.reasons.map(reason => <i key={reason}>✓ {reason}</i>)}</div><button className={`save ${saved.includes(match.person.id) ? 'active' : ''}`} onClick={() => onSave(match.person.id)}>{saved.includes(match.person.id) ? '★ Saqlandi' : '☆ Saqlash'}</button></article>) : <EmptyState title="Hali saqlangan match yo‘q" text="Kashfiyotlardan foydali odamlarni saqlab qo‘y." />}</div>
  </section>
}

function RequestsView({ requests, people, collaborations, onUpdate, onStartCollaboration }: { requests: IntroRequest[]; people: Person[]; collaborations: Collaboration[]; onUpdate: (id: string, status: IntroRequest['status']) => void; onStartCollaboration: (request: IntroRequest) => void }) {
  return <section className="product-view"><SectionTitle code="CONSENT QUEUE" title="Aloqa sening nazoratingda." description="Kontakt faqat ikki tomon aniq rozilik berganda ochiladi." />
    <div className="request-list">{requests.map(request => { const person = people.find(p => p.id === request.personId)!; const started = collaborations.some(collaboration => collaboration.introRequestId === request.id); return <article className="request-card" key={request.id}><span className="person-avatar" style={{ background: person.accent }}>{person.initials}</span><div className="request-main"><div><b>{person.name}</b><small>{request.direction === 'incoming' ? 'Senga so‘rov yubordi' : 'Sen yubording'} · {request.sentAt}</small></div><h3>{request.scope}</h3><p>{person.intent.title}</p></div><div className={`request-status ${request.status}`}>{request.status === 'pending' && request.direction === 'incoming' ? <><button onClick={() => onUpdate(request.id, 'accepted')}>Qabul qilish</button><button onClick={() => onUpdate(request.id, 'declined')}>Rad etish</button></> : request.status === 'accepted' ? <button disabled={started} onClick={() => onStartCollaboration(request)}>{started ? '✓ Hamkorlik faol' : 'Hamkorlikni boshlash →'}</button> : request.status === 'declined' ? 'Yopildi' : 'Javob kutilmoqda'}</div></article> })}</div>
  </section>
}

function CirclesView({ circles, joined, onJoin }: { circles: Circle[]; joined: string[]; onJoin: (circle: Circle) => void }) {
  return <section className="product-view"><SectionTitle code="SMALL GROUPS · REAL OUTPUT" title="Birga bajariladigan sprintlar." description="4–8 odam. Bitta aniq natija. Cheklangan vaqt." action={<button className="quiet-button">+ Circle taklif qilish</button>} />
    <div className="circle-grid">{circles.map(circle => <article className="circle-card" key={circle.id}><div className="circle-orbit"><b>{circle.day}</b><small>/{circle.duration} KUN</small></div><span className="kicker">{circle.tags.join(' · ')}</span><h2>{circle.title}</h2><p>{circle.outcome}</p><div className="member-line"><span>{'●'.repeat(circle.members)}<i>{'○'.repeat(circle.capacity - circle.members)}</i></span><small>{circle.members}/{circle.capacity} a’zo</small></div><div className="progress-line"><i style={{ width: `${circle.progress}%` }} /></div><button disabled={joined.includes(circle.id)} onClick={() => onJoin(circle)}>{joined.includes(circle.id) ? '✓ Qo‘shilgansan' : 'Circle’ga qo‘shilish →'}</button></article>)}</div>
  </section>
}

function ProgressView({ collaborations, verifications, people, serverConnected, onCompleteMilestone, onSubmitOutcome, onResolveOutcome }: { collaborations: Collaboration[]; verifications: OutcomeVerification[]; people: Person[]; serverConnected: boolean; onCompleteMilestone: (collaborationId: string, milestoneId: string) => void; onSubmitOutcome: (collaborationId: string, evidence: string) => void; onResolveOutcome: (verificationId: string, decision: 'confirmed' | 'disputed') => void }) {
  const completedMilestones = collaborations.flatMap((collaboration) => collaboration.milestones).filter((milestone) => milestone.status === 'completed').length
  const readyOutcomes = collaborations.filter((collaboration) => collaboration.status === 'outcome-ready').length
  const verifiedOutcomes = collaborations.filter((collaboration) => collaboration.status === 'verified').length
  return <section className="product-view"><SectionTitle code="IMPACT · OXIRGI 30 KUN" title="Harakat emas, natija." description="Like va ekranda o‘tgan vaqt emas — hayotingda yaratilgan qiymat." />
    <div className="impact-hero"><div><b>{collaborations.length}</b><span>hamkorlik</span></div><div><b>{verifiedOutcomes}</b><span>tasdiqlangan natija</span></div><div><b>{completedMilestones}</b><span>yakunlangan milestone</span></div><div><b>{readyOutcomes}</b><span>tasdiqqa tayyor natija</span></div></div>
    {collaborations.length === 0 ? <EmptyState title="Hamkorlik hali boshlanmagan" text="Qabul qilingan intro’dan hamkorlik boshlang va birinchi milestone’ni belgilang." /> : <div className="collaboration-list">{collaborations.map(collaboration => <CollaborationCard key={collaboration.id} collaboration={collaboration} verification={verifications.find(candidate => candidate.collaborationId === collaboration.id && candidate.status === 'pending')} person={people.find(candidate => candidate.id === collaboration.personId)} serverConnected={serverConnected} onCompleteMilestone={onCompleteMilestone} onSubmitOutcome={onSubmitOutcome} onResolveOutcome={onResolveOutcome} />)}</div>}
  </section>
}

function CollaborationCard({ collaboration, verification, person, serverConnected, onCompleteMilestone, onSubmitOutcome, onResolveOutcome }: { collaboration: Collaboration; verification?: OutcomeVerification; person?: Person; serverConnected: boolean; onCompleteMilestone: (collaborationId: string, milestoneId: string) => void; onSubmitOutcome: (collaborationId: string, evidence: string) => void; onResolveOutcome: (verificationId: string, decision: 'confirmed' | 'disputed') => void }) {
  const [evidence, setEvidence] = useState('')
  const statusLabel = collaboration.status === 'verified' ? '✓ TASDIQLANGAN NATIJA' : collaboration.status === 'verification-pending' ? 'HAMKOR TASDIG‘I KUTILMOQDA' : collaboration.status === 'outcome-ready' ? 'NATIJA TASDIQQA TAYYOR' : 'FAOL HAMKORLIK'

  return <article className={`collaboration-card ${collaboration.status}`}><div className="panel-title"><span>{statusLabel}</span><small>{person?.name}</small></div><h2>{collaboration.title}</h2><div className="milestone-list">{collaboration.milestones.map(milestone => <div className={milestone.status} key={milestone.id}><i>{milestone.status === 'completed' ? '✓' : '○'}</i><span>{milestone.title}</span>{milestone.status === 'pending' && <button onClick={() => onCompleteMilestone(collaboration.id, milestone.id)}>Bajarildi</button>}</div>)}</div>
    {collaboration.status === 'outcome-ready' && <form className="verification-form" onSubmit={(event) => { event.preventDefault(); onSubmitOutcome(collaboration.id, evidence); setEvidence('') }}><label htmlFor={`evidence-${collaboration.id}`}>NIMA NATIJA YARATILDI?</label><textarea id={`evidence-${collaboration.id}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Aniq natija yoki topshirilgan artefaktni yozing…" maxLength={500} /><button className="primary" disabled={!evidence.trim()}>Tasdiqqa yuborish <span>→</span></button></form>}
    {collaboration.status === 'verification-pending' && verification && <div className="verification-review"><span>{serverConnected ? 'HAMKOR SESSIYASIDAGI QAROR KUTILMOQDA' : 'COUNTERPARTY PREVIEW · LOCAL DEMO'}</span><p>“{verification.evidence}”</p><small>{serverConnected ? 'So‘rovchi o‘z natijasini tasdiqlay olmaydi.' : 'Production’da bu qarorni faqat autentifikatsiyalangan hamkor bera oladi.'}</small>{!serverConnected && <div><button onClick={() => onResolveOutcome(verification.id, 'confirmed')}>✓ Tasdiqlash</button><button className="dispute" onClick={() => onResolveOutcome(verification.id, 'disputed')}>Qayta ko‘rib chiqish</button></div>}</div>}
    {collaboration.status === 'verified' && <p className="verified-outcome">✓ Hamkor tasdiqladi. Bu natija Trust markazida signal sifatida ko‘rinadi.</p>}
  </article>
}

function TrustView({ trustSignals, people, onExit, toast }: { trustSignals: TrustSignal[]; people: Person[]; onExit: () => void; toast: (message: string) => void }) {
  const [settings, setSettings] = useState({ matchedOnly: true, aiDrafts: true, activity: false, analytics: true })
  const toggle = (key: keyof typeof settings) => setSettings(current => ({ ...current, [key]: !current[key] }))
  return <section className="product-view"><SectionTitle code="PRIVACY · PERMISSIONS · SAFETY" title="Ma’lumoting — seniki." description="Kim nimani ko‘rishi va AI nima qilishi mumkinligini shu yerdan boshqarasan." />
    <div className="trust-grid"><div className="panel"><div className="panel-title"><span>IDENTITY</span><small className="verified">✓ TASDIQLANGAN</small></div><div className="identity-row"><span className="profile-big">M</span><div><h3>Miraziz</h3><p>Email tasdiqlangan · 18+ · Global</p></div></div><button className="quiet-button full">Verifikatsiyani boshqarish</button></div><div className="panel"><div className="panel-title"><span>RUXSATLAR</span></div><Toggle label="Faqat matchlar profilimni ko‘rsin" active={settings.matchedOnly} onClick={() => toggle('matchedOnly')} /><Toggle label="AI faqat draft tayyorlasin" active={settings.aiDrafts} onClick={() => toggle('aiDrafts')} /><Toggle label="Faollik holatini ko‘rsatish" active={settings.activity} onClick={() => toggle('activity')} /><Toggle label="Anonim product analytics" active={settings.analytics} onClick={() => toggle('analytics')} /></div><div className="panel wide trust-signals"><div className="panel-title"><span>VERIFIED OUTCOMES</span><small>{trustSignals.length} SIGNAL</small></div>{trustSignals.length === 0 ? <p className="trust-empty">Hamkor tasdiqlagan natijalar shu yerda paydo bo‘ladi. Signal faqat ikki tomon qaroridan keyin yaratiladi.</p> : trustSignals.map(signal => <div className="trust-signal" key={signal.id}><i>✓</i><div><b>{signal.label}</b><span>{people.find(person => person.id === signal.personId)?.name} tasdiqladi · {new Date(signal.issuedAt).toLocaleDateString('uz-UZ')}</span></div></div>)}</div><div className="panel wide"><div className="panel-title"><span>DATA CONTROLS</span></div><div className="data-actions"><button onClick={() => toast('Ma’lumot eksporti tayyorlanmoqda')}>↓ Ma’lumotlarimni eksport qilish</button><button onClick={() => toast('Barcha faol sessiyalar yopildi')}>⌁ Boshqa sessiyalarni yopish</button><button className="danger" onClick={onExit}>Akkauntdan chiqish</button></div></div></div>
  </section>
}
