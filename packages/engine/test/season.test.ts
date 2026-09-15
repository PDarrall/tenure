import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { leagueFixtures, roundRobin } from '../src/season/fixtures.js'
import { matchOdds, playMatch, poissonPmf, type Participant } from '../src/season/match.js'
import { matchesThisRound, roundsNeeded } from '../src/season/cups.js'
import { tableFor } from '../src/season/table.js'
import { advanceWeek, runSeasons, runWeeks } from '../src/sim/advance.js'
import { digestWorld } from '../src/digest.js'
import { renderMatch } from '../src/text/render.js'
import * as T from '../src/tunables.js'

function side(overrides: Partial<Participant> = {}): Participant {
  return { id: 1, strength: 50, tactical: 50, form: [], morale: 50, shape: 'A', mentality: 'balanced', ...overrides }
}

describe('fixtures', () => {
  it('round-robin: every pair meets twice, once at each ground, one match per team per round', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1)
    const rounds = roundRobin(ids)
    expect(rounds).toHaveLength(38)
    const seen = new Map<string, number>()
    for (const round of rounds) {
      expect(round).toHaveLength(10)
      const inRound = new Set<number>()
      for (const [h, a] of round) {
        expect(inRound.has(h)).toBe(false)
        expect(inRound.has(a)).toBe(false)
        inRound.add(h)
        inRound.add(a)
        seen.set(`${h}-${a}`, (seen.get(`${h}-${a}`) ?? 0) + 1)
      }
    }
    for (const h of ids) for (const a of ids) if (h !== a) expect(seen.get(`${h}-${a}`)).toBe(1)
  })

  it('spreads league rounds over the match weeks with doubles where needed', () => {
    const world = createWorld(1)
    const fixtures = leagueFixtures(world, createRng(1))
    expect(fixtures.filter((f) => f.tier === 1)).toHaveLength(380)
    expect(fixtures.filter((f) => f.tier === 2)).toHaveLength(552)
    for (const f of fixtures) {
      expect(f.week).toBeGreaterThanOrEqual(0)
      expect(f.week).toBeLessThan(T.MATCH_WEEKS)
    }
    const weeksTier2 = new Set(fixtures.filter((f) => f.tier === 2).map((f) => f.week))
    expect(weeksTier2.size).toBe(T.MATCH_WEEKS)
    const weeksTier1 = new Set(fixtures.filter((f) => f.tier === 1).map((f) => f.week))
    expect(weeksTier1.size).toBe(38)
  })
})

