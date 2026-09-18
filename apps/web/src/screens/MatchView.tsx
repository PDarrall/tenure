import { useEffect, useReducer, useState } from 'react'
import { bestReplacement, competitionLabel, tableFor, type MatchEvent, type MatchPlayer, type MatchSide, type MatchState, type Mentality, type PlayerId, type Tier, type World } from '@tenure/engine'
import { humanMatch, humanSide, mentalityWatched, skipWatched, substituteWatched, tickWatched, watched, type Session } from '../controller.js'
import { humanClub, ordinalOf, positionLabel, weekLabel } from './common.js'
import { Continue, Foot, FootSpace, SectionLabel, Seg, Star } from './ui.js'
import { Table } from './Fixtures.js'

/** Wall time per match minute at full speed: a match in about a minute (DESIGN.md "Match"). */
export const MINUTE_MS = 640

function clock(m: MatchState): string {
  if (m.over) return 'FT'
  if (m.played === 0) return "0'"
  const last = m.events[m.events.length - 1]
  if (last && last.kind === 'halftime' && m.half === 1) return 'HT'
  const base = m.half === 1 ? 45 : 90
  return m.minute > base ? `${base}+${m.minute - base}'` : `${m.minute}'`
}

const PAUSE_LABEL: Record<string, string> = { goal: 'goal', red: 'red card', injury: 'injury', halftime: 'half time', fulltime: 'full time', shootout: 'penalties', sub: 'a change', kickoff: 'kick-off' }

