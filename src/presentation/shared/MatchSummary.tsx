import type { Match, Person } from '../../domain/model/entities'

export function PersonSummary({ person, large = false }: { person: Person; large?: boolean }) {
  return (
    <div className={large ? 'modal-person' : 'person'}>
      <div className={`person-avatar${large ? ' large' : ''}`} style={{ background: person.accent }}>
        {person.initials}
      </div>
      <div>
        <h3>{person.name}</h3>
        <p>{person.role} · {person.city}</p>
      </div>
    </div>
  )
}

export function MutualExchange({ match, compact = false }: { match: Match; compact?: boolean }) {
  const Element = compact ? 'b' : 'p'

  return (
    <div className={compact ? 'mutual-box' : 'exchange'}>
      <div>
        <span>SEN OLASAN</span>
        <Element>{match.youReceive.join(' · ') || 'Yangi perspektiva'}</Element>
      </div>
      <i aria-hidden="true">⇄</i>
      <div>
        <span>ULAR OLADI</span>
        <Element>{match.theyReceive.join(' · ') || 'Yangi aloqa'}</Element>
      </div>
    </div>
  )
}