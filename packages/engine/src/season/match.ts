/**
 * The one-shot match model (DESIGN.md "Formations and tactics", until the
 * minute engine in phase 3c). Each side's effective XI feeds an expected-goals
 * figure; structure (bands and width), mentality, style and home advantage
 * lean it; goals are Poisson. The same distribution gives the win/draw/loss
 * probabilities used for expected points, so credit is judged against the
 * odds the model itself produced.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { Mentality, Result, Style } from '../types.js'
import type { XiBands } from '../players/select.js'

export interface Participant {
  id: number
  /** Mean effective rating of the XI. */
  strength: number
  /** Manager's tactical ability, 0–100. */
  tactical: number
  form: readonly Result[]
  /** Team morale, 0–100 (the XI's mean). */
  morale: number
  mentality: Mentality
  style: Style
  bands: XiBands
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

export function formScore(form: readonly Result[]): number {
  if (form.length === 0) return 0
  let points = 0
  for (const r of form) points += r === 'W' ? 3 : r === 'D' ? 1 : 0
  return (points / (3 * form.length) - 0.5) * 2
}

export function effectiveStrength(p: Participant): number {
  return (
    p.strength +
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

/** Structural lean of `us` over `them` on our expected goals: the midfield, our attack against their defence, width, their overload. */
function structureFactor(us: Participant, them: Participant): number {
  const midEdge = us.bands.midfield - them.bands.midfield
  let f = 1 + T.MID_EDGE_K * midEdge
  const ratio = them.bands.defence > 0 ? us.bands.attack / them.bands.defence : T.ATTACK_DEFENCE_STANDARD
  f *= 1 + T.ATTACK_DEFENCE_K * (ratio - T.ATTACK_DEFENCE_STANDARD)
  if (them.bands.defenceWidth < T.NARROW_DEFENCE_WIDTH && us.bands.width >= 4) f *= 1 + T.WIDTH_EDGE
  const overload = Math.max(0, Math.round(them.bands.defence / Math.max(0.01, them.bands.strength / 100)) - 1 - 4)
  if (overload > 0) f *= 1 - T.OVERLOAD_K * overload
  return Math.max(0.5, f)
}

/** Style, one rule each (DESIGN.md "Formations and tactics"): returns multipliers on our goals and on theirs. */
export function styleFactors(us: Participant, them: Participant): { own: number; concede: number; variance: number } {
  const e = T.STYLE_EFFECTS
  switch (us.style) {
    case 'possession':
      return { own: us.strength > them.strength ? 1 + e.possession.betterXi : 1, concede: 1, variance: e.possession.variance }
    case 'direct':
      return { own: 1 + e.direct.perTrait * (us.bands.pace + us.bands.aerial), concede: e.direct.concede, variance: 1 }
    case 'counter':
      return { own: (them.mentality === 'attack' ? e.counter.vsAttack : 1) * e.counter.own, concede: e.counter.concede, variance: 1 }
    case 'pressing':
      return { own: e.pressing.own, concede: e.pressing.concede, variance: 1 }
  }
}

export function matchOdds(home: Participant, away: Participant): MatchOdds {
  const diff = effectiveStrength(home) - effectiveStrength(away)
  // Home advantage is the only asymmetry between the sides before strength is read.
  let lambdaHome = (T.GOALS_BASE + T.HOME_ADVANTAGE_GOALS) * Math.exp(T.GOAL_SENSITIVITY * diff)
  let lambdaAway = T.GOALS_BASE * Math.exp(-T.GOAL_SENSITIVITY * diff)
  lambdaHome *= structureFactor(home, away)
  lambdaAway *= structureFactor(away, home)
  const sh = styleFactors(home, away)
  const sa = styleFactors(away, home)
  lambdaHome *= sh.own * sa.concede
  lambdaAway *= sa.own * sh.concede
  const variance = mentalityFactor(home.mentality) * mentalityFactor(away.mentality) * sh.variance * sa.variance
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
  const gap = (effectiveStrength(home) - effectiveStrength(away)) / 50
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

/** A plain participant for tests and the abstract sides: eleven equal players in a 4-4-2. */
export function plainBands(strength: number, formation: { defence: number; midfield: number; attack: number; width: number; defenceWidth: number } = { defence: 4, midfield: 4, attack: 2, width: 4, defenceWidth: 2 }): XiBands {
  const s = strength / 100
  return {
    strength,
    defence: (formation.defence + 1) * s,
    midfield: formation.midfield * s,
    attack: formation.attack * s,
    width: formation.width,
    defenceWidth: formation.defenceWidth,
    pace: 0,
    aerial: 0,
    leaders: 0,
  }
}
