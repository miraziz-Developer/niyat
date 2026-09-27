import { useCallback, useEffect, useMemo, useState } from 'react'
import { completeMilestone, createCollaboration } from '../../application/collaborations/manage-collaboration'
import { rankMatches } from '../../application/matching/rank-matches'
import { requestOutcomeVerification, resolveOutcomeVerification } from '../../application/outcomes/manage-outcome-verification'
import { createIntroRequest, transitionIntroRequest } from '../../application/requests/manage-intro-request'
import { NetworkError } from '../../application/ports/network-client'
import type { Circle, Collaboration, Intent, IntroRequest, Match, OutcomeVerification, Person, TrustSignal } from '../../domain/model/entities'
import type { Viewer } from '../app.types'
import { describeError } from '../shared/describe-error'
import { formatDayHeading, formatShortDate } from '../shared/format-date'
import { useNetwork } from '../shared/network-context'
import { storageKeys } from '../shared/storage-keys'
import { usePersistentState } from '../shared/use-persistent-state'
import { useTransientNotice } from '../shared/use-transient-notice'
import { mapCollaboration, mapServerIntro, mapServerMatch, mapTrustSignal, mapVerification, uniquePeople, unknownPerson } from './server-workspace-mappers'
import { CompactMatch, EmptyState, LoadingState, MatchDrawer, MiniMark, SectionTitle, Toggle } from './WorkspaceComponents'
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
  /** Server mode: called when the API reports the session is gone, so the app can return to sign-in. */
  onSessionExpired?: () => void
}

type ServerStatus = 'local' | 'loading' | 'connected' | 'error'

const defaultMilestones = ['Birinchi uchrashuvni o‘tkazish', 'Keyingi amaliy qadamni yakunlash']