describe('match model', () => {
  it('produces probabilities that sum to one and favour the stronger side', () => {
    const odds = matchOdds(side({ strength: 60 }), side({ id: 2, strength: 40 }))
    expect(odds.pHome + odds.pDraw + odds.pAway).toBeCloseTo(1, 6)
    expect(odds.pHome).toBeGreaterThan(odds.pAway)
    expect(odds.expHome).toBeGreaterThan(odds.expAway)
    const even = matchOdds(side(), side({ id: 2 }))
    expect(even.pHome).toBeGreaterThan(even.pAway)
    expect(even.pDraw).toBeGreaterThan(0.15)
    expect(even.pDraw).toBeLessThan(0.35)
  })

  it('applies the shape loop and mentality variance', () => {
    const base = matchOdds(side({ shape: 'A' }), side({ id: 2, shape: 'A' }))
    const beats = matchOdds(side({ shape: 'A' }), side({ id: 2, shape: 'B' }))
    const loses = matchOdds(side({ shape: 'B' }), side({ id: 2, shape: 'A' }))
    expect(beats.pHome).toBeGreaterThan(base.pHome)
    expect(loses.pHome).toBeLessThan(base.pHome)
    const attack = matchOdds(side({ mentality: 'attack' }), side({ id: 2 }))
    expect(attack.lambdaHome + attack.lambdaAway).toBeGreaterThan(base.lambdaHome + base.lambdaAway)
    expect(attack.pDraw).toBeLessThan(base.pDraw)
  })

  it('samples deterministically and settles knockout ties', () => {
    const a = playMatch(createRng(5), side(), side({ id: 2 }), true)
    const b = playMatch(createRng(5), side(), side({ id: 2 }), true)
    expect(a).toEqual(b)
    const rng = createRng(8)
    let shootouts = 0
    for (let i = 0; i < 300; i++) {
      const m = playMatch(rng, side(), side({ id: 2 }), true)
      if (m.homeGoals === m.awayGoals) {
        shootouts++
        expect([1, 2]).toContain(m.shootoutWinnerId)
      } else expect(m.shootoutWinnerId).toBeUndefined()
    }
    expect(shootouts).toBeGreaterThan(30)
  })

  it('poisson pmf is normalised', () => {
    const pmf = poissonPmf(1.4, T.MAX_GOALS)
    expect(pmf.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  })
})

describe('cups', () => {
  it('reduces any field to one winner in the tunable number of rounds', () => {
    expect(matchesThisRound(116)).toBe(52)
    expect(matchesThisRound(64)).toBe(32)
    expect(matchesThisRound(44)).toBe(12)
    expect(roundsNeeded(116)).toBe(T.NATIONAL_CUP_ROUND_WEEKS.length)
    expect(roundsNeeded(44)).toBe(T.LEAGUE_CUP_ROUND_WEEKS.length)
    const euro = T.EUROPEAN_LEAGUE_PLACES + 1 + Object.values(T.EUROPEAN_FOREIGN_ENTRANTS).reduce((a, b) => a + b, 0)
    expect(roundsNeeded(euro)).toBe(T.EUROPEAN_ROUND_WEEKS.length)
  })
})

describe('a full season', () => {
  const world = createWorld(1)
  runSeasons(world, 1)

  it('plays every league fixture and fills the tables', () => {
    expect(world.fixtures.filter((f) => f.competition === 'league' && !f.played)).toHaveLength(0)
    for (let tier = 1 as const; tier <= 5; tier++) {
      const table = tableFor(world, tier as 1 | 2 | 3 | 4 | 5)
      expect(table).toHaveLength(T.TIER_SIZES[tier - 1] as number)
      for (const row of table) {
        expect(row.played).toBe(T.LEAGUE_ROUNDS_BY_TIER[tier - 1])
        expect(row.won + row.drawn + row.lost).toBe(row.played)
        expect(row.points).toBe(3 * row.won + row.drawn)
      }
    }
  })

  it('crowns every cup with two finalists and logs one exit per loser', () => {
    for (const cup of world.cups) {
      expect(cup.winnerId).not.toBeNull()
      expect(cup.finalistIds).toHaveLength(2)
      expect(cup.finalistIds).toContain(cup.winnerId)
      const exits = world.log.filter((e) => e.type === 'cup.exit' && e.payload['competition'] === cup.competition)
      const entrants = cup.competition === 'nationalCup' ? 116 : cup.competition === 'leagueCup' ? 44 : 32
      expect(exits).toHaveLength(entrants - 1)
    }
    const trophies = world.log.filter((e) => e.type === 'trophy')
    // Five league titles, three cups, three foreign titles.
    expect(trophies).toHaveLength(5 + 3 + 3)
  })

  it('promotes and relegates three per boundary and keeps tier sizes', () => {
    const promotions = world.log.filter((e) => e.type === 'promotion')
    const relegations = world.log.filter((e) => e.type === 'relegation')
    expect(promotions).toHaveLength(4 * T.UP_DOWN_PER_BOUNDARY)
    expect(relegations).toHaveLength(4 * T.UP_DOWN_PER_BOUNDARY)
    T.TIER_SIZES.forEach((size, i) => expect(world.clubs.filter((c) => c.tier === i + 1)).toHaveLength(size))
    expect(world.europeanEntrants).toHaveLength(T.EUROPEAN_LEAGUE_PLACES + 1)
    expect(new Set(world.europeanEntrants).size).toBe(T.EUROPEAN_LEAGUE_PLACES + 1)
  })

  it('writes a season record for every manager in a post, then ages everyone', () => {
    for (const club of world.clubs) {
      const manager = world.managers.find((m) => m.id === club.managerId)!
      expect(manager.history.seasons).toHaveLength(1)
      const record = manager.history.seasons[0]!
      expect(record.games).toBeGreaterThanOrEqual(T.LEAGUE_ROUNDS_BY_TIER[record.tier! - 1] as number)
      expect(record.finish).toBeGreaterThanOrEqual(1)
      expect(record.netSpendRank).toBeGreaterThanOrEqual(1)
      expect(manager.history.games).toBe(record.games)
      expect(manager.seasonGames).toBe(0)
    }
    for (const league of world.foreign) {
      for (const club of league.clubs) {
        const manager = world.managers.find((m) => m.id === club.managerId)!
        expect(manager.history.seasons[0]!.games).toBe(T.FOREIGN_GAMES_PER_SEASON)
      }
    }
    const fresh = createWorld(1)
    for (const m of world.managers) expect(m.age).toBe(fresh.managers.find((f) => f.id === m.id)!.age + 1)
  })

  it('keeps squads in range and moves them through ageing, gravity and windows', () => {
    const summers = world.log.filter((e) => e.type === 'squad.summer')
    const windows = world.log.filter((e) => e.type === 'squad.window')
    expect(summers).toHaveLength(world.clubs.length)
    expect(windows).toHaveLength(world.clubs.length * 2)
    for (const club of world.clubs) {
      expect(club.squad.strength).toBeGreaterThan(0)
      expect(club.squad.strength).toBeLessThanOrEqual(100)
      expect(club.squad.avgAge).toBeGreaterThan(17)
      expect(club.squad.avgAge).toBeLessThan(36)
    }
    expect(windows.some((e) => (e.payload['youth'] as number) >= 4)).toBe(true)
  })

  it('starts the next season with fresh fixtures and tables', () => {
    expect(world.week).toBe(T.SEASON_WEEKS)
    expect(world.season).toBe(2)
    advanceWeek(world)
    expect(world.fixtures.some((f) => f.competition === 'league' && !f.played)).toBe(true)
    expect(world.log.filter((e) => e.type === 'season.start')).toHaveLength(2)
  })
})

describe('determinism', () => {
  it('two worlds from one seed match after two seasons', () => {
    const a = createWorld(7)
    const b = createWorld(7)
    runSeasons(a, 2)
    runSeasons(b, 2)
    expect(digestWorld(a).hash).toBe(digestWorld(b).hash)
    expect(a.log.length).toBe(b.log.length)
  })

  it('a JSON save taken mid-season continues identically', () => {
    const live = createWorld(11)
    runWeeks(live, 17)
    const restored = JSON.parse(JSON.stringify(live))
    runWeeks(live, 40)
    runWeeks(restored, 40)
    expect(digestWorld(restored).hash).toBe(digestWorld(live).hash)
  })
})

describe('match text', () => {
  it('renders a summary from the template library with both club names', () => {
    const world = createWorld(1)
    runWeeks(world, 1)
    const event = world.log.find((e) => e.type === 'match.played')!
    const text = renderMatch(world, event)
    const home = world.clubs.find((c) => c.id === event.payload['homeId'])!
    const away = world.clubs.find((c) => c.id === event.payload['awayId'])!
    expect(text).toContain(home.name)
    expect(text).toContain(away.name)
    expect(text).not.toContain('{')
  })
})
