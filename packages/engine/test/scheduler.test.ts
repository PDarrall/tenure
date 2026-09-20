/**
 * The calendar and the cups (DESIGN.md "World"): 52 weeks, every fixture
 * inside the season's 41, no club more than twice in a week and never
 * twice in a slot; the cups in their formats, entry by tier, every
 * competition resolved and every trophy awarded; qualification with
 * places passing down; two-leg ties on aggregate; neutral finals.
 */
import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { leagueSlotsFor } from '../src/season/fixtures.js'
import { europeanPlaces } from '../src/season/promotion.js'
import { buildRounds, roundFixtures } from '../src/season/cups.js'
import { matchOdds, plainBands, playMatch, type Participant } from '../src/season/match.js'
import { createMatch, runToEnd, type SideSetup } from '../src/match/minute.js'
import { lineupFor } from '../src/season/season.js'
import { T } from '../src/tunables.js'
import type { Fixture, Tier, World } from '../src/types.js'

function side(id: number, strength = 60): Participant {
  return { id, strength, tactical: 50, form: [], morale: 50, mentality: 'balanced', style: 'possession', bands: plainBands(strength) }
}

/** Every match of a full season, from the log (fixtures are replaced each season). */
function matchesOf(world: World): { week: number; homeId: number; awayId: number; competition: string }[] {
  return world.log.filter((e) => e.type === 'match.played').map((e) => ({ week: e.week, homeId: e.payload['homeId'] as number, awayId: e.payload['awayId'] as number, competition: String(e.payload['competition']) }))
}

describe('the scheduler', () => {
  it('gives every tier its rounds inside the season weeks, one per slot', () => {
    for (let tier = 1 as Tier; tier <= 5; tier = (tier + 1) as Tier) {
      const slots = leagueSlotsFor(tier)
      expect(slots).toHaveLength(T.LEAGUE_ROUNDS_BY_TIER[tier - 1] as number)
      expect(new Set(slots.map((s) => `${s.week}:${s.slot}`)).size).toBe(slots.length)
      for (const s of slots) expect(s.week).toBeLessThan(T.MATCH_WEEKS)
    }
  })

  it('for every seed it is given: every fixture in weeks 1–41, no club twice in a slot, none more than twice in a week', { timeout: 120_000 }, () => {
    for (const seed of [1, 2, 3, 4]) {
      const world = createWorld(seed)
      runSeasons(world, 1)
      // Every fixture of the season had a week and a slot inside the season.
      const bySlot = new Map<string, number>()
      const byWeek = new Map<string, number>()
      for (const f of world.fixtures) {
        expect(f.week, `seed ${seed}: ${f.competition} round ${f.round} week`).toBeLessThan(T.MATCH_WEEKS)
        expect([0, 1]).toContain(f.slot)
        for (const id of [f.homeId, f.awayId]) {
          const slotKey = `${id}:${f.week}:${f.slot}`
          const weekKey = `${id}:${f.week}`
          bySlot.set(slotKey, (bySlot.get(slotKey) ?? 0) + 1)
          byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + 1)
        }
      }
      expect(Math.max(...bySlot.values()), `seed ${seed}: a club twice in one slot`).toBe(1)
      expect(Math.max(...byWeek.values()), `seed ${seed}: a club three times in one week`).toBeLessThanOrEqual(2)
      expect(world.fixtures.some((f) => !f.played), `seed ${seed}: an unplayed fixture`).toBe(false)
      for (const m of matchesOf(world)) expect(m.week % T.SEASON_WEEKS).toBeLessThan(T.MATCH_WEEKS)
    }
  })
})

