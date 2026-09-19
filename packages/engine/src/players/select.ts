/**
 * Picking a side (DESIGN.md "Players": positional penalties, condition,
 * morale, the assistant's auto-pick) and reading it in bands for the match
 * model (DESIGN.md "Formations and tactics").
 */
import { T } from '../tunables.js'
import type { Club, ClubId, Formation, FormationSlot, Player, PlayerId, Position, World, YouthLean } from '../types.js'
import { playerById } from '../lookup.js'
import { slotsOf, structureOf } from './formations.js'
import { hasTrait } from './traits.js'

const ROLE_INDEX: Record<Position, number> = { GK: 0, D: 1, M: 2, F: 3 }

/** What the rating rules need to know about a player: a Player, or a copy of one inside a match. */
export type Rateable = Pick<Player, 'rating' | 'condition' | 'morale' | 'traits' | 'position' | 'side'>

/** Rating lost playing a slot: adjacent role −15, distant −30, wrong side −5; versatile halves it (tunables). */
export function positionPenalty(player: Rateable, slot: FormationSlot): number {
  let penalty = 0
  if (player.position !== slot.position) {
    const distance = Math.abs(ROLE_INDEX[player.position] - ROLE_INDEX[slot.position])
    const gkInvolved = player.position === 'GK' || slot.position === 'GK'
    penalty += distance === 1 && !gkInvolved ? T.POSITION_PENALTY_ADJACENT : T.POSITION_PENALTY_DISTANT
  }
  if (player.side !== 'any' && slot.side !== player.side && player.position !== 'GK') penalty += T.SIDE_PENALTY
  if (player.traits.includes('versatile')) penalty *= T.VERSATILE_PENALTY_SHARE
  return penalty
}

export interface MatchContext {
  /** A cup tie, a derby, or a top side: the big-game trait plays up. */
  bigGame: boolean
}

/** What a player brings to a slot today: rating less position, condition and morale, plus the traits that read here. */
export function effectiveRating(player: Rateable, slot: FormationSlot, ctx: MatchContext = { bigGame: false }): number {
  let rating = player.rating - positionPenalty(player, slot)
  if (player.condition < T.CONDITION_RATING_FROM) rating -= (T.CONDITION_RATING_FROM - player.condition) * T.CONDITION_RATING_PER_POINT
  rating += ((player.morale - T.SCALE_MIDPOINT) / T.SCALE_MIDPOINT) * T.PLAYER_MORALE_RATING_SWING
  if (ctx.bigGame && player.traits.includes('big-game')) rating += T.BIG_GAME_BONUS
  // A nobody on a bad day is still a nobody, not a liability with a minus sign.
  return Math.max(0, rating)
}

/** Scorers by position, poachers weighted up (the poacher rule). */
export function scorerWeight(p: Rateable): number {
  const base = T.SCORER_POSITION_WEIGHTS[p.position]
  return base * (p.traits.includes('poacher') ? T.POACHER_SCORER_MULT : 1) * (p.rating / 100)
}

/** Assisters by position, playmakers weighted up (the playmaker rule). */
export function assisterWeight(p: Rateable): number {
  const base = T.ASSIST_POSITION_WEIGHTS[p.position]
  return base * (p.traits.includes('playmaker') ? T.PLAYMAKER_ASSIST_MULT : 1) * (p.rating / 100)
}

export function available(player: Player): boolean {
  return !player.retired && player.injuryWeeks === 0 && player.suspension === 0
}

export function squadOf(world: World, club: { playerIds: PlayerId[] }): Player[] {
  const out: Player[] = []
  for (const id of club.playerIds) {
    const p = playerById(world, id)
    if (p && !p.retired) out.push(p)
  }
  return out
}

export interface Picked {
  xi: PlayerId[]
  bench: PlayerId[]
}

