import { useCallback, useEffect, useMemo, useState } from 'react'
import { completeMilestone, createCollaboration } from '../../application/collaborations/manage-collaboration'
import { rankMatches } from '../../application/matching/rank-matches'
import { requestOutcomeVerification, resolveOutcomeVerification } from '../../application/outcomes/manage-outcome-verification'
import { createIntroRequest, transitionIntroRequest } from '../../application/requests/manage-intro-request'
import type { Circle, Collaboration, Intent, IntroRequest, Match, OutcomeVerification, Person, TrustSignal } from '../../domain/model/entities'
import type { Viewer } from '../app.types'
import { formatDayHeading, formatShortDate } from '../shared/format-date'
import { useNetwork } from '../shared/network-context'
import { storageKeys } from '../shared/storage-keys'
import { usePersistentState } from '../shared/use-persistent-state'
import { useTransientNotice } from '../shared/use-transient-notice'
import { mapCollaboration, mapServerIntro, mapServerMatch, mapTrustSignal, mapVerification, uniquePeople, unknownPerson } from './server-workspace-mappers'
import { CompactMatch, EmptyState, MatchDrawer, MiniMark, SectionTitle, Toggle } from './WorkspaceComponents'
import { workspaceNavigation, type WorkspaceSection } from './workspace.types'

type WorkspaceData = {
  people: Person[]
  circles: Circle[]
  initialRequests: IntroRequest[]
}

type ProductAppProps = {
  intent: Intent
  /** Server mode: the authenticated member and, once saved, their intent. */
  server?: { userId: string; intentId?: string }
  viewer: Viewer
  data: WorkspaceData
  onEdit: () => void
  onExit: () => void
}

type ServerStatus = 'local' | 'loading' | 'connected' | 'error'

const defaultMilestones = ['Birinchi uchrashuvni o‘tkazish', 'Keyingi amaliy qadamni yakunlash']
const introScope = '15 daqiqalik tanishuv'

