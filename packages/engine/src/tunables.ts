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

// ---------------------------------------------------------------------------
// Calendar (DESIGN.md "Season and match": 38 or 46 league games, cups, two
// windows, ~40 weekly turns). Weeks are shared by every tier; a week can hold
// more than one match for a club.
// ---------------------------------------------------------------------------

/** Weeks in a season: MATCH_WEEKS of football then the summer. */
export const MATCH_WEEKS = 40
export const SUMMER_WEEKS = 6
export const SEASON_WEEKS = MATCH_WEEKS + SUMMER_WEEKS

/** "Monthly" rolls happen every this many weeks. */
export const MONTH_WEEKS = 4

/** League rounds per tier, index 0 = tier 1. DESIGN: 38 or 46. */
export const LEAGUE_ROUNDS_BY_TIER: readonly number[] = [38, 46, 46, 46, 46]

/** Season week of the winter window (played after that week's matches). */
export const WINTER_WINDOW_WEEK = 20

/** Season week of the summer window: the second summer week. */
export const SUMMER_WINDOW_WEEK = MATCH_WEEKS + 1

/** Season weeks each cup round is played in. Last entry is the final. */
export const NATIONAL_CUP_ROUND_WEEKS: readonly number[] = [3, 8, 13, 18, 23, 28, 35]
export const LEAGUE_CUP_ROUND_WEEKS: readonly number[] = [1, 6, 11, 16, 21, 26]
export const EUROPEAN_ROUND_WEEKS: readonly number[] = [5, 12, 19, 27, 33]

/** Tiers whose clubs enter the league cup. DESIGN: tiers 1–2. */
export const LEAGUE_CUP_TIERS: readonly number[] = [1, 2]

/** European places: top N of tier 1 plus the national cup winner. DESIGN: four. */
export const EUROPEAN_LEAGUE_PLACES = 4

/** Foreign entrants to the European competition, by league kind. Fills a 32-club bracket with the 5 home clubs. */
export const EUROPEAN_FOREIGN_ENTRANTS: Readonly<Record<'big' | 'mid' | 'small', number>> = {
  big: 12,
  mid: 9,
  small: 6,
}

/** Clubs promoted and relegated across each tier boundary. */
export const UP_DOWN_PER_BOUNDARY = 3

/** Size of the bottom zone: "bottom four" in crisis hires and survival tags. */
export const BOTTOM_ZONE = 4

// ---------------------------------------------------------------------------
// Match model (DESIGN.md "Season and match"). Drives result variance and so
// every credit-based target: median first spell, 30% inside a season.
// ---------------------------------------------------------------------------

/** Expected goals for two equal sides: home and away. */
export const GOALS_BASE_HOME = 1.5
export const GOALS_BASE_AWAY = 1.15

/** Expected goals scale by exp(± sensitivity × strength difference). */
export const GOAL_SENSITIVITY = 0.032

/** Strength points added to the home side. */
export const HOME_ADV = 0

/** Results kept for form. DESIGN: last six. */
export const FORM_WINDOW = 6

/** Strength swing from form: ±this at all wins / all losses over the window. */
export const FORM_WEIGHT = 3

/** Strength swing from the manager's tactical ability: ±this at 100 / 0. */
export const ABILITY_WEIGHT = 4

/** Strength swing from squad morale: ±this at 100 / 0. */
export const MORALE_WEIGHT = 3

/** Shape matchup: winner's expected goals × (1 + this), loser's × (1 − this). DESIGN: ±5%. */
export const TACTIC_RPS = 0.05

/** Mentality: attack scales both sides' expected goals up, defend down, by this. */
export const MENTALITY_VARIANCE = 0.2

/** AI picks attack when the opponent is weaker by this many points, defend when stronger. */
export const AI_MENTALITY_GAP = 12

/** Goals per side considered when summing outcome probabilities. */
export const MAX_GOALS = 10