/**
 * The assistant's pick: slot by slot, the best available player for it,
 * with a youth-first manager nudging under-24s in. The bench is a keeper
 * and the best of the rest.
 */
export function autoPick(world: World, club: { playerIds: PlayerId[] }, formation: Formation, lean: YouthLean = 'results-first', ctx?: MatchContext): Picked {
  const pool = squadOf(world, club).filter(available)
  const taken = new Set<PlayerId>()
  const xi: PlayerId[] = []
  const bonus = (p: Player) => (lean === 'youth-first' && p.age < T.YOUTH_AGE ? T.YOUTH_LEAN_SELECTION_BONUS : 0)
  for (const slot of slotsOf(formation)) {
    let best: Player | null = null
    let bestScore = -Infinity
    for (const p of pool) {
      if (taken.has(p.id)) continue
      const score = effectiveRating(p, slot, ctx) + bonus(p)
      if (score > bestScore || (score === bestScore && best !== null && p.id < best.id)) {
        best = p
        bestScore = score
      }
    }
    if (!best) break
    taken.add(best.id)
    xi.push(best.id)
  }
  const rest = pool.filter((p) => !taken.has(p.id)).sort((a, b) => b.rating + bonus(b) - (a.rating + bonus(a)) || a.id - b.id)
  const bench: PlayerId[] = []
  const keeper = rest.find((p) => p.position === 'GK')
  if (keeper) bench.push(keeper.id)
  for (const p of rest) {
    if (bench.length >= T.BENCH_SIZE) break
    if (!bench.includes(p.id)) bench.push(p.id)
  }
  return { xi, bench }
}

/**
 * The human's picked XI, with unavailable or missing players replaced by the
 * assistant's choice for the slot. Returns the side and which slots changed.
 */
export function enforceSelection(world: World, club: { playerIds: PlayerId[] }, formation: Formation, xi: readonly PlayerId[], bench: readonly PlayerId[], ctx?: MatchContext): Picked & { changed: number[] } {
  const slots = slotsOf(formation)
  const pool = squadOf(world, club).filter(available)
  const ids = new Set(pool.map((p) => p.id))
  const out: PlayerId[] = []
  const changed: number[] = []
  const used = new Set<PlayerId>()
  slots.forEach((_, i) => {
    const id = xi[i]
    if (id !== undefined && ids.has(id) && !used.has(id)) {
      out.push(id)
      used.add(id)
    } else {
      out.push(-1)
      changed.push(i)
    }
  })
  for (const i of changed) {
    const slot = slots[i] as FormationSlot
    let best: Player | null = null
    let bestScore = -Infinity
    for (const p of pool) {
      if (used.has(p.id)) continue
      const score = effectiveRating(p, slot, ctx)
      if (score > bestScore) {
        best = p
        bestScore = score
      }
    }
    if (best) {
      out[i] = best.id
      used.add(best.id)
    }
  }
  const finalXi = out.filter((id) => id !== -1)
  const benchOut: PlayerId[] = []
  for (const id of bench) if (ids.has(id) && !used.has(id) && benchOut.length < T.BENCH_SIZE) benchOut.push(id)
  const spare = pool.filter((p) => !used.has(p.id) && !benchOut.includes(p.id)).sort((a, b) => b.rating - a.rating || a.id - b.id)
  if (!benchOut.some((id) => playerById(world, id)?.position === 'GK')) {
    const keeper = spare.find((p) => p.position === 'GK')
    if (keeper && benchOut.length < T.BENCH_SIZE) benchOut.push(keeper.id)
  }
  for (const p of spare) {
    if (benchOut.length >= T.BENCH_SIZE) break
    if (!benchOut.includes(p.id)) benchOut.push(p.id)
  }
  return { xi: finalXi, bench: benchOut, changed }
}

