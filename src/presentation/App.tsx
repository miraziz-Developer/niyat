import { useEffect, useState } from 'react'
import { currentTermsVersion, type Consent } from '../application/consent/consent'
import type { IntentInput, ServerIntent } from '../application/intents/intent'
import { NetworkError } from '../application/ports/network-client'
import type { ServerProfile } from '../application/profiles/profile'
import type { Intent } from '../domain/model/entities'
import type { AppData, IntentDraft, Viewer } from './app.types'
import { legalPaths } from './LegalPage'
import { LoginPanel } from './LoginPanel'
import { describeError } from './shared/describe-error'
import { useNetwork } from './shared/network-context'
import { Segmented } from './shared/Segmented'
import { storageKeys } from './shared/storage-keys'
import { TagInput } from './shared/TagInput'
import { usePersistentState } from './shared/use-persistent-state'
import ProductApp from './workspace/WorkspaceApp'

type Screen = 'home' | 'create' | 'product'
type ServerState =
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'signed-out'; notice?: string }
  | { status: 'ready'; userId: string; profile: ServerProfile | null; consent: Consent; moderator: boolean; intent: ServerIntent | null }
type Visibility = Extract<IntentInput['visibility'], 'matched' | 'public'>

const demoViewer: Viewer = { name: 'Miraziz', subtitle: 'Builder · demo', verified: true }
const editableStatuses: ServerIntent['status'][] = ['draft', 'active', 'paused']
const emptyDraft: IntentDraft = { title: '', outcome: '', offers: [], needs: [], topics: [], mode: 'hybrid', horizon: 'quarter' }
const modeLabels = { online: 'Onlayn', offline: 'Oflayn', hybrid: 'Aralash' } as const
const horizonLabels = { now: 'Hozir', month: '1 oy', quarter: '3 oy' } as const

function Field({ label, hint, value, onChange, placeholder, area = false, maxLength, autoFocus = false }: {
  label: string; hint: string; value: string; onChange: (value: string) => void; placeholder: string; area?: boolean; maxLength: number; autoFocus?: boolean
}) {
  const Component = area ? 'textarea' : 'input'
  return (
    <label className="field">
      <span>{label}<small>{hint}</small></span>
      <Component value={value} maxLength={maxLength} autoFocus={autoFocus} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {area && <small className="field-counter" aria-hidden="true">{value.length}/{maxLength}</small>}
    </label>
  )
}

function Mark() {
  return <div className="mark" aria-hidden="true"><i /><i /><i /></div>
}

let loginLink: Promise<boolean> | null = null

/**
 * A sign-in link lands as ?login_token=…. The token is removed from the address bar immediately, so it never
 * stays in history, bookmarks or a Referer header, and exchanged exactly once: every caller (including React's
 * development double-mount) awaits the same promise. Resolves false only when a token was present and refused.
 */
function consumeLoginLink(client: { verifyMagicLink(token: string): Promise<void> }): Promise<boolean> {
  if (loginLink) return loginLink
  const url = new URL(window.location.href)
  const token = url.searchParams.get('login_token')
  if (!token) return Promise.resolve(true)
  url.searchParams.delete('login_token')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  loginLink = client.verifyMagicLink(token).then(() => true, () => false)
  return loginLink
}

/** The intent the member works on: the first one they can still act on, newest first. */
function pickIntent(intents: ServerIntent[]) {
  return intents.find(intent => intent.status === 'active') ?? intents.find(intent => editableStatuses.includes(intent.status)) ?? null
}