export default function ProductApp({ intent, server, viewer, data, onEdit, onExit, onSessionExpired }: ProductAppProps) {
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

  const failed = useCallback((error: unknown) => {
    if (error instanceof NetworkError && error.status === 401 && onSessionExpired) { onSessionExpired(); return true }
    return false
  }, [onSessionExpired])

  useEffect(() => {
    refresh().catch(error => { if (!failed(error)) setServerStatus('error') })
  }, [refresh, failed])

  /** Runs a server mutation, then re-reads the server's view so the UI never guesses state. */
  async function onServer(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    try {
      await action()
      await refresh()
      showNotice(success)
      return true
    } catch (error) {
      if (!failed(error)) showNotice(describeError(error), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  function hasOutgoingRequest(match: Match) {
    return local ? requests.some(request => request.personId === match.person.id && request.direction === 'outgoing') : Boolean(match.introId)
  }

  async function createRequest(match: Match, scope: string, message: string) {
    if (hasOutgoingRequest(match)) return
    if (network && match.matchId) {
      const matchId = match.matchId
      if (await onServer(() => network.createIntroRequest(matchId, scope, message), 'Intro so‘rovi yuborildi')) setActiveMatch(null)
      return
    }
    setRequests((current) => [createIntroRequest(match.person.id, scope, Date.now()), ...current])
    setActiveMatch(null)
    showNotice('Intro so‘rovi yuborildi')
  }

  async function updateRequest(id: string, status: 'accepted' | 'declined' | 'cancelled') {
    const message = status === 'accepted' ? 'Rozilik berildi — ismlar ikki tomonga ochildi' : status === 'cancelled' ? 'So‘rov bekor qilindi' : 'So‘rov rad etildi'
    if (network) { await onServer(() => network.transitionIntroRequest(id, status), message); return }
    // The local demo has no separate cancelled state; a withdrawn request simply closes.
    setRequests((current) => current.map((request) => request.id === id ? transitionIntroRequest(request, status === 'cancelled' ? 'declined' : status) : request))
    showNotice(message)
  }

  async function blockPerson(person: Person) {
    setActiveMatch(null)
    if (network) { await onServer(() => network.block(person.id), 'Foydalanuvchi bloklandi — u sizni endi ko‘rmaydi'); return }
    setHidden((current) => current.includes(person.id) ? current : [...current, person.id])
    showNotice('Foydalanuvchi bloklandi')
  }

  async function reportPerson(person: Person, reason: string) {
    if (network) { await onServer(() => network.report('user', person.id, reason), 'Shikoyat moderatorga yuborildi'); return }
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

  function navigate(next: WorkspaceSection) {
    setSection(next)
    window.scrollTo({ top: 0 })
  }

  const loading = serverStatus === 'loading'
  const connectedCount = requests.filter(request => request.status === 'accepted').length
  const completedMilestones = collaborations.flatMap(collaboration => collaboration.milestones).filter(milestone => milestone.status === 'completed').length
  const journey = collaborations.some(collaboration => collaboration.status === 'verified') ? 100
    : collaborations.length ? 75 : connectedCount ? 60 : requests.some(request => request.direction === 'outgoing') ? 45 : 25

  return (
    <div className="product-shell">
      <aside className="side-nav" aria-label="Workspace">
        <button className="side-brand" onClick={() => navigate('today')}><MiniMark /><b>niyat</b></button>
        <div className="side-caption">Workspace</div>
        <nav className="side-links" aria-label="Bo‘limlar">
          {workspaceNavigation.map((item) => <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}><i aria-hidden="true">{item.icon}</i>{item.label}{item.id === 'requests' && pendingCount > 0 && <em aria-label={`${pendingCount} ta yangi`}>{pendingCount}</em>}</button>)}
        </nav>
        <button className="active-intent-mini" style={{ textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer' }} onClick={onEdit} aria-label="Faol niyatni tahrirlash">
          <span>Faol niyat</span><b>{intent.title}</b><div aria-hidden="true"><i style={{ width: `${journey}%` }} /></div><small>{matches.length} kesishma · {connectedCount} aloqa</small>
        </button>
        <button className="side-profile" onClick={() => navigate('trust')}><span aria-hidden="true">{viewer.name[0]?.toUpperCase()}</span><div><b>{viewer.name}</b><small>{viewer.subtitle}</small></div></button>
      </aside>

      <div className="product-body">
        {serverStatus === 'connected' && <div className="api-status connected" role="status"><span aria-hidden="true">●</span> Serverga ulangan · o‘zgarishlar saqlanadi</div>}
        {serverStatus === 'error' && <div className="api-status error" role="alert">Server bilan aloqa uzildi yoki sessiya tugagan. <button onClick={() => { setServerStatus('loading'); refresh().catch(() => setServerStatus('error')) }}>Qayta urinish</button></div>}
        <nav className="mobile-product-nav" aria-label="Bo‘limlar">
          {workspaceNavigation.map(item => <button aria-label={item.label} aria-current={section === item.id ? 'page' : undefined} className={section === item.id ? 'active' : ''} key={item.id} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span><small aria-hidden="true">{item.short}</small>{item.id === 'requests' && pendingCount > 0 && <em aria-hidden="true">{pendingCount}</em>}</button>)}
        </nav>

        <main>
          {loading && <section className="product-view"><LoadingState rows={4} /></section>}
          {!loading && section === 'today' && <TodayView intent={intent} viewer={viewer} matches={matches} journey={journey} stats={{ connected: connectedCount, collaborations: collaborations.length, milestones: completedMilestones }} onOpenMatch={setActiveMatch} onNavigate={navigate} onEdit={onEdit} />}
          {!loading && section === 'discover' && <DiscoverView matches={matches} saved={saved} onSave={(id) => setSaved((current) => current.includes(id) ? current.filter(x => x !== id) : [...current, id])} onOpenMatch={setActiveMatch} onEdit={onEdit} />}
          {!loading && section === 'requests' && <RequestsView requests={requests} findPerson={findPerson} collaborations={collaborations} busy={busy} onUpdate={updateRequest} onStartCollaboration={startCollaboration} onDiscover={() => navigate('discover')} />}
          {!loading && section === 'circles' && <CirclesView circles={local ? data.circles : []} joined={joined} onJoin={(circle) => { setJoined((current) => current.includes(circle.id) ? current : [...current, circle.id]); showNotice(`“${circle.title}” doirasiga qo‘shilding`) }} />}
          {!loading && section === 'progress' && <ProgressView collaborations={collaborations} verifications={verifications} findPerson={findPerson} local={local} busy={busy} onCompleteMilestone={finishMilestone} onSubmitOutcome={submitOutcome} onResolveOutcome={resolveOutcome} onRequests={() => navigate('requests')} />}
          {!loading && section === 'trust' && <TrustView viewer={viewer} local={local} actorId={actorId} trustSignals={trustSignals} findPerson={findPerson} onSignOut={signOut} />}
        </main>
      </div>

      {activeMatch && <MatchDrawer key={activeMatch.matchId ?? activeMatch.person.id} match={activeMatch} alreadySent={hasOutgoingRequest(activeMatch)} busy={busy} onRequest={(scope, message) => createRequest(activeMatch, scope, message)} onBlock={() => blockPerson(activeMatch.person)} onReport={(reason) => reportPerson(activeMatch.person, reason)} onClose={() => setActiveMatch(null)} />}
      <div aria-live="polite" aria-atomic="true">{notice && <div className={`toast${notice.tone === 'error' ? ' error' : ''}`} role={notice.tone === 'error' ? 'alert' : 'status'}><span aria-hidden="true">{notice.tone === 'error' ? '!' : '✓'}</span>{notice.message}</div>}</div>
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
      ? <div className={`mission ${done ? 'mission-done' : ''}`}><div className="mission-number" aria-hidden="true">01</div><div className="mission-copy"><span>Bugungi qadam · ≈ 15 daqiqa</span><h2>{done ? 'Bugungi qadam bajarildi.' : 'Eng kuchli match bilan tanishuvni boshla.'}</h2><p>{done ? 'Zo‘r. Endi real javob kelishini kutamiz; keraksiz bildirishnoma yubormaymiz.' : `${top.person.name} sen qidirayotgan “${top.youReceive[0] ?? 'tajriba'}”ni bera oladi. Sen ham unga foydali bo‘la olasan.`}</p></div><button onClick={() => { if (!done) onOpenMatch(top); setDone(true) }}>{done ? '✓ Bajarildi' : 'Boshlash →'}</button></div>
      : <div className="mission"><div className="mission-number" aria-hidden="true">01</div><div className="mission-copy"><span>Bugungi qadam</span><h2>Hozircha kesishma yo‘q.</h2><p>Sen bera oladigan va senga kerak narsa mos kelgan odam paydo bo‘lishi bilan shu yerda ko‘rasan. Takliflar va ehtiyojlarni aniqroq yozish imkoniyatni oshiradi.</p></div><button onClick={onEdit}>Niyatni aniqlashtirish →</button></div>}
    <div className="dashboard-grid">
      <div className="panel wide"><div className="panel-title"><span>Yangi kesishmalar</span>{matches.length > 0 && <button onClick={() => onNavigate('discover')}>Barchasi ({matches.length}) →</button>}</div>{matches.length ? matches.slice(0, 3).map(match => <CompactMatch key={match.matchId ?? match.person.id} match={match} onClick={() => onOpenMatch(match)} />) : <p className="panel-empty">Kesishmalar shu yerda paydo bo‘ladi.</p>}</div>
      <div className="panel"><div className="panel-title"><span>Faol niyat</span><button onClick={onEdit}>Tahrirlash</button></div><div className="intent-focus"><MiniMark /><h3>{intent.title}</h3><p>{intent.outcome}</p><div className="progress-line" role="progressbar" aria-label="Niyat yo‘li" aria-valuenow={journey} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${journey}%` }} /></div><small>{journey}% · {journeyLabel(journey)}</small></div></div>
      <div className="panel"><div className="panel-title"><span>Holat</span><button onClick={() => onNavigate('progress')}>Hisobot →</button></div><div className="weekly-stats"><div><b>{stats.connected}</b><span>ochiq aloqa</span></div><div><b>{stats.collaborations}</b><span>hamkorlik</span></div><div><b>{stats.milestones}</b><span>milestone</span></div></div>{strongestReason && <p className="insight">↗ Eng kuchli signal: {strongestReason}</p>}</div>
    </div>
  </section>
}

function journeyLabel(journey: number) {
  return journey >= 100 ? 'Tasdiqlangan natija' : journey >= 75 ? 'Hamkorlik bosqichi' : journey >= 60 ? 'Aloqa ochildi' : journey >= 45 ? 'Intro yuborildi' : 'Niyat e’lon qilindi'
}

function DiscoverView({ matches, saved, onSave, onOpenMatch, onEdit }: { matches: Match[]; saved: string[]; onSave: (id: string) => void; onOpenMatch: (match: Match) => void; onEdit: () => void }) {
  const [filter, setFilter] = useState<'all' | 'strong' | 'saved'>('all')
  const key = (match: Match) => match.matchId ?? match.person.id
  const savedCount = matches.filter(match => saved.includes(key(match))).length
  const strongCount = matches.filter(match => match.score >= 65).length
  const visible = matches.filter(m => filter === 'all' || (filter === 'strong' ? m.score >= 65 : saved.includes(key(m))))
  const empty = filter === 'saved'
    ? <EmptyState title="Hali saqlangan match yo‘q" text="Kartadagi “Saqlash” tugmasi bilan keyinroq qaytmoqchi bo‘lgan odamlarni belgilang." action={<button className="quiet-button" onClick={() => setFilter('all')}>Barchasini ko‘rish</button>} />
    : filter === 'strong'
      ? <EmptyState title="65% dan kuchli match hozircha yo‘q" text="Barcha kesishmalarda ham foydali odamlar bo‘lishi mumkin." action={<button className="quiet-button" onClick={() => setFilter('all')}>Barchasini ko‘rish</button>} />
      : <EmptyState title="Hozircha mos kesishma yo‘q" text="O‘zaro qiymat bo‘lgan niyat paydo bo‘lganda shu yerda ko‘rinadi. Takliflaringizni kengaytirish imkoniyatni oshiradi." action={<button className="primary" onClick={onEdit}>Niyatni aniqlashtirish</button>} />
  return <section className="product-view"><SectionTitle code="Kashfiyot · cheklangan lenta" title="Bugungi kashfiyotlar." description="Cheksiz scroll yo‘q. Faqat niyatingga aloqador, tushuntirilgan imkoniyatlar." />
    <div className="filter-row" role="group" aria-label="Saralash">
      <button aria-pressed={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Barchasi · {matches.length}</button>
      <button aria-pressed={filter === 'strong'} className={filter === 'strong' ? 'active' : ''} onClick={() => setFilter('strong')}>Kuchli · {strongCount}</button>
      <button aria-pressed={filter === 'saved'} className={filter === 'saved' ? 'active' : ''} onClick={() => setFilter('saved')}>Saqlangan · {savedCount}</button>
    </div>
    <div className="discovery-list">{visible.length ? visible.map(match => <article className="discovery-card" key={key(match)}>
      <CompactMatch match={match} onClick={() => onOpenMatch(match)} />
      <div className="discovery-footer">
        <div className="discovery-reason"><span>Nega</span>{match.reasons.slice(0, 3).map(reason => <i key={reason}>✓ {reason}</i>)}</div>
        <button aria-pressed={saved.includes(key(match))} className={`save ${saved.includes(key(match)) ? 'active' : ''}`} onClick={() => onSave(key(match))}>{saved.includes(key(match)) ? '★ Saqlandi' : '☆ Saqlash'}</button>
      </div>
    </article>) : empty}</div>
  </section>
}

const requestBadge = { pending: 'Kutilmoqda', accepted: 'Qabul qilingan', declined: 'Yopilgan' } as const

function RequestsView({ requests, findPerson, collaborations, busy, onUpdate, onStartCollaboration, onDiscover }: { requests: IntroRequest[]; findPerson: (id: string) => Person; collaborations: Collaboration[]; busy: boolean; onUpdate: (id: string, status: 'accepted' | 'declined' | 'cancelled') => void; onStartCollaboration: (request: IntroRequest) => void; onDiscover: () => void }) {
  // Actionable items first: incoming decisions, then accepted intros waiting for a collaboration.
  const order = (request: IntroRequest) => request.status === 'pending' && request.direction === 'incoming' ? 0 : request.status === 'accepted' ? 1 : request.status === 'pending' ? 2 : 3
  const sorted = [...requests].sort((a, b) => order(a) - order(b))
  return <section className="product-view"><SectionTitle code="Rozilik navbati" title="Aloqa sening nazoratingda." description="Ism va kontakt faqat ikki tomon aniq rozilik berganda ochiladi." />
    {sorted.length === 0 ? <EmptyState title="So‘rovlar hali yo‘q" text="Kesishmadan intro so‘rasang yoki senga so‘rov kelsa, shu yerda ko‘rinadi." action={<button className="primary" onClick={onDiscover}>Kesishmalarni ko‘rish</button>} /> : <div className="request-list">{sorted.map(request => {
      const person = findPerson(request.personId)
      const started = collaborations.some(collaboration => collaboration.introRequestId === request.id)
      const incoming = request.direction === 'incoming'
      return <article className="request-card" key={request.id}>
        <span className="person-avatar" style={{ background: person.accent }} aria-hidden="true">{person.initials}</span>
        <div className="request-main"><div><b>{person.name}</b><small>{incoming ? 'Senga so‘rov yubordi' : 'Sen yubording'} · {request.sentAt}</small></div><h3>{request.scope}</h3><p>{person.intent.title}</p></div>
        <div className="request-status">
          <span className={`badge ${request.status}`}>{started ? 'Hamkorlik faol' : requestBadge[request.status]}</span>
          {request.status === 'pending' && incoming && <><button className="accept" disabled={busy} onClick={() => onUpdate(request.id, 'accepted')}>Qabul qilish</button><button disabled={busy} onClick={() => onUpdate(request.id, 'declined')}>Rad etish</button></>}
          {request.status === 'pending' && !incoming && <button disabled={busy} onClick={() => onUpdate(request.id, 'cancelled')}>So‘rovni bekor qilish</button>}
          {request.status === 'accepted' && !started && <button className="accept" disabled={busy} onClick={() => onStartCollaboration(request)}>Hamkorlikni boshlash →</button>}
        </div>
      </article>
    })}</div>}
  </section>
}

function CirclesView({ circles, joined, onJoin }: { circles: Circle[]; joined: string[]; onJoin: (circle: Circle) => void }) {
  return <section className="product-view"><SectionTitle code="Kichik guruhlar · real natija" title="Birga bajariladigan sprintlar." description="4–8 odam. Bitta aniq natija. Cheklangan vaqt." />
    {circles.length === 0 ? <EmptyState title="Doiralar tez orada" text="Kichik guruh sprintlari private alpha’ning keyingi bosqichida ochiladi." /> : <div className="circle-grid">{circles.map(circle => <article className="circle-card" key={circle.id}><div className="circle-orbit" aria-label={`${circle.duration} kundan ${circle.day}-kun`}><b>{circle.day}</b><small>/{circle.duration} KUN</small></div><span className="kicker">{circle.tags.join(' · ')}</span><h2>{circle.title}</h2><p>{circle.outcome}</p><div className="member-line"><span aria-hidden="true">{'●'.repeat(circle.members)}<i>{'○'.repeat(circle.capacity - circle.members)}</i></span><small>{circle.members}/{circle.capacity} a’zo</small></div><div className="progress-line" role="progressbar" aria-label="Sprint jarayoni" aria-valuenow={circle.progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${circle.progress}%` }} /></div><button disabled={joined.includes(circle.id)} onClick={() => onJoin(circle)}>{joined.includes(circle.id) ? '✓ Qo‘shilgansan' : 'Doiraga qo‘shilish →'}</button></article>)}</div>}
  </section>
}