export default function ProductApp({ intent, server, viewer, data, onEdit, onExit }: ProductAppProps) {
  const network = useNetwork()
  const local = network === null
  const [section, setSection] = useState<WorkspaceSection>('today')
  // Server data lives in memory only; browser persistence is reserved for the local demo.
  const [requests, setRequests] = usePersistentState<IntroRequest[]>(storageKeys.introRequests, local ? data.initialRequests : [], local)
  const [collaborations, setCollaborations] = usePersistentState<Collaboration[]>(storageKeys.collaborations, [], local)
  const [verifications, setVerifications] = usePersistentState<OutcomeVerification[]>(storageKeys.outcomeVerifications, [], local)
  const [trustSignals, setTrustSignals] = usePersistentState<TrustSignal[]>(storageKeys.trustSignals, [], local)
  const [hidden, setHidden] = usePersistentState<string[]>(storageKeys.hiddenPeople, [], local)
  const [joined, setJoined] = usePersistentState<string[]>(storageKeys.joinedCircles, ['c1'])
  const [saved, setSaved] = usePersistentState<string[]>(storageKeys.savedMatches, [])
  const [serverMatches, setServerMatches] = useState<Match[]>([])
  const [serverPeople, setServerPeople] = useState<Person[]>([])
  const [serverStatus, setServerStatus] = useState<ServerStatus>(local ? 'local' : 'loading')
  const actorId = server?.userId ?? ''
  const serverIntentId = server?.intentId
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)
  const [busy, setBusy] = useState(false)
  const { notice, showNotice } = useTransientNotice()

  const localMatches = useMemo(() => rankMatches(intent, data.people), [intent, data.people])
  const matches = (local ? localMatches : serverMatches).filter(match => !hidden.includes(match.person.id))
  const people = local ? data.people : serverPeople
  const findPerson = (id: string) => people.find(person => person.id === id) ?? unknownPerson(id)
  const pendingCount = requests.filter((request) => request.status === 'pending' && request.direction === 'incoming').length

  const refresh = useCallback(async () => {
    if (!network || !actorId) return
    const [serverMatchList, intros, serverCollaborations, signals] = await Promise.all([
      serverIntentId ? network.listMatches(serverIntentId) : Promise.resolve([]),
      network.listIntroRequests(),
      network.listCollaborations(),
      network.listTrustSignals(),
    ])
    const mappedMatches = serverMatchList.map(match => mapServerMatch(match, intent.title))
    const mappedIntros = intros.map(intro => mapServerIntro(intro, actorId))
    const mappedCollaborations = serverCollaborations.map(item => ({ item, collaboration: mapCollaboration(item, actorId) }))
    setServerMatches(mappedMatches)
    setServerPeople(uniquePeople([...mappedMatches.map(match => match.person), ...mappedIntros.map(intro => intro.person)]))
    setRequests(mappedIntros.map(intro => intro.request))
    setCollaborations(mappedCollaborations.map(({ collaboration }) => collaboration))
    setVerifications(mappedCollaborations.flatMap(({ item, collaboration }) => item.verification ? [mapVerification(item.verification, collaboration, actorId)] : []))
    setTrustSignals(signals.map(mapTrustSignal))
    setServerStatus('connected')
  }, [network, actorId, serverIntentId, intent.title, setCollaborations, setRequests, setTrustSignals, setVerifications])

  useEffect(() => {
    refresh().catch(() => setServerStatus('error'))
  }, [refresh])

  /** Runs a server mutation, then re-reads the server's view so the UI never guesses state. */
  async function onServer(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      await refresh()
      showNotice(success)
      return true
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Server xatosi')
      return false
    } finally {
      setBusy(false)
    }
  }

  function hasOutgoingRequest(match: Match) {
    return local ? requests.some(request => request.personId === match.person.id && request.direction === 'outgoing') : Boolean(match.introId)
  }

  async function createRequest(match: Match) {
    if (hasOutgoingRequest(match)) return
    if (network && match.matchId) {
      const matchId = match.matchId
      if (await onServer(() => network.createIntroRequest(matchId, introScope, match.opening), 'Intro so‘rovi yuborildi')) setActiveMatch(null)
      return
    }
    setRequests((current) => [createIntroRequest(match.person.id, introScope, Date.now()), ...current])
    showNotice('Intro so‘rovi xavfsiz yuborildi')
  }

  async function updateRequest(id: string, status: 'accepted' | 'declined') {
    const message = status === 'accepted' ? 'Rozilik berildi — ismlar ikki tomonga ochildi' : 'So‘rov yopildi'
    if (network) { await onServer(() => network.transitionIntroRequest(id, status), message); return }
    setRequests((current) => current.map((request) => request.id === id ? transitionIntroRequest(request, status) : request))
    showNotice(message)
  }

  async function blockPerson(person: Person) {
    setActiveMatch(null)
    if (network) { await onServer(() => network.block(person.id), 'Foydalanuvchi bloklandi — u sizni endi ko‘rmaydi'); return }
    setHidden((current) => current.includes(person.id) ? current : [...current, person.id])
    showNotice('Foydalanuvchi bloklandi')
  }

  async function reportPerson(person: Person) {
    if (network) { await onServer(() => network.report('user', person.id, 'inappropriate'), 'Shikoyat moderatorga yuborildi'); return }
    showNotice('Shikoyat qabul qilindi (demo)')
  }

  async function startCollaboration(request: IntroRequest) {
    if (collaborations.some((collaboration) => collaboration.introRequestId === request.id)) return
    if (network) {
      if (await onServer(() => network.createCollaboration(request.id, request.scope, defaultMilestones), 'Hamkorlik boshlandi')) setSection('progress')
      return
    }
    setCollaborations((current) => [createCollaboration(request, request.scope, defaultMilestones, Date.now()), ...current])
    setSection('progress')
    showNotice('Hamkorlik boshlandi — birinchi milestone tayyor')
  }

  async function finishMilestone(collaborationId: string, milestoneId: string) {
    if (network) { await onServer(() => network.completeMilestone(collaborationId, milestoneId), 'Milestone bajarildi'); return }
    setCollaborations((current) => current.map((collaboration) => collaboration.id === collaborationId ? completeMilestone(collaboration, milestoneId, Date.now()) : collaboration))
    showNotice('Milestone bajarildi')
  }

  async function submitOutcome(collaborationId: string, evidence: string) {
    const collaboration = collaborations.find((candidate) => candidate.id === collaborationId)
    if (!collaboration || verifications.some((verification) => verification.collaborationId === collaborationId && verification.status === 'pending')) return
    if (network) { await onServer(() => network.requestVerification(collaborationId, evidence), 'Natija hamkorga tasdiqlash uchun yuborildi'); return }
    const result = requestOutcomeVerification(collaboration, evidence, Date.now())
    setCollaborations((current) => current.map((candidate) => candidate.id === collaborationId ? result.collaboration : candidate))
    setVerifications((current) => [result.verification, ...current])
    showNotice('Natija hamkorga tasdiqlash uchun yuborildi')
  }

  async function resolveOutcome(verificationId: string, decision: 'confirmed' | 'disputed') {
    const message = decision === 'confirmed' ? 'Natija tasdiqlandi — trust signal yaratildi' : 'Natija qayta ko‘rib chiqish uchun qaytarildi'
    if (network) { await onServer(() => network.resolveVerification(verificationId, decision), message); return }
    const verification = verifications.find((candidate) => candidate.id === verificationId)
    const collaboration = verification && collaborations.find((candidate) => candidate.id === verification.collaborationId)
    if (!verification || !collaboration) return
    const result = resolveOutcomeVerification(collaboration, verification, decision, Date.now())
    setCollaborations((current) => current.map((candidate) => candidate.id === collaboration.id ? result.collaboration : candidate))
    setVerifications((current) => current.map((candidate) => candidate.id === verification.id ? result.verification : candidate))
    const signal = result.trustSignal
    if (signal) setTrustSignals((current) => current.some((existing) => existing.id === signal.id) ? current : [signal, ...current])
    showNotice(message)
  }

  async function signOut() {
    if (network) {
      try { await network.signOut() } catch { /* the session may already be gone */ }
    }
    onExit()
  }

  const connectedCount = requests.filter(request => request.status === 'accepted').length
  const completedMilestones = collaborations.flatMap(collaboration => collaboration.milestones).filter(milestone => milestone.status === 'completed').length
  const journey = collaborations.some(collaboration => collaboration.status === 'verified') ? 100
    : collaborations.length ? 75 : connectedCount ? 60 : requests.some(request => request.direction === 'outgoing') ? 45 : 25

  return (
    <div className="product-shell">
      <aside className="side-nav">
        <button className="side-brand" onClick={() => setSection('today')}><MiniMark /><b>niyat</b></button>
        <div className="side-caption">WORKSPACE</div>
        <div className="side-links">
          {workspaceNavigation.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}><i>{item.icon}</i>{item.label}{item.id === 'requests' && pendingCount > 0 && <em>{pendingCount}</em>}</button>)}
        </div>
        <div className="active-intent-mini">
          <span>FAOL NIYAT</span><b>{intent.title}</b><div><i style={{ width: `${journey}%` }} /></div><small>{matches.length} kesishma · {connectedCount} aloqa</small>
        </div>
        <button className="side-profile" onClick={() => setSection('trust')}><span>{viewer.name[0]?.toUpperCase()}</span><div><b>{viewer.name}</b><small>{viewer.subtitle}</small></div><i>···</i></button>
      </aside>

      <div className="product-body">
        {serverStatus === 'loading' && <div className="api-status" role="status">Server ma’lumotlari yuklanmoqda…</div>}
        {serverStatus === 'connected' && <div className="api-status connected" role="status">● SERVERGA ULANGAN</div>}
        {serverStatus === 'error' && <div className="api-status error" role="alert">Server sessiyasi topilmadi. Qayta kiring yoki local demo rejimini ishlating. <button onClick={() => { setServerStatus('loading'); refresh().catch(() => setServerStatus('error')) }}>Qayta urinish</button></div>}
        <div className="mobile-product-nav">
          {workspaceNavigation.slice(0, 5).map(item => <button aria-label={item.label} className={section === item.id ? 'active' : ''} key={item.id} onClick={() => setSection(item.id)}>{item.icon}<small>{item.label}</small></button>)}
        </div>

        {section === 'today' && <TodayView intent={intent} viewer={viewer} matches={matches} journey={journey} stats={{ connected: connectedCount, collaborations: collaborations.length, milestones: completedMilestones }} onOpenMatch={setActiveMatch} onNavigate={setSection} onEdit={onEdit} />}
        {section === 'discover' && <DiscoverView matches={matches} saved={saved} onSave={(id) => setSaved((current) => current.includes(id) ? current.filter(x => x !== id) : [...current, id])} onOpenMatch={setActiveMatch} onEdit={onEdit} />}
        {section === 'requests' && <RequestsView requests={requests} findPerson={findPerson} collaborations={collaborations} busy={busy} onUpdate={updateRequest} onStartCollaboration={startCollaboration} />}
        {section === 'circles' && <CirclesView circles={local ? data.circles : []} joined={joined} onJoin={(circle) => { setJoined((current) => current.includes(circle.id) ? current : [...current, circle.id]); showNotice(`“${circle.title}” circle’iga qo‘shilding`) }} />}
        {section === 'progress' && <ProgressView collaborations={collaborations} verifications={verifications} findPerson={findPerson} local={local} busy={busy} onCompleteMilestone={finishMilestone} onSubmitOutcome={submitOutcome} onResolveOutcome={resolveOutcome} />}
        {section === 'trust' && <TrustView viewer={viewer} local={local} actorId={actorId} trustSignals={trustSignals} findPerson={findPerson} onSignOut={signOut} />}
      </div>

      {activeMatch && <MatchDrawer match={activeMatch} alreadySent={hasOutgoingRequest(activeMatch)} busy={busy} onRequest={() => createRequest(activeMatch)} onBlock={() => blockPerson(activeMatch.person)} onReport={() => reportPerson(activeMatch.person)} onClose={() => setActiveMatch(null)} />}
      {notice && <div className="toast" role="status">✓ {notice}</div>}
    </div>
  )
}