describe('the cups', () => {
  const world = createWorld(3)
  runSeasons(world, 1)
  const cup = (name: string) => world.cups.find((c) => c.competition === name)!
  // Tiers as the draw read them: the season's end has moved clubs up and down since.
  const tiersOf = (e: { payload: Record<string, unknown> }) => [e.payload['homeTier'] as number | null, e.payload['awayTier'] as number | null]

  it('every competition is resolved and every trophy awarded', () => {
    for (const c of world.cups) {
      expect(c.winnerId, c.competition).not.toBeNull()
      expect(c.roundsPlayed).toBe(c.rounds.length)
      expect(c.remaining).toHaveLength(1)
      expect(c.ties).toHaveLength(0)
    }
    const trophies = world.log.filter((e) => e.type === 'trophy').map((e) => String(e.payload['competition']))
    for (const name of ['nationalCup', 'leagueCup', 'championsCup', 'europaCup', 'conferenceCup']) expect(trophies.filter((t) => t === name)).toHaveLength(1)
    expect(trophies.filter((t) => t === 'league')).toHaveLength(5)
  })

  it('the Cup: tiers 4–5 in round one, tier 3 in two, tiers 1–2 in three; single ties; neutral semi-finals and final', () => {
    const ties = world.log.filter((e) => e.type === 'cup.tie' && e.payload['competition'] === 'nationalCup')
    const tiersIn = (round: number) => new Set(ties.filter((e) => e.payload['round'] === round).flatMap(tiersOf))
    expect([...tiersIn(1)].sort()).toEqual([4, 5])
    expect(tiersIn(2).has(3)).toBe(true)
    expect(tiersIn(2).has(1) || tiersIn(2).has(2)).toBe(false)
    expect(tiersIn(3).has(1) && tiersIn(3).has(2)).toBe(true)
    expect(ties.filter((e) => e.payload['round'] === 1)).toHaveLength(24)
    expect(ties.filter((e) => e.payload['round'] === 3)).toHaveLength(34)
    expect(ties.filter((e) => e.payload['round'] === 4)).toHaveLength(2)
    expect(ties.every((e) => e.payload['legs'] === 1)).toBe(true)
    expect(ties.filter((e) => e.payload['round'] === 8).every((e) => e.payload['neutral'] === true)).toBe(true)
    expect(ties.filter((e) => e.payload['round'] === 9).every((e) => e.payload['neutral'] === true)).toBe(true)
    expect(cup('nationalCup').rounds.map((r) => r.label)).toEqual(['Round 1', 'Round 2', 'Round 3', 'Round 4', 'Round 5', 'Round 6', 'Quarter-final', 'Semi-final', 'Final'])
  })

  it('the League Cup: tiers 2–4 in round one, tier 1 in two, its clubs in Europe in three; two-leg semi-finals', () => {
    const ties = world.log.filter((e) => e.type === 'cup.tie' && e.payload['competition'] === 'leagueCup')
    const entrants = (round: number) => ties.filter((e) => e.payload['round'] === round).flatMap((e) => [{ id: e.payload['homeId'] as number, tier: e.payload['homeTier'] as number | null }, { id: e.payload['awayId'] as number, tier: e.payload['awayTier'] as number | null }])
    const europe = new Set([...world.log.filter((e) => e.type === 'europe.group').flatMap((e) => e.payload['clubIds'] as number[])].filter((id) => id < T.EUROPEAN_OPPONENT_ID_BASE))
    for (const { tier } of entrants(1)) expect([2, 3, 4]).toContain(tier)
    const tierOneEntering = entrants(2).filter((c) => c.tier === 1)
    expect(tierOneEntering.length).toBeGreaterThan(0)
    for (const { id } of tierOneEntering) expect(europe.has(id)).toBe(false)
    const round3Tier1 = entrants(3).filter((c) => c.tier === 1 && europe.has(c.id))
    expect(round3Tier1.length).toBeGreaterThan(0)
    expect(ties.filter((e) => e.payload['round'] === 6).every((e) => e.payload['legs'] === 2)).toBe(true)
    expect(ties.filter((e) => e.payload['round'] === 6)).toHaveLength(2)
  })

  it('Europe: four groups of four with six matchdays, then two-leg knockouts and a one-off final', () => {
    for (const name of ['championsCup', 'europaCup', 'conferenceCup']) {
      const c = cup(name)
      expect(c.groups).toHaveLength(4)
      for (const g of c.groups) {
        expect(g.clubIds).toHaveLength(4)
        for (const row of g.rows) expect(row.played).toBe(6)
      }
      expect(c.rounds.filter((r) => r.group)).toHaveLength(6)
      expect(c.rounds.slice(6).map((r) => r.label)).toEqual(['Quarter-final', 'Semi-final', 'Final'])
      const ties = world.log.filter((e) => e.type === 'cup.tie' && e.payload['competition'] === name)
      expect(ties.filter((e) => e.payload['round'] === 7 && e.payload['legs'] === 2)).toHaveLength(4)
      expect(ties.filter((e) => e.payload['round'] === 9 && e.payload['neutral'] === true)).toHaveLength(1)
      const exits = world.log.filter((e) => e.type === 'cup.exit' && e.payload['competition'] === name)
      expect(exits).toHaveLength(T.EUROPE_CLUBS - 1)
      expect(world.log.filter((e) => e.type === 'europe.prize' && e.payload['competition'] === name).length).toBeGreaterThan(0)
    }
  })

  it('qualification: the top four, fifth and the Cup winner, sixth and the League Cup winner, places passing down', () => {
    const table = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(europeanPlaces(table, 30, 31)).toEqual({ championsCup: [1, 2, 3, 4], europaCup: [5, 30], conferenceCup: [6, 31] })
    // The Cup winner finished second: its place passes to sixth; the League Cup winner is fifth: seventh takes the pass-down.
    expect(europeanPlaces(table, 2, 5)).toEqual({ championsCup: [1, 2, 3, 4], europaCup: [5, 6], conferenceCup: [7, 8] })
    expect(europeanPlaces(table, null, null)).toEqual({ championsCup: [1, 2, 3, 4], europaCup: [5, 6], conferenceCup: [7, 8] })
  })

  it('names the rounds from the end and gives group matchdays their weeks', () => {
    const rounds = buildRounds(T.EUROPE_KNOCKOUT_ROUNDS, T.EUROPE_GROUP_WEEKS)
    expect(rounds.map((r) => r.week)).toEqual([...T.EUROPE_GROUP_WEEKS, 26, 31, 37])
    expect(rounds[6]!.secondLeg).toEqual({ week: 28, slot: 1 })
  })
})

