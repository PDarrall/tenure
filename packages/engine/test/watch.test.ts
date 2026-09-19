import { describe, expect, it } from 'vitest'
import { createCareer } from '../src/play/career.js'
import { pendingDecisions } from '../src/play/decisions.js'
import { advanceTurn, humanClubId, commitWatched, discardWatched, findFixture, fixtureKey } from '../src/sim/turn.js'
import { openVacancies } from '../src/market/vacancies.js'
import { qualifies } from '../src/market/shortlist.js'
import { rngFromState } from '../src/rng.js'
import { tick, substitute, setMentality, bestReplacement } from '../src/match/minute.js'
import { digestWorld } from '../src/digest.js'
import { seasonWeek } from '../src/season/calendar.js'
import { decidesTie } from '../src/season/season.js'
import { T } from '../src/tunables.js'
import type { World } from '../src/types.js'

function me(world: World) {
  return world.managers[world.human!.managerId - 1]!
}

function getJob(world: World): void {
  for (let i = 0; i < 400; i++) {
    const offer = pendingDecisions(world).find((d) => d.kind === 'offer')
    if (offer) {
      advanceTurn(world, { answers: { [offer.id]: 'top-half:2' } })
      return
    }
    const player = me(world)
    const apply = openVacancies(world)
      .filter((v) => v.post.kind === 'home' && qualifies(world, player, v) && !v.applicants.includes(player.id))
      .map((v) => v.id)
    advanceTurn(world, { apply })
  }
  throw new Error('no offer arrived')
}

/** Continue with the match view on until the turn stops before a fixture. */
function untilPreMatch(world: World, max = 30): void {
  for (let i = 0; i < max; i++) {
    if (world.human!.watched) return
    const answers: Record<number, string> = {}
    for (const d of pendingDecisions(world)) if (d.blocking) answers[d.id] = d.defaultKey
    advanceTurn(world, { answers }, { watch: true })
  }
  throw new Error('no pre-match stop')
}

