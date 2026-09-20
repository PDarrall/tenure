/**
 * The fast path as the season reads it (DESIGN.md "Match"): a participant is
 * a side before kick-off; odds come from the calibrated table; a match nobody
 * watches is one scoreline drawn from those odds. The same distribution gives
 * the win/draw/loss probabilities used for expected points, so credit is
 * judged against the odds the model itself produced.
 */
import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { XiBands } from '../players/select.js'
import { drawMatchDays, sideRating, type SideView } from '../match/model.js'
import { fastOdds, sampleScoreline } from '../match/fastpath.js'

export interface Participant extends SideView {
  id: number
}

export interface MatchOdds {
  pHome: number
  pDraw: number
  pAway: number
  lambdaHome: number
  lambdaAway: number
  /** The pre-match pressure lean, home perspective, for the opposition report. */
  lean: number
  /** Expected league points for each side (3 × win + draw). */
  expHome: number
  expAway: number
  /** The scoreline distribution the numbers above are summed from. */
  pmf: number[][]
}

export interface MatchOutcome {
  homeGoals: number
  awayGoals: number
  /** Set for cup ties that were level and went to a shoot-out. */
  shootoutWinnerId?: number
  odds: MatchOdds
}

export { formScore, sideRating } from '../match/model.js'
export { poissonPmf } from '../match/fastpath.js'

/** The side's rating on the day; kept under its old name for the tenure model. */
export function effectiveStrength(p: Participant): number {
  return sideRating(p)
}

export function matchOdds(home: Participant, away: Participant, neutral = false): MatchOdds {
  const o = fastOdds(home, away, undefined, neutral)
  return {
    pHome: o.pHome,
    pDraw: o.pDraw,
    pAway: o.pAway,
    lambdaHome: o.lambdaHome,
    lambdaAway: o.lambdaAway,
    lean: o.lean,
    expHome: T.POINTS_WIN * o.pHome + T.POINTS_DRAW * o.pDraw,
    expAway: T.POINTS_WIN * o.pAway + T.POINTS_DRAW * o.pDraw,
    pmf: o.pmf,
  }
}

export function shootoutHomeChance(home: Participant, away: Participant): number {
  const gap = (sideRating(home) - sideRating(away)) / 50
  const edge = Math.max(-1, Math.min(1, gap)) * T.SHOOTOUT_STRENGTH_EDGE
  return 0.5 + edge
}

export interface PlayOptions {
  /** A neutral ground: no home lean. */
  neutral?: boolean
  /** The first leg's score carried into a second leg, from the home side's view; a knockout is level on aggregate. */
  aggregate?: { home: number; away: number } | null
  /** A cup tie: the day's draw is wider and the underdog is lifted (DESIGN.md "Match": mismatch and upsets). */
  cup?: boolean
}

export function playMatch(rng: Rng, home: Participant, away: Participant, knockout: boolean, options: PlayOptions = {}): MatchOutcome {
  // The odds the manager saw, before the night: the day is variance he cannot read.
  const odds = matchOdds(home, away, options.neutral === true)
  const days = drawMatchDays(rng, home, away, options.cup === true)
  const played = matchOdds({ ...home, ...days.home }, { ...away, ...days.away }, options.neutral === true)
  const { homeGoals, awayGoals } = sampleScoreline(rng.float(), played.pmf)
  const outcome: MatchOutcome = { homeGoals, awayGoals, odds }
  const agg = options.aggregate ?? { home: 0, away: 0 }
  if (knockout && homeGoals + agg.home === awayGoals + agg.away) {
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
    attackerEff: strength,
    keeperEff: strength,
    defenderEff: strength,
    backLine: formation.defence,
  }
}
