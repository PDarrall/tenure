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

// ---------------------------------------------------------------------------
// Managers (DESIGN.md "Managers", "Reputation → employability band")
// ---------------------------------------------------------------------------

/** Population size, topped up each summer. Serves: every career target. */
export const POPULATION = 400

/** Starting age for new entrants, inclusive. DESIGN: 33–38. */
export const START_AGE_RANGE: readonly [number, number] = [33, 38]

/** Age range of genesis incumbents, who have been around a while. */
export const INCUMBENT_AGE_RANGE: readonly [number, number] = [36, 60]

/**
 * Reputation of new entrants (genesis unemployed and later cohorts), uniform.
 * Sits in the non-league and tier-4 bands so first jobs are small.
 * Serves: median first spell ≈ 1.5 seasons; 40–50% never get a second job.
 */
export const ENTRY_REPUTATION_RANGE: readonly [number, number] = [8, 32]

/** Genesis incumbents' reputation by tier, index 0 = tier 1. Matches the bands. */
export const INCUMBENT_REPUTATION_BY_TIER: readonly (readonly [number, number])[] = [
  [72, 92],
  [58, 78],
  [40, 62],
  [22, 44],
  [6, 26],
]

/** Genesis incumbents abroad, reputation by league kind. */
export const INCUMBENT_REPUTATION_ABROAD: Readonly<Record<'big' | 'mid' | 'small', readonly [number, number]>> = {
  big: [72, 92],
  mid: [50, 72],
  small: [10, 40],
}

/** Base ability range, uniform per component (0–100). */
export const ABILITY_RANGE: readonly [number, number] = [30, 70]

/** Incumbents at higher tiers are a little better: + (5 − tier) × this. */
export const INCUMBENT_ABILITY_PER_TIER = 3

/** Agent quality (0–100), uniform. Serves: shortlist randomness. */
export const AGENT_RANGE: readonly [number, number] = [20, 90]

/** Trust in the manager at genesis (0–100) before background offsets. */
export const TRUST_BASE = 50

/**
 * Background offsets. DESIGN: ex-pro = high player trust, low board trust;
 * coach = tactically strong, no name; analyst = dealing/development, no
 * player trust. "No name" is a reputation offset.
 */
export const BACKGROUND_OFFSETS: Readonly<
  Record<
    'ex-pro' | 'coach' | 'analyst',
    { reputation: number; playersTrust: number; boardTrust: number; tactical: number; development: number; dealing: number }
  >
> = {
  'ex-pro': { reputation: 6, playersTrust: 25, boardTrust: -15, tactical: 0, development: 0, dealing: 0 },
  coach: { reputation: -6, playersTrust: 0, boardTrust: 0, tactical: 15, development: 0, dealing: 0 },
  analyst: { reputation: 0, playersTrust: -20, boardTrust: 5, tactical: 0, development: 15, dealing: 15 },
}

/** Background mix for new entrants. */
export const BACKGROUND_WEIGHTS: Readonly<Record<'ex-pro' | 'coach' | 'analyst', number>> = {
  'ex-pro': 0.5,
  coach: 0.35,
  analyst: 0.15,
}

/** Share of managers in the home pyramid (and its unemployed pool) who are home nationals. */
export const HOME_NATIONAL_SHARE = 0.85

/** Share of managers at a foreign club who are nationals of that league. */
export const FOREIGN_NATIONAL_SHARE = 0.8

/**
 * Reputation → employability bands. DESIGN: 0–20 non-league / minor abroad ·
 * 20–40 tier 4 · 40–60 tier 3 · 60–75 tier 2 · 75–90 tier 1 · 90+ elite.
 * `tiers` are the home tiers the band covers; `foreign` the leagues abroad.
 * Serves: 40–50% never get a second job (typecasting by band).
 */
export const REPUTATION_BANDS: readonly {
  min: number
  tiers: readonly (1 | 2 | 3 | 4 | 5)[]
  foreign: readonly ('big' | 'mid' | 'small')[]
  elite: boolean
}[] = [
  { min: 0, tiers: [5], foreign: ['small'], elite: false },
  { min: 20, tiers: [4], foreign: [], elite: false },
  { min: 40, tiers: [3], foreign: [], elite: false },
  { min: 60, tiers: [2], foreign: ['mid'], elite: false },
  { min: 75, tiers: [1], foreign: [], elite: false },
  { min: 90, tiers: [1], foreign: ['big'], elite: true },
]

/** Tier-1 clubs ranked in the top N by prestige are "elite" (90+ band, −10 credit on hire). */
export const ELITE_PRESTIGE_RANK = 6
