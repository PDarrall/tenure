import { useState } from 'react'
import { clubById, ordinal, type Decision, type Promise, type World } from '@tenure/engine'
import { withAnswer, type Session } from '../controller.js'

const PROMISES: { key: Promise; label: string; blurb: string }[] = [
  { key: 'top-half', label: 'Top half', blurb: 'the normal budget' },
  { key: 'promotion', label: 'Promotion', blurb: '+30% budget, the target three places harder' },
  { key: 'stability', label: 'Stability', blurb: '−10% budget, the target two places easier' },
]

/** Day one: your agent's offer, terms on the table (DESIGN.md "Job market", the start). */
export function FirstOffer({ session, offer, onContinue }: { session: Session; offer: Decision; onContinue: (s: Session) => void }) {
  const world: World = session.world
  const [promise, setPromise] = useState<Promise>('top-half')
  const post = offer.payload['post'] as { clubId: number }
  const club = clubById(world, post.clubId)
  const years = offer.payload['years'] as number
  const salary = offer.payload['salary'] as number
  const budget = offer.payload['budget'] as number
  const expectation = offer.payload['expectation'] as number
  const option = offer.options.find((o) => o.key === `${promise}:${years}`) ?? offer.options.find((o) => o.key.startsWith(`${promise}:`))
  // Answer and take the turn in one step: the answer must travel with the session, not wait for a re-render.
  const accept = () => {
    if (!option) return
    onContinue(withAnswer(session, offer.id, option.key))
  }
  const decline = () => onContinue(withAnswer(session, offer.id, 'decline'))
  return (
    <section aria-label="Your first offer" className="decision blocking">
      <p className="from">Your agent · day one</p>
      <h2>
        {club.name} (tier {club.tier})
      </h2>
      <p>
        {offer.payload['crisis'] === true ? 'A club in crisis. ' : 'The bottom of your band. '}
        {club.owner.type} owner. Terms: a {years}-year contract at £{salary}m a season, a summer budget of £{budget}m, and the board expects {ordinal(expectation)}.
      </p>
      <h3>What you promise at the interview</h3>
      <div className="row">
        {PROMISES.map((p) => (
          <button key={p.key} className={promise === p.key ? 'selected' : ''} onClick={() => setPromise(p.key)} aria-pressed={promise === p.key} data-testid={`promise-${p.key}`}>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <p className="muted">{PROMISES.find((p) => p.key === promise)?.blurb}. {option?.detail ? option.detail + '.' : ''}</p>
      <div className="row">
        <button className="primary" onClick={accept} disabled={!option} data-testid="accept-offer">
          Accept and manage from the first turn
        </button>
        <button onClick={decline} data-testid="start-unemployed">
          Start unemployed
        </button>
      </div>
      <p className="muted">Out of work, your agent puts your name in for the best-fitting vacancy every week. This offer is a one-off: after a spell ends, the market decides.</p>
    </section>
  )
}
