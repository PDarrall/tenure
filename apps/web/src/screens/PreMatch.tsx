import { competitionLabel, inboxSince, playerById, squadOf, tunables, type MatchSide, type World } from '@tenure/engine'
import { humanMatch, humanSide, watched, type Session } from '../controller.js'
import { positionLabel, rating, weekLabel } from './common.js'

function formText(form: readonly string[]): string {
  return form.length ? form.join(' ') : 'no games yet'
}

/** Before kick-off: the opposition report, the odds, what the assistant had to change, and the whistle (DESIGN.md "Formations and tactics"). */
export function PreMatch({ session, onKickOff, onBack }: { session: Session; onKickOff: () => void; onBack: () => void }) {
  const world: World = session.world
  const w = watched(session)
  const m = humanMatch(session)
  if (!w || !m) return null
  const prepared = w.prepared[0]!
  const us = humanSide(session)
  const them: 'home' | 'away' = us === 'home' ? 'away' : 'home'
  const ours: MatchSide = m[us]
  const theirs: MatchSide = m[them]
  const theirParticipant = them === 'home' ? prepared.homeSide.participant : prepared.awaySide.participant
  const odds = prepared.odds
  const pWin = us === 'home' ? odds.pHome : odds.pAway
  const pLose = us === 'home' ? odds.pAway : odds.pHome
  const theirClub = world.clubs[theirs.clubId - 1]
  const absentees = theirClub ? squadOf(world, theirClub).filter((p) => p.injuryWeeks > 0 || p.suspension > 0) : []
  const keyPlayers = theirs.players
    .filter((p) => p.on)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
  const staffNotes = inboxSince(world, session.shownFrom).filter((i) => i.from === 'staff')
  const pct = (x: number) => `${Math.round(x * 100)}%`
  return (
    <section aria-label="Pre-match" className="decision">
      <p className="from">Pre-match · {competitionLabel(prepared.fixture.competition)} · {weekLabel(w.seasonWeek)}</p>
      <h2>
        {m.home.name} v {m.away.name}
      </h2>
      <p>
        {us === 'home' ? 'At home. ' : 'Away. '}
        Odds: win {pct(pWin)}, draw {pct(odds.pDraw)}, lose {pct(pLose)}.
      </p>
      <h3>Opposition report</h3>
      <p>
        {theirs.name}: {theirs.formation}, {theirs.style}, {theirs.mentality}. Form {formText(theirParticipant.form)}.
        {theirClub ? ` Strength ${Math.round(theirClub.squad.strength)}.` : ''}
      </p>
      <p>
        Key players: {keyPlayers.map((p) => `${p.name} (${positionLabel(p)}, ${Math.round(p.rating)})`).join(', ')}.
        {absentees.length ? ` Absent: ${absentees.map((p) => `${p.name} (${p.injuryWeeks > 0 ? 'injured' : 'banned'})`).join(', ')}.` : ' Nobody missing.'}
      </p>
      <h3>Your side</h3>
      <p>
        {ours.formation}, {ours.style}, {ours.mentality}.
      </p>
      <ul className="plain">
        {ours.players
          .filter((p) => p.started)
          .map((p) => (
            <li key={p.id}>
              {p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side} · ` : ''}
              {p.name} {Math.round(p.rating)}
              {world.human!.selection.captain === p.id ? ' (c)' : ''}
            </li>
          ))}
      </ul>
      <p className="muted">Bench: {ours.players.filter((p) => !p.started).map((p) => `${p.name} (${positionLabel(p)})`).join(', ')}.</p>
      {staffNotes.length > 0 && (
        <>
          <h3>From the assistant</h3>
          {staffNotes.map((n, i) => (
            <p key={i}>{n.text}</p>
          ))}
        </>
      )}
      <div className="row">
        <button className="primary" onClick={onKickOff} data-testid="kick-off">
          Kick off
        </button>
        <button onClick={onBack}>Change the side</button>
      </div>
      <p className="muted">A match runs in about a minute at full speed; it pauses itself at goals, red cards, injuries and half time. Ratings out of {tunables.RATING_MAX}.</p>
      {(() => {
        const cap = world.human!.selection.captain
        const c = cap === null ? null : playerById(world, cap)
        return c && !ours.players.some((p) => p.id === c.id && p.started) ? <p className="muted">Your captain {c.name} is not starting.</p> : null
      })()}
    </section>
  )
}