export interface XiBands {
  /** Mean effective rating of the eleven. */
  strength: number
  /** Sum of effective ratings in the band ÷ 100: a count weighted by quality. */
  defence: number
  midfield: number
  attack: number
  width: number
  defenceWidth: number
  /** Players carrying each trait in the XI, for the rules that count them. */
  pace: number
  aerial: number
  leaders: number
  /** Who a chance is between: the scorer-weighted mean of the outfield effective ratings, the keeper's, the back line's mean. */
  attackerEff: number
  keeperEff: number
  defenderEff: number
  /** Defenders in the shape, for the overload rule. */
  backLine: number
}

/** Read a picked XI in bands for the match model. */
export function xiBands(world: World, xi: readonly PlayerId[], formation: Formation, ctx?: MatchContext): XiBands {
  const slots = slotsOf(formation)
  const structure = structureOf(formation)
  let total = 0
  let defence = 0
  let midfield = 0
  let attack = 0
  let pace = 0
  let aerial = 0
  let leaders = 0
  let n = 0
  let attackerWeight = 0
  let attackerSum = 0
  let keeperEff: number | null = null
  let defenderSum = 0
  let defenders = 0
  slots.forEach((slot, i) => {
    const id = xi[i]
    const p = id === undefined ? null : playerById(world, id)
    if (!p) return
    const eff = effectiveRating(p, slot, ctx)
    total += eff
    n++
    if (slot.position === 'GK') keeperEff = eff
    if (slot.position === 'GK' || slot.position === 'D') defence += eff / 100
    else if (slot.position === 'M') midfield += eff / 100
    else attack += eff / 100
    if (slot.position === 'D') {
      defenderSum += eff
      defenders++
    }
    if (slot.position !== 'GK') {
      const w = scorerWeight(p)
      attackerWeight += w
      attackerSum += eff * w
    }
    if (hasTrait(p, 'pace')) pace++
    if (hasTrait(p, 'aerial')) aerial++
    if (hasTrait(p, 'leader')) leaders++
  })
  // Missing players (a short squad) count as nobody; no keeper is an outfielder in goal.
  const strength = n ? total / n : 0
  return {
    strength,
    defence,
    midfield,
    attack,
    width: structure.width,
    defenceWidth: structure.defenceWidth,
    pace,
    aerial,
    leaders,
    attackerEff: attackerWeight > 0 ? attackerSum / attackerWeight : strength,
    keeperEff: keeperEff ?? strength - T.NO_KEEPER_PENALTY,
    defenderEff: defenders ? defenderSum / defenders : strength - T.NO_KEEPER_PENALTY,
    backLine: structure.defence,
  }
}

/** Two effective ratings within this are a tie (floating-point noise from a penalty subtraction must not flip a pick, or anchoring oscillates). */
const TIE_EPSILON = 1e-6

/** The best XI mean in a formation: the anchoring number (DESIGN.md "club strength stays the master number"). */
export function bestXiMean(world: World, club: { playerIds: PlayerId[] }, formation: Formation): number {
  const pool = squadOf(world, club)
  const taken = new Set<PlayerId>()
  let total = 0
  let n = 0
  for (const slot of slotsOf(formation)) {
    let best: Player | null = null
    let bestRating = -Infinity
    for (const p of pool) {
      if (taken.has(p.id)) continue
      const r = p.rating - positionPenalty(p, slot)
      if (r > bestRating + TIE_EPSILON) {
        best = p
        bestRating = r
      }
    }
    if (!best) continue
    taken.add(best.id)
    total += bestRating
    n++
  }
  return n ? total / n : 0
}

/** The formation a club fields: its manager's, or what it played last. */
export function clubFormation(world: World, club: Club): Formation {
  const manager = club.managerId === null ? undefined : world.managers[club.managerId - 1]
  return manager && manager.id === club.managerId ? manager.preferredFormation : club.formation
}

export function clubById(world: World, id: ClubId): Club | undefined {
  const club = world.clubs[id - 1]
  return club && club.id === id ? club : world.clubs.find((c) => c.id === id)
}