describe('a watched match week', () => {
  it('stops before the human fixture with the division in the minute engine, then commits it on the next turn', () => {
    const world = createCareer(3, { name: 'Watcher', background: 'coach' })
    getJob(world)
    untilPreMatch(world)
    const w = world.human!.watched!
    const club = humanClubId(world)!
    const sw = seasonWeek(world.week)
    expect(w.seasonWeek).toBe(sw)
    expect(w.prepared.length).toBe(w.matches.length)
    expect(w.prepared.length).toBeGreaterThan(1)
    const mine = w.prepared[0]!
    expect([mine.fixture.homeId, mine.fixture.awayId]).toContain(club)
    const tier = world.clubs[club - 1]!.tier
    for (const p of w.prepared) expect(p.fixture.tier ?? tier).toBe(tier)
    // Nothing has been played yet: the odds are set and the human's side is on the sheet.
    expect(findFixture(world, fixtureKey(mine.fixture))!.played).toBe(false)
    expect(mine.odds.pHome + mine.odds.pDraw + mine.odds.pAway).toBeCloseTo(1, 6)
    const state = w.matches[0]!
    const humanKey = state.home.clubId === club ? 'home' : 'away'
    expect(state[humanKey].isHuman).toBe(true)
    expect(state[humanKey].players.filter((p) => p.on)).toHaveLength(11)
    // The match view plays some of it: a mentality change and a substitution while paused.
    for (let m = 0; m < 30; m++) tick(state)
    setMentality(state, humanKey, 'attack')
    const off = state[humanKey].players.find((p) => p.on && p.slot?.position === 'M')!
    const onId = bestReplacement(state, humanKey, off.id)!
    expect(substitute(state, humanKey, off.id, onId)).toBe(true)
    // A save mid-match keeps the minute and everything with it.
    const restored = JSON.parse(JSON.stringify(world)) as World
    expect(restored.human!.watched!.matches[0]!.minute).toBe(state.minute)
    const logBefore = world.log.length
    // Continue: the rest of the match runs headless, the slot settles, the human's fixture counts as played.
    const played = advanceTurn(world, {}, { watch: true })
    expect(played).toBe(1)
    expect(world.human!.watched).toBeNull()
    expect(findFixture(world, fixtureKey(mine.fixture))!.played).toBe(true)
    const events = world.log.slice(logBefore).filter((e) => e.type === 'match.played')
    const mineEvent = events.find((e) => e.payload['homeId'] === mine.fixture.homeId && e.payload['awayId'] === mine.fixture.awayId)!
    expect(mineEvent.payload['watched']).toBe(true)
    expect(mineEvent.payload['minutes']).toBeGreaterThanOrEqual(90)
    expect(mineEvent.payload['homeGoals']).toBe(state.home.goals)
    expect(mineEvent.payload['awayGoals']).toBe(state.away.goals)
    // The substitute is on the record, and the season carries on into the next pre-match stop.
    const sub = world.players[onId - 1]!
    expect(sub.season.apps).toBeGreaterThanOrEqual(1)
    // The whole slot settled in the same turn, the rest on the fast path (a career log keeps only the human's match).
    expect(world.fixtures.filter((f) => f.week === sw && f.competition === 'league' && f.tier === tier).every((f) => f.played)).toBe(true)
    expect(world.log.slice(logBefore).filter((e) => e.type === 'match.played')).toHaveLength(1)
    // The restored save commits to the same result.
    advanceTurn(restored, {}, { watch: true })
    expect(digestWorld(restored)).toEqual(digestWorld(world))
    untilPreMatch(world)
    expect(world.human!.watched).not.toBeNull()
  })

  it('is deterministic and the same as the fast path for everybody else', () => {
    const play = () => {
      const world = createCareer(4, { name: 'Watcher', background: 'analyst' })
      getJob(world)
      for (let i = 0; i < 12; i++) {
        untilPreMatch(world, 60)
        advanceTurn(world, {}, { watch: true })
      }
      return world
    }
    const a = play()
    const b = play()
    expect(digestWorld(a)).toEqual(digestWorld(b))
    // A career log keeps only the human's matches; the fixtures show the rest of each week went on the fast path in the same turn.
    const mine = a.log.filter((e) => e.type === 'match.played' && e.payload['watched'] === true)
    expect(mine.length).toBeGreaterThanOrEqual(12)
    const club = humanClubId(a)
    for (const e of mine) {
      const sw = e.week % T.SEASON_WEEKS
      const thatWeek = a.fixtures.filter((f) => f.week === sw && f.competition === 'league')
      expect(thatWeek.length).toBeGreaterThan(12)
      // The slot the human played in (a week has a weekend and a midweek; the other slot may still be to come).
      const own = thatWeek.find((f) => f.homeId === club || f.awayId === club)!
      expect(thatWeek.filter((f) => f.slot === own.slot).every((f) => f.played)).toBe(true)
    }
  })

  it('watches a cup tie on its own, and forgets a prepared slot when the human goes back', () => {
    const world = createCareer(5, { name: 'Watcher', background: 'ex-pro' })
    getJob(world)
    let cupSeen = false
    for (let i = 0; i < 60 && !cupSeen; i++) {
      untilPreMatch(world, 60)
      const w = world.human!.watched!
      if (w.slot.kind === 'cup') {
        expect(w.prepared).toHaveLength(1)
        // A group match or a first leg settles nothing tonight; a one-off tie or a second leg does.
        expect(w.prepared[0]!.knockout).toBe(decidesTie(w.prepared[0]!.fixture))
        if (!w.prepared[0]!.knockout) {
          advanceTurn(world, {}, { watch: true })
          continue
        }
        cupSeen = true
        // Going back: the slot is forgotten and read again on the next Continue.
        discardWatched(world)
        expect(world.human!.watched).toBeNull()
        untilPreMatch(world, 5)
        expect(world.human!.watched!.slot.kind).toBe('cup')
        const before = world.log.length
        advanceTurn(world, {}, { watch: true })
        const cupEvents = world.log.slice(before).filter((e) => e.type === 'match.played' && e.payload['competition'] !== 'league')
        expect(cupEvents.length).toBeGreaterThan(0)
        expect(cupEvents.some((e) => e.payload['watched'] === true)).toBe(true)
        // The whole round is played and settled with the human's tie: nothing of it is left, and the human is out or drawn on.
        const competition = w.slot.competition
        const cup = world.cups.find((c) => c.competition === competition)!
        expect(world.fixtures.filter((f) => f.competition === competition && f.week === w.seasonWeek && !f.played)).toHaveLength(0)
        expect(cup.roundsPlayed).toBeGreaterThan(w.prepared[0]!.fixture.round - 1)
        expect(world.log.slice(before).some((e) => e.type === 'cup.exit' || e.type === 'cup.tie' || e.type === 'cup.bye' || e.type === 'cup.won')).toBe(true)
      } else {
        advanceTurn(world, {}, { watch: true })
      }
    }
    expect(cupSeen).toBe(true)
    // commitWatched on nothing is a no-op.
    expect(commitWatched(world, rngFromState(world.rng))).toEqual([])
  })
})