function TodayView({ intent, viewer, matches, journey, stats, onOpenMatch, onNavigate, onEdit }: { intent: Intent; viewer: Viewer; matches: Match[]; journey: number; stats: { connected: number; collaborations: number; milestones: number }; onOpenMatch: (match: Match) => void; onNavigate: (section: WorkspaceSection) => void; onEdit: () => void }) {
  const [done, setDone] = useState(false)
  const top = matches[0]
  const strongestReason = top?.reasons[0]
  return <section className="product-view">
    <SectionTitle code={formatDayHeading()} title={`Xayrli tong, ${viewer.name}.`} description="Bugun niyatingni natijaga yaqinlashtiradigan bitta muhim ish bor." action={<button className="quiet-button" onClick={onEdit}>Niyatni tahrirlash</button>} />
    {top
      ? <div className={`mission ${done ? 'mission-done' : ''}`}><div className="mission-number">01</div><div className="mission-copy"><span>BUGUNGI QADAM · ≈ 15 DAQIQA</span><h2>{done ? 'Bugungi qadam bajarildi.' : 'Eng kuchli match bilan tanishuvni boshla.'}</h2><p>{done ? 'Zo‘r. Endi real javob kelishini kutamiz; keraksiz notification yubormaymiz.' : `${top.person.name} sen qidirayotgan ${top.youReceive[0] ?? 'tajriba'}ni bera oladi. Sen ham unga foydali bo‘la olasan.`}</p></div><button onClick={() => { if (!done) onOpenMatch(top); setDone(true) }}>{done ? '✓' : 'Boshlash →'}</button></div>
      : <div className="mission"><div className="mission-number">01</div><div className="mission-copy"><span>BUGUNGI QADAM</span><h2>Hozircha kesishma yo‘q.</h2><p>Tarmoqda sen bera oladigan va senga kerak narsa mos kelgan odam paydo bo‘lishi bilan shu yerda ko‘rasan. Takliflar va ehtiyojlarni aniqroq yozish imkoniyatni oshiradi.</p></div><button onClick={onEdit}>Tahrirlash →</button></div>}
    <div className="dashboard-grid">
      <div className="panel wide"><div className="panel-title"><span>YANGI KESISHMALAR</span><button onClick={() => onNavigate('discover')}>Barchasi →</button></div>{matches.length ? matches.slice(0, 3).map(match => <CompactMatch key={match.matchId ?? match.person.id} match={match} onClick={() => onOpenMatch(match)} />) : <p className="panel-empty">Kesishmalar shu yerda paydo bo‘ladi.</p>}</div>
      <div className="panel"><div className="panel-title"><span>FAOL NIYAT</span><button onClick={onEdit}>Tahrirlash</button></div><div className="intent-focus"><MiniMark /><h3>{intent.title}</h3><p>{intent.outcome}</p><div className="progress-line"><i style={{ width: `${journey}%` }} /></div><small>{journey}% · {journeyLabel(journey)}</small></div></div>
      <div className="panel"><div className="panel-title"><span>HOLAT</span><button onClick={() => onNavigate('progress')}>Hisobot →</button></div><div className="weekly-stats"><div><b>{stats.connected}</b><span>ochiq aloqa</span></div><div><b>{stats.collaborations}</b><span>hamkorlik</span></div><div><b>{stats.milestones}</b><span>milestone</span></div></div>{strongestReason && <p className="insight">↗ Eng kuchli signal: {strongestReason}</p>}</div>
    </div>
  </section>
}

