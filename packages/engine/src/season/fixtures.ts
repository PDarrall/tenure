import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { ClubId, Fixture, Tier, World } from '../types.js'

/**
 * Double round-robin by the circle method. Each pair meets twice, once at
 * each ground. `ids.length` must be even.
 *
 * Venues: the fixed club (index 0) alternates by round; every other pair
 * takes its venue from the pair's index. A rotating club moves one pair
 * index per round, so its venue alternates too, with at most two games
 * running at one ground where it passes the fixed club. (Keyed on round
 * plus index, every rotating club sat at one ground for half a season.)
 */
export function roundRobin(ids: readonly ClubId[]): [ClubId, ClubId][][] {
  const n = ids.length
  if (n % 2 !== 0) throw new Error(`roundRobin: odd number of teams ${n}`)
  const arr = [...ids]
  const first: [ClubId, ClubId][][] = []
  for (let r = 0; r < n - 1; r++) {
    const pairs: [ClubId, ClubId][] = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i] as ClubId
      const b = arr[n - 1 - i] as ClubId
      const aHome = i === 0 ? r % 2 === 0 : i % 2 === 0
      pairs.push(aHome ? [a, b] : [b, a])
    }
    first.push(pairs)
    const last = arr.pop() as ClubId
    arr.splice(1, 0, last)
  }
  const second = first.map((pairs) => pairs.map(([h, a]): [ClubId, ClubId] => [a, h]))
  return [...first, ...second]
}

/** The Cup weekends a tier has entered by: its league round moves to the midweek of those weeks. */
export function cupWeekendsFor(tier: Tier): Set<number> {
  const weeks = new Set<number>()
  let entered = false
  for (const round of T.THE_CUP_ROUNDS) {
    if (round.entrants.includes(tier)) entered = true
    if (entered && round.slot === 0) weeks.add(round.week)
  }
  return weeks
}

/** Every week and slot a cup round occupies, whichever competition. */
export function cupSlots(): Set<string> {
  const out = new Set<string>()
  const add = (week: number, slot: number) => out.add(`${week}:${slot}`)
  for (const r of [...T.THE_CUP_ROUNDS, ...T.LEAGUE_CUP_ROUNDS, ...T.EUROPE_KNOCKOUT_ROUNDS]) {
    add(r.week, r.slot)
    if (r.secondLeg) add(r.secondLeg.week, r.secondLeg.slot)
  }
  for (const week of T.EUROPE_GROUP_WEEKS) add(week, 1)
  return out
}

/**
 * The slots a tier's league rounds take, in order (DESIGN.md "World"): the
 * weekend of every week but its idle ones; the midweek instead on the
 * tier's Cup weekends; both slots in its double weeks, which the template
 * keeps clear of every cup round.
 */
export function leagueSlotsFor(tier: Tier): { week: number; slot: 0 | 1 }[] {
  const idle = new Set(T.LEAGUE_IDLE_WEEKS_BY_TIER[tier - 1] ?? [])
  const doubles = new Set(T.LEAGUE_DOUBLE_WEEKS_BY_TIER[tier - 1] ?? [])
  const cupWeekends = cupWeekendsFor(tier)
  const taken = cupSlots()
  const slots: { week: number; slot: 0 | 1 }[] = []
  for (let week = 0; week < T.MATCH_WEEKS; week++) {
    if (idle.has(week)) continue
    if (doubles.has(week)) {
      if (taken.has(`${week}:0`) || taken.has(`${week}:1`)) throw new Error(`tier ${tier}: double week ${week} collides with a cup round`)
      slots.push({ week, slot: 0 }, { week, slot: 1 })
      continue
    }
    slots.push(cupWeekends.has(week) ? { week, slot: 1 } : { week, slot: 0 })
  }
  return slots
}

/** League fixtures for every tier, each round on its slot from the template. */
export function leagueFixtures(world: World, rng: Rng): Fixture[] {
  const fixtures: Fixture[] = []
  for (let index = 0; index < T.TIER_SIZES.length; index++) {
    const tier = (index + 1) as Tier
    const ids = world.clubs
      .filter((c) => c.tier === tier)
      .map((c) => c.id)
      .sort((a, b) => a - b)
    rng.shuffle(ids)
    const rounds = roundRobin(ids)
    const expected = T.LEAGUE_ROUNDS_BY_TIER[index]
    if (rounds.length !== expected) {
      throw new Error(`tier ${tier}: ${rounds.length} rounds generated, tunables say ${expected}`)
    }
    const slots = leagueSlotsFor(tier)
    if (slots.length !== rounds.length) {
      throw new Error(`tier ${tier}: ${rounds.length} rounds but the calendar template gives ${slots.length} slots`)
    }
    rounds.forEach((pairs, r) => {
      const { week, slot } = slots[r] as { week: number; slot: 0 | 1 }
      for (const [homeId, awayId] of pairs) {
        fixtures.push({ week, slot, competition: 'league', round: r + 1, homeId, awayId, tier, played: false })
      }
    })
  }
  return fixtures
}