/** Tactical ability assumed for a club with no manager or an abstract foreign side. */
export const CARETAKER_ABILITY = 40

/** Morale change per result, scaled by the manager's motivation. */
export const MORALE_WIN = 4
export const MORALE_LOSS = -5
/** Morale drifts back toward MORALE_INITIAL by this share each week. */
export const MORALE_DECAY = 0.1

/** Cup ties level after normal time go to a shoot-out; better side wins with base + this × strength gap share. */
export const SHOOTOUT_STRENGTH_EDGE = 0.2

// ---------------------------------------------------------------------------
// Squad (DESIGN.md "Squad"). Serves: ceiling resets (turnover), ownership
// and blame, and the long-tenure targets through strength maintenance.
// ---------------------------------------------------------------------------

/** Peak age band. Squads older than the top lose strength each summer. */
export const PEAK_AGE: readonly [number, number] = [25, 29]

/** Strength lost per summer by a squad past its peak, uniform. DESIGN: 3–5. */
export const AGEING_LOSS: readonly [number, number] = [3, 5]

/** Strength gained per summer by a squad younger than the peak band. */
export const YOUNG_SQUAD_GROWTH = 1

/** Mean age rises by this each summer before turnover. */
export const AGE_DRIFT = 1

/** Mean age of incoming signings; turnover pulls the squad toward it. */
export const SIGNING_AGE = 26

/** Mean age of promoted academy players. */
export const ACADEMY_AGE = 19

/** Share of the gap to the gravity target closed each summer. */
export const GRAVITY_RATE = 0.3

/** Transfer budget in £m per season = coefficient × wealth². Serves: earnings, big-spender ranks. */
export const TRANSFER_BUDGET_PER_WEALTH_SQ = 0.012

/** Spend returns: gain = SPEND_GAIN_MAX × r / (r + 1), r = spend / normal budget. Diminishing. */
export const SPEND_GAIN_MAX = 9

/** Dealing ability multiplies spend gain: 1 + this × (dealing − 50) / 50. */
export const DEALING_EFFECT = 0.3

/** AI spends this share of its summer budget. */
export const AI_SPEND_FRACTION = 1
/** The winter pot is this share of the normal budget. DESIGN: two windows. */
export const WINTER_BUDGET_SHARE = 0.3

/** First-XI turnover each summer = base + slope × (spend / normal budget), capped. */
export const TURNOVER_BASE = 0.15
export const TURNOVER_PER_BUDGET = 0.25
export const TURNOVER_MAX = 0.7

/** Academy players promoted into the XI = floor((development − offset) / step), clamped 0–max. */
export const YOUTH_DEVELOPMENT_OFFSET = 25
export const YOUTH_DEVELOPMENT_STEP = 12
export const YOUTH_MAX_PER_SUMMER = 5

/** Strength gained next season per academy player in the XI (slow, cheap). */
export const YOUTH_GAIN_PER_PLAYER = 0.6

/** Strength lost now per academy player replacing a senior (they are raw). */
export const YOUTH_COST_PER_PLAYER = 0.4

/** Age needed for a youth-promoted player to count as a signing for ownership. */
export const ACADEMY_COUNTS_AS_SIGNING = true

// ---------------------------------------------------------------------------
// Prestige and wealth drift (DESIGN.md: prestige "slow-moving").
// ---------------------------------------------------------------------------

/** Share of the gap to the finish-implied prestige closed each season. */
export const PRESTIGE_DRIFT_RATE = 0.15

/** Prestige added by a trophy that season. */
export const PRESTIGE_TROPHY_BONUS = 3

/** Wealth follows prestige: share of the gap closed each season. */
export const WEALTH_DRIFT_RATE = 0.2

// ---------------------------------------------------------------------------
// Abroad (abstract season for the foreign leagues).
// ---------------------------------------------------------------------------

/** Games credited to a manager for a season abroad (no match sim). */
export const FOREIGN_GAMES_PER_SEASON = 34

