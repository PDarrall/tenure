import { useEffect, useReducer, useState } from 'react'
import { bestReplacement, competitionLabel, tableFor, type MatchEvent, type MatchPlay, type MatchPlayer, type MatchSide, type MatchState, type Mentality, type PlayerId, type Tier, type World } from '@tenure/engine'
import { forcedChange, humanMatch, humanSide, matchPlay, mentalityWatched, playToFullTime, playToNextPause, substituteWatched, watched, withMatchPlay, type Session } from '../controller.js'
import { foldScorers, humanClub, ordinalOf, positionLabel, weekLabel } from './common.js'
import { Choices, Continue, Foot, FootSpace, SectionLabel, Seg, Star } from './ui.js'

import { Table } from './Fixtures.js'

/** The ticker: the finished match replayed as minutes and goals, inside three seconds (DESIGN.md "Interface", Result first). */
export const TICKER_MS = 2200
/** The beat after the whistle before the result lands. */
export const TICKER_LAND_MS = 300

const PLAY_OPTIONS: { key: MatchPlay; label: string }[] = [
  { key: 'fullTime', label: 'To full time' },
  { key: 'keyEvents', label: 'To key events' },
]

function clock(m: MatchState): string {
  if (m.over) return 'FT'
  if (m.played === 0) return "0'"
  const last = m.events[m.events.length - 1]
  if (last && last.kind === 'halftime' && m.half === 1) return 'HT'
  const base = m.half === 1 ? 45 : 90
  return m.minute > base ? `${base}+${m.minute - base}'` : `${m.minute}'`
}

const PAUSE_LABEL: Record<string, string> = { goal: 'goal', red: 'red card', injury: 'injury', halftime: 'half time', fulltime: 'full time', shootout: 'penalties', sub: 'a change', kickoff: 'kick-off' }

function lastPause(m: MatchState): MatchEvent | undefined {
  return [...m.events].reverse().find((e) => e.pause)
}

function pauseReason(m: MatchState): string {
  const last = lastPause(m)
  if (!last) return 'paused'
  return `Paused · ${PAUSE_LABEL[last.kind] ?? last.kind}`
}

// --- The ticker replays a finished match by its ticks: the first half runs 1 to 45 plus stoppage, the second 46 to the whistle.

/** Ticks in the first half of a finished match: the second half's are the minutes past 45. */
function firstHalfTicks(m: MatchState): number {
  return m.over ? m.played - (m.minute - 45) : m.played
}

/** Every event with the tick it happened on. */
function tickedEvents(m: MatchState): { e: MatchEvent; tick: number }[] {
  const fh = firstHalfTicks(m)
  let second = false
  return m.events.map((e) => {
    if (e.kind === 'halftime' || e.kind === 'secondhalf') {
      second = true
      return { e, tick: fh }
    }
    return { e, tick: second ? fh + (e.minute - 45) : e.minute }
  })
}