function journeyLabel(journey: number) {
  return journey >= 100 ? 'Tasdiqlangan natija' : journey >= 75 ? 'Hamkorlik bosqichi' : journey >= 60 ? 'Aloqa ochildi' : journey >= 45 ? 'Intro yuborildi' : 'Niyat e’lon qilindi'
}

function DiscoverView({ matches, saved, onSave, onOpenMatch, onEdit }: { matches: Match[]; saved: string[]; onSave: (id: string) => void; onOpenMatch: (match: Match) => void; onEdit: () => void }) {
  const [filter, setFilter] = useState<'all' | 'strong' | 'saved'>('all')
  const key = (match: Match) => match.matchId ?? match.person.id
  const visible = matches.filter(m => filter === 'all' || (filter === 'strong' ? m.score >= 65 : saved.includes(key(m))))
  const empty = filter === 'saved'
    ? <EmptyState title="Hali saqlangan match yo‘q" text="Kashfiyotlardan foydali odamlarni saqlab qo‘y." />
    : <EmptyState title="Hozircha mos kesishma yo‘q" text="O‘zaro qiymat bo‘lgan niyat paydo bo‘lganda shu yerda ko‘rinadi." />
  return <section className="product-view"><SectionTitle code="DISCOVER · CHEKLANGAN FEED" title="Bugungi kashfiyotlar." description="Cheksiz scroll yo‘q. Faqat niyatingga aloqador, tushuntirilgan imkoniyatlar." action={matches.length ? undefined : <button className="quiet-button" onClick={onEdit}>Niyatni aniqlashtirish</button>} />
    <div className="filter-row"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Barchasi</button><button className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Kuchli match</button><button className={filter === 'saved' ? 'active' : ''} onClick={() => setFilter('saved')}>Saqlangan · {saved.length}</button></div>
    <div className="discovery-list">{visible.length ? visible.map(match => <article className="discovery-card" key={key(match)}><CompactMatch match={match} onClick={() => onOpenMatch(match)} /><div className="discovery-reason"><span>NIMA UCHUN</span>{match.reasons.map(reason => <i key={reason}>✓ {reason}</i>)}</div><button className={`save ${saved.includes(key(match)) ? 'active' : ''}`} onClick={() => onSave(key(match))}>{saved.includes(key(match)) ? '★ Saqlandi' : '☆ Saqlash'}</button></article>) : empty}</div>
  </section>
}

