import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { ClubId, CupState, World } from '../types.js'

/** Matches in a knockout round of n clubs: pare down to a power of two, then halve. */
export function matchesThisRound(n: number): number {
  let pow = 1
  while (pow * 2 <= n) pow *= 2
  return n === pow ? n / 2 : n - pow
}

/** Rounds needed to reduce n clubs to one. */
export function roundsNeeded(n: number): number {
  let rounds = 0
  let left = n
  while (left > 1) {
    left -= matchesThisRound(left)
    rounds++
  }
  return rounds
}

function foreignEntrants(world: World): ClubId[] {
  const ids: ClubId[] = []
  for (const league of world.foreign) {
    const count = T.EUROPEAN_FOREIGN_ENTRANTS[league.kind]
    const best = [...league.clubs].sort((a, b) => b.strength - a.strength || a.id - b.id).slice(0, count)
    ids.push(...best.map((c) => c.id))
  }
  return ids
}

function makeCup(competition: CupState['competition'], roundWeeks: readonly number[], entrants: ClubId[]): CupState {
  const needed = roundsNeeded(entrants.length)
  if (needed !== roundWeeks.length) {
    throw new Error(`${competition}: ${entrants.length} entrants need ${needed} rounds, tunables give ${roundWeeks.length}`)
  }
  return {
    competition,
    roundWeeks: [...roundWeeks],
    remaining: [...entrants].sort((a, b) => a - b),
    roundsPlayed: 0,
    winnerId: null,
    finalistIds: [],
  }
}

/** Create this season's three cups from the current clubs. */
export function seedCups(world: World): void {
  const national = world.clubs.map((c) => c.id)
  const leagueCup = world.clubs.filter((c) => T.LEAGUE_CUP_TIERS.includes(c.tier)).map((c) => c.id)
  const european = [...world.europeanEntrants, ...foreignEntrants(world)]
  world.cups = [
    makeCup('nationalCup', T.NATIONAL_CUP_ROUND_WEEKS, national),
    makeCup('leagueCup', T.LEAGUE_CUP_ROUND_WEEKS, leagueCup),
    makeCup('european', T.EUROPEAN_ROUND_WEEKS, european),
  ]
}

/** Draw the next round: pairs that play now; everyone else has a bye. */
export function drawRound(rng: Rng, cup: CupState): [ClubId, ClubId][] {
  const ids = [...cup.remaining]
  rng.shuffle(ids)
  const matches = matchesThisRound(ids.length)
  const pairs: [ClubId, ClubId][] = []
  for (let i = 0; i < matches; i++) pairs.push([ids[2 * i] as ClubId, ids[2 * i + 1] as ClubId])
  return pairs
}

export function isFinal(cup: CupState): boolean {
  return cup.remaining.length === 2
}
