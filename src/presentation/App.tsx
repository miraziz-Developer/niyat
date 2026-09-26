import { useEffect, useState } from 'react'
import type { IntentInput, ServerIntent } from '../application/intents/intent'
import type { ServerProfile } from '../application/profiles/profile'
import type { Intent } from '../domain/model/entities'
import type { AppData, IntentDraft, Viewer } from './app.types'
import { useNetwork } from './shared/network-context'
import { storageKeys } from './shared/storage-keys'
import { usePersistentState } from './shared/use-persistent-state'
import ProductApp from './workspace/WorkspaceApp'

type Screen = 'home' | 'create' | 'product'
type ServerState =
  | { status: 'local' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; userId: string; profile: ServerProfile | null; intent: ServerIntent | null }

const demoViewer: Viewer = { name: 'Miraziz', subtitle: 'Builder · demo', verified: true }
const editableStatuses: ServerIntent['status'][] = ['draft', 'active', 'paused']

function parseTags(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 8)
}

function Field({ label, hint, value, onChange, placeholder, area = false }: {
  label: string; hint: string; value: string; onChange: (value: string) => void; placeholder: string; area?: boolean
}) {
  const Component = area ? 'textarea' : 'input'
  return (
    <label className="field">
      <span>{label}<small>{hint}</small></span>
      <Component value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

function Mark() {
  return <div className="mark" aria-label="Niyat"><i /><i /><i /></div>
}

/** The intent the member works on: the first one they can still act on, newest first. */
function pickIntent(intents: ServerIntent[]) {
  return intents.find(intent => intent.status === 'active') ?? intents.find(intent => editableStatuses.includes(intent.status)) ?? null
}

function App({ data }: { data: AppData }) {
  const { starterIntent, people, circles, initialRequests } = data
  const network = useNetwork()
  const [screen, setScreen] = useState<Screen>('home')
  const [draft, setDraft] = usePersistentState<IntentDraft>(storageKeys.intentDraft, starterIntent, !network)
  const [server, setServer] = useState<ServerState>(network ? { status: 'loading' } : { status: 'local' })
  const [displayName, setDisplayName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!network) return
    let cancelled = false
    // The session must exist before any authenticated read, so these calls are sequential.
    network.connect().then(async session => ({ session, intents: await network.listIntents() })).then(({ session, intents }) => {
      if (cancelled) return
      const intent = pickIntent(intents)
      if (intent) setDraft({ title: intent.title, outcome: intent.outcome, offers: intent.offers, needs: intent.needs, topics: intent.topics })
      else setDraft({ title: '', outcome: '', offers: [], needs: [], topics: [] })
      setServer({ status: 'ready', userId: session.userId, profile: session.profile, intent })
    }).catch((error: unknown) => {
      if (!cancelled) setServer({ status: 'error', message: error instanceof Error ? error.message : 'Server bilan aloqa yo‘q' })
    })
    return () => { cancelled = true }
  }, [network, setDraft])

  const serverIntent = server.status === 'ready' ? server.intent : null
  const needsName = server.status === 'ready' && !server.profile
  const intent: Intent = {
    id: serverIntent?.id ?? 'mine', ...draft, location: 'Global',
    mode: serverIntent?.mode ?? 'hybrid', horizon: serverIntent?.horizon ?? 'quarter', visibility: 'network',
  }
  const fields = [draft.title.trim(), draft.outcome.trim(), draft.offers.length, draft.needs.length, draft.topics.length, ...(needsName ? [displayName.trim()] : [])]
  const completeness = Math.round(fields.filter(Boolean).length / fields.length * 100)
  const viewer: Viewer = server.status === 'ready'
    ? { name: server.profile?.displayName ?? 'Siz', subtitle: server.profile?.verificationLevel ? 'Tasdiqlangan a’zo' : 'Private alpha a’zosi', verified: Boolean(server.profile?.verificationLevel) }
    : demoViewer

  function update<K extends keyof IntentDraft>(key: K, value: IntentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function publish() {
    if (completeness < 100 || saving) return
    if (!network || server.status !== 'ready') { setScreen('product'); return }
    setSaving(true)
    setSaveError('')
    try {
      const profile = server.profile ?? await network.saveProfile({ displayName: displayName.trim(), bio: '', languages: ['uz'] })
      const current = server.intent && editableStatuses.includes(server.intent.status) ? server.intent : null
      const input: IntentInput = {
        ...draft,
        mode: current?.mode ?? 'hybrid',
        horizon: current?.horizon ?? 'quarter',
        // Publishing is an explicit choice to be matched, so a private draft becomes matchable.
        visibility: current && current.visibility !== 'private' ? current.visibility : 'matched',
        status: 'active',
      }
      const saved = current ? await network.updateIntent(current.id, input) : await network.createIntent(input)
      setServer({ ...server, profile, intent: saved })
      setScreen('product')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Niyat saqlanmadi')
    } finally {
      setSaving(false)
    }
  }

  function openWorkspace() {
    if (!network) { setDraft(starterIntent); setScreen('product'); return }
    setScreen(serverIntent?.status === 'active' ? 'product' : 'create')
  }

  if (screen === 'product') {
    return (
      <ProductApp
        intent={intent}
        server={server.status === 'ready' ? { userId: server.userId, intentId: serverIntent?.id } : undefined}
        viewer={viewer}
        data={{ people, circles, initialRequests }}
        onEdit={() => setScreen('create')}
        onExit={() => setScreen('home')}
      />
    )
  }

  return (
    <main>
      <nav>
        <button className="brand" onClick={() => setScreen('home')}><Mark /><b>niyat</b><em>beta</em></button>
        <div className="nav-center"><span className="live-dot" /> {network ? 'Private alpha' : 'Local demo'}</div>
        <button aria-label="Niyatni tahrirlash" className="avatar" onClick={() => setScreen('create')}>{viewer.name[0]?.toUpperCase()}</button>
      </nav>

      {server.status === 'loading' && <div className="api-status" role="status">Server ma’lumotlari yuklanmoqda…</div>}
      {server.status === 'error' && <div className="api-status error" role="alert">Server bilan ulanib bo‘lmadi: {server.message}</div>}

      {screen === 'home' && (
        <section className="home">
          <div className="eyebrow"><span>✦</span> PEOPLE, NOT PROFILES</div>
          <h1>Kerakli insonni emas.<br /><strong>Kerakli <i>to‘qnashuvni</i> top.</strong></h1>
          <p className="lead">Niyatingni ayt. Biz sen bera oladigan va olishing kerak bo‘lgan narsalar kesishgan insonlarni topamiz.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => setScreen('create')}>Niyat yaratish <span>↗</span></button>
            <button className="text-button" disabled={server.status === 'loading'} onClick={openWorkspace}>
              {network ? 'Workspace’ni ochish' : 'Jonli demoni ko‘rish'} <span>→</span>
            </button>
          </div>
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

      {screen === 'create' && (
        <section className="workspace">
          <header className="section-head">
            <div><span className="kicker">INTENT CAPSULE / 001</span><h2>Niyatingni aniq qil.</h2><p>Algoritm unvonlarni emas, o‘zaro qiymatni qidiradi.</p></div>
            <div className="completion"><b>{completeness}%</b><span>ANIQLIK</span><div><i style={{ width: `${completeness}%` }} /></div></div>
          </header>
          <div className="builder">
            <form className="form-card" onSubmit={(event) => { event.preventDefault(); void publish() }}>
              {needsName && <Field label="Ismingiz" hint="Faqat rozilikdan keyin ko‘rinadi" value={displayName} onChange={setDisplayName} placeholder="Masalan: Aziza Karimova" />}
              <Field label="Nima qurmoqchisan?" hint="Bir jumlada" value={draft.title} onChange={(v) => update('title', v)} placeholder="Masalan: yangi avlod ta’lim platformasi" />
              <Field area label="Qanday natija ko‘rmoqchisan?" hint="O‘lchash mumkin bo‘lsin" value={draft.outcome} onChange={(v) => update('outcome', v)} placeholder="90 kun ichida..." />
              <Field label="Sen nima bera olasan?" hint="Vergul bilan ajrat" value={draft.offers.join(', ')} onChange={(v) => update('offers', parseTags(v))} placeholder="engineering, auditoriya, tajriba" />
              <Field label="Senga nima kerak?" hint="Halol va konkret bo‘l" value={draft.needs.join(', ')} onChange={(v) => update('needs', parseTags(v))} placeholder="design, distribution, capital" />
              <Field label="Asosiy mavzular" hint="Ko‘pi bilan 8 ta" value={draft.topics.join(', ')} onChange={(v) => update('topics', parseTags(v))} placeholder="AI, climate, education" />
              {saveError && <p className="form-error" role="alert">{saveError}</p>}
              <button className="primary publish" disabled={completeness < 100 || saving || server.status === 'loading'}>
                {saving ? 'Saqlanmoqda…' : serverIntent?.status === 'active' ? 'Niyatni yangilash' : 'Niyatni tarmoqqa chiqarish'} <span>→</span>
              </button>
            </form>
            <aside className="preview">
              <span className="kicker">LIVE CAPSULE</span>
              <div className="capsule-glow" />
              <h3>{draft.title || 'Sening niyating shu yerda paydo bo‘ladi'}</h3>
              <p>{draft.outcome || 'Aniq natijani yozsang, tarmoq kerakli kesishmalarni topadi.'}</p>
              <TagGroup title="BERAMAN" tags={draft.offers} empty="Qobiliyatlaring" />
              <TagGroup title="KERAK" tags={draft.needs} empty="Ehtiyojlaring" warm />
              <div className="privacy"><span>◉</span><div><b>Consent-first</b><small>Ismingiz va kontaktingiz faqat ikki tomon roziligidan keyin ochiladi.</small></div></div>
            </aside>
          </div>
        </section>
      )}
    </main>
  )
}

function TagGroup({ title, tags, empty, warm = false }: { title: string; tags: string[]; empty: string; warm?: boolean }) {
  return <div className="tag-group"><span>{title}</span><div>{tags.length ? tags.map(tag => <i className={warm ? 'warm' : ''} key={tag}>{tag}</i>) : <i className="ghost">{empty}</i>}</div></div>
}

export default App
