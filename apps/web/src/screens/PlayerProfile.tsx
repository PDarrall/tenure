import { clubNameOf, pendingDecisions, playerById, TRAIT_RULES, tunables, type World } from '@tenure/engine'
import type { Session } from '../controller.js'
import { withContractOffer } from '../controller.js'
import { averageRatingOf, fitness, humanClub, positionLabel, rating, ratingChange } from './common.js'

/** The potential a scout would report: a range around the hidden number, for an unfinished player of your own club. */
function potentialRange(p: { rating: number; potential: number; age: number }): string | null {
  if (p.age >= tunables.YOUTH_AGE) return null
  const spread = 4
  const low = Math.max(Math.round(p.rating), Math.floor(p.potential - spread))
  const high = Math.ceil(p.potential + spread)
  return `${low}–${high}`
}

export function PlayerProfile({ session, playerId, onChange, onBack }: { session: Session; playerId: number; onChange: (s: Session) => void; onBack: () => void }) {
  const world: World = session.world
  const p = playerById(world, playerId)
  if (!p) {
    return (
      <section aria-label="Player">
        <p className="muted">He is no longer on the books.</p>
        <button onClick={onBack}>Back</button>
      </section>
    )
  }
  const club = humanClub(world)
  const ours = club !== null && p.clubId === club.id
  const mine = world.human && p.madeBy.find((m) => m.managerId === world.human!.managerId)
  const range = ours ? potentialRange(p) : null
  const pendingContract = pendingDecisions(world).find((d) => d.kind === 'playerContract' && d.payload['playerId'] === p.id)
  const offered = (session.inputs.contractOffers ?? []).includes(p.id)
  const history = [...p.history, p.season].filter((h) => h.apps > 0 || h.season === world.season)
  return (
    <section aria-label="Player">
      <p>
        <button onClick={onBack}>← Squad</button>
      </p>
      <h2>
        {mine ? '★ ' : ''}
        {p.name}
      </h2>
      <p>
        {positionLabel(p)}, {p.age}, {p.nationality}. Rating <strong>{rating(p)}</strong> ({ratingChange(p)} this season).
        {range ? ` Potential, as scouted: ${range}.` : p.age < tunables.YOUTH_AGE ? ' Potential: not scouted.' : ' A finished player.'}
      </p>
      <p>
        Condition {fitness(p)} · morale {Math.round(p.morale)} · value £{p.value}m · contract {p.contract.years} year{p.contract.years === 1 ? '' : 's'} at £{p.contract.wage}k a week
        {p.yellows > 0 ? ` · ${p.yellows} yellow${p.yellows === 1 ? '' : 's'} this season` : ''}
      </p>
      {p.traits.length > 0 && (
        <ul>
          {p.traits.map((t) => (
            <li key={t}>
              <strong>{t}</strong>: {TRAIT_RULES[t].rule}
            </li>
          ))}
        </ul>
      )}
      {mine && (
        <p>
          Yours: {mine.circumstance} at {clubNameOf(world, mine.clubId)} in season {Math.floor(mine.week / tunables.SEASON_WEEKS) + 1}, rated {Math.round(mine.rating)} then. Bond {Math.round(mine.bond)}, growth under you {mine.growth.toFixed(1)}.
        </p>
      )}
      {ours && (
        <div className="row">
          {pendingContract ? (
            <span className="notice">His terms are on your desk under Decisions.</span>
          ) : offered ? (
            <span className="notice">You will talk terms when you continue.</span>
          ) : (
            <button onClick={() => onChange(withContractOffer(session, p.id))}>Talk terms{p.contract.years <= 1 ? ' (last year)' : ''}</button>
          )}
        </div>
      )}
      <h3>Record</h3>
      <table>
        <thead>
          <tr>
            <th>Season</th>
            <th className="name">Club</th>
            <th>Apps</th>
            <th>G</th>
            <th>A</th>
            <th>Avg</th>
            <th>Cards</th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={`${h.season}-${h.clubId}`}>
              <td>{h.season}</td>
              <td className="name">
                {clubNameOf(world, h.clubId) ?? '—'}
                {h.tier ? ` (tier ${h.tier})` : ''}
              </td>
              <td>
                {h.apps} ({h.starts})
              </td>
              <td>{h.goals}</td>
              <td>{h.assists}</td>
              <td>{h.rated ? (h.ratingSum / h.rated).toFixed(2) : '–'}</td>
              <td>
                {h.yellows}/{h.reds}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {p.season.rated > 0 && <p className="muted">Average this season {averageRatingOf(p)}.</p>}
      {!mine && p.madeBy.length > 0 && <p className="muted">Made by {p.madeBy.map((m) => world.managers[m.managerId - 1]?.name ?? 'somebody').join(', ')}.</p>}
    </section>
  )
}
