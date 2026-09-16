/**
 * The abstract match model (DESIGN.md "Season and match"). Each side's
 * effective strength feeds an expected-goals figure; goals are Poisson. The
 * same distribution gives the win/draw/loss probabilities used for expected
 * points, so credit is judged against the odds the model itself produced.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { Mentality, Result, Shape } from '../types.js'

export interface Participant {
  id: number
  strength: number
  /** Manager's tactical ability, 0–100. */
  tactical: number
  form: readonly Result[]
  morale: number
  shape: Shape
  mentality: Mentality
}

export interface MatchOdds {
  pHome: number
  pDraw: number
  pAway: number
  lambdaHome: number
  lambdaAway: number
  /** Expected league points for each side (3 × win + draw). */
  expHome: number
  expAway: number
}

export interface MatchOutcome {
  homeGoals: number
  awayGoals: number
  /** Set for cup ties that were level and went to a shoot-out. */
  shootoutWinnerId?: number
  odds: MatchOdds
}

const BEATS: Record<Shape, Shape> = { A: 'B', B: 'C', C: 'A' }

export function formScore(form: readonly Result[]): number {
  if (form.length === 0) return 0
  let points = 0
  for (const r of form) points += r === 'W' ? 3 : r === 'D' ? 1 : 0
  return (points / (3 * form.length) - 0.5) * 2
}

export function effectiveStrength(p: Participant, home: boolean): number {
  return (
    p.strength +
    (home ? T.HOME_ADV : 0) +
    T.FORM_WEIGHT * formScore(p.form) +
    (T.ABILITY_WEIGHT * (p.tactical - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT +
    (T.MORALE_WEIGHT * (p.morale - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT
  )
}

function mentalityFactor(m: Mentality): number {
  return m === 'attack' ? 1 + T.MENTALITY_VARIANCE : m === 'defend' ? 1 - T.MENTALITY_VARIANCE : 1
}

export function poissonPmf(lambda: number, max: number): number[] {
  const pmf: number[] = []
  let p = Math.exp(-lambda)
  let total = 0
  for (let k = 0; k <= max; k++) {
    if (k > 0) p = (p * lambda) / k
    pmf.push(p)
    total += p
  }
  return pmf.map((x) => x / total)
}

export function matchOdds(home: Participant, away: Participant): MatchOdds {
  const diff = effectiveStrength(home, true) - effectiveStrength(away, false)
  let lambdaHome = T.GOALS_BASE_HOME * Math.exp(T.GOAL_SENSITIVITY * diff)
  let lambdaAway = T.GOALS_BASE_AWAY * Math.exp(-T.GOAL_SENSITIVITY * diff)
  if (BEATS[home.shape] === away.shape) {
    lambdaHome *= 1 + T.TACTIC_RPS
    lambdaAway *= 1 - T.TACTIC_RPS
  } else if (BEATS[away.shape] === home.shape) {
    lambdaHome *= 1 - T.TACTIC_RPS
    lambdaAway *= 1 + T.TACTIC_RPS
  }
  const variance = mentalityFactor(home.mentality) * mentalityFactor(away.mentality)
  lambdaHome *= variance
  lambdaAway *= variance
  const ph = poissonPmf(lambdaHome, T.MAX_GOALS)
  const pa = poissonPmf(lambdaAway, T.MAX_GOALS)
  let pHome = 0
  let pDraw = 0
  let pAway = 0
  for (let h = 0; h <= T.MAX_GOALS; h++) {
    for (let a = 0; a <= T.MAX_GOALS; a++) {
      const p = (ph[h] as number) * (pa[a] as number)
      if (h > a) pHome += p
      else if (h === a) pDraw += p
      else pAway += p
    }
  }
  return {
    pHome,
    pDraw,
    pAway,
    lambdaHome,
    lambdaAway,
    expHome: T.POINTS_WIN * pHome + T.POINTS_DRAW * pDraw,
    expAway: T.POINTS_WIN * pAway + T.POINTS_DRAW * pDraw,
  }
}

function samplePoisson(rng: Rng, lambda: number): number {
  const pmf = poissonPmf(lambda, T.MAX_GOALS)
  let r = rng.float()
  for (let k = 0; k <= T.MAX_GOALS; k++) {
    r -= pmf[k] as number
    if (r < 0) return k
  }
  return T.MAX_GOALS
}

/** Probability the home side wins a shoot-out, from the strength gap. */
export function shootoutHomeChance(home: Participant, away: Participant): number {
  const gap = (effectiveStrength(home, true) - effectiveStrength(away, false)) / 50
  const edge = Math.max(-1, Math.min(1, gap)) * T.SHOOTOUT_STRENGTH_EDGE
  return 0.5 + edge
}

export function playMatch(rng: Rng, home: Participant, away: Participant, knockout: boolean): MatchOutcome {
  const odds = matchOdds(home, away)
  const homeGoals = samplePoisson(rng, odds.lambdaHome)
  const awayGoals = samplePoisson(rng, odds.lambdaAway)
  const outcome: MatchOutcome = { homeGoals, awayGoals, odds }
  if (knockout && homeGoals === awayGoals) {
    outcome.shootoutWinnerId = rng.chance(shootoutHomeChance(home, away)) ? home.id : away.id
  }
  return outcome
}

/** Expected points in a knockout tie, where a level tie is settled by the shoot-out. */
export function knockoutExpected(odds: MatchOdds, home: Participant, away: Participant): { home: number; away: number } {
  const ph = shootoutHomeChance(home, away)
  return {
    home: T.POINTS_WIN * (odds.pHome + odds.pDraw * ph),
    away: T.POINTS_WIN * (odds.pAway + odds.pDraw * (1 - ph)),
  }
}
