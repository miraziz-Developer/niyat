import { useMemo, useState } from 'react'
import { rankMatches } from '../application/matching/rank-matches'
import type { Intent, Match } from '../domain/model/entities'
import { people, starterIntent } from '../infrastructure/demo/demo-data'
import { usePersistentState } from './shared/use-persistent-state'
import ProductApp from './workspace/WorkspaceApp'
import { Dialog } from './shared/Dialog'

type Screen = 'home' | 'create' | 'matches' | 'product'
type Draft = typeof starterIntent

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

function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [draft, setDraft] = usePersistentState<Draft>('niyat-draft', starterIntent)
  const [activeMatch, setActiveMatch] = useState<Match | null>(null)
  const [requested, setRequested] = useState<string[]>([])

  const intent: Intent = useMemo(() => ({
    id: 'mine', ...draft, location: 'Global', mode: 'hybrid', horizon: 'quarter', visibility: 'network',
  }), [draft])
  const matches = useMemo(() => rankMatches(intent, people), [intent])
  const completeness = [draft.title, draft.outcome, draft.offers.length, draft.needs.length, draft.topics.length].filter(Boolean).length * 20

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function publish() {
    if (completeness < 100) return
    setScreen('product')
  }

  if (screen === 'product') return <ProductApp intent={intent} onEdit={() => setScreen('create')} onExit={() => setScreen('home')} />

  return (
    <main>
      <nav>
        <button className="brand" onClick={() => setScreen('home')}><Mark /><b>niyat</b><em>beta</em></button>
        <div className="nav-center"><span className="live-dot" /> 148 niyat hozir faol</div>
        <button className="avatar" onClick={() => setScreen('create')}>M</button>
      </nav>

      {screen === 'home' && (
        <section className="home">
          <div className="eyebrow"><span>✦</span> PEOPLE, NOT PROFILES</div>
          <h1>Kerakli insonni emas.<br /><strong>Kerakli <i>to‘qnashuvni</i> top.</strong></h1>
          <p className="lead">Niyatingni ayt. Biz sen bera oladigan va olishing kerak bo‘lgan narsalar kesishgan insonlarni topamiz.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => setScreen('create')}>Niyat yaratish <span>↗</span></button>
            <button className="text-button" onClick={() => { setDraft(starterIntent); setScreen('product') }}>Jonli demoni ko‘rish <span>→</span></button>
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
            <div className="form-card">
              <Field label="Nima qurmoqchisan?" hint="Bir jumlada" value={draft.title} onChange={(v) => update('title', v)} placeholder="Masalan: yangi avlod ta’lim platformasi" />
              <Field area label="Qanday natija ko‘rmoqchisan?" hint="O‘lchash mumkin bo‘lsin" value={draft.outcome} onChange={(v) => update('outcome', v)} placeholder="90 kun ichida..." />
              <Field label="Sen nima bera olasan?" hint="Vergul bilan ajrat" value={draft.offers.join(', ')} onChange={(v) => update('offers', parseTags(v))} placeholder="engineering, auditoriya, tajriba" />
              <Field label="Senga nima kerak?" hint="Halol va konkret bo‘l" value={draft.needs.join(', ')} onChange={(v) => update('needs', parseTags(v))} placeholder="design, distribution, capital" />
              <Field label="Asosiy mavzular" hint="Ko‘pi bilan 8 ta" value={draft.topics.join(', ')} onChange={(v) => update('topics', parseTags(v))} placeholder="AI, climate, education" />
              <button className="primary publish" disabled={completeness < 100} onClick={publish}>Niyatni tarmoqqa chiqarish <span>→</span></button>
            </div>
            <aside className="preview">
              <span className="kicker">LIVE CAPSULE</span>
              <div className="capsule-glow" />
              <h3>{draft.title || 'Sening niyating shu yerda paydo bo‘ladi'}</h3>
              <p>{draft.outcome || 'Aniq natijani yozsang, tarmoq kerakli kesishmalarni topadi.'}</p>
              <TagGroup title="BERAMAN" tags={draft.offers} empty="Qobiliyatlaring" />
              <TagGroup title="KERAK" tags={draft.needs} empty="Ehtiyojlaring" warm />
              <div className="privacy"><span>◉</span><div><b>Consent-first</b><small>Kontakt ma’lumoting faqat ikki tomon roziligidan keyin ochiladi.</small></div></div>
            </aside>
          </div>
        </section>
      )}

      {screen === 'matches' && (
        <section className="workspace matches-page">
          <header className="section-head">
            <div><span className="kicker">MUTUAL COLLISIONS</span><h2>{matches.filter(m => m.score > 50).length} ta kuchli kesishma.</h2><p>Bu odamlar faqat senga kerak emas — sen ham ularga keraksan.</p></div>
            <div className="header-actions"><button className="outline" onClick={() => setScreen('create')}>Niyatni tahrirlash</button><button className="primary" onClick={() => setScreen('product')}>Workspace →</button></div>
          </header>
          <div className="match-grid">
            {matches.map((match, index) => (
              <button className="match-card" key={match.person.id} onClick={() => setActiveMatch(match)}>
                <div className="match-top"><span className="rank">0{index + 1}</span><div className="score"><b>{match.score}</b><small>MATCH</small></div></div>
                <div className="person"><div className="person-avatar" style={{ background: match.person.accent }}>{match.person.initials}</div><div><h3>{match.person.name}</h3><p>{match.person.role} · {match.person.city}</p></div></div>
                <h4>{match.person.intent.title}</h4>
                <div className="exchange">
                  <div><span>SEN OLASAN</span><p>{match.youReceive.join(' · ') || 'Yangi perspektiva'}</p></div>
                  <b>⇄</b>
                  <div><span>ULAR OLADI</span><p>{match.theyReceive.join(' · ') || 'Yangi aloqa'}</p></div>
                </div>
                <span className="view">Kesishmani ochish ↗</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeMatch && (
        <Dialog label={`${activeMatch.person.name} bilan moslik`} onClose={() => setActiveMatch(null)}>
            <button aria-label="Dialogni yopish" className="close" onClick={() => setActiveMatch(null)}>×</button>
            <span className="kicker">MUTUAL VALUE · {activeMatch.score}%</span>
            <div className="modal-person"><div className="person-avatar large" style={{ background: activeMatch.person.accent }}>{activeMatch.person.initials}</div><div><h2>{activeMatch.person.name}</h2><p>{activeMatch.person.role} · {activeMatch.person.city}</p></div></div>
            <div className="reason-list">{activeMatch.reasons.map(r => <span key={r}>✓ {r}</span>)}</div>
            <div className="message"><span>TAKLIF ETILGAN KIRISH</span><p>{activeMatch.opening}</p></div>
            {requested.includes(activeMatch.person.id) ? (
              <div className="sent">✓ So‘rov yuborildi. Qarshi tomon rozilik bersa, aloqa ochiladi.</div>
            ) : (
              <button className="primary full" onClick={() => setRequested([...requested, activeMatch.person.id])}>Rozilik bilan intro so‘rash <span>→</span></button>
            )}
            <small className="consent-note">Bu amal kontaktni darhol ochmaydi. Ikki tomon ham rozilik berishi kerak.</small>
        </Dialog>
      )}
    </main>
  )
}

function TagGroup({ title, tags, empty, warm = false }: { title: string; tags: string[]; empty: string; warm?: boolean }) {
  return <div className="tag-group"><span>{title}</span><div>{tags.length ? tags.map(tag => <i className={warm ? 'warm' : ''} key={tag}>{tag}</i>) : <i className="ghost">{empty}</i>}</div></div>
}

export default App