function pauseReason(m: MatchState): string {
  const last = [...m.events].reverse().find((e) => e.pause)
  if (!last) return 'paused'
  return `paused · ${PAUSE_LABEL[last.kind] ?? last.kind}`
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

function scorers(side: MatchSide): string {
  return side.scorers.map((s) => `${s.name} ${s.minute}'`).join(', ')
}

function playerNote(p: MatchPlayer): string | null {
  if (p.sentOff) return 'sent off'
  if (p.injured) return 'injured'
  if (p.started && !p.on) return 'off'
  if (!p.started && p.on) return 'on'
  if (p.yellows > 0) return 'booked'
  return null
}

function XiRow({ p, mine, world }: { p: MatchPlayer; mine: boolean; world: World }) {
  const note = playerNote(p)
  const star = mine && world.human !== null && world.players[p.id - 1]?.madeBy.some((m) => m.managerId === world.human!.managerId)
  return (
    <div className={`pitch-row compact${!p.on ? ' off' : ''}`}>
      <span className="slot">{p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side}` : positionLabel(p)}</span>
      <span className="who">
        {star && <Star />}
        <span className="nm">{p.name}</span>
      </span>
      {note && <span className="note">{note}</span>}
      <span className="rt">{p.live.toFixed(1)}</span>
    </div>
  )
}

function Commentary({ events, testId, limit }: { events: MatchEvent[]; testId?: string; limit?: number }) {
  const shown = limit ? events.slice(-limit) : events
  return (
    <ul className="commentary" aria-label="Commentary" data-testid={testId}>
      {shown.map((e, i) => (
        <li key={`${e.minute}-${i}-${e.kind}`} className={e.kind === 'goal' ? 'goal' : i === shown.length - 1 ? 'latest' : ''}>
          <span className="min">{e.minute}'</span>
          <span className="txt">{e.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function MatchView({ session, onContinue }: { session: Session; onContinue: () => void }) {
  const world = session.world
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [running, setRunning] = useState(false)
  const [holding, setHolding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [subOff, setSubOff] = useState<PlayerId | null>(null)
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
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
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
  const them: 'home' | 'away' = us === 'home' ? 'away' : 'home'
  const ours = m[us]
  const theirs = m[them]
  const paused = !live && !m.over
  const club = humanClub(world)
  const tier: Tier | null = club ? club.tier : null
  const label = w.slot.kind === 'cup' ? competitionLabel(w.slot.competition) : 'League'
  const eyebrow = `${label} · ${weekLabel(w.seasonWeek)} · ${us === 'home' ? 'Home' : 'Away'}`
  const onPitch = ours.players.filter((p) => p.on)
  const bench = ours.players.filter((p) => !p.on && !p.started && !p.sentOff && !p.injured && p.minutes === 0)
  const injuredNeedingChange = ours.players.filter((p) => p.injured && p.started && !ours.players.some((q) => q.on && q.slot === p.slot && q.id !== p.id))
  const others = w.matches.slice(1)
  const subsLeft = 3 - ours.subsUsed
  const canSub = paused && subsLeft > 0 && bench.length > 0
  const pressureHome = m.pressure > 0
  const pressurePct = Math.min(50, Math.round(Math.abs(m.pressure) / 2))
  const offPlayer = subOff === null ? null : ours.players.find((p) => p.id === subOff)

  const sub = (onId: PlayerId) => {
    if (subOff === null) return
    substituteWatched(session, subOff, onId)
    setSubOff(null)
    setPicking(false)
    bump()
  }
  const changeMentality = (mentality: Mentality) => {
    mentalityWatched(session, mentality)
    bump()
  }
  const playOn = () => {
    setPicking(false)
    setSubOff(null)
    setRunning(true)
  }
  const pause = () => {
    setRunning(false)
    setHolding(false)
  }
  const skip = () => {
    skipWatched(session)
    setRunning(false)
    setHolding(false)
    bump()
  }

  const scoreHead = (
    <div className="score-head">
      <div className="side home">
        <div className="nm">{m.home.name}</div>
        <div className="sc">{scorers(m.home) || ' '}</div>
      </div>
      <div className={`scoreline${m.over ? '' : ' live'}`} data-testid="score" aria-label={`${m.home.name} ${m.home.goals}, ${m.away.name} ${m.away.goals}`}>
        {m.home.goals}
        <span className="dash">–</span>
        {m.away.goals}
      </div>
      <div className="side away">
        <div className="nm">{m.away.name}</div>
        <div className="sc">{scorers(m.away) || ' '}</div>
      </div>
    </div>
  )

  if (m.over) {
    const gf = ours.goals
    const ga = theirs.goals
    const home = us === 'home'
    const verb = gf > ga ? `won ${gf}–${ga} ${home ? 'at home to' : 'at'}` : gf === ga ? `drew ${gf}–${ga} ${home ? 'at home with' : 'away at'}` : `lost ${gf}–${ga} ${home ? 'at home to' : 'at'}`
    let move = ''
    if (w.slot.kind === 'league' && tier !== null && club) {
      const before = tableFor(world, tier).findIndex((r) => r.clubId === club.id) + 1
      const after = liveTable(world, w.matches, tier).findIndex((r) => r.clubId === club.id) + 1
      const d = before - after
      move = d > 0 ? ` Up ${d === 1 ? 'a place' : `${d} places`}, to ${ordinalOf(after)}.` : d < 0 ? ` Down ${-d === 1 ? 'a place' : `${-d} places`}, to ${ordinalOf(after)}.` : ` Still ${ordinalOf(after)}.`
    }
    const played = ours.players.filter((p) => p.started || p.minutes > 0)
    const half = Math.ceil(played.length / 2)
    const stats: [string, string, string][] = [
      [String(m.home.stats.shots), 'Shots', String(m.away.stats.shots)],
      [String(m.home.stats.onTarget), 'On target', String(m.away.stats.onTarget)],
      [`${m.home.stats.possession}%`, 'Possession', `${m.away.stats.possession}%`],
      [String(m.home.stats.corners), 'Corners', String(m.away.stats.corners)],
      [String(m.home.stats.fouls), 'Fouls', String(m.away.stats.fouls)],
      [`${m.home.stats.yellows} / ${m.home.stats.reds}`, 'Cards', `${m.away.stats.yellows} / ${m.away.stats.reds}`],
    ]
    return (
      <main className="screen" aria-label="Result">
        <div className="head tight">
          <div className="between">
            <div className="label">{eyebrow}</div>
            <span className="label">Full time</span>
          </div>
          {scoreHead}
          <div className="body">
            {ours.name} {verb} {theirs.name}.{move}
          </div>
        </div>
        <div className="rule" />
        <div className="scroll">
          <div className="stack">
            {stats.map(([h, k, a]) => (
              <div className="stat-row" key={k}>
                <span className="v">{h}</span>
                <span className="k">{k}</span>
                <span className="v r">{a}</span>
              </div>
            ))}
          </div>
          <SectionLabel>Ratings · {ours.name}</SectionLabel>
          <div className="two-col">
            <div>
              {played.slice(0, half).map((p) => (
                <XiRow key={p.id} p={p} mine world={world} />
              ))}
            </div>
            <div>
              {played.slice(half).map((p) => (
                <XiRow key={p.id} p={p} mine world={world} />
              ))}
            </div>
          </div>
          {w.slot.kind === 'league' && tier !== null && <LiveTable world={world} matches={w.matches} tier={tier} mine={club?.id ?? null} />}
          {others.length > 0 && (
            <>
              <SectionLabel>Full time{tier !== null ? ` · tier ${tier}` : ''}</SectionLabel>
              {others.map((o, i) => (
                <div className="latest-row" key={i}>
                  <span className="tm h">{o.home.name}</span>
                  <span className="sc">
                    {o.home.goals}–{o.away.goals}
                  </span>
                  <span className="tm">{o.away.name}</span>
                  <span className="mn">FT</span>
                </div>
              ))}
            </>
          )}
          <SectionLabel>Commentary</SectionLabel>
          <Commentary events={m.events} testId="commentary" />
          <div className="tail" />
        </div>
        <Foot>
          <Continue next="To the inbox" testId="continue-after-match" onClick={onContinue} />
        </Foot>
        <FootSpace />
      </main>
    )
  }

  return (
    <main className="screen" aria-label="Match">
      <div className="head tight">
        <div className="between">
          <div className="label">{eyebrow}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="label">{m.played === 0 ? 'Kick-off' : live ? 'Playing' : pauseReason(m)}</span>
            <span className="minute" data-testid="minute">
              {clock(m)}
            </span>
          </div>
        </div>
        {scoreHead}
        <div className="pressure" aria-label="Pressure" title={`Pressure ${Math.round(m.pressure)}`}>
          <div className="track">
            {pressurePct > 0 && <div className={`fill ${pressureHome ? 'home' : 'away'}`} style={{ width: `${pressurePct}%` }} />}
            <div className="centre" />
          </div>
          <div className="ends">
            <span>{m.home.name}</span>
            <span>{m.away.name}</span>
          </div>
        </div>
        {m.events.length > 0 && <Commentary events={m.events} limit={4} />}
      </div>
      <div className="rule" />
      <div className="scroll">
        {paused && (
          <div className="stack g10" style={{ padding: '14px 0 4px' }}>
            <div className="label">While paused · mentality</div>
            <Seg small options={[{ key: 'defend', label: 'Defend' }, { key: 'balanced', label: 'Balanced' }, { key: 'attack', label: 'Attack' }]} value={ours.mentality} onChange={changeMentality} testId={(k) => `mentality-${k}`} />
            <div className="between center" style={{ paddingTop: 4 }}>
              <span className="sub">
                Substitutions · {subsLeft} left
                {injuredNeedingChange.length ? ` · ${injuredNeedingChange.map((p) => p.name).join(', ')} cannot go on` : ''}
              </span>
              <span style={{ display: 'flex', gap: 8 }}>
                {canSub && !picking && (
                  <button type="button" className="btn small" onClick={() => setPicking(true)} data-testid="make-a-change">
                    Make a change
                  </button>
                )}
                <button type="button" className="btn small" onClick={skip} data-testid="to-full-time">
                  To full time
                </button>
              </span>
            </div>
            {picking && canSub && (
              <div className="sub-box" data-testid="sub-box">
                <div className="between">
                  <span className="strong" style={{ fontSize: 14 }}>
                    {offPlayer ? `${offPlayer.name} off. Who comes on?` : 'Who comes off?'}
                  </span>
                  <button
                    type="button"
                    className="text-btn quiet"
                    onClick={() => {
                      setPicking(false)
                      setSubOff(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {subOff === null &&
                  onPitch.map((p) => (
                    <button type="button" className="pitch-row" key={p.id} onClick={() => setSubOff(p.id)} data-testid="sub-off" data-player={p.id}>
                      <span className="slot">{p.slot ? `${p.slot.position}${p.slot.position === 'GK' ? '' : p.slot.side}` : positionLabel(p)}</span>
                      <span className="who">
                        <span className="nm">{p.name}</span>
                      </span>
                      {p.injured && <span className="note">injured</span>}
                      <span className="rt">{p.live.toFixed(1)}</span>
                    </button>
                  ))}
                {subOff !== null &&
                  bench.map((p) => (
                    <button type="button" className="pitch-row" key={p.id} onClick={() => sub(p.id)} data-testid="sub-on" data-player={p.id}>
                      <span className="slot">{positionLabel(p)}</span>
                      <span className="who">
                        <span className="nm">{p.name}</span>
                      </span>
                      <span className="rt">{Math.round(p.rating)}</span>
                    </button>
                  ))}
                {subOff !== null &&
                  (() => {
                    const best = bestReplacement(m, us, subOff)
                    const bestPlayer = best === null ? null : ours.players.find((p) => p.id === best)
                    return bestPlayer ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0 6px' }}>
                        <button type="button" className="btn small" onClick={() => sub(bestPlayer.id)} data-testid="sub-best">
                          Best available · {bestPlayer.name}
                        </button>
                      </div>
                    ) : null
                  })()}
              </div>
            )}
          </div>
        )}
        <SectionLabel>Both elevens</SectionLabel>
        <div className="two-col">
          <div>
            <div className="label" style={{ padding: '0 0 4px' }}>
              {ours.name}
            </div>
            {[...onPitch, ...ours.players.filter((p) => (p.injured || p.sentOff) && !p.on)].map((p) => (
              <XiRow key={p.id} p={p} mine world={world} />
            ))}
          </div>
          <div>
            <div className="label" style={{ padding: '0 0 4px' }}>
              {theirs.name}
            </div>
            {theirs.players
              .filter((p) => p.on)
              .map((p) => (
                <XiRow key={p.id} p={p} mine={false} world={world} />
              ))}
          </div>
        </div>
        {others.length > 0 && (
          <>
            <SectionLabel>Latest{tier !== null ? ` · tier ${tier}` : ''}</SectionLabel>
            <div data-testid="latest-scores">
              {others.map((o, i) => (
                <div className="latest-row" key={i}>
                  <span className="tm h">{o.home.name}</span>
                  <span className="sc">
                    {o.home.goals}–{o.away.goals}
                  </span>
                  <span className="tm">{o.away.name}</span>
                  <span className="mn">{clock(o)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {m.events.length > 4 && (
          <>
            <SectionLabel>Commentary</SectionLabel>
            <Commentary events={m.events} testId="commentary" />
          </>
        )}
        <div className="tail" />
      </div>
      <Foot>
        {live ? (
          <Continue main="Pause" next={`Playing · ${clock(m)}`} testId="pause" onClick={pause} />
        ) : (
          <Continue next={m.played === 0 ? 'Kick off' : 'Play on · to the next pause'} testId="play-on" onClick={playOn} />
        )}
      </Foot>
      <FootSpace />
    </main>
  )
}

function LiveTable({ world, matches, tier, mine }: { world: World; matches: MatchState[]; tier: Tier; mine: number | null }) {
  const rows = liveTable(world, matches, tier)
  const me = rows.findIndex((r) => r.clubId === mine)
  const render = (r: (typeof rows)[number], i: number, pin: boolean) => (
    <div className={`table-row${r.clubId === mine ? ' me' : ''}`} key={`${pin ? 'pin-' : ''}${r.clubId}`}>
      <span className="w22 pos">{i + 1}</span>
      <span className="grow">{world.clubs[r.clubId - 1]?.name}</span>
      <span className="w26 num">{r.played}</span>
      <span className="w34 num">{r.goalsFor - r.goalsAgainst > 0 ? `+${r.goalsFor - r.goalsAgainst}` : r.goalsFor - r.goalsAgainst}</span>
      <span className="w34 pts">{r.points}</span>
    </div>
  )
  return (
    <div className="stack" data-testid="live-table">
      <div className="label" style={{ padding: '18px 0 0' }}>
        Table at full time · tier {tier}
      </div>
      <div className="table-head">
        <span className="w22" style={{ textAlign: 'left' }}>
          #
        </span>
        <span className="grow">Club</span>
        <span className="w26">P</span>
        <span className="w34">GD</span>
        <span className="w34">Pts</span>
      </div>
      {me >= 0 && render(rows[me]!, me, true)}
      {rows.slice(0, 6).map((r, i) => render(r, i, false))}
    </div>
  )
}

// Table is re-exported for the fixtures tab; the live table above applies today's results first.
export { Table }