function RequestsView({ requests, findPerson, collaborations, busy, onUpdate, onStartCollaboration }: { requests: IntroRequest[]; findPerson: (id: string) => Person; collaborations: Collaboration[]; busy: boolean; onUpdate: (id: string, status: 'accepted' | 'declined') => void; onStartCollaboration: (request: IntroRequest) => void }) {
  return <section className="product-view"><SectionTitle code="CONSENT QUEUE" title="Aloqa sening nazoratingda." description="Kontakt faqat ikki tomon aniq rozilik berganda ochiladi." />
    {requests.length === 0 ? <EmptyState title="So‘rovlar hali yo‘q" text="Kesishmadan intro so‘rasang yoki senga so‘rov kelsa, shu yerda ko‘rinadi." /> : <div className="request-list">{requests.map(request => {
      const person = findPerson(request.personId)
      const started = collaborations.some(collaboration => collaboration.introRequestId === request.id)
      return <article className="request-card" key={request.id}><span className="person-avatar" style={{ background: person.accent }}>{person.initials}</span><div className="request-main"><div><b>{person.name}</b><small>{request.direction === 'incoming' ? 'Senga so‘rov yubordi' : 'Sen yubording'} · {request.sentAt}</small></div><h3>{request.scope}</h3><p>{person.intent.title}</p></div><div className={`request-status ${request.status}`}>{request.status === 'pending' && request.direction === 'incoming' ? <><button disabled={busy} onClick={() => onUpdate(request.id, 'accepted')}>Qabul qilish</button><button disabled={busy} onClick={() => onUpdate(request.id, 'declined')}>Rad etish</button></> : request.status === 'accepted' ? <button disabled={started || busy} onClick={() => onStartCollaboration(request)}>{started ? '✓ Hamkorlik faol' : 'Hamkorlikni boshlash →'}</button> : request.status === 'declined' ? 'Yopildi' : 'Javob kutilmoqda'}</div></article>
    })}</div>}
  </section>
}