/** Noise (strength points) added when ranking a foreign league. */
export const FOREIGN_SEASON_NOISE_SD = 6

/** Foreign club strength drifts toward its league strength by this share per season. */
export const FOREIGN_GRAVITY_RATE = 0.3

/** Random strength shock per season for foreign clubs (sd). */
export const FOREIGN_STRENGTH_SHOCK_SD = 2

// ---------------------------------------------------------------------------
// Expectation (DESIGN.md "Expectation"). Serves: median first spell ≈ 1.5
// seasons and the 30% inside-a-season share, through the season-end delta.
// ---------------------------------------------------------------------------

/** Owner ambition lifts the target by up to this many places (ambition 1). */
export const EXPECT_AMBITION_PLACES = 3

/** After a missed target, the target eases one place toward the structural one. */
export const EXPECT_EASE_PER_MISS = 1

/** Interview promises. DESIGN: promotion +30% budget, +3 places; stability −10%, −2 places. */
export const PROMISE_EFFECTS: Readonly<Record<'top-half' | 'promotion' | 'stability', { budget: number; places: number }>> = {
  'top-half': { budget: 1, places: 0 },
  promotion: { budget: 1.3, places: -3 },
  stability: { budget: 0.9, places: 2 },
}

// ---------------------------------------------------------------------------
// Credit (DESIGN.md "Credit"). Serves: median first spell, 30% inside a
// season, 10% reach 20 seasons (ceiling and staleness).
// ---------------------------------------------------------------------------

export const CREDIT_ON_HIRE = 55
/** Crisis hire: bottom zone, just relegated, or predecessor sacked mid-season. */
export const CREDIT_CRISIS_BONUS = 15
/** Hire at an elite (top-six-prestige) club. */
export const CREDIT_ELITE_PENALTY = -10
/** Per match: Δ = K × (points − expected points). */
export const CREDIT_K = 2
/** Losses weighted × this. Credit erodes unless you overachieve; watch in validation. */
export const CREDIT_LOSS_WEIGHT = 1.5
/** From this consecutive defeat on, an extra penalty each. */
export const CREDIT_CONSEC_DEFEAT_FROM = 3
export const CREDIT_CONSEC_DEFEAT = -2
export const CREDIT_DERBY_DEFEAT = -4
export const CREDIT_CUP_EXIT_LOWER = -6
/** Beating a side in the top N of its division. */
export const CREDIT_BEAT_TOP = 2
export const CREDIT_TOP_SIDE_RANK = 3
/** Monthly: position worse than expectation by this many places or more. */
export const CREDIT_MONTH_GAP_PLACES = 4
export const CREDIT_MONTH_GAP = -3
/** Season end: (expectation − finish) × this, clamped ± the clamp. */
export const CREDIT_SEASON_PER_PLACE = 3
export const CREDIT_SEASON_CLAMP = 20
export const CREDIT_PROMOTION = 20
export const CREDIT_RELEGATION = -25
export const CREDIT_TROPHY = 15
/** Ceiling stays here for the first seasons, then falls per season (staleness). */
export const CREDIT_CEILING = 100
export const CEILING_FULL_SEASONS = 3
export const CEILING_STALENESS_PER_SEASON = 10
/** First-XI turnover in one summer that resets the ceiling. */
export const CEILING_RESET_TURNOVER = 0.5
/** Blame: for this many seasons, negative deltas × (base + share × ownership). */
export const BLAME_SEASONS = 2
export const BLAME_BASE = 0.5
export const BLAME_OWNERSHIP_SHARE = 0.5

// ---------------------------------------------------------------------------
// Sacking (DESIGN.md "Sacking"). Serves: unjust sackings ≈ 20–30%, median
// first spell.
// ---------------------------------------------------------------------------

