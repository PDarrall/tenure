import { describe, expect, it } from 'vitest'
import { createCareer } from '../src/play/career.js'
import { pendingDecisions, queueDecision } from '../src/play/decisions.js'
import { advanceTurn, clubFixturesInWeek, humanClubId, humanHasFixtureIn, nextSlot } from '../src/sim/turn.js'
import { advanceWeek } from '../src/sim/advance.js'
import { nextFixture, seasonFixtures } from '../src/play/fixtures.js'
import { inboxMark, inboxSince } from '../src/play/inbox.js'
import { openVacancies } from '../src/market/vacancies.js'
import { qualifies } from '../src/market/shortlist.js'
import { seasonWeek } from '../src/season/calendar.js'
import { digestWorld } from '../src/digest.js'
import { T } from '../src/tunables.js'
import type { HumanInputs, World } from '../src/types.js'

function me(world: World) {
  return world.managers[world.human!.managerId - 1]!
}

/** The human's matches logged from a log position on. */
function humanMatchesSince(world: World, index: number): number {
  const id = me(world).id
  return world.log.slice(index).filter((e) => e.type === 'match.played' && (e.payload['homeManagerId'] === id || e.payload['awayManagerId'] === id)).length
}

/** Apply for every qualifying home job each turn until an offer comes, then take it. */
function getJob(world: World, terms = 'top-half:2'): void {
  for (let i = 0; i < 400; i++) {
    const offer = pendingDecisions(world).find((d) => d.kind === 'offer')
    if (offer) {
      advanceTurn(world, { answers: { [offer.id]: terms } })
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

/** Answer everything with its first option and keep applying: a scripted player. */
function script(world: World): HumanInputs {
  const player = me(world)
  const answers: Record<number, string> = {}
  for (const d of pendingDecisions(world)) answers[d.id] = d.kind === 'offer' ? 'top-half:2' : d.options[0]!.key
  const apply = openVacancies(world)
    .filter((v) => v.post.kind === 'home' && qualifies(world, player, v) && !v.applicants.includes(player.id))
    .map((v) => v.id)
  return { apply, answers }
}

describe('one match per turn', () => {
  it('out of work, every turn is one week and plays none of the human club\'s matches', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    for (let i = 0; i < 12; i++) {
      const played = advanceTurn(world, {})
      expect(played).toBe(0)
      expect(world.week).toBe(i + 1)
    }
    // The AI world kept playing underneath.
    expect(world.log.some((e) => e.type === 'match.played')).toBe(false) // none concern the human
    expect(world.tables.some((r) => r.played > 0)).toBe(true)
  })

  it('in a job, a turn plays at most one fixture of the human club, and every step does something', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    getJob(world)
    const player = me(world)
    let matchTurns = 0
    let stepTurns = 0
    for (let i = 0; i < 3 * T.SEASON_WEEKS && player.status.kind === 'employed'; i++) {
      const before = world.log.length
      const week = world.week
      const played = advanceTurn(world, {})
      expect(played).toBeLessThanOrEqual(1)
      expect(humanMatchesSince(world, before)).toBe(played)
      if (played === 1) {
        matchTurns++
      } else {
        stepTurns++
        // A step with no match moved the clock, or stopped for an answer before the next fixture.
        expect(world.week > week || pendingDecisions(world).length > 0).toBe(true)
      }
    }
    expect(matchTurns).toBeGreaterThan(10)
    expect(stepTurns).toBeGreaterThan(0)
    expect(stepTurns).toBeLessThan(matchTurns)
  })

  it('a decision waiting at the close of a week stops the turn before the next fixture', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    getJob(world)
    // Find a turn that just played the club's last fixture of a week, with a fixture next week.
    let ready = false
    for (let i = 0; i < 3 * T.SEASON_WEEKS && !ready; i++) {
      const played = advanceTurn(world, {})
      const sw = seasonWeek(world.week)
      const club = humanClubId(world)
      ready =
        played === 1 &&
        club !== null &&
        sw + 1 < T.MATCH_WEEKS &&
        !humanHasFixtureIn(world, sw, club) &&
        humanHasFixtureIn(world, sw + 1, club) &&
        pendingDecisions(world).length === 0
    }
    expect(ready).toBe(true)
    const club = humanClubId(world)!
    const week = world.week
    const waiting = queueDecision(world, { kind: 'board', from: 'board', title: 'A word', body: 'Before the next game.', options: [{ key: 'ok', label: 'Fine' }], defaultKey: 'ok', blocking: false })
    expect(advanceTurn(world, {})).toBe(0)
    expect(world.week).toBe(week + 1)
    expect(clubFixturesInWeek(world, seasonWeek(world.week), club).some((f) => f.played)).toBe(false)
    expect(pendingDecisions(world).some((d) => d.id === waiting.id)).toBe(true)
    // Answered (or defaulted), the next turn plays the fixture without moving the week.
    expect(advanceTurn(world, {})).toBe(1)
    expect(world.week).toBe(week + 1)
  })

  it('cup ties are drawn the week before and stand as the next fixture until played', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    getJob(world)
    let next = nextFixture(world)
    for (let i = 0; i < 3 * T.SEASON_WEEKS && !(next && next.kind === 'fixture' && next.competition !== 'league'); i++) {
      if (me(world).status.kind !== 'employed') getJob(world)
      advanceTurn(world, script(world))
      next = nextFixture(world)
    }
    expect(next && next.kind === 'fixture' && next.competition !== 'league').toBe(true)
    if (!next || next.kind !== 'fixture') return
    const club = humanClubId(world)!
    expect(next.played).toBe(false)
    expect(next.opponent.length).toBeGreaterThan(0)
    const tie = world.log.find((e) => e.type === 'cup.tie' && e.payload['competition'] === next!.competition && e.payload['round'] === next!.round && (e.payload['homeId'] === club || e.payload['awayId'] === club))
    expect(tie).toBeDefined()
    expect(tie!.week).toBeLessThan(next.week)
    // The next fixture turn plays that tie.
    for (let i = 0; i < 3; i++) {
      const before = world.log.length
      if (advanceTurn(world, script(world)) === 1) {
        const played = world.log.slice(before).find((e) => e.type === 'match.played' && (e.payload['homeId'] === club || e.payload['awayId'] === club))!
        expect(played.payload['competition']).toBe(next.competition)
        expect(played.payload['round']).toBe(next.round)
        return
      }
    }
    throw new Error('the tie was not played')
  })

  it('advanceWeek on a career finishes exactly the current week', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    getJob(world)
    for (let i = 0; i < 5; i++) {
      const week = world.week
      const sw = seasonWeek(week)
      advanceWeek(world, {})
      expect(world.week).toBe(week + 1)
      expect(world.fixtures.some((f) => f.week === sw && !f.played && f.competition === 'league')).toBe(false)
      expect(nextSlot(world, sw)).toBeNull()
    }
  })

  it('is deterministic turn by turn and a save between two turns of one week continues identically', { timeout: 60_000 }, () => {
    const a = createCareer(7, { name: 'Test Player', background: 'coach' })
    const b = createCareer(7, { name: 'Test Player', background: 'coach' })
    for (let i = 0; i < 90; i++) {
      advanceTurn(a, script(a))
      advanceTurn(b, script(b))
    }
    expect(digestWorld(a).hash).toBe(digestWorld(b).hash)
    // Walk to a point mid-week: the club has played this week and the week still has football in it.
    let midWeek = false
    for (let i = 0; i < 60 && !midWeek; i++) {
      advanceTurn(a, script(a))
      const club = humanClubId(a)
      midWeek = club !== null && clubFixturesInWeek(a, seasonWeek(a.week), club).some((f) => f.played) && nextSlot(a, seasonWeek(a.week)) !== null
    }
    const restored = JSON.parse(JSON.stringify(a)) as World
    for (let i = 0; i < 40; i++) {
      advanceTurn(a, script(a))
      advanceTurn(restored, script(restored))
    }
    expect(digestWorld(restored).hash).toBe(digestWorld(a).hash)
  })

  it('reads one turn of post from a mark, and lists the season by competition', () => {
    const world = createCareer(1, { name: 'Test Player', background: 'coach' })
    getJob(world)
    for (let i = 0; i < 20; i++) {
      const mark = inboxMark(world)
      const played = advanceTurn(world, {})
      const items = inboxSince(world, mark)
      for (const item of items) expect(item.week).toBeGreaterThanOrEqual(mark.week)
      if (played === 1) expect(items.some((i) => i.from === 'match')).toBe(true)
      if (me(world).status.kind !== 'employed') break
    }
    if (me(world).status.kind !== 'employed') return
    const club = world.clubs[humanClubId(world)! - 1]!
    const byCompetition = seasonFixtures(world)
    const league = byCompetition.find((c) => c.competition === 'league')!
    expect(league.fixtures).toHaveLength(T.LEAGUE_ROUNDS_BY_TIER[club.tier - 1] as number)
    expect(league.fixtures.filter((f) => f.played).every((f) => f.result !== null && f.goalsFor !== null)).toBe(true)
    expect(league.fixtures.some((f) => f.played)).toBe(true)
    const national = byCompetition.find((c) => c.competition === 'nationalCup')!
    expect(national.status.length).toBeGreaterThan(0)
  })
})