function CirclesView({ circles, joined, onJoin }: { circles: Circle[]; joined: string[]; onJoin: (circle: Circle) => void }) {
  return <section className="product-view"><SectionTitle code="SMALL GROUPS · REAL OUTPUT" title="Birga bajariladigan sprintlar." description="4–8 odam. Bitta aniq natija. Cheklangan vaqt." />
    {circles.length === 0 ? <EmptyState title="Circles tez orada" text="Kichik guruh sprintlari private alpha’ning keyingi bosqichida ochiladi." /> : <div className="circle-grid">{circles.map(circle => <article className="circle-card" key={circle.id}><div className="circle-orbit"><b>{circle.day}</b><small>/{circle.duration} KUN</small></div><span className="kicker">{circle.tags.join(' · ')}</span><h2>{circle.title}</h2><p>{circle.outcome}</p><div className="member-line"><span>{'●'.repeat(circle.members)}<i>{'○'.repeat(circle.capacity - circle.members)}</i></span><small>{circle.members}/{circle.capacity} a’zo</small></div><div className="progress-line"><i style={{ width: `${circle.progress}%` }} /></div><button disabled={joined.includes(circle.id)} onClick={() => onJoin(circle)}>{joined.includes(circle.id) ? '✓ Qo‘shilgansan' : 'Circle’ga qo‘shilish →'}</button></article>)}</div>}
  </section>
}

type OutcomeActions = { busy: boolean; onCompleteMilestone: (collaborationId: string, milestoneId: string) => void; onSubmitOutcome: (collaborationId: string, evidence: string) => void; onResolveOutcome: (verificationId: string, decision: 'confirmed' | 'disputed') => void }