export const SACK_THRESHOLD: Readonly<Record<'patient' | 'normal' | 'impatient', number>> = {
  patient: 15,
  normal: 25,
  impatient: 35,
}
/** Erratic owners: uniform in this range, re-rolled monthly. */
export const SACK_THRESHOLD_ERRATIC: readonly [number, number] = [10, 45]
/** Weekly roll while below threshold: base × (1 − perYear × years remaining), floored. */
export const SACK_ROLL_BASE = 0.1
export const SACK_ROLL_PER_YEAR = 0.2
export const SACK_ROLL_FLOOR = 0.03
/** Credit at or below this: sacked at once. */
export const CREDIT_INSTANT_SACK = 5
/** A sacking is "deserved" after this many consecutive weeks below threshold. */
export const DESERVED_WEEKS = 8
export const REP_SACKED_DESERVED = -8
export const REP_SACKED_UNJUST = -2

// ---------------------------------------------------------------------------
// Shocks (DESIGN.md "Shocks"). Serves: unjust sackings ≈ 20–30%.
// ---------------------------------------------------------------------------

/** Wealth below this counts as a low-wealth club. */
export const LOW_WEALTH = 30
export const TAKEOVER_P = 0.01
export const TAKEOVER_LOW_WEALTH_MULT = 3
/** New owner replaces the manager within this many months with this chance, whatever the results. */
export const TAKEOVER_REPLACE_P = 0.35
export const TAKEOVER_REPLACE_MONTHS = 6
export const CRISIS_P = 0.005
export const CRISIS_LOW_WEALTH_MULT = 3
export const CRISIS_BUDGET_CUT = 0.4
export const CRISIS_EXPECTATION_EASE = 3
/** Forced star sale: only at low-wealth clubs. */
export const STAR_SALE_P = 0.01
export const STAR_SALE_STRENGTH = -5
export const STAR_SALE_EXPECTATION_EASE = 1
/** Dressing-room fallout rolls once per losing run of this length. */
export const FALLOUT_TRIGGER_DEFEATS = 4
export const FALLOUT_P = 0.25
/** Back down: squad morale falls. Sell: ownership up, strength down, "difficult" progress. */
export const FALLOUT_MORALE_LOSS = 10
export const FALLOUT_STRENGTH_LOSS = 3
export const FALLOUT_OWNERSHIP_GAIN = 1 / 11
/** AI sells the player when its motivation ability is below this. */
export const AI_FALLOUT_SELL_BELOW_MOTIVATION = 50
/** Board rows: monthly roll while credit is within the margin above threshold. */
export const BOARD_ROW_P = 0.05
export const BOARD_ROW_MARGIN = 10
export const BOARD_ROW_CREDIT = -3

// ---------------------------------------------------------------------------
// Ways out (DESIGN.md "Ways out"). Serves: careers across three or four clubs.
// ---------------------------------------------------------------------------

/** Mutual consent is offered while credit sits in this window. */
export const MUTUAL_WINDOW: readonly [number, number] = [10, 25]
export const MUTUAL_PAYOUT_SHARE = 0.5
export const REP_MUTUAL = -4
/** AI accepts a mutual-consent offer with this chance each month it is offered. */
export const AI_MUTUAL_ACCEPT_P = 0.3
/** Resigning: reputation hit depends on credit at the split. */
export const RESIGN_CREDIT_SPLIT = 50
export const REP_RESIGN_HIGH = -1
export const REP_RESIGN_LOW = -5
/** AI resigns with this monthly chance while below threshold (jumping before the push). */
export const AI_RESIGN_P = 0.02
/** Contract expiry: renewed above this credit, otherwise released. */
export const EXPIRY_RENEW_CREDIT = 40
export const REP_RELEASED = -3
/** Years on a renewal. */
export const RENEW_YEARS = 2

// ---------------------------------------------------------------------------
// Reputation moves at season end (DESIGN.md "Reputation moves"). Serves:
// 40–50% never get a second job; median career 6–8 seasons.
// ---------------------------------------------------------------------------

