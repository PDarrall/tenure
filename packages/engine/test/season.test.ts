import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { leagueFixtures, roundRobin } from '../src/season/fixtures.js'
import { matchOdds, plainBands, playMatch, poissonPmf, type Participant } from '../src/season/match.js'
import { structureOf } from '../src/players/formations.js'
import { matchesThisRound, roundsNeeded } from '../src/season/cups.js'
import { tableFor } from '../src/season/table.js'
import { advanceWeek, runSeasons, runWeeks } from '../src/sim/advance.js'
import { digestWorld } from '../src/digest.js'
import { renderMatch } from '../src/text/render.js'
import { T } from '../src/tunables.js'

function side(overrides: Partial<Participant> = {}): Participant {
  return { id: 1, strength: 50, tactical: 50, form: [], morale: 50, mentality: 'balanced', style: 'possession', bands: plainBands(50), ...overrides }
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

  it('never sends a club to the same venue more than three rounds running', () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1)
    const rounds = roundRobin(ids)
    let longest = 0
    for (const id of ids) {
      let run = 0
      let last: 'H' | 'A' | null = null
      for (const round of rounds) {
        const pair = round.find(([h, a]) => h === id || a === id)!
        const venue = pair[0] === id ? 'H' : 'A'
        run = venue === last ? run + 1 : 1
        last = venue
        longest = Math.max(longest, run)
      }
    }
    expect(longest).toBeLessThanOrEqual(3)
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

  it('reads structure: a fifth midfielder wins pressure, a back five concedes less, four forwards make and concede', () => {
    const base = matchOdds(side(), side({ id: 2 }))
    const fiveMid = matchOdds(side({ bands: plainBands(50, structureOf('4-5-1')) }), side({ id: 2 }))
    // DESIGN: 4-5-1 wins the midfield against 4-4-2 but creates less.
    expect(fiveMid.lean).toBeGreaterThan(base.lean)
    expect(fiveMid.lambdaAway).toBeLessThan(base.lambdaAway)
    expect(fiveMid.lambdaHome).toBeLessThan(base.lambdaHome)
    const backFive = matchOdds(side({ bands: plainBands(50, structureOf('5-4-1')) }), side({ id: 2 }))
    expect(backFive.lambdaAway).toBeLessThan(base.lambdaAway)
    expect(backFive.lambdaHome).toBeLessThan(base.lambdaHome)
    const fourUp = matchOdds(side({ bands: plainBands(50, structureOf('4-2-4')) }), side({ id: 2 }))
    expect(fourUp.lambdaHome + fourUp.lambdaAway).toBeGreaterThan(base.lambdaHome + base.lambdaAway)
    // Mentality: attack opens the game up and leans on pressure; defend closes it and concedes less.
    const attack = matchOdds(side({ mentality: 'attack' }), side({ id: 2 }))
    expect(attack.lean).toBeGreaterThan(base.lean)
    expect(attack.lambdaHome).toBeGreaterThan(base.lambdaHome)
    expect(attack.lambdaHome + attack.lambdaAway).toBeGreaterThan(base.lambdaHome + base.lambdaAway)
    const defend = matchOdds(side({ mentality: 'defend' }), side({ id: 2 }))
    expect(defend.lean).toBeLessThan(base.lean)
    expect(defend.lambdaAway).toBeLessThan(base.lambdaAway)
    expect(defend.lambdaHome).toBeLessThan(base.lambdaHome)
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

  it('gives the home side of two equal teams the pressure lean, and nothing else', () => {
    const odds = matchOdds(side(), side({ id: 2 }))
    // Identical sides: structure and style cancel, leaving only the lean between the two.
    expect(odds.lean).toBe(T.HOME_PRESSURE_LEAN)
    expect(odds.lambdaHome / odds.lambdaAway).toBeGreaterThan(1.15)
    expect(odds.lambdaHome / odds.lambdaAway).toBeLessThan(1.7)
    expect(odds.lambdaHome + odds.lambdaAway).toBeGreaterThan(2.2)
    expect(odds.lambdaHome + odds.lambdaAway).toBeLessThan(3.3)
    // Home win / draw / away win for equal sides. DESIGN target ≈ 45 / 26 / 29, to verify.
    // Two equal sides draw more often than the population does, whose gaps between sides decide more matches.
    expect(odds.pHome).toBeGreaterThan(0.4)
    expect(odds.pHome).toBeLessThan(0.54)
    expect(odds.pDraw).toBeGreaterThan(0.2)
    expect(odds.pDraw).toBeLessThan(0.37)
    expect(odds.pAway).toBeGreaterThan(0.18)
    expect(odds.pAway).toBeLessThan(0.34)
  })

  it('a simulated season lands near the goals-per-game and result-split targets (to verify)', () => {
    const world = createWorld(3)
    runSeasons(world, 1)
    const league = world.log.filter((e) => e.type === 'match.played' && e.payload['competition'] === 'league')
    let goals = 0
    let home = 0
    let draw = 0
    for (const e of league) {
      const hg = e.payload['homeGoals'] as number
      const ag = e.payload['awayGoals'] as number
      goals += hg + ag
      if (hg > ag) home++
      else if (hg === ag) draw++
    }
    const n = league.length
    expect(n).toBeGreaterThan(2000)
    // A first season carries wide strength gaps (tiers are not yet sorted), so it reads above the
    // 2.7 and 45 / 26 / 29 the fast path is calibrated to on settled worlds; these bands only catch a break.
    expect(goals / n).toBeGreaterThan(2.3)
    expect(goals / n).toBeLessThan(3.6)
    expect(home / n).toBeGreaterThan(0.38)
    expect(home / n).toBeLessThan(0.54)
    expect(draw / n).toBeGreaterThan(0.18)
    expect(draw / n).toBeLessThan(0.32)
  })

  it('stays finite against a side of nobodies (a strength-1 club once produced NaN odds and NaN credit)', () => {
    const nobodies = side({ id: 2, strength: 0.4, bands: { ...plainBands(0.4), defence: 0.005, midfield: 0.03, attack: 0.01 } })
    const odds = matchOdds(side({ strength: 30 }), nobodies)
    for (const v of [odds.pHome, odds.pDraw, odds.pAway, odds.lambdaHome, odds.lambdaAway, odds.expHome, odds.expAway]) expect(Number.isFinite(v)).toBe(true)
    expect(odds.pHome + odds.pDraw + odds.pAway).toBeCloseTo(1, 6)
    expect(odds.lambdaHome).toBeLessThanOrEqual(T.LAMBDA_MAX)
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

describe('cup draws', () => {
  it('a round drawn before its week is played as drawn, one tie event per tie and a bye event per bye', async () => {
    const { drawCupRound, drawnCupFixtures, playWeek } = await import('../src/season/season.js')
    const world = createWorld(2)
    runWeeks(world, 1) // season started, league cup round one (week 1) not yet played
    const cup = world.cups.find((c) => c.competition === 'leagueCup')!
    expect(cup.roundsPlayed).toBe(0)
    const rng = createRng(99)
    const drawn = drawCupRound(world, rng, cup, cup.roundWeeks[0]!)
    expect(drawn).toHaveLength(matchesThisRound(cup.remaining.length))
    expect(drawnCupFixtures(world, cup)).toEqual(drawn)
    const ties = world.log.filter((e) => e.type === 'cup.tie' && e.payload['competition'] === 'leagueCup')
    const byes = world.log.filter((e) => e.type === 'cup.bye' && e.payload['competition'] === 'leagueCup')
    expect(ties).toHaveLength(drawn.length)
    expect(ties.length * 2 + byes.length).toBe(cup.remaining.length)
    const before = drawn.map((f) => `${f.homeId}-${f.awayId}`)
    const played = playWeek(world, rng, cup.roundWeeks[0]!).filter((p) => p.fixture.competition === 'leagueCup')
    expect(played.map((p) => `${p.fixture.homeId}-${p.fixture.awayId}`)).toEqual(before)
    expect(cup.roundsPlayed).toBe(1)
    expect(drawnCupFixtures(world, cup)).toHaveLength(0)
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
    const staffed = world.clubs.filter((c) => c.managerId !== null)
    expect(staffed.length).toBeGreaterThan(0)
    for (const club of staffed) {
      const manager = world.managers.find((m) => m.id === club.managerId)!
      const spell = world.spells.find((s) => s.id === manager.history.spellIds.at(-1))!
      if (spell.startWeek >= T.MATCH_WEEKS) continue // hired this summer: no record yet
      expect(manager.history.seasons).toHaveLength(1)
      const record = manager.history.seasons[0]!
      // Genesis managers played the whole season; later hires carry games from wherever they were.
      if (spell.startWeek <= 0) expect(record.games).toBeGreaterThanOrEqual(T.LEAGUE_ROUNDS_BY_TIER[record.tier! - 1] as number)
      expect(record.games).toBeGreaterThanOrEqual(0)
      expect(record.finish).toBeGreaterThanOrEqual(1)
      expect(record.netSpendRank).toBeGreaterThanOrEqual(1)
      expect(manager.history.games).toBe(record.games)
      expect(manager.seasonGames).toBe(0)
    }
    for (const league of world.foreign) {
      for (const club of league.clubs) {
        if (club.managerId === null) continue
        const manager = world.managers.find((m) => m.id === club.managerId)!
        const spell = world.spells.find((s) => s.id === manager.history.spellIds.at(-1))!
        if (spell.startWeek > 0) continue // hired during the season or summer: not a full season abroad
        expect(manager.history.seasons[0]!.games).toBe(T.FOREIGN_GAMES_PER_SEASON)
      }
    }
    const fresh = createWorld(1)
    for (const m of world.managers) {
      const was = fresh.managers.find((f) => f.id === m.id)
      if (!was || m.status.kind === 'retired') continue // cohort entrants and the retired do not age here
      expect(m.age).toBe(was.age + 1)
    }
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
  it('two worlds from one seed match after two seasons', { timeout: 60_000 }, () => {
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