function App({ data }: { data: AppData }) {
  const { starterIntent, people, circles, initialRequests } = data
  const network = useNetwork()
  const [screen, setScreen] = useState<Screen>('home')
  const [storedDraft, setDraft] = usePersistentState<IntentDraft>(storageKeys.intentDraft, starterIntent, !network)
  const [server, setServer] = useState<ServerState>(network ? { status: 'loading' } : { status: 'local' })
  const [displayName, setDisplayName] = useState('')
  const [adultChecked, setAdultChecked] = useState(false)
  const [termsChecked, setTermsChecked] = useState(false)
  const [visibility, setVisibility] = useState<Visibility>('matched')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // Drafts saved before mode/horizon existed still load with sensible defaults.
  const draft: IntentDraft = { ...emptyDraft, ...storedDraft }

  useEffect(() => {
    if (!network) return
    let cancelled = false
    async function bootstrap(client: NonNullable<typeof network>) {
      const linkFailed = !(await consumeLoginLink(client))
      try {
        // The session must exist before any authenticated read, so these calls are sequential.
        const session = await client.connect()
        const intents = await client.listIntents()
        if (cancelled) return
        const intent = pickIntent(intents)
        setDraft(intent ? { title: intent.title, outcome: intent.outcome, offers: intent.offers, needs: intent.needs, topics: intent.topics, mode: intent.mode, horizon: intent.horizon } : emptyDraft)
        if (intent?.visibility === 'public') setVisibility('public')
        setServer({ status: 'ready', userId: session.userId, profile: session.profile, consent: session.consent, moderator: session.moderator, intent })
      } catch (error) {
        if (cancelled) return
        if (error instanceof NetworkError && error.status === 401) {
          setServer({ status: 'signed-out', ...(linkFailed ? { notice: 'Kirish havolasi eskirgan yoki allaqachon ishlatilgan. Yangisini so‘rang.' } : {}) })
        } else {
          setServer({ status: 'error', message: describeError(error, 'Server bilan ulanib bo‘lmadi.') })
        }
      }
    }
    void bootstrap(network)
    return () => { cancelled = true }
  }, [network, setDraft])

  const serverIntent = server.status === 'ready' ? server.intent : null
  const needsName = server.status === 'ready' && !server.profile
  const needsConsent = server.status === 'ready' && !server.consent.current
  const intent: Intent = {
    id: serverIntent?.id ?? 'mine', title: draft.title, outcome: draft.outcome, offers: draft.offers, needs: draft.needs, topics: draft.topics,
    location: 'Global', mode: draft.mode ?? 'hybrid', horizon: draft.horizon ?? 'quarter', visibility: 'network',
  }
  const checklist = [
    ...(needsName ? [{ label: 'Ismingiz', done: displayName.trim().length > 0 }] : []),
    { label: 'Nima qurmoqchisiz', done: draft.title.trim().length > 0 },
    { label: 'Kutilgan natija', done: draft.outcome.trim().length > 0 },
    { label: 'Kamida bitta taklif', done: draft.offers.length > 0 },
    { label: 'Kamida bitta ehtiyoj', done: draft.needs.length > 0 },
    { label: 'Kamida bitta mavzu', done: draft.topics.length > 0 },
    ...(needsConsent ? [{ label: '18 yoshdan oshganlik tasdig‘i', done: adultChecked }, { label: 'Shartlar va maxfiylik siyosatiga rozilik', done: termsChecked }] : []),
  ]
  const completeness = Math.round(checklist.filter(item => item.done).length / checklist.length * 100)
  const ready = completeness === 100
  const viewer: Viewer = server.status === 'ready'
    ? { name: server.profile?.displayName ?? 'Siz', subtitle: server.profile?.verificationLevel ? 'Tasdiqlangan a’zo' : 'Private alpha a’zosi', verified: Boolean(server.profile?.verificationLevel) }
    : demoViewer

  function update<K extends keyof IntentDraft>(key: K, value: IntentDraft[K]) {
    setDraft((current) => ({ ...emptyDraft, ...current, [key]: value }))
  }

  async function publish() {
    if (!ready || saving) return
    if (!network || server.status !== 'ready') { setScreen('product'); return }
    setSaving(true)
    setSaveError('')
    try {
      const consent = server.consent.current ? server.consent : await network.acceptConsents(currentTermsVersion)
      const profile = server.profile ?? await network.saveProfile({ displayName: displayName.trim(), bio: '', languages: ['uz'] })
      const current = server.intent && editableStatuses.includes(server.intent.status) ? server.intent : null
      const input: IntentInput = {
        title: draft.title.trim(), outcome: draft.outcome.trim(), offers: draft.offers, needs: draft.needs, topics: draft.topics,
        mode: draft.mode ?? 'hybrid', horizon: draft.horizon ?? 'quarter', visibility, status: 'active',
      }
      const saved = current ? await network.updateIntent(current.id, input) : await network.createIntent(input)
      setServer({ ...server, profile, consent, intent: saved })
      setScreen('product')
    } catch (error) {
      setSaveError(describeError(error, 'Niyat saqlanmadi. Qayta urinib ko‘ring.'))
    } finally {
      setSaving(false)
    }
  }

  function signedOut() {
    setScreen('home')
    setServer({ status: 'signed-out' })
  }

  function openWorkspace() {
    if (!network) { setDraft(starterIntent); setScreen('product'); return }
    setScreen(serverIntent?.status === 'active' && !needsConsent ? 'product' : 'create')
  }

  if (screen === 'product') {
    return (
      <ProductApp
        intent={intent}
        server={server.status === 'ready' ? { userId: server.userId, intentId: serverIntent?.id, moderator: server.moderator } : undefined}
        viewer={viewer}
        data={{ people, circles, initialRequests }}
        onEdit={() => setScreen('create')}
        onExit={network ? signedOut : () => setScreen('home')}
        onSessionExpired={network ? () => setServer({ status: 'signed-out', notice: 'Sessiya tugadi. Davom etish uchun qayta kiring.' }) : undefined}
        onProfileSaved={(profile) => setServer(current => current.status === 'ready' ? { ...current, profile } : current)}
      />
    )
  }

  const editing = serverIntent?.status === 'active'
  const signedOutState = server.status === 'signed-out' ? server : null
  // Without a session only the landing page is meaningful; the capsule needs an account to save to.
  const visibleScreen = signedOutState ? 'home' : screen

  return (
    <main>
      <nav className="top-nav" aria-label="Asosiy">
        <button className="brand" onClick={() => setScreen('home')} aria-label="Niyat — bosh sahifa"><Mark /><b>niyat</b><em>beta</em></button>
        <div className="nav-center"><span className="live-dot" aria-hidden="true" /> {network ? 'Private alpha' : 'Local demo · ma’lumot shu brauzerda'}</div>
        {signedOutState ? <span aria-hidden="true" /> : <button aria-label="Niyatni tahrirlash" className="avatar" onClick={() => setScreen('create')}>{viewer.name[0]?.toUpperCase()}</button>}
      </nav>

      {server.status === 'loading' && <div className="api-status" role="status">Server ma’lumotlari yuklanmoqda…</div>}
      {server.status === 'error' && <div className="api-status error" role="alert">{server.message} <button onClick={() => window.location.reload()}>Qayta urinish</button></div>}

      {visibleScreen === 'home' && (
        <section className="home">
          <div className="eyebrow"><span aria-hidden="true">✦</span> Profil emas — niyat</div>
          <h1>Kerakli insonni emas.<br /><strong>Kerakli <i>to‘qnashuvni</i> top.</strong></h1>
          <p className="lead">Niyatingni ayt. Biz sen bera oladigan va olishing kerak bo‘lgan narsalar kesishgan insonlarni topamiz.</p>
          {signedOutState && network ? <LoginPanel network={network} notice={signedOutState.notice} /> : (
            <div className="hero-actions">
              <button className="primary" onClick={() => setScreen('create')}>{editing ? 'Niyatni tahrirlash' : 'Niyat yaratish'} <span aria-hidden="true">↗</span></button>
              <button className="text-button" disabled={server.status === 'loading'} onClick={openWorkspace}>
                {network ? 'Workspace’ni ochish' : 'Jonli demoni ko‘rish'} <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
          <div className="constellation" aria-hidden="true">
            <div className="orbit orbit-a" /><div className="orbit orbit-b" />
            <div className="node node-a"><span>G‘OYA</span></div>
            <div className="node node-b"><span>QOBILIYAT</span></div>
            <div className="node node-c"><span>IMKONIYAT</span></div>
            <div className="node node-main"><Mark /><b>SENING<br />NIYATING</b></div>
          </div>
          <div className="principles">
            <article><b>01</b><div><h3>Profil emas, harakat</h3><p>Kecha kim bo‘lganing emas, bugun nimaga intilayotganing muhim.</p></div></article>
            <article><b>02</b><div><h3>Ikki tomonlama qiymat</h3><p>Har bir aloqa ikkala tomon uchun ham foydali bo‘lishi shart.</p></div></article>
            <article><b>03</b><div><h3>Rozilik — standart</h3><p>Sen “ha” demaguningcha hech kimga shaxsing ochilmaydi.</p></div></article>
          </div>
        </section>
      )}

      {visibleScreen === 'create' && (
        <section className="workspace" aria-labelledby="capsule-title">
          <header className="section-head">
            <div><span className="kicker">Niyat kapsulasi</span><h2 id="capsule-title">{editing ? 'Niyatingni yangila.' : 'Niyatingni aniq qil.'}</h2><p>Algoritm unvonlarni emas, o‘zaro qiymatni qidiradi.</p></div>
            <div className="completion" aria-live="polite"><b>{completeness}%</b><span>Aniqlik</span><div role="progressbar" aria-label="Kapsula to‘liqligi" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${completeness}%` }} /></div></div>
          </header>
          <div className="builder">
            <form className="form-card" onSubmit={(event) => { event.preventDefault(); void publish() }} noValidate>
              <div className="form-section">
                <h3>1 · Niyat</h3>
                {needsName && <Field label="Ismingiz" hint="Faqat rozilikdan keyin ko‘rinadi" value={displayName} onChange={setDisplayName} placeholder="Masalan: Aziza Karimova" maxLength={80} autoFocus />}
                <Field label="Nima qurmoqchisan?" hint="Bir jumlada" value={draft.title} onChange={(v) => update('title', v)} placeholder="Masalan: bolalar uchun AI o‘qituvchi" maxLength={160} />
                <Field area label="Qanday natija ko‘rmoqchisan?" hint="O‘lchash mumkin bo‘lsin" value={draft.outcome} onChange={(v) => update('outcome', v)} placeholder="Masalan: 90 kunda 100 oilada sinovdan o‘tkazish" maxLength={2000} />
              </div>
              <div className="form-section">
                <h3>2 · Almashinuv</h3>
                <TagInput label="Sen nima bera olasan?" hint="Qobiliyat, tajriba, resurs" values={draft.offers} onChange={(v) => update('offers', v)} placeholder="engineering, auditoriya, tajriba" />
                <TagInput label="Senga nima kerak?" hint="Halol va konkret bo‘l" values={draft.needs} onChange={(v) => update('needs', v)} placeholder="design, distribution, investitsiya" tone="warm" />
                <TagInput label="Asosiy mavzular" hint="Kontekstni aniqlaydi" values={draft.topics} onChange={(v) => update('topics', v)} placeholder="AI, ta’lim, iqlim" />
              </div>
              <div className="form-section">
                <h3>3 · Format</h3>
                <div className="field-row">
                  <Segmented label="Ishlash formati" value={draft.mode ?? 'hybrid'} onChange={(v) => update('mode', v)} options={(['online', 'offline', 'hybrid'] as const).map(value => ({ value, label: modeLabels[value] }))} />
                  <Segmented label="Muddat" value={draft.horizon ?? 'quarter'} onChange={(v) => update('horizon', v)} options={(['now', 'month', 'quarter'] as const).map(value => ({ value, label: horizonLabels[value] }))} />
                </div>
                {network && <Segmented label="Kim ko‘radi" value={visibility} onChange={setVisibility} options={[{ value: 'matched', label: 'Faqat match’lar' }, { value: 'public', label: 'Barcha a’zolar' }]} />}
              </div>
              {needsConsent && (
                <div className="form-section">
                  <h3>4 · Rozilik</h3>
                  <div className="consent-checks">
                    <label className="check-row"><input type="checkbox" checked={adultChecked} onChange={(event) => setAdultChecked(event.target.checked)} /><span>18 yoshdan oshganman.</span></label>
                    <label className="check-row"><input type="checkbox" checked={termsChecked} onChange={(event) => setTermsChecked(event.target.checked)} /><span><a href={legalPaths.terms} target="_blank" rel="noreferrer">Foydalanish shartlari</a> va <a href={legalPaths.privacy} target="_blank" rel="noreferrer">maxfiylik siyosati</a> bilan tanishdim va roziman.</span></label>
                  </div>
                </div>
              )}
              {!ready && (
                <div className="form-section" aria-live="polite">
                  <h3>E’lon qilish uchun qoldi</h3>
                  <ul className="checklist">{checklist.map(item => <li key={item.label} className={item.done ? 'done' : ''}><i aria-hidden="true">✓</i><span>{item.label}{item.done ? '' : ' — to‘ldirilmagan'}</span></li>)}</ul>
                </div>
              )}
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <button className="primary publish" disabled={!ready || saving || server.status === 'loading'}>
                {saving ? 'Saqlanmoqda…' : editing ? 'O‘zgarishlarni saqlash' : 'Niyatni tarmoqqa chiqarish'} <span aria-hidden="true">→</span>
              </button>
            </form>
            <aside className="preview" aria-label="Kapsula ko‘rinishi">
              <span className="kicker">Jonli ko‘rinish</span>
              <div className="capsule-glow" aria-hidden="true" />
              <h3>{draft.title || 'Sening niyating shu yerda paydo bo‘ladi'}</h3>
              <p>{draft.outcome || 'Aniq natijani yozsang, tarmoq kerakli kesishmalarni topadi.'}</p>
              <div className="preview-meta"><span>{modeLabels[draft.mode ?? 'hybrid']}</span><span>{horizonLabels[draft.horizon ?? 'quarter']}</span>{network && <span>{visibility === 'public' ? 'Barcha a’zolar' : 'Faqat match’lar'}</span>}</div>
              <TagGroup title="Beraman" tags={draft.offers} empty="Qobiliyatlaring" />
              <TagGroup title="Kerak" tags={draft.needs} empty="Ehtiyojlaring" warm />
              <div className="privacy"><span aria-hidden="true">◉</span><div><b>Rozilik birinchi</b><small>Ismingiz va kontaktingiz faqat ikki tomon roziligidan keyin ochiladi. Match’larda faqat niyatingiz ko‘rinadi.</small></div></div>
            </aside>
          </div>
        </section>
      )}
    </main>
  )
}

function TagGroup({ title, tags, empty, warm = false }: { title: string; tags: string[]; empty: string; warm?: boolean }) {
  return <div className="tag-group"><span>{title.toUpperCase()}</span><div>{tags.length ? tags.map(tag => <i className={warm ? 'warm' : ''} key={tag}>{tag}</i>) : <i className="ghost">{empty}</i>}</div></div>
}

export default App
