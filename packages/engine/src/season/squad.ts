import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp, gravityTarget, round1 } from '../world/gen.js'
import type { Club, Manager, Result, World } from '../types.js'

export function managerOf(world: World, club: Club): Manager | undefined {
  if (club.managerId === null) return undefined
  return world.managers.find((m) => m.id === club.managerId)
}

/** The transfer budget a club normally has for a summer, £m. */
export function normalBudget(club: Club): number {
  return round1(T.TRANSFER_BUDGET_PER_WEALTH_SQ * club.wealth * club.wealth)
}

export function updateMorale(club: Club, result: Result, motivation: number): void {
  const scale = 0.5 + motivation / 100
  const delta = result === 'W' ? T.MORALE_WIN * scale : result === 'L' ? T.MORALE_LOSS * (1.5 - motivation / 100) : 0
  club.squad.morale = round1(clamp(club.squad.morale + delta, 0, 100))
}

export function decayMorale(club: Club): void {
  club.squad.morale = round1(club.squad.morale + T.MORALE_DECAY * (T.MORALE_INITIAL - club.squad.morale))
}

export interface WindowSummary {
  clubId: number
  managerId: number | null
  spend: number
  gain: number
  /** Share of the first XI replaced. */
  turnover: number
  youth: number
}

/**
 * A transfer window for an AI club: spend the pot, take the diminishing
 * strength gain, churn the squad, and in summer promote academy players.
 */
export function runWindow(world: World, club: Club, summer: boolean, budgetMultiplier: number): WindowSummary {
  const manager = managerOf(world, club)
  const dealing = manager ? manager.ability.dealing : 50
  const development = manager ? manager.ability.development : 50
  const normal = normalBudget(club)
  const pot = summer ? normal * budgetMultiplier : normal * T.WINTER_BUDGET_SHARE
  const spend = round1(Math.max(0, pot * (summer ? T.AI_SPEND_FRACTION : 1)))
  const r = normal > 0 ? spend / normal : 0
  const gain = round1(((T.SPEND_GAIN_MAX * r) / (r + 1)) * (1 + (T.DEALING_EFFECT * (dealing - 50)) / 50))
  let turnover = summer ? T.TURNOVER_BASE + T.TURNOVER_PER_BUDGET * r : T.TURNOVER_PER_BUDGET * r
  turnover = clamp(turnover, 0, T.TURNOVER_MAX)

  let youth = 0
  if (summer) {
    youth = clamp(Math.floor((development - T.YOUTH_DEVELOPMENT_OFFSET) / T.YOUTH_DEVELOPMENT_STEP), 0, T.YOUTH_MAX_PER_SUMMER)
    club.squad.academyInXi = youth
    club.thisSeason.academyPromoted = youth
    club.pendingYouthGain = round1(club.pendingYouthGain + T.YOUTH_GAIN_PER_PLAYER * youth)
    if (T.ACADEMY_COUNTS_AS_SIGNING) turnover = clamp(turnover + youth / 11, 0, 1)
  }

  const oldAge = club.squad.avgAge
  const seniorShare = summer ? Math.max(0, turnover - youth / 11) : turnover
  club.squad.avgAge = round1(
    oldAge * (1 - turnover) + T.SIGNING_AGE * seniorShare + (summer ? (T.ACADEMY_AGE * youth) / 11 : 0),
  )
  club.squad.strength = round1(clamp(club.squad.strength + gain - T.YOUTH_COST_PER_PLAYER * youth, 1, 100))
  club.netSpendThisSeason = round1(club.netSpendThisSeason + spend)

  const summary: WindowSummary = {
    clubId: club.id,
    managerId: club.managerId,
    spend,
    gain,
    turnover: round1(turnover * 100) / 100,
    youth,
  }
  emit(world, 'squad.window', { ...summary, summer, season: world.season })
  return summary
}

export interface SummerSquadSummary {
  ageing: number
  gravity: number
  youthReleased: number
}

/** Summer squad drift before the window: release youth gains, age, gravitate. */
export function summerSquad(world: World, rng: Rng, club: Club): SummerSquadSummary {
  const youthReleased = club.pendingYouthGain
  club.pendingYouthGain = 0
  club.squad.avgAge = round1(club.squad.avgAge + T.AGE_DRIFT)
  let ageing = 0
  if (club.squad.avgAge > T.PEAK_AGE[1]) ageing = -rng.int(T.AGEING_LOSS[0], T.AGEING_LOSS[1])
  else if (club.squad.avgAge < T.PEAK_AGE[0]) ageing = T.YOUNG_SQUAD_GROWTH
  const gravity = round1(T.GRAVITY_RATE * (gravityTarget(club.wealth) - club.squad.strength))
  club.squad.strength = round1(clamp(club.squad.strength + youthReleased + ageing + gravity, 1, 100))
  club.squad.academyInXi = 0
  emit(world, 'squad.summer', { clubId: club.id, youthReleased, ageing, gravity, strength: club.squad.strength })
  return { ageing, gravity, youthReleased }
}