type OutcomeActions = { busy: boolean; onCompleteMilestone: (collaborationId: string, milestoneId: string) => void; onSubmitOutcome: (collaborationId: string, evidence: string) => void; onResolveOutcome: (verificationId: string, decision: 'confirmed' | 'disputed') => void }

function ProgressView({ collaborations, verifications, findPerson, local, onRequests, ...actions }: { collaborations: Collaboration[]; verifications: OutcomeVerification[]; findPerson: (id: string) => Person; local: boolean; onRequests: () => void } & OutcomeActions) {
  const completedMilestones = collaborations.flatMap((collaboration) => collaboration.milestones).filter((milestone) => milestone.status === 'completed').length
  const readyOutcomes = collaborations.filter((collaboration) => collaboration.status === 'outcome-ready').length
  const verifiedOutcomes = collaborations.filter((collaboration) => collaboration.status === 'verified').length
  return <section className="product-view"><SectionTitle code="Ta’sir" title="Harakat emas, natija." description="Like va ekranda o‘tgan vaqt emas — hayotingda yaratilgan qiymat." />
    <div className="impact-hero"><div><b>{collaborations.length}</b><span>hamkorlik</span></div><div><b>{verifiedOutcomes}</b><span>tasdiqlangan natija</span></div><div><b>{completedMilestones}</b><span>yakunlangan milestone</span></div><div><b>{readyOutcomes}</b><span>tasdiqqa tayyor natija</span></div></div>
    {collaborations.length === 0 ? <EmptyState title="Hamkorlik hali boshlanmagan" text="Qabul qilingan intro’dan hamkorlik boshlang va birinchi milestone’ni belgilang." action={<button className="quiet-button" onClick={onRequests}>So‘rovlarga o‘tish</button>} /> : <div className="collaboration-list">{collaborations.map(collaboration => <CollaborationCard key={collaboration.id} collaboration={collaboration} verification={verifications.find(candidate => candidate.collaborationId === collaboration.id && candidate.status === 'pending')} person={findPerson(collaboration.personId)} local={local} {...actions} />)}</div>}
  </section>
}

