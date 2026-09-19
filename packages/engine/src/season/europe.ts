/**
 * The European competitions' foreign fields (DESIGN.md "World"): opponents
 * generated for each competition and season, each a name and a strength
 * drawn afresh by stage from EUROPE_OPPONENT_STRENGTH, so the later rounds
 * are harder whoever survives. A squad appears when a tie against a home
 * club is prepared and goes when the tie is settled. Two generated sides
 * meeting each other are settled on strength alone.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { OpponentNamer } from '../world/names.js'
import { generateSquad, forgetPlayer } from '../players/gen.js'
import { playerById, europeanOpponentById } from '../lookup.js'
import type { ClubId, EuropeanCompetition, EuropeanOpponent, Nationality, World } from '../types.js'

const POOLS: Exclude<Nationality, 'home'>[] = ['big', 'mid', 'small']

export type EuropeStage = 'group' | 'quarter' | 'semi' | 'final'

export const EUROPEAN_COMPETITIONS: readonly EuropeanCompetition[] = ['championsCup', 'europaCup', 'conferenceCup']

function drawStrength(rng: Rng, competition: EuropeanCompetition, stage: EuropeStage): number {
  const spec = T.EUROPE_OPPONENT_STRENGTH[competition][stage]
  return round1(clamp(rng.normal(spec.mean, spec.sd), 1, 100))
}

/** Fresh fields for the season, one per competition: names and group-stage strengths. Last season's opponents and their squads are gone. */
export function generateEuropeanFields(world: World, rng: Rng, counts: Record<EuropeanCompetition, number>): Record<EuropeanCompetition, EuropeanOpponent[]> {
  for (const o of world.europeanOpponents) dropOpponentSquad(world, o)
  const namer = new OpponentNamer(rng)
  const fields: Record<EuropeanCompetition, EuropeanOpponent[]> = { championsCup: [], europaCup: [], conferenceCup: [] }
  let i = 0
  for (const competition of EUROPEAN_COMPETITIONS) {
    for (let n = 0; n < counts[competition]; n++, i++) {
      const pool = POOLS[i % POOLS.length] as Exclude<Nationality, 'home'>
      fields[competition].push({ id: T.EUROPEAN_OPPONENT_ID_BASE + i, name: namer.next(pool, T.EUROPEAN_OPPONENT_PREFIX_SHARE), competition, strength: drawStrength(rng, competition, 'group'), playerIds: [] })
    }
  }
  world.europeanOpponents = [...fields.championsCup, ...fields.europaCup, ...fields.conferenceCup]
  return fields
}

/** Before a knockout stage is drawn: every surviving opponent is drawn again at the stage's strength, squads dropped. */
export function redrawOpponents(world: World, rng: Rng, remaining: readonly ClubId[], competition: EuropeanCompetition, stage: EuropeStage): void {
  for (const id of remaining) {
    const o = europeanOpponentById(world, id)
    if (!o) continue
    o.strength = drawStrength(rng, competition, stage)
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

export function isEuropean(competition: string): competition is EuropeanCompetition {
  return competition === 'championsCup' || competition === 'europaCup' || competition === 'conferenceCup'
}