export const REP_SEASON_PER_PLACE = 2
export const REP_SEASON_CLAMP = 8
export const REP_TROPHY = 6
/** Tier weights on the trophy reputation gain. */
export const REP_TROPHY_WEIGHT: Readonly<Record<string, number>> = {
  'league-1': 1,
  'league-2': 0.6,
  'league-3': 0.4,
  'league-4': 0.3,
  'league-5': 0.2,
  nationalCup: 0.8,
  leagueCup: 0.5,
  european: 1.2,
  'foreign-big': 0.9,
  'foreign-mid': 0.5,
  'foreign-small': 0.3,
}
export const REP_PROMOTION = 5
export const REP_RELEGATION = -6

// ---------------------------------------------------------------------------
// Contracts and pay (DESIGN.md "Job market": salary by tier × reputation).
// Serves: earnings scale in Legacy.
// ---------------------------------------------------------------------------

/** £m per season at reputation 50, index 0 = tier 1. */
export const SALARY_BASE_BY_TIER: readonly number[] = [3, 1, 0.4, 0.2, 0.08]
export const SALARY_BASE_ABROAD: Readonly<Record<'big' | 'mid' | 'small', number>> = { big: 3, mid: 1, small: 0.3 }
/** Salary = base × (SALARY_REP_FLOOR + reputation / 100). */
export const SALARY_REP_FLOOR = 0.5
/** Genesis incumbents: contract years left and seasons already served, uniform. */
export const GENESIS_CONTRACT_YEARS: readonly [number, number] = [1, 3]
export const GENESIS_TENURE_SEASONS: readonly [number, number] = [0, 4]
/** Ownership a genesis incumbent has built per season served. */
export const GENESIS_OWNERSHIP_PER_SEASON = 0.35

// ---------------------------------------------------------------------------
// Job market (DESIGN.md "Job market"). Serves: 40–50% never get a second
// job, median career 6–8 seasons across three or four clubs.
// ---------------------------------------------------------------------------

/** Weeks after a vacancy opens before the shortlist is drawn, then before the hire. */
export const VACANCY_SHORTLIST_DELAY_WEEKS = 1
export const VACANCY_HIRE_DELAY_WEEKS = 2
/** After this many weeks unfilled, the search widens by one band a week. */
export const VACANCY_WIDEN_AFTER_WEEKS = 3
/** Shortlist size, uniform. DESIGN: three to five. */
export const SHORTLIST_SIZE: readonly [number, number] = [3, 5]
/** Shortlist score weights: reputation, tag fit, agent quality, randomness. */
export const SHORTLIST_WEIGHTS = { reputation: 1, tagFit: 0.6, agent: 0.4, random: 0.5 } as const
/** Shortlist weight multipliers by age. Serves: careers end by 72, a handful past 1,000 games. */
export const AGE_PENALTY: readonly { from: number; mult: number }[] = [
  { from: 60, mult: 0.5 },
  { from: 67, mult: 0.2 },
]
/** A manager one band below the club's band qualifies with a wanted tag. */
export const TAG_BAND_BELOW = 1
/** AI applies to clubs at most this many bands below its own band ... */
export const AI_APPLY_BANDS_BELOW = 1
/** ... until this many months unemployed, after which it applies anywhere it qualifies. */
export const AI_APPLY_ANY_AFTER_MONTHS = 12
/** Most tags on a vacancy's want-list. */
export const WANT_TAGS_MAX = 2
/** Contract years offered, weights for 1, 2, 3, 4 years. DESIGN: one to four. */
export const CONTRACT_YEARS_WEIGHTS: readonly number[] = [0.15, 0.4, 0.3, 0.15]
/** Salary × (1 − factor × (years − 2)): longer contracts pay less per year. */
export const SALARY_PER_YEAR_FACTOR = 0.08
/** AI promises promotion when the structural target is this high or better (tiers 2–5). */
export const AI_PROMISE_PROMOTION_RANK = 4
/** Employed managers are approached only by clubs at least this much more prestigious. */
export const POACH_PRESTIGE_GAP = 10
/** Share of vacancies where the club calls one employed manager (the best fit) rather than only the unemployed. */
export const POACH_ATTEMPT_P = 0.25
export const AI_ACCEPT_APPROACH_P = 0.7
/** Declining an approach. DESIGN: credit +3, loyalty progress. */
export const DECLINE_APPROACH_CREDIT = 3
export const LOYALTY_PER_DECLINE = 1
export const REP_POACHED = 2
/** The new club pays the buy-out if it is under this share of its wage budget; otherwise the manager must walk out. */
export const BUYOUT_AFFORD_SHARE = 0.5
/** AI walks out (no buy-out) only for a club this much more prestigious, with this chance. */
export const WALKOUT_MIN_PRESTIGE_GAP = 20
export const AI_WALKOUT_P = 0.5
export const REP_WALKOUT = -3

