import type { Rng } from '../rng.js'
import * as T from '../tunables.js'
import type { ClubId, Fixture, Tier, World } from '../types.js'
import { leagueRoundWeek } from './calendar.js'

/**
 * Double round-robin by the circle method. Each pair meets twice, once at
 * each ground. `ids.length` must be even.
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
      pairs.push((r + i) % 2 === 0 ? [a, b] : [b, a])
    }
    first.push(pairs)
    const last = arr.pop() as ClubId
    arr.splice(1, 0, last)
  }
  const second = first.map((pairs) => pairs.map(([h, a]): [ClubId, ClubId] => [a, h]))
  return [...first, ...second]
}

/** League fixtures for every tier, rounds spread over the match weeks. */
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
    rounds.forEach((pairs, r) => {
      const week = leagueRoundWeek(r, rounds.length)
      for (const [homeId, awayId] of pairs) {
        fixtures.push({ week, competition: 'league', round: r + 1, homeId, awayId, tier, played: false })
      }
    })
  }
  return fixtures
}
