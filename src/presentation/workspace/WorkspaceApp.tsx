import { useMemo, useState } from 'react'
import { rankMatches } from '../../application/matching/rank-matches'
import { createIntroRequest, transitionIntroRequest } from '../../application/requests/manage-intro-request'
import type { Circle, Intent, IntroRequest, Match } from '../../domain/model/entities'
import { circles, initialRequests, people } from '../../infrastructure/demo/demo-data'
import { usePersistentState } from '../shared/use-persistent-state'
import { CompactMatch, EmptyState, MatchDrawer, MiniMark, SectionTitle, Toggle } from './WorkspaceComponents'
import { workspaceNavigation, type WorkspaceSection } from './workspace.types'

export default function ProductApp({ intent, onEdit, onExit }: { intent: Intent; onEdit: () => void; onExit: () => void }) {
  const [section, setSection] = useState<WorkspaceSection>('today')
  const [requests, setRequests] = usePersistentState<IntroRequest[]>('niyat-requests', initialRequests)
  const [joined, setJoined] = usePersistentState<string[]>('niyat-joined-circles', ['c1'])
  const [saved, setSaved] = usePersistentState<string[]>('niyat-saved-matches', [])
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)
  const [notice, setNotice] = useState('')
  const matches = useMemo(() => rankMatches(intent, people), [intent])
  const pendingCount = requests.filter((request) => request.status === 'pending' && request.direction === 'incoming').length

  function toast(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2400)
  }

  function createRequest(match: Match) {
    if (requests.some((request) => request.personId === match.person.id && request.direction === 'outgoing')) return
    setRequests((current) => [createIntroRequest(match.person.id, '15 daqiqalik tanishuv', Date.now()), ...current])
    toast('Intro so‘rovi xavfsiz yuborildi')
  }

  function updateRequest(id: string, status: IntroRequest['status']) {
    setRequests((current) => current.map((request) => request.id === id ? transitionIntroRequest(request, status) : request))
    toast(status === 'accepted' ? 'Rozilik berildi — suhbat xonasi ochildi' : 'So‘rov yopildi')
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
        <div className="mobile-product-nav">
          {workspaceNavigation.slice(0, 5).map(item => <button aria-label={item.label} className={section === item.id ? 'active' : ''} key={item.id} onClick={() => setSection(item.id)}>{item.icon}<small>{item.label}</small></button>)}
        </div>

        {section === 'today' && <TodayView intent={intent} matches={matches} onOpenMatch={setActiveMatch} onNavigate={setSection} onEdit={onEdit} />}
        {section === 'discover' && <DiscoverView matches={matches} saved={saved} onSave={(id) => setSaved((current) => current.includes(id) ? current.filter(x => x !== id) : [...current, id])} onOpenMatch={setActiveMatch} />}
        {section === 'requests' && <RequestsView requests={requests} onUpdate={updateRequest} />}
        {section === 'circles' && <CirclesView joined={joined} onJoin={(circle) => { setJoined((current) => current.includes(circle.id) ? current : [...current, circle.id]); toast(`“${circle.title}” circle’iga qo‘shilding`) }} />}
        {section === 'progress' && <ProgressView />}
        {section === 'trust' && <TrustView onExit={onExit} toast={toast} />}
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

function RequestsView({ requests, onUpdate }: { requests: IntroRequest[]; onUpdate: (id: string, status: IntroRequest['status']) => void }) {
  return <section className="product-view"><SectionTitle code="CONSENT QUEUE" title="Aloqa sening nazoratingda." description="Kontakt faqat ikki tomon aniq rozilik berganda ochiladi." />
    <div className="request-list">{requests.map(request => { const person = people.find(p => p.id === request.personId)!; return <article className="request-card" key={request.id}><span className="person-avatar" style={{ background: person.accent }}>{person.initials}</span><div className="request-main"><div><b>{person.name}</b><small>{request.direction === 'incoming' ? 'Senga so‘rov yubordi' : 'Sen yubording'} · {request.sentAt}</small></div><h3>{request.scope}</h3><p>{person.intent.title}</p></div><div className={`request-status ${request.status}`}>{request.status === 'pending' && request.direction === 'incoming' ? <><button onClick={() => onUpdate(request.id, 'accepted')}>Qabul qilish</button><button onClick={() => onUpdate(request.id, 'declined')}>Rad etish</button></> : request.status === 'accepted' ? '✓ Suhbat ochiq' : request.status === 'declined' ? 'Yopildi' : 'Javob kutilmoqda'}</div></article> })}</div>
  </section>
}

function CirclesView({ joined, onJoin }: { joined: string[]; onJoin: (circle: Circle) => void }) {
  return <section className="product-view"><SectionTitle code="SMALL GROUPS · REAL OUTPUT" title="Birga bajariladigan sprintlar." description="4–8 odam. Bitta aniq natija. Cheklangan vaqt." action={<button className="quiet-button">+ Circle taklif qilish</button>} />
    <div className="circle-grid">{circles.map(circle => <article className="circle-card" key={circle.id}><div className="circle-orbit"><b>{circle.day}</b><small>/{circle.duration} KUN</small></div><span className="kicker">{circle.tags.join(' · ')}</span><h2>{circle.title}</h2><p>{circle.outcome}</p><div className="member-line"><span>{'●'.repeat(circle.members)}<i>{'○'.repeat(circle.capacity - circle.members)}</i></span><small>{circle.members}/{circle.capacity} a’zo</small></div><div className="progress-line"><i style={{ width: `${circle.progress}%` }} /></div><button disabled={joined.includes(circle.id)} onClick={() => onJoin(circle)}>{joined.includes(circle.id) ? '✓ Qo‘shilgansan' : 'Circle’ga qo‘shilish →'}</button></article>)}</div>
  </section>
}

function ProgressView() {
  return <section className="product-view"><SectionTitle code="IMPACT · OXIRGI 30 KUN" title="Harakat emas, natija." description="Like va ekranda o‘tgan vaqt emas — hayotingda yaratilgan qiymat." />
    <div className="impact-hero"><div><b>7</b><span>foydali aloqa</span></div><div><b>3</b><span>real uchrashuv</span></div><div><b>2</b><span>yakunlangan milestone</span></div><div><b>1</b><span>tasdiqlangan natija</span></div></div>
    <div className="dashboard-grid"><div className="panel wide"><div className="panel-title"><span>NIYAT YO‘LI</span><small>38% bajarildi</small></div><div className="journey">{['Muammoni aniqlash','10 ta suhbat','Hamkor topish','Prototype','Birinchi 100 user'].map((step,index) => <div className={index < 2 ? 'done' : index === 2 ? 'current' : ''} key={step}><i>{index < 2 ? '✓' : index + 1}</i><span>{step}</span></div>)}</div></div><div className="panel"><div className="panel-title"><span>IMPACT SIGNAL</span></div><div className="impact-badge">↗<b>Connector</b><p>3 kishini foydali aloqa bilan bog‘lading. Bu sening eng kuchli hissang.</p></div></div></div>
  </section>
}

function TrustView({ onExit, toast }: { onExit: () => void; toast: (message: string) => void }) {
  const [settings, setSettings] = useState({ matchedOnly: true, aiDrafts: true, activity: false, analytics: true })
  const toggle = (key: keyof typeof settings) => setSettings(current => ({ ...current, [key]: !current[key] }))
  return <section className="product-view"><SectionTitle code="PRIVACY · PERMISSIONS · SAFETY" title="Ma’lumoting — seniki." description="Kim nimani ko‘rishi va AI nima qilishi mumkinligini shu yerdan boshqarasan." />
    <div className="trust-grid"><div className="panel"><div className="panel-title"><span>IDENTITY</span><small className="verified">✓ TASDIQLANGAN</small></div><div className="identity-row"><span className="profile-big">M</span><div><h3>Miraziz</h3><p>Email tasdiqlangan · 18+ · Global</p></div></div><button className="quiet-button full">Verifikatsiyani boshqarish</button></div><div className="panel"><div className="panel-title"><span>RUXSATLAR</span></div><Toggle label="Faqat matchlar profilimni ko‘rsin" active={settings.matchedOnly} onClick={() => toggle('matchedOnly')} /><Toggle label="AI faqat draft tayyorlasin" active={settings.aiDrafts} onClick={() => toggle('aiDrafts')} /><Toggle label="Faollik holatini ko‘rsatish" active={settings.activity} onClick={() => toggle('activity')} /><Toggle label="Anonim product analytics" active={settings.analytics} onClick={() => toggle('analytics')} /></div><div className="panel wide"><div className="panel-title"><span>DATA CONTROLS</span></div><div className="data-actions"><button onClick={() => toast('Ma’lumot eksporti tayyorlanmoqda')}>↓ Ma’lumotlarimni eksport qilish</button><button onClick={() => toast('Barcha faol sessiyalar yopildi')}>⌁ Boshqa sessiyalarni yopish</button><button className="danger" onClick={onExit}>Akkauntdan chiqish</button></div></div></div>
  </section>
}
