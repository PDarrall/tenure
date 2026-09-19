import { clubNameOf, pendingDecisions, playerById, requestLikelihood, scoutedView, TRAIT_RULES, tunables, windowState, type Request, type World } from '@tenure/engine'
import type { Session } from '../controller.js'
import { requested, withRequest, withoutRequest } from '../controller.js'
import { humanClub, isMine, rating, ratingChange, ratingChangeUp } from './common.js'
import { Chevron, Star } from './ui.js'

/** The potential a scout would report: a range around the hidden number, for an unfinished player of your own club. */
function potentialRange(p: { rating: number; potential: number; age: number }): string | null {
  if (p.age >= tunables.YOUTH_AGE) return null
  const spread = 4
  const low = Math.max(Math.round(p.rating), Math.floor(p.potential - spread))
  const high = Math.ceil(p.potential + spread)
  return `${low}–${high}`
}

function askLabel(ask: Request['ask']): string {
  switch (ask) {
    case 'captaincy':
      return 'Offer the armband'
    case 'contract':
      return 'Talk terms'
    case 'playingTime':
      return 'Promise starts'
    case 'sell':
      return 'Put him up for sale'
    case 'loan':
      return 'Loan him out'
    default:
      return ask
  }
}

const POSITION: Record<string, string> = { GK: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }
const SIDE: Record<string, string> = { L: 'left', C: 'centre', R: 'right' }

function positionName(p: { position: string; side: string }): string {
  const name = POSITION[p.position] ?? p.position
  const side = SIDE[p.side]
  return side && p.position !== 'GK' ? `${name}, ${side}` : name
}

