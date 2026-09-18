import { clubById, tunables, type Decision, type DecisionOption, type Promise, type World } from '@tenure/engine'
import { withAnswer, type Session } from '../controller.js'
import { Card, Choices, Foot, FootSpace, Head, Seg } from './ui.js'

const PROMISES: { key: Promise; label: string; blurb: string }[] = [
  { key: 'top-half', label: 'Top half', blurb: 'The normal budget.' },
  { key: 'promotion', label: 'Promotion', blurb: '+30% budget, the target three places harder.' },
  { key: 'stability', label: 'Stability', blurb: '−10% budget, the target two places easier.' },
]

export interface OfferPick {
  promise: Promise
  years: number
}

export function defaultPick(offer: Decision): OfferPick {
  return { promise: 'top-half', years: Number(offer.payload['years']) || 2 }
}

/** The interview option the promise and length choose. */
export function offerOption(offer: Decision, pick: OfferPick): DecisionOption | undefined {
  return offer.options.find((o) => o.key === `${pick.promise}:${pick.years}`) ?? offer.options.find((o) => o.key.startsWith(`${pick.promise}:`))
}

function salaryFrom(detail: string | undefined): string | null {
  const m = detail?.match(/£[\d.]+m a season/)
  return m ? m[0] : null
}

function targetFrom(detail: string | undefined): string | null {
  const m = detail?.match(/target ([^,\s]+)/)
  return m ? m[1]! : null
}

/** What you promise at the interview and how long for: the two controls the terms turn on. */
export function OfferTerms({ offer, pick, onPick }: { offer: Decision; pick: OfferPick; onPick: (p: OfferPick) => void }) {
  const option = offerOption(offer, pick)
  const promise = PROMISES.find((p) => p.key === pick.promise)
  const target = targetFrom(option?.detail)
  const salary = salaryFrom(option?.detail)
  return (
    <>
      <div className="stack g8">
        <div className="label">What you promise at the interview</div>
        <Seg options={PROMISES.map((p) => ({ key: p.key, label: p.label }))} value={pick.promise} onChange={(promise) => onPick({ ...pick, promise })} testId={(k) => `promise-${k}`} />
        <div className="caption">
          {promise?.blurb}
          {target ? ` Target ${target}.` : ''}
        </div>
      </div>
      <div className="stack g8">
        <div className="label">Contract</div>
        <Seg options={tunables.HUMAN_CONTRACT_YEARS_OPTIONS.map((y) => ({ key: String(y), label: `${y} yr${y === 1 ? '' : 's'}` }))} value={String(pick.years)} onChange={(y) => onPick({ ...pick, years: Number(y) })} testId={(k) => `years-${k}`} />
        <div className="caption">{salary ? `${salary}. ` : ''}Longer buys patience and pays less.</div>
      </div>
    </>
  )
}

function vacancyOf(world: World, offer: Decision) {
  const id = Number(offer.payload['vacancyId'])
  return world.vacancies[id - 1] ?? null
}

/** Day one: your agent's offer, terms on the table (DESIGN.md "Job market", the start). */
export function FirstOffer({ session, offer, pick, onPick, onContinue }: { session: Session; offer: Decision; pick: OfferPick; onPick: (p: OfferPick) => void; onContinue: (s: Session) => void }) {
  const world: World = session.world
  const post = offer.payload['post'] as { clubId: number }
  const club = clubById(world, post.clubId)
  const vacancy = vacancyOf(world, offer)
  const years = Number(offer.payload['years'])
  const salary = Number(offer.payload['salary'])
  const budget = Number(offer.payload['budget'])
  const expectation = Number(offer.payload['expectation'])
  const option = offerOption(offer, pick)
  return (
    <main className="screen" aria-label="Your first offer">
      <Head eyebrow="Your agent · day one" title={club.name} sub={`Tier ${club.tier} · ${vacancy?.crisis ? 'a club in crisis' : 'the bottom of your band'} · ${club.owner.type} owner`} />
      <div className="scroll">
        <div className="stack g20 pt2">
          <div className="body lead">
            A {years}-year contract at £{salary}m a season, a summer budget of £{budget}m, and the board expects {ordinalText(expectation)}.
          </div>
          <OfferTerms offer={offer} pick={pick} onPick={onPick} />
          <div className="rule" />
          <div className="sub">Out of work, your agent puts your name in for the best-fitting vacancy every week. This offer is a one-off: after a spell ends, the market decides.</div>
        </div>
        <div className="tail" />
      </div>
      <Foot>
        <Choices
          title="The offer on the table"
          options={[
            { key: 'decline', label: 'Start unemployed', testId: 'start-unemployed' },
            { key: option?.key ?? 'decline', label: 'Accept', detail: 'manage from the first turn', testId: 'accept-offer' },
          ]}
          onChoose={(key) => onContinue(withAnswer(session, offer.id, key))}
        />
      </Foot>
      <FootSpace />
    </main>
  )
}

function ordinalText(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'] as const
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** A job offer while out of work: the same terms, answered below. */
export function OfferCard({ world, offer, pick, onPick, answered }: { world: World; offer: Decision; pick: OfferPick; onPick: (p: OfferPick) => void; answered: string | undefined }) {
  const post = offer.payload['post'] as { clubId: number }
  const club = clubById(world, post.clubId)
  const vacancy = vacancyOf(world, offer)
  const option = offerOption(offer, pick)
  return (
    <Card label="Agent · must answer" testId="offer-card">
      <div className="h">{club.name} want to talk</div>
      <div className="sub">
        Tier {club.tier}, {club.owner.type} owner, {vacancy?.crisis ? 'a crisis appointment' : 'a planned appointment'}. They are offering {Number(offer.payload['years'])} years at £{Number(offer.payload['salary'])}m a season, a budget of £{Number(offer.payload['budget'])}m, and expect {ordinalText(Number(offer.payload['expectation']))}.
      </div>
      <OfferTerms offer={offer} pick={pick} onPick={onPick} />
      <div className="caption">{answered === undefined ? 'Answer below.' : answered === 'decline' ? 'Continue turns the job down.' : `Continue takes the job: ${option?.detail ?? ''}.`}</div>
    </Card>
  )
}
