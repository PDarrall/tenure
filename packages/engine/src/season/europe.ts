/**
 * The European competition's foreign field (DESIGN.md "World"): opponents
 * generated for the season, each a name and a strength drawn afresh by round
 * from EUROPEAN_OPPONENT_STRENGTH_BY_ROUND, so the later rounds are harder
 * whoever survives. A squad appears when a tie against a home club is
 * prepared and goes when the tie is settled. Two generated sides meeting
 * each other are settled on strength alone.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { OpponentNamer } from '../world/names.js'
import { generateSquad, forgetPlayer } from '../players/gen.js'
import { playerById, europeanOpponentById } from '../lookup.js'
import type { ClubId, EuropeanOpponent, Nationality, World } from '../types.js'

const POOLS: Exclude<Nationality, 'home'>[] = ['big', 'mid', 'small']

function drawStrength(rng: Rng, round: number): number {
  const spec = T.EUROPEAN_OPPONENT_STRENGTH_BY_ROUND[Math.min(round, T.EUROPEAN_OPPONENT_STRENGTH_BY_ROUND.length - 1)] as { mean: number; sd: number }
  return round1(clamp(rng.normal(spec.mean, spec.sd), 1, 100))
}

/** A fresh field for the season: names and round-one strengths. Last season's opponents and their squads are gone. */
export function generateEuropeanField(world: World, rng: Rng): EuropeanOpponent[] {
  for (const o of world.europeanOpponents) dropOpponentSquad(world, o)
  const namer = new OpponentNamer(rng)
  const field: EuropeanOpponent[] = []
  for (let i = 0; i < T.EUROPEAN_OPPONENTS; i++) {
    const pool = POOLS[i % POOLS.length] as Exclude<Nationality, 'home'>
    field.push({ id: T.EUROPEAN_OPPONENT_ID_BASE + i, name: namer.next(pool, T.EUROPEAN_OPPONENT_PREFIX_SHARE), strength: drawStrength(rng, 0), playerIds: [] })
  }
  world.europeanOpponents = field
  return field
}

/** Before a round is drawn: every surviving opponent is drawn again at the round's strength, squads dropped. */
export function redrawOpponents(world: World, rng: Rng, remaining: readonly ClubId[], round: number): void {
  for (const id of remaining) {
    const o = europeanOpponentById(world, id)
    if (!o) continue
    o.strength = drawStrength(rng, round)
    dropOpponentSquad(world, o)
  }
}

/** The pool a generated opponent's players are named from: its place in the field. */
function poolOf(o: EuropeanOpponent): Exclude<Nationality, 'home'> {
  return POOLS[(o.id - T.EUROPEAN_OPPONENT_ID_BASE) % POOLS.length] as Exclude<Nationality, 'home'>
}

/** The squad for a tie against a home club, generated once at the opponent's strength. */
export function ensureOpponentSquad(world: World, rng: Rng, o: EuropeanOpponent): void {
  if (o.playerIds.length > 0) return
  generateSquad(world, rng, o, o.strength, T.DEFAULT_FORMATION, T.EUROPEAN_OPPONENT_SQUAD_SIZE, null, T.EUROPEAN_OPPONENT_NATIONAL_SHARE, poolOf(o))
}

/** The tie is over: the squad goes, so a save carries nothing it does not need. */
export function dropOpponentSquad(world: World, o: EuropeanOpponent): void {
  for (const id of o.playerIds) {
    const p = playerById(world, id)
    if (p) forgetPlayer(world, p)
  }
  o.playerIds = []
}