function ProgressView({ collaborations, verifications, findPerson, local, ...actions }: { collaborations: Collaboration[]; verifications: OutcomeVerification[]; findPerson: (id: string) => Person; local: boolean } & OutcomeActions) {
  const completedMilestones = collaborations.flatMap((collaboration) => collaboration.milestones).filter((milestone) => milestone.status === 'completed').length
  const readyOutcomes = collaborations.filter((collaboration) => collaboration.status === 'outcome-ready').length
  const verifiedOutcomes = collaborations.filter((collaboration) => collaboration.status === 'verified').length
  return <section className="product-view"><SectionTitle code="IMPACT" title="Harakat emas, natija." description="Like va ekranda o‘tgan vaqt emas — hayotingda yaratilgan qiymat." />
    <div className="impact-hero"><div><b>{collaborations.length}</b><span>hamkorlik</span></div><div><b>{verifiedOutcomes}</b><span>tasdiqlangan natija</span></div><div><b>{completedMilestones}</b><span>yakunlangan milestone</span></div><div><b>{readyOutcomes}</b><span>tasdiqqa tayyor natija</span></div></div>
    {collaborations.length === 0 ? <EmptyState title="Hamkorlik hali boshlanmagan" text="Qabul qilingan intro’dan hamkorlik boshlang va birinchi milestone’ni belgilang." /> : <div className="collaboration-list">{collaborations.map(collaboration => <CollaborationCard key={collaboration.id} collaboration={collaboration} verification={verifications.find(candidate => candidate.collaborationId === collaboration.id && candidate.status === 'pending')} person={findPerson(collaboration.personId)} local={local} {...actions} />)}</div>}
  </section>
}

