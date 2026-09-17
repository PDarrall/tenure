import { useEffect, useReducer, useState } from 'react'
import { bestReplacement, tableFor, type MatchPlayer, type MatchState, type Mentality, type PlayerId, type Tier, type World } from '@tenure/engine'
import { humanMatch, humanSide, mentalityWatched, skipWatched, substituteWatched, tickWatched, watched, type Session } from '../controller.js'
import { humanClub, positionLabel } from './common.js'

/** Wall time per match minute at full speed: a match in about a minute (DESIGN.md "Match"). */
export const MINUTE_MS = 640

function scoreText(m: MatchState): string {
  return `${m.home.name} ${m.home.goals}–${m.away.goals} ${m.away.name}`
}

function clock(m: MatchState): string {
  if (m.over) return 'Full time'
  if (m.played === 0) return 'Kick-off'
  const base = m.half === 1 ? 45 : 90
  return m.minute > base ? `${base}+${m.minute - base}'` : `${m.minute}'`
}

/** The live table for the human's division: the standings with today's results applied. */
function liveTable(world: World, matches: MatchState[], tier: Tier) {
  const rows = tableFor(world, tier).map((r) => ({ ...r }))
  const byClub = new Map(rows.map((r) => [r.clubId, r]))
  for (const m of matches) {
    const h = byClub.get(m.home.clubId)
    const a = byClub.get(m.away.clubId)
    if (!h || !a) continue
    h.played++
    a.played++
    h.goalsFor += m.home.goals
    h.goalsAgainst += m.away.goals
    a.goalsFor += m.away.goals
    a.goalsAgainst += m.home.goals
    if (m.home.goals > m.away.goals) {
      h.won++
      a.lost++
      h.points += 3
    } else if (m.home.goals < m.away.goals) {
      a.won++
      h.lost++
      a.points += 3
    } else {
      h.drawn++
      a.drawn++
      h.points++
      a.points++
    }
  }
  return rows.sort((x, y) => y.points - x.points || y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor)
}