export function PlayerProfile({ session, playerId, onChange, onBack }: { session: Session; playerId: number; onChange: (s: Session) => void; onBack: () => void }) {
  const world: World = session.world
  const p = playerById(world, playerId)
  const back = (
    <button type="button" className="text-btn" onClick={onBack} style={{ fontSize: 14 }}>
      <Chevron dir="left" />
      Squad
    </button>
  )
  if (!p) {
    return (
      <>
        <div className="head">
          {back}
          <h1 className="title">No longer on the books</h1>
        </div>
        <div className="scroll" aria-label="Player" />
      </>
    )
  }
  const club = humanClub(world)
  const ours = club !== null && p.clubId === club.id
  const mine = world.human && p.madeBy.find((m) => m.managerId === world.human!.managerId)
  const range = ours ? potentialRange(p) : null
  const pendingContract = pendingDecisions(world).find((d) => d.kind === 'playerContract' && d.payload['playerId'] === p.id)
  const offered = (session.inputs.contractOffers ?? []).includes(p.id)
  const history = [...p.history, p.season].filter((h) => h.apps > 0 || h.season === world.season).reverse()
  const selection = { ...world.human!.selection, ...(session.inputs.selection ?? {}) }
  const captain = selection.captain === p.id
  const scouted = scoutedView(p)
  const open = windowState(world).open
  const ask = (ask: Request['ask'], to: Request['to']) => {
    const req: Request = { to, ask, playerId: p.id }
    const like = requestLikelihood(world, req)
    const on = requested(session, req)
    return (
      <button type="button" className="btn small" disabled={!on && !like.available} title={like.available ? like.words : (like.why ?? '')} onClick={() => onChange(on ? withoutRequest(session, req) : withRequest(session, req))} data-testid={`ask-${ask}`}>
        {on ? 'Asked · cancel' : like.available ? `${askLabel(ask)} (${like.words})` : `${askLabel(ask)}: ${like.why === 'closed' ? 'window shut' : 'not now'}`}
      </button>
    )
  }
  const condition = p.injuryWeeks > 0 ? `inj ${p.injuryWeeks}w` : p.suspension > 0 ? `ban ${p.suspension}` : `${Math.round(p.condition)}`
  return (
    <>
      <div className="head" style={{ gap: 8 }}>
        {back}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isMine(world, p) && <Star size={14} />}
          <h1 className="title">{p.name}</h1>
        </div>
        <div className="sub">
          {positionName(p)} · {p.age} · {p.nationality === 'home' ? 'home-grown' : 'from abroad'}
        </div>
      </div>
      <div className="scroll" aria-label="Player">
        <div className="stack g16 pt2">
          <div style={{ display: 'flex', gap: 20 }}>
            <div className="stack g2 grow">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="figure" style={{ fontSize: 34, lineHeight: '38px' }} data-testid="player-rating">
                  {scouted ? `${scouted.lo}–${scouted.hi}` : rating(p)}
                </span>
                {!scouted && (
                  <span className={`strong ${ratingChangeUp(p) ? 'ink' : 'ink3'}`} style={{ fontSize: 14 }}>
                    {ratingChange(p)} this season
                  </span>
                )}
              </div>
              <div className="label" data-testid="rating-label">{scouted ? `Rating, the director's estimate · ${scouted.seen} of ${scouted.of} matches seen` : 'Rating'}</div>
            </div>
            <div className="stack g2 grow">
              <div className="figure" style={{ fontSize: 34, lineHeight: '38px' }}>
                {scouted ? `${scouted.plo}–${scouted.phi}` : (range ?? (p.age < tunables.YOUTH_AGE ? '—' : 'Made'))}
              </div>
              <div className="label">{scouted ? 'Potential, his estimate' : range ? 'Potential, as scouted' : p.age < tunables.YOUTH_AGE ? 'Potential, not scouted' : 'A finished player'}</div>
            </div>
          </div>
          <div className="triple">
            <div>
              <span className="h bold">{condition}</span>
              <div className="label">Condition</div>
            </div>
            <div>
              <span className="h bold">{Math.round(p.morale)}</span>
              <div className="label">Morale</div>
            </div>
            <div>
              <span className="h bold">£{p.value}m</span>
              <div className="label">Value</div>
            </div>
          </div>
          <div className="stack g6">
            <div className="label">Traits</div>
            {p.traits.length === 0 && <div className="body ink2">None to speak of.</div>}
            {p.traits.map((t) => (
              <div className="body" key={t}>
                <span className="strong">{t.charAt(0).toUpperCase() + t.slice(1)}</span> <span className="ink2">— {TRAIT_RULES[t].rule}</span>
              </div>
            ))}
          </div>
          {mine && (
            <div className="stack g6">
              <div className="label">Yours</div>
              <div className="body ink2">
                {mine.circumstance.charAt(0).toUpperCase() + mine.circumstance.slice(1)} at {clubNameOf(world, mine.clubId)} in season {Math.floor(mine.week / tunables.SEASON_WEEKS) + 1}, rated {Math.round(mine.rating)} then. Bond {Math.round(mine.bond)} · growth under you {mine.growth.toFixed(1)}.
              </div>
            </div>
          )}
          {!mine && p.madeBy.length > 0 && (
            <div className="stack g6">
              <div className="label">Made by</div>
              <div className="body ink2">{p.madeBy.map((m) => world.managers[m.managerId - 1]?.name ?? 'somebody').join(', ')}.</div>
            </div>
          )}
          {ours && (
            <div className="between center">
              <div className="stack g2">
                <div className="label">Captain</div>
                <span className="row-name">{captain ? 'Wears the armband' : selection.captain === null ? 'Nobody wears the armband' : 'Not the captain'}</span>
              </div>
              {!captain && ask('captaincy', 'player')}
            </div>
          )}
          <div className="contract-row">
            <div className="stack g2">
              <div className="label">Contract</div>
              <span className="row-name">
                {p.contract.years} year{p.contract.years === 1 ? '' : 's'} at £{p.contract.wage}k a week
              </span>
            </div>
            {ours &&
              (pendingContract ? (
                <span className="caption right">His terms are on your desk at Home.</span>
              ) : offered ? (
                <span className="caption right">You will talk terms when you continue.</span>
              ) : (
                ask('contract', 'player')
              ))}
          </div>
          {ours && (
            <div className="stack g6">
              <div className="label">Asks · each a bet</div>
              <div className="between" style={{ gap: 8, flexWrap: 'wrap' }}>
                {ask('playingTime', 'player')}
                {ask('sell', 'director')}
                {ask('loan', 'director')}
              </div>
              {!open && <div className="caption">Sales and loans wait for a window.</div>}
            </div>
          )}
          <div className="stack">
            <div className="table-head" style={{ padding: '4px 0 6px' }}>
              <span className="w20" style={{ textAlign: 'left' }}>
                S
              </span>
              <span className="grow">Record</span>
              <span className="w54">Apps</span>
              <span className="w22">G</span>
              <span className="w22">A</span>
              <span className="w40">Avg</span>
            </div>
            {history.map((h) => (
              <div className="table-row" key={`${h.season}-${h.clubId}`} style={{ minHeight: 36, padding: '8px 0' }}>
                <span className="w20 pos">{h.season}</span>
                <span className="grow" style={{ fontSize: 14 }}>
                  {clubNameOf(world, h.clubId) ?? '—'}
                  {h.tier ? <span className="ink3"> · tier {h.tier}</span> : null}
                </span>
                <span className="w54 cell">
                  {h.apps} ({h.starts})
                </span>
                <span className="w22 cell">{h.goals}</span>
                <span className="w22 cell">{h.assists}</span>
                <span className="w40 cell-strong" style={{ fontSize: 14, fontWeight: 600 }}>
                  {h.rated ? (h.ratingSum / h.rated).toFixed(2) : '–'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="tail" />
      </div>
    </>
  )
}