describe('two legs and neutral ground', () => {
  it('a second leg is settled on aggregate, the shoot-out only when level over both', () => {
    const home = side(1, 60)
    const away = side(2, 60)
    // 3–0 up from the first leg: a level night settles nothing on penalties; only a level aggregate does.
    let levelNights = 0
    for (let seed = 1; seed <= 60; seed++) {
      const rng = createRng(seed)
      const out = playMatch(rng, home, away, true, { aggregate: { home: 3, away: 0 } })
      const levelAggregate = out.homeGoals + 3 === out.awayGoals
      if (out.homeGoals === out.awayGoals) levelNights++
      expect(out.shootoutWinnerId !== undefined, `seed ${seed}: ${out.homeGoals}-${out.awayGoals}`).toBe(levelAggregate)
    }
    expect(levelNights).toBeGreaterThan(0)
    // Down 0–2 from the first leg and winning 2–0 on the night: level on aggregate, so a shoot-out.
    let seen = false
    for (let seed = 1; seed <= 400 && !seen; seed++) {
      const rng = createRng(seed)
      const out = playMatch(rng, home, away, true, { aggregate: { home: 0, away: 2 } })
      if (out.homeGoals === 2 && out.awayGoals === 0) {
        expect(out.shootoutWinnerId).toBeDefined()
        seen = true
      }
    }
    expect(seen).toBe(true)
  })

  it('a neutral ground drops the home lean from the odds and from the minute engine', () => {
    const a = side(1, 60)
    const b = side(2, 60)
    const homeOdds = matchOdds(a, b)
    const neutralOdds = matchOdds(a, b, true)
    expect(homeOdds.pHome).toBeGreaterThan(homeOdds.pAway)
    expect(Math.abs(neutralOdds.pHome - neutralOdds.pAway)).toBeLessThan(0.02)
    expect(neutralOdds.lean).toBeCloseTo(0, 5)
    // The minute engine: two equal sides on neutral ground, pressure drifts round nil over many matches.
    const world = createWorld(21)
    runWeeks(world, 1)
    const rng = createRng(21)
    const [x, y] = world.clubs.filter((c) => c.tier === 1).slice(0, 2)
    const setup = (id: number): SideSetup => {
      const s = lineupFor(world, rng, id, { bigGame: false })
      return { clubId: id, name: String(id), isHuman: false, managerId: null, participant: s.participant, xi: s.lineup.xi, bench: s.lineup.bench, formation: world.clubs[id - 1]!.formation }
    }
    const m = createMatch(world, rng, setup(x!.id), setup(y!.id), true, false, { neutral: true, aggregate: { home: 1, away: 1 } })
    expect(m.neutral).toBe(true)
    expect(m.aggregate).toEqual({ home: 1, away: 1 })
    runToEnd(m)
    expect(m.over).toBe(true)
    if (m.home.goals === m.away.goals) expect(m.shootoutWinnerId).not.toBeNull()
    else expect(m.shootoutWinnerId).toBeNull()
  })

  it('a cup fixture carries the first leg into the second', async () => {
    const world = createWorld(5)
    runWeeks(world, 26) // the League Cup semi-final first legs (week 25) have been played
    const cup = world.cups.find((c) => c.competition === 'leagueCup')!
    const semi = cup.rounds.find((r) => r.label === 'Semi-final')!
    const first = roundFixtures(world, cup, semi, 1)
    const second = roundFixtures(world, cup, semi, 2)
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    for (const f of first) expect(f.played).toBe(true)
    for (const f of second) {
      expect(f.played).toBe(false)
      const leg1 = first.find((g) => g.tieId === f.tieId) as Fixture
      expect(f.homeId).toBe(leg1.awayId)
      expect(f.aggregate).toEqual({ home: leg1.awayGoals, away: leg1.homeGoals })
    }
  })
})