export function MatchView({ session, onContinue }: { session: Session; onContinue: () => void }) {
  const world = session.world
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [running, setRunning] = useState(false)
  const [holding, setHolding] = useState(false)
  const [subOff, setSubOff] = useState<PlayerId | null>(null)
  const [kickedOff, setKickedOff] = useState(0)
  const [fullTimeAt, setFullTimeAt] = useState<number | null>(null)
  const m = humanMatch(session)
  const w = watched(session)
  const us = humanSide(session)
  const live = running || holding

  useEffect(() => {
    if (!live || !m || m.over) return
    const timer = window.setInterval(() => {
      const events = tickWatched(session)
      const mine = humanMatch(session)
      if (mine && mine.over) {
        setRunning(false)
        setHolding(false)
        setFullTimeAt(Date.now())
      } else if (events.some((e) => e.pause)) {
        setRunning(false)
        setHolding(false)
      }
      bump()
    }, MINUTE_MS)
    return () => window.clearInterval(timer)
  }, [live, session, m])

  // Space bar held runs the match, as in CM.
  useEffect(() => {
    if (!m || m.over) return
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        setHolding(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setHolding(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [m])

  if (!m || !w) return null
  const ours = m[us]
  const paused = !live && !m.over
  const club = humanClub(world)
  const onPitch = ours.players.filter((p) => p.on)
  const bench = ours.players.filter((p) => !p.on && !p.started && !p.sentOff && !p.injured && p.minutes === 0)
  const injuredNeedingChange = ours.players.filter((p) => p.injured && p.started && !ours.players.some((q) => q.on && q.slot === p.slot && q.id !== p.id))
  const events = [...m.events].reverse()
  const others = w.matches.slice(1)
  const tier: Tier | null = club ? club.tier : null
  const wallSeconds = kickedOff && fullTimeAt ? Math.round((fullTimeAt - kickedOff) / 1000) : null

  const start = () => {
    if (!kickedOff) setKickedOff(Date.now())
  }
  const skip = () => {
    start()
    skipWatched(session)
    setRunning(false)
    setHolding(false)
    setFullTimeAt(Date.now())
    bump()
  }
  const sub = (onId: PlayerId) => {
    if (subOff === null) return
    substituteWatched(session, subOff, onId)
    setSubOff(null)
    bump()
  }
  const changeMentality = (mentality: Mentality) => {
    mentalityWatched(session, mentality)
    bump()
  }
  const liveRating = (p: MatchPlayer) => p.live.toFixed(1)

  return (
    <section aria-label="Match" className="decision">
      <p className="from">Match · {w.slot.kind === 'cup' ? w.slot.competition : 'league'}</p>
      <h2 data-testid="score">{scoreText(m)}</h2>
      <p>
        <strong data-testid="minute">{clock(m)}</strong>
        {m.home.scorers.length + m.away.scorers.length > 0 && (
          <span className="muted">
            {' '}
            · {m.home.scorers.map((s) => `${s.name} ${s.minute}'`).join(', ') || '—'} | {m.away.scorers.map((s) => `${s.name} ${s.minute}'`).join(', ') || '—'}
          </span>
        )}
      </p>
      <div className="bar" aria-label="Pressure" title={`Pressure ${Math.round(m.pressure)}`}>
        <div className="fill" style={{ width: `${Math.round((m.pressure + 100) / 2)}%` }} />
      </div>
      <p className="muted small">
        Pressure: {m.away.name} ← → {m.home.name}
      </p>

      <div className="row">
        {!m.over && (
          <>
            <button
              className={holding ? 'selected' : ''}
              onPointerDown={(e) => {
                e.preventDefault()
                start()
                setHolding(true)
              }}
              onPointerUp={() => setHolding(false)}
              onPointerLeave={() => setHolding(false)}
              onPointerCancel={() => setHolding(false)}
              data-testid="hold-to-run"
            >
              <span>Hold to run</span>
            </button>
            <button
              className={running ? 'selected' : ''}
              onClick={() => {
                start()
                setRunning(!running)
              }}
              data-testid="run-toggle"
              aria-pressed={running}
            >
              <span>{running ? 'Pause' : 'Run'}</span>
            </button>
            <button onClick={skip} data-testid="to-full-time">
              To full time
            </button>
          </>
        )}
        {m.over && (
          <button className="primary" onClick={onContinue} data-testid="continue-after-match">
            Continue
          </button>
        )}
      </div>
      {wallSeconds !== null && <p className="muted small" data-testid="wall-seconds">{wallSeconds}</p>}

      {paused && (
        <div className="notice" aria-label="While paused">
          <p>
            <strong>Paused.</strong> Mentality:{' '}
            {(['defend', 'balanced', 'attack'] as Mentality[]).map((mt) => (
              <button key={mt} className={ours.mentality === mt ? 'selected' : ''} onClick={() => changeMentality(mt)} aria-pressed={ours.mentality === mt} data-testid={`mentality-${mt}`}>
                <span>{mt}</span>
              </button>
            ))}
          </p>
          {injuredNeedingChange.length > 0 && <p>{injuredNeedingChange.map((p) => p.name).join(', ')} cannot go on: make a change.</p>}
          {ours.subsUsed < 3 && bench.length > 0 && (
            <p>
              Substitution ({3 - ours.subsUsed} left): {subOff === null ? 'tap the player coming off, then the one going on.' : `${ours.players.find((p) => p.id === subOff)?.name} off; who comes on?`}
            </p>
          )}
          {subOff !== null && (
            <div className="row">
              {bench.map((p) => (
                <button key={p.id} onClick={() => sub(p.id)} data-testid="sub-on" data-player={p.id}>
                  <span>
                    {p.name} ({positionLabel(p)} {Math.round(p.rating)})
                  </span>
                </button>
              ))}
              {(() => {
                const best = bestReplacement(m, us, subOff)
                return best !== null ? (
                  <button onClick={() => sub(best)} data-testid="sub-best">
                    <span>Best available</span>
                  </button>
                ) : null
              })()}
              <button onClick={() => setSubOff(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div className="cols">
        <div>
          <h3>{ours.name}</h3>
          <ul className="plain">
            {[...onPitch, ...ours.players.filter((p) => p.injured && !p.on)].map((p) => (
              <li key={p.id} className="item">
                {paused && ours.subsUsed < 3 && bench.length > 0 && !m.over ? (
                  <button className={subOff === p.id ? 'selected' : ''} onClick={() => setSubOff(subOff === p.id ? null : p.id)} data-testid="sub-off" data-player={p.id}>
                    <span>
                      {p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side} · ` : ''}
                      {p.name} · {liveRating(p)} · {Math.round(p.condition)}
                      {p.yellows > 0 ? ' · booked' : ''}
                      {p.injured ? ' · injured' : ''}
                    </span>
                  </button>
                ) : (
                  <span>
                    {p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side} · ` : ''}
                    {p.name} · {liveRating(p)} · {Math.round(p.condition)}
                    {p.yellows > 0 ? ' · booked' : ''}
                    {p.sentOff ? ' · sent off' : ''}
                    {p.injured ? ' · injured' : ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="muted small">Bench: {bench.map((p) => p.name).join(', ') || 'nobody left'}. Subs used {ours.subsUsed} of 3.</p>
        </div>
        <div>
          <h3>{m[us === 'home' ? 'away' : 'home'].name}</h3>
          <ul className="plain">
            {m[us === 'home' ? 'away' : 'home'].players
              .filter((p) => p.on)
              .map((p) => (
                <li key={p.id} className="item">
                  {p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side} · ` : ''}
                  {p.name} · {liveRating(p)}
                  {p.yellows > 0 ? ' · booked' : ''}
                </li>
              ))}
          </ul>
        </div>
      </div>

      <h3>Stats</h3>
      <table>
        <thead>
          <tr>
            <th className="name"></th>
            <th>Shots</th>
            <th>On target</th>
            <th>Poss</th>
            <th>Corners</th>
            <th>Fouls</th>
            <th>Cards</th>
          </tr>
        </thead>
        <tbody>
          {(['home', 'away'] as const).map((k) => (
            <tr key={k} className={k === us ? 'me' : ''}>
              <td className="name">{m[k].name}</td>
              <td>{m[k].stats.shots}</td>
              <td>{m[k].stats.onTarget}</td>
              <td>{m.over ? `${m[k].stats.possession}%` : `${k === 'home' ? Math.round(50 + 0.6 * 100 * ((m.played ? m.homeMinutes / m.played : 0.5) - 0.5)) : 100 - Math.round(50 + 0.6 * 100 * ((m.played ? m.homeMinutes / m.played : 0.5) - 0.5))}%`}</td>
              <td>{m[k].stats.corners}</td>
              <td>{m[k].stats.fouls}</td>
              <td>
                {m[k].stats.yellows}/{m[k].stats.reds}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Commentary</h3>
      <ul className="plain" aria-label="Commentary" data-testid="commentary">
        {events.map((e, i) => (
          <li key={events.length - i} className={e.kind === 'goal' || e.kind === 'red' ? '' : 'muted'}>
            <strong>{e.minute}'</strong> {e.text}
          </li>
        ))}
      </ul>

      {others.length > 0 && (
        <>
          <h3>Latest scores</h3>
          <ul className="plain" data-testid="latest-scores">
            {others.map((o, i) => (
              <li key={i}>
                {o.home.name} {o.home.goals}–{o.away.goals} {o.away.name} <span className="muted small">{clock(o)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {m.over && w.slot.kind === 'league' && tier !== null && (
        <>
          <h3>Table at full time</h3>
          <table data-testid="live-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="name">Club</th>
                <th>P</th>
                <th>GD</th>
                <th>Pts</th>
              </tr>
            </thead>
            <tbody>
              {liveTable(world, w.matches, tier).map((r, i) => (
                <tr key={r.clubId} className={club && r.clubId === club.id ? 'me' : ''}>
                  <td>{i + 1}</td>
                  <td className="name">{world.clubs[r.clubId - 1]?.name}</td>
                  <td>{r.played}</td>
                  <td>{r.goalsFor - r.goalsAgainst}</td>
                  <td>{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
