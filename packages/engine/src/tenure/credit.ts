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
  const lost = ctx.points < T.POINTS_DRAW
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
    if (ctx.points >= T.POINTS_WIN && ctx.beatTopSide) delta += T.CREDIT_BEAT_TOP
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

/** The ceiling for the season about to be played, given seasons already completed. */
export function ceilingFor(seasonsCompleted: number): number {
  const stale = Math.max(0, seasonsCompleted + 1 - T.CEILING_FULL_SEASONS)
  return Math.max(0, T.CREDIT_CEILING - T.CEILING_STALENESS_PER_SEASON * stale)
}

/**
 * Ceiling at season end for the coming season: 100 through season three,
 * then 10 lower each season, unless a trophy or promotion reset it. The
 * credit clamp waits for the summer window, whose turnover may reset it.
 */
export function advanceCeiling(spell: Spell, reset: boolean): void {
  spell.seasonsCompleted++
  if (reset) {
    spell.ceiling = T.CREDIT_CEILING
    return
  }
  const decayed = Math.max(0, spell.ceiling - T.CEILING_STALENESS_PER_SEASON)
  spell.ceiling = spell.seasonsCompleted + 1 <= T.CEILING_FULL_SEASONS ? T.CREDIT_CEILING : Math.min(decayed, ceilingFor(spell.seasonsCompleted))
}

/** Apply the ceiling to credit once resets have had their chance. */
export function clampToCeiling(spell: Spell): void {
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