function CollaborationCard({ collaboration, verification, person, local, busy, onCompleteMilestone, onSubmitOutcome, onResolveOutcome }: { collaboration: Collaboration; verification?: OutcomeVerification; person: Person; local: boolean } & OutcomeActions) {
  const [evidence, setEvidence] = useState('')
  const statusLabel = collaboration.status === 'verified' ? '✓ Tasdiqlangan natija' : collaboration.status === 'verification-pending' ? 'Hamkor tasdig‘i kutilmoqda' : collaboration.status === 'outcome-ready' ? 'Natija tasdiqqa tayyor' : 'Faol hamkorlik'
  const done = collaboration.milestones.filter(milestone => milestone.status === 'completed').length
  // In server mode only the counterparty sees decision buttons; the requester can never confirm their own outcome.
  const canDecide = verification && (local || verification.awaitingMyDecision)

  return <article className={`collaboration-card ${collaboration.status}`}>
    <div className="panel-title"><span>{statusLabel}</span><small>{person.name} · {done}/{collaboration.milestones.length} milestone</small></div>
    <h2>{collaboration.title}</h2>
    <div className="milestone-list">{collaboration.milestones.map(milestone => <div className={milestone.status} key={milestone.id}><i aria-hidden="true">{milestone.status === 'completed' ? '✓' : ''}</i><span>{milestone.title}<span className="sr-only">{milestone.status === 'completed' ? ' — bajarilgan' : ' — kutilmoqda'}</span></span>{milestone.status === 'pending' && collaboration.status === 'active' && <button disabled={busy} onClick={() => onCompleteMilestone(collaboration.id, milestone.id)}>Bajarildi</button>}</div>)}</div>
    {collaboration.status === 'outcome-ready' && <form className="verification-form" onSubmit={(event) => { event.preventDefault(); onSubmitOutcome(collaboration.id, evidence.trim()); setEvidence('') }}><label htmlFor={`evidence-${collaboration.id}`}>NIMA NATIJA YARATILDI?</label><textarea id={`evidence-${collaboration.id}`} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Aniq natija yoki topshirilgan artefaktni yozing…" maxLength={2000} /><button className="primary" disabled={!evidence.trim() || busy}>Tasdiqqa yuborish <span aria-hidden="true">→</span></button></form>}
    {collaboration.status === 'verification-pending' && verification && <div className="verification-review"><span>{local ? 'Hamkor ko‘rinishi · local demo' : canDecide ? 'SIZNING QARORINGIZ KERAK' : 'HAMKOR QARORI KUTILMOQDA'}</span><p>“{verification.evidence}”</p><small>{local ? 'Production’da bu qarorni faqat autentifikatsiyalangan hamkor bera oladi.' : canDecide ? 'Natija haqiqatan yaratilganini tasdiqlang yoki qayta ko‘rib chiqishni so‘rang.' : 'So‘rovchi o‘z natijasini tasdiqlay olmaydi.'}</small>{canDecide && <div><button disabled={busy} onClick={() => onResolveOutcome(verification.id, 'confirmed')}>✓ Tasdiqlash</button><button className="dispute" disabled={busy} onClick={() => onResolveOutcome(verification.id, 'disputed')}>Qayta ko‘rib chiqish</button></div>}</div>}
    {collaboration.status === 'verified' && <p className="verified-outcome">✓ Hamkor tasdiqladi. Bu natija Trust markazida signal sifatida ko‘rinadi.</p>}
  </article>
}

type PrivacySettings = { matchedOnly: boolean; aiDrafts: boolean; activity: boolean; analytics: boolean }

function TrustView({ viewer, local, actorId, trustSignals, findPerson, onSignOut }: { viewer: Viewer; local: boolean; actorId: string; trustSignals: TrustSignal[]; findPerson: (id: string) => Person; onSignOut: () => void }) {
  const [settings, setSettings] = usePersistentState<PrivacySettings>(storageKeys.privacySettings, { matchedOnly: true, aiDrafts: true, activity: false, analytics: true })
  const [confirmExit, setConfirmExit] = useState(false)
  const toggle = (key: keyof PrivacySettings) => setSettings(current => ({ ...current, [key]: !current[key] }))
  return <section className="product-view"><SectionTitle code="Maxfiylik · ruxsatlar · xavfsizlik" title="Ma’lumoting — seniki." description="Kim nimani ko‘rishi va AI nima qilishi mumkinligini shu yerdan boshqarasan." />
    <div className="trust-grid">
      <div className="panel"><div className="panel-title"><span>Identitet</span>{viewer.verified && <small className="verified">✓ Tasdiqlangan</small>}</div><div className="identity-row"><span className="profile-big" aria-hidden="true">{viewer.name[0]?.toUpperCase()}</span><div><h3>{viewer.name}</h3><p>{local ? 'Local demo · ma’lumot faqat shu brauzerda' : `Private alpha sessiyasi · ${actorId.slice(0, 8)}`}</p></div></div><p className="panel-note">Ismingiz match’larda yashirin turadi va faqat intro qabul qilingach ochiladi.</p></div>
      <div className="panel"><div className="panel-title"><span>Ruxsatlar</span><small>Shu qurilmada</small></div><Toggle label="Faqat matchlar profilimni ko‘rsin" active={settings.matchedOnly} onClick={() => toggle('matchedOnly')} /><Toggle label="AI faqat draft tayyorlasin" active={settings.aiDrafts} onClick={() => toggle('aiDrafts')} /><Toggle label="Faollik holatini ko‘rsatish" active={settings.activity} onClick={() => toggle('activity')} /><Toggle label="Anonim product analytics" active={settings.analytics} onClick={() => toggle('analytics')} /></div>
      <div className="panel wide trust-signals"><div className="panel-title"><span>Tasdiqlangan natijalar</span><small>{trustSignals.length} signal</small></div>{trustSignals.length === 0 ? <p className="trust-empty">Hamkor tasdiqlagan natijalar shu yerda paydo bo‘ladi. Signal faqat ikki tomon qaroridan keyin yaratiladi.</p> : trustSignals.map(signal => <div className="trust-signal" key={signal.id}><i aria-hidden="true">✓</i><div><b>{signal.label}</b><span>{findPerson(signal.personId).name} tasdiqladi · {formatShortDate(signal.issuedAt)}</span></div></div>)}</div>
      <div className="panel wide"><div className="panel-title"><span>Ma’lumotlarni boshqarish</span></div>
        {confirmExit
          ? <div className="confirm-box neutral"><p>{local ? 'Demodan chiqasizmi? Kiritgan ma’lumotlaringiz shu brauzerda saqlanib qoladi.' : 'Akkauntdan chiqasizmi? Qayta kirish uchun yangi sessiya kerak bo‘ladi.'}</p><div><button className="danger-button" onClick={onSignOut}>Ha, chiqish</button><button className="ghost-button" onClick={() => setConfirmExit(false)}>Qolish</button></div></div>
          : <div className="data-actions"><button className="ghost-button" disabled title="Tez orada">↓ Eksport · tez orada</button><button className="ghost-button" disabled title="Tez orada">⌁ Boshqa sessiyalarni yopish · tez orada</button><button className="danger-button" onClick={() => setConfirmExit(true)}>{local ? 'Demodan chiqish' : 'Akkauntdan chiqish'}</button></div>}
      </div>
    </div>
  </section>
}