function CollaborationCard({ collaboration, verification, person, local, busy, onCompleteMilestone, onSubmitOutcome, onResolveOutcome }: { collaboration: Collaboration; verification?: OutcomeVerification; person: Person; local: boolean } & OutcomeActions) {
  const [evidence, setEvidence] = useState('')
  const statusLabel = collaboration.status === 'verified' ? '✓ TASDIQLANGAN NATIJA' : collaboration.status === 'verification-pending' ? 'HAMKOR TASDIG‘I KUTILMOQDA' : collaboration.status === 'outcome-ready' ? 'NATIJA TASDIQQA TAYYOR' : 'FAOL HAMKORLIK'
  // In server mode only the counterparty sees decision buttons; the requester can never confirm their own outcome.
  const canDecide = verification && (local || verification.awaitingMyDecision)

  return <article className={`collaboration-card ${collaboration.status}`}><div className="panel-title"><span>{statusLabel}</span><small>{person.name}</small></div><h2>{collaboration.title}</h2><div className="milestone-list">{collaboration.milestones.map(milestone => <div className={milestone.status} key={milestone.id}><i>{milestone.status === 'completed' ? '✓' : '○'}</i><span>{milestone.title}</span>{milestone.status === 'pending' && collaboration.status === 'active' && <button disabled={busy} onClick={() => onCompleteMilestone(collaboration.id, milestone.id)}>Bajarildi</button>}</div>)}</div>
    {collaboration.status === 'outcome-ready' && <form className="verification-form" onSubmit={(event) => { event.preventDefault(); onSubmitOutcome(collaboration.id, evidence.trim()); setEvidence('') }}><label htmlFor={`evidence-${collaboration.id}`}>NIMA NATIJA YARATILDI?</label><textarea id={`evidence-${collaboration.id}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Aniq natija yoki topshirilgan artefaktni yozing…" maxLength={2000} /><button className="primary" disabled={!evidence.trim() || busy}>Tasdiqqa yuborish <span>→</span></button></form>}
    {collaboration.status === 'verification-pending' && verification && <div className="verification-review"><span>{local ? 'COUNTERPARTY PREVIEW · LOCAL DEMO' : canDecide ? 'SIZNING QARORINGIZ KERAK' : 'HAMKOR QARORI KUTILMOQDA'}</span><p>“{verification.evidence}”</p><small>{local ? 'Production’da bu qarorni faqat autentifikatsiyalangan hamkor bera oladi.' : canDecide ? 'Natija haqiqatan yaratilganini tasdiqlang yoki qayta ko‘rib chiqishni so‘rang.' : 'So‘rovchi o‘z natijasini tasdiqlay olmaydi.'}</small>{canDecide && <div><button disabled={busy} onClick={() => onResolveOutcome(verification.id, 'confirmed')}>✓ Tasdiqlash</button><button className="dispute" disabled={busy} onClick={() => onResolveOutcome(verification.id, 'disputed')}>Qayta ko‘rib chiqish</button></div>}</div>}
    {collaboration.status === 'verified' && <p className="verified-outcome">✓ Hamkor tasdiqladi. Bu natija Trust markazida signal sifatida ko‘rinadi.</p>}
  </article>
}

type PrivacySettings = { matchedOnly: boolean; aiDrafts: boolean; activity: boolean; analytics: boolean }

function TrustView({ viewer, local, actorId, trustSignals, findPerson, onSignOut }: { viewer: Viewer; local: boolean; actorId: string; trustSignals: TrustSignal[]; findPerson: (id: string) => Person; onSignOut: () => void }) {
  const [settings, setSettings] = usePersistentState<PrivacySettings>(storageKeys.privacySettings, { matchedOnly: true, aiDrafts: true, activity: false, analytics: true })
  const toggle = (key: keyof PrivacySettings) => setSettings(current => ({ ...current, [key]: !current[key] }))
  return <section className="product-view"><SectionTitle code="PRIVACY · PERMISSIONS · SAFETY" title="Ma’lumoting — seniki." description="Kim nimani ko‘rishi va AI nima qilishi mumkinligini shu yerdan boshqarasan." />
    <div className="trust-grid">
      <div className="panel"><div className="panel-title"><span>IDENTITY</span>{viewer.verified && <small className="verified">✓ TASDIQLANGAN</small>}</div><div className="identity-row"><span className="profile-big">{viewer.name[0]?.toUpperCase()}</span><div><h3>{viewer.name}</h3><p>{local ? 'Local demo · ma’lumot faqat shu brauzerda' : `Private alpha sessiyasi · ${actorId.slice(0, 8)}`}</p></div></div><p className="panel-note">Ismingiz match’larda yashirin turadi va faqat intro qabul qilingach ochiladi.</p></div>
      <div className="panel"><div className="panel-title"><span>RUXSATLAR · SHU QURILMADA</span></div><Toggle label="Faqat matchlar profilimni ko‘rsin" active={settings.matchedOnly} onClick={() => toggle('matchedOnly')} /><Toggle label="AI faqat draft tayyorlasin" active={settings.aiDrafts} onClick={() => toggle('aiDrafts')} /><Toggle label="Faollik holatini ko‘rsatish" active={settings.activity} onClick={() => toggle('activity')} /><Toggle label="Anonim product analytics" active={settings.analytics} onClick={() => toggle('analytics')} /></div>
      <div className="panel wide trust-signals"><div className="panel-title"><span>VERIFIED OUTCOMES</span><small>{trustSignals.length} SIGNAL</small></div>{trustSignals.length === 0 ? <p className="trust-empty">Hamkor tasdiqlagan natijalar shu yerda paydo bo‘ladi. Signal faqat ikki tomon qaroridan keyin yaratiladi.</p> : trustSignals.map(signal => <div className="trust-signal" key={signal.id}><i>✓</i><div><b>{signal.label}</b><span>{findPerson(signal.personId).name} tasdiqladi · {formatShortDate(signal.issuedAt)}</span></div></div>)}</div>
      <div className="panel wide"><div className="panel-title"><span>DATA CONTROLS</span></div><div className="data-actions"><button disabled title="Tez orada">↓ Ma’lumotlarni eksport qilish · tez orada</button><button disabled title="Tez orada">⌁ Boshqa sessiyalarni yopish · tez orada</button><button className="danger" onClick={onSignOut}>{local ? 'Demodan chiqish' : 'Akkauntdan chiqish'}</button></div></div>
    </div>
  </section>
}
