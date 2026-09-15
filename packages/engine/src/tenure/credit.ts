import * as T from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import type { Spell } from '../types.js'

/** Blame: in the first seasons negative deltas are scaled by ownership of the squad. */
export function blameScale(spell: Spell): number {
  if (spell.seasonsCompleted >= T.BLAME_SEASONS) return 1
  return T.BLAME_BASE + T.BLAME_OWNERSHIP_SHARE * spell.ownership
}

/** Apply a credit delta with blame scaling and clamping. Returns the delta applied. */
export function addCredit(spell: Spell, delta: number): number {
  const scaled = delta < 0 ? delta * blameScale(spell) : delta
  const before = spell.credit
  spell.credit = round1(clamp(spell.credit + scaled, 0, spell.ceiling))
  return round1(spell.credit - before)
}

export interface MatchContext {
  points: number
  expected: number
  derby: boolean
  cupExitToLowerTier: boolean
  beatTopSide: boolean
}

/** Per-match credit: k × (points − expected), losses weighted, plus the DESIGN extras. */
export function matchCreditDelta(spell: Spell, ctx: MatchContext): number {
  const lost = ctx.points === 0
  let delta = T.CREDIT_K * (ctx.points - ctx.expected)
  if (lost) delta *= T.CREDIT_LOSS_WEIGHT
  if (lost) {
    spell.consecutiveDefeats++
    if (spell.consecutiveDefeats >= T.CREDIT_CONSEC_DEFEAT_FROM) delta += T.CREDIT_CONSEC_DEFEAT
    if (ctx.derby) delta += T.CREDIT_DERBY_DEFEAT
    if (ctx.cupExitToLowerTier) delta += T.CREDIT_CUP_EXIT_LOWER
  } else {
    spell.consecutiveDefeats = 0
    spell.falloutRolled = false
    if (ctx.points === 3 && ctx.beatTopSide) delta += T.CREDIT_BEAT_TOP
  }
  spell.season.games++
  spell.season.points += ctx.points
  return delta
}

/** Monthly: league position worse than expectation by the gap or more. */
export function monthlyGapDelta(spell: Spell, position: number): number {
  return position - spell.expectation >= T.CREDIT_MONTH_GAP_PLACES ? T.CREDIT_MONTH_GAP : 0
}

export interface SeasonContext {
  finish: number
  promoted: boolean
  relegated: boolean
  trophies: number
}

/** Season end: (expectation − finish) × 3 clamped, plus promotion, relegation and trophies. */
export function seasonEndDelta(spell: Spell, ctx: SeasonContext): number {
  let delta = clamp((spell.expectation - ctx.finish) * T.CREDIT_SEASON_PER_PLACE, -T.CREDIT_SEASON_CLAMP, T.CREDIT_SEASON_CLAMP)
  if (ctx.promoted) delta += T.CREDIT_PROMOTION
  if (ctx.relegated) delta += T.CREDIT_RELEGATION
  delta += T.CREDIT_TROPHY * ctx.trophies
  return delta
}

/** Ceiling at season end: full for the first seasons, then staleness, unless reset. */
export function advanceCeiling(spell: Spell, reset: boolean): void {
  spell.seasonsCompleted++
  if (reset) {
    spell.ceiling = T.CREDIT_CEILING
    return
  }
  if (spell.seasonsCompleted <= T.CEILING_FULL_SEASONS) spell.ceiling = T.CREDIT_CEILING
  else spell.ceiling = Math.max(0, spell.ceiling - T.CEILING_STALENESS_PER_SEASON)
  spell.credit = Math.min(spell.credit, spell.ceiling)
}

/** A big summer turnover resets the ceiling. */
export function resetCeilingForTurnover(spell: Spell, turnover: number): boolean {
  if (turnover >= T.CEILING_RESET_TURNOVER) {
    spell.ceiling = T.CREDIT_CEILING
    return true
  }
  return false
}