function tickerClock(tick: number, fh: number): string {
  if (tick <= fh) return tick > 45 ? `45+${tick - 45}'` : `${tick}'`
  const minute = 45 + (tick - fh)
  return minute > 90 ? `90+${minute - 90}'` : `${minute}'`
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

function scorerNames(side: MatchSide): string[] {
  return side.scorers.map((s) => `${s.name} ${s.minute}'`)
}

/**
 * The scorers under a side's name. A heavy win runs to a wall of text at 390
 * wide, so four names show and the rest wait behind a tap (DESIGN.md
 * "Interface": contained).
 */
function Scorers({ side, testId }: { side: MatchSide; testId: string }) {
  const [open, setOpen] = useState(false)
  const names = scorerNames(side)
  if (names.length === 0) return <div className="sc">{' '}</div>
  const { shown, more } = foldScorers(names, open)
  return (
    <div className="sc" data-testid={testId} data-scorers={names.length}>
      {shown.join(', ')}
      {more > 0 && (
        <>
          {' '}
          <button type="button" className="text-btn more" onClick={() => setOpen(true)} data-testid={`${testId}-more`}>
            and {more} more
          </button>
        </>
      )}
    </div>
  )
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

function ScoreHead({ home, away, homeGoals, awayGoals, live }: { home: MatchSide; away: MatchSide; homeGoals: number; awayGoals: number; live: boolean }) {
  return (
    <div className="score-head">
      <div className="side home">
        <div className="nm">{home.name}</div>
        <Scorers side={home} testId="scorers-home" />
      </div>
      <div className={`scoreline${live ? ' live' : ''}`} data-testid="score" aria-label={`${home.name} ${homeGoals}, ${away.name} ${awayGoals}`}>
        {homeGoals}
        <span className="dash">–</span>
        {awayGoals}
      </div>
      <div className="side away">
        <div className="nm">{away.name}</div>
        <Scorers side={away} testId="scorers-away" />
      </div>
    </div>
  )
}

interface Ticker {
  start: number
  /** The tick the press was made at: a match switched to full time mid-way replays from there. */
  from: number
  tick: number
}

/**
 * The match screen (DESIGN.md "Match", "Interface" Result first): one toggle
 * and one button. To full time plays the match in one press behind the ticker;
 * To key events plays to the next pause, mentality and substitutions while
 * paused, an injury needing a change a forced decision in the foot.
 */
export function MatchView({ session, onChange, onContinue }: { session: Session; onChange: (s: Session) => void; onContinue: () => void }) {
  const world = session.world
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const m = humanMatch(session)
  const w = watched(session)
  const us = humanSide(session)
  const mode = matchPlay(session)
  const [ticker, setTicker] = useState<Ticker | null>(null)
  // A match already over when the screen opens (a reload after the whistle) goes straight to the result.
  const [showResult, setShowResult] = useState<boolean>(() => m?.over ?? false)
  const [picking, setPicking] = useState(false)
  const [subOff, setSubOff] = useState<PlayerId | null>(null)

  // The ticker runs on the wall clock, so it lands inside TICKER_MS whatever the frame rate.
  useEffect(() => {
    if (!ticker || !m) return
    const span = Math.max(1, m.played - ticker.from)
    const id = window.setInterval(() => {
      const elapsed = performance.now() - ticker.start
      if (elapsed >= TICKER_MS + TICKER_LAND_MS) {
        window.clearInterval(id)
        setTicker(null)
        setShowResult(true)
        return
      }
      const tick = ticker.from + Math.min(span, Math.floor((elapsed / TICKER_MS) * span))
      if (tick !== ticker.tick) setTicker({ ...ticker, tick })
    }, 16)
    return () => window.clearInterval(id)
  }, [ticker, m])

  if (!m || !w) return null
  const them: 'home' | 'away' = us === 'home' ? 'away' : 'home'
  const ours = m[us]
  const theirs = m[them]
  const club = humanClub(world)
  const tier: Tier | null = club ? club.tier : null
  const label = w.slot.kind === 'cup' ? competitionLabel(w.slot.competition) : 'League'
  const eyebrow = `${label} · ${weekLabel(w.seasonWeek)} · ${us === 'home' ? 'Home' : 'Away'}`
  const others = w.matches.slice(1)

  // --- The result card.
  if (m.over && showResult) {
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
          <ScoreHead home={m.home} away={m.away} homeGoals={m.home.goals} awayGoals={m.away.goals} live={false} />
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

  // --- The ticker: the match already played, replayed as minutes and goals.
  if (ticker) {
    const fh = firstHalfTicks(m)
    const seen = tickedEvents(m).filter((t) => t.tick <= ticker.tick)
    const goals = seen.filter((t) => t.e.kind === 'goal')
    const homeGoals = goals.filter((t) => t.e.side === 'home').length
    const awayGoals = goals.filter((t) => t.e.side === 'away').length
    const minute = tickerClock(ticker.tick, fh)
    return (
      <main className="screen" aria-label="Match" data-testid="ticker">
        <div className="head tight">
          <div className="between">
            <div className="label">{eyebrow}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="label accent">Playing</span>
              <span className="minute live" data-testid="minute">
                {minute}
              </span>
            </div>
          </div>
          <ScoreHead home={m.home} away={m.away} homeGoals={homeGoals} awayGoals={awayGoals} live />
          <div className="ticker-line" aria-hidden="true">
            <div style={{ width: `${Math.min(100, Math.round((ticker.tick / Math.max(1, m.played)) * 100))}%` }} />
          </div>
          {goals.length > 0 && <Commentary events={goals.slice(-3).map((t) => t.e)} />}
        </div>
        <div className="rule" />
        <div className="scroll" />
        <Foot>
          <Continue next={`Playing · ${minute}`} disabled testId="playing" onClick={() => undefined} />
        </Foot>
        <FootSpace />
      </main>
    )
  }

  // --- Paused: before kick-off, at a key event, or at the whistle before the result.
  const onPitch = ours.players.filter((p) => p.on)
  const bench = ours.players.filter((p) => !p.on && !p.started && !p.sentOff && !p.injured && p.minutes === 0)
  const subsLeft = 3 - ours.subsUsed
  const canSub = !m.over && subsLeft > 0 && bench.length > 0
  const forced = mode === 'keyEvents' ? forcedChange(session) : null
  const forcedBest = forced ? bestReplacement(m, us, forced.id) : null
  const forcedBestPlayer = forcedBest === null ? null : ours.players.find((p) => p.id === forcedBest)
  const pressureHome = m.pressure > 0
  const pressurePct = Math.min(50, Math.round(Math.abs(m.pressure) / 2))
  const offPlayer = subOff === null ? null : ours.players.find((p) => p.id === subOff)
  const pause = lastPause(m)
  const state = m.played === 0 ? 'Kick-off' : m.over ? 'Full time' : pauseReason(m)

  const sub = (offId: PlayerId, onId: PlayerId) => {
    substituteWatched(session, offId, onId)
    setSubOff(null)
    setPicking(false)
    bump()
  }
  const changeMentality = (mentality: Mentality) => {
    mentalityWatched(session, mentality)
    bump()
  }
  const press = () => {
    setPicking(false)
    setSubOff(null)
    if (mode === 'fullTime') {
      const from = m.played
      playToFullTime(session)
      setTicker({ start: performance.now(), from, tick: from })
    } else {
      playToNextPause(session)
      bump()
    }
  }
  // The second line says what Continue will do: "Kick off · to full time", then "To next event" at each pause, "Result" at the whistle.
  const next = m.over ? 'Result' : `${m.played === 0 ? 'Kick off · to' : 'To'} ${mode === 'fullTime' ? 'full time' : 'next event'}`
  const dataNext = m.over ? 'result' : mode === 'fullTime' ? 'full-time' : 'next-event'

  return (
    <main className="screen" aria-label="Match">
      <div className="head tight">
        <div className="between">
          <div className="label">{eyebrow}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="label" data-testid="match-state">{state}</span>
            <span className="minute" data-testid="minute">
              {clock(m)}
            </span>
          </div>
        </div>
        <ScoreHead home={m.home} away={m.away} homeGoals={m.home.goals} awayGoals={m.away.goals} live={!m.over} />
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
        {m.played > 0 && pause && <Commentary events={[pause]} testId="pause-line" />}
      </div>
      <div className="rule" />
      <div className="scroll">
        <div className="stack g10" style={{ padding: '14px 0 4px' }}>
          <div className="label">Continue plays</div>
          <Seg small options={PLAY_OPTIONS} value={mode} onChange={(k) => onChange(withMatchPlay(session, k))} testId={(k) => `play-${k}`} />
          {!m.over && (
            <>
              <div className="label" style={{ paddingTop: 4 }}>
                While paused · mentality
              </div>
              <Seg small options={[{ key: 'defend', label: 'Defend' }, { key: 'balanced', label: 'Balanced' }, { key: 'attack', label: 'Attack' }]} value={ours.mentality} onChange={changeMentality} testId={(k) => `mentality-${k}`} />
              <div className="between center" style={{ paddingTop: 4 }}>
                <span className="sub">
                  Substitutions · {subsLeft} left
                  {forced ? ` · ${forced.name} cannot go on` : ''}
                </span>
                {canSub && !picking && (
                  <button type="button" className="btn small" onClick={() => setPicking(true)} data-testid="make-a-change">
                    Make a change
                  </button>
                )}
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
                      <button type="button" className="pitch-row" key={p.id} onClick={() => sub(subOff, p.id)} data-testid="sub-on" data-player={p.id}>
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
                          <button type="button" className="btn small" onClick={() => sub(subOff, bestPlayer.id)} data-testid="sub-best">
                            Best available · {bestPlayer.name}
                          </button>
                        </div>
                      ) : null
                    })()}
                </div>
              )}
            </>
          )}
        </div>
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
        {m.events.length > 1 && (
          <>
            <SectionLabel>Commentary</SectionLabel>
            <Commentary events={m.events} testId="commentary" />
          </>
        )}
        <div className="tail" />
      </div>
      <Foot>
        {forced && forcedBestPlayer ? (
          <Choices
            title={`${forced.name} is injured · who comes on?`}
            options={[
              { key: 'best', label: 'Best available', detail: forcedBestPlayer.name, testId: 'choice-default' },
              { key: 'pick', label: 'Choose', detail: 'from the bench', testId: 'choice-pick' },
            ]}
            onChoose={(key) => {
              if (key === 'best') sub(forced.id, forcedBestPlayer.id)
              else {
                setSubOff(forced.id)
                setPicking(true)
              }
            }}
          />
        ) : (
          <Continue next={next} dataNext={dataNext} onClick={m.over ? () => setShowResult(true) : press} />
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
