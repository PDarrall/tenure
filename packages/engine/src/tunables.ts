/**
 * Every constant in the engine lives here. Each one carries a comment naming
 * the validation target (DESIGN.md, "Validation targets") it serves, or the
 * DESIGN.md rule it encodes. No magic numbers anywhere else.
 *
 * Validation targets are starting figures from memory, marked "to verify"
 * until a source is attached (see CLAUDE.md).
 */

/** Seed the `sim` CLI uses when none is given. Serves: reproducibility. */
export const DEFAULT_SEED = 1

// ---------------------------------------------------------------------------
// World (DESIGN.md "World"). These shape the pyramid every target is measured
// against; none is tied to a single validation line.
// ---------------------------------------------------------------------------

/** Clubs per tier, index 0 = tier 1. DESIGN: 20, then 24 in tiers 2–5. */
export const TIER_SIZES: readonly number[] = [20, 24, 24, 24, 24]

/** Prestige range drawn per tier (0–100, slow-moving). Overlaps so yo-yo clubs exist. */
export const PRESTIGE_BY_TIER: readonly (readonly [number, number])[] = [
  [45, 95],
  [30, 62],
  [20, 46],
  [10, 34],
  [3, 20],
]

/** Wealth = prestige + normal(0, sd), clamped 0–100. Rich small clubs and poor big ones both exist. */
export const WEALTH_NOISE_SD = 10

/** Owner type mix. Serves: unjust sackings ≈ 20–30% (impatient and erratic owners sack unjustly). */
export const OWNER_TYPE_WEIGHTS: Readonly<Record<'patient' | 'normal' | 'impatient' | 'erratic', number>> = {
  patient: 0.25,
  normal: 0.45,
  impatient: 0.2,
  erratic: 0.1,
}

/** Owner ambition drawn uniformly in this range (0–1). Serves: expectation spread. */
export const AMBITION_RANGE: readonly [number, number] = [0.2, 1]

/** Fan patience drawn uniformly (0–100). Held on the club for later phases. */
export const FAN_PATIENCE_RANGE: readonly [number, number] = [30, 80]

/** Squad strength target set by wealth: target = intercept + slope × wealth ("gravity"). */
export const GRAVITY_INTERCEPT = 5
export const GRAVITY_SLOPE = 0.9

/** Initial strength = gravity target + normal(0, sd). Serves: season-one surprises. */
export const STRENGTH_INITIAL_NOISE_SD = 6

/** First-XI mean age at genesis, uniform. DESIGN: peak 25–29. */
export const SQUAD_AGE_INITIAL_RANGE: readonly [number, number] = [24, 30]

/** Squad size at genesis, uniform. */
export const SQUAD_SIZE_RANGE: readonly [number, number] = [22, 28]

/** Morale at genesis (0–100). */
export const MORALE_INITIAL = 50

/** Wage budget in £m per season = coefficient × wealth². Serves: earnings scale. */
export const WAGE_BUDGET_PER_WEALTH_SQ = 0.02

/** Number of regions towns are spread over; rivals are drawn within a region. */
export const REGIONS = 12

/** Rivals per club, at most. Serves: derby defeat −4 frequency. */
export const RIVALS_PER_CLUB = 2

/** Share of clubs named after their town alone (no "United", "Town" suffix). */
export const CLUB_PLAIN_NAME_SHARE = 0.5

/** Share of foreign clubs carrying a prefix ("Real", "FC"). */
export const FOREIGN_PREFIX_SHARE = 0.5

/** Abroad: three abstracted leagues, a job market and European opposition. */
export const FOREIGN_LEAGUES: readonly {
  kind: 'big' | 'mid' | 'small'
  clubs: number
  prestige: number
  strength: number
}[] = [
  { kind: 'big', clubs: 20, prestige: 90, strength: 78 },
  { kind: 'mid', clubs: 18, prestige: 60, strength: 58 },
  { kind: 'small', clubs: 16, prestige: 30, strength: 40 },
]

/** Foreign club prestige and strength spread around the league figure. */
export const FOREIGN_CLUB_NOISE_SD = 8

/** Id offset for foreign clubs so ids never collide with home clubs. */
export const FOREIGN_CLUB_ID_BASE = 1000