// ---------------------------------------------------------------------------
// Unemployment and permadeath (DESIGN.md "Job market", "Permadeath").
// Serves: 40–50% never get a second job; careers end.
// ---------------------------------------------------------------------------

export const UNEMPLOYED_DECAY_AFTER_MONTHS = 3
export const UNEMPLOYED_DECAY = -1
/** Punditry halves the decay. */
export const PUNDITRY_DECAY_SHARE = 0.5
/** Stepping down to an assistant role: once, then decay stops. */
export const REP_STEP_DOWN = -5
/** £m per month. */
export const PUNDITRY_INCOME_PER_MONTH = 0.01
export const ASSISTANT_INCOME_PER_MONTH = 0.03
/** AI activity choices by months out of work and reputation. */
export const AI_PUNDITRY_AFTER_MONTHS = 6
export const AI_PUNDITRY_MIN_REP = 40
export const AI_ASSISTANT_AFTER_MONTHS = 12
export const AI_ASSISTANT_MAX_REP = 40
export const AI_ABROAD_AFTER_MONTHS = 9
export const AI_ABROAD_P = 0.3
/** Career ends after this many months without a shortlist. DESIGN: 24. */
export const NO_SHORTLIST_MONTHS = 24
/** Career ends at this age. DESIGN: 72. */
export const RETIRE_AGE = 72
/** Monthly chance of a career-ending scandal. */
export const SCANDAL_P = 0.0005
/** AI voluntary retirement from this age: base + per-year × (age − from), doubled when unemployed. */
export const AI_RETIRE_FROM = 60
export const AI_RETIRE_BASE_P = 0.05
export const AI_RETIRE_PER_YEAR = 0.03
export const AI_RETIRE_UNEMPLOYED_MULT = 2

// ---------------------------------------------------------------------------
// Tags (DESIGN.md "Tags"). Windows are seasons; expiry is seasons after the
// last qualifying season. Serves: typecasting, second-job rate.
// ---------------------------------------------------------------------------

export const TAG_RULES = {
  'promotion specialist': { count: 2, window: 5, expiry: 5 },
  'survival specialist': { count: 2, window: 5, expiry: 5 },
  'youth developer': { academyInXi: 4, expiry: 3 },
  'big spender': { rank: 3, seasons: 2, expiry: 2 },
  overachiever: { seasons: 3, places: 5, window: 6, expiry: 3 },
  'cup manager': { finals: 2, window: 4, expiry: 4 },
  loyal: { seasons: 6, expiry: 2 },
  'in demand': { expiry: 2 },
  mercenary: { walkouts: 2, expiry: 5 },
  difficult: { count: 2, window: 3, expiry: 3 },
  abroad: { expiry: 4 },
} as const

// ---------------------------------------------------------------------------
// Cohorts (DESIGN.md "~400 managers"). Serves: a steady flow of first-timers.
// ---------------------------------------------------------------------------

/** Each summer the population of non-retired managers is topped up to POPULATION. */
export const COHORT_TOP_UP = true
