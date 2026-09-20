import type { CupRoundSpec } from './types.js'

/**
 * Every constant in the engine lives here. Each one carries a comment naming
 * the validation target (DESIGN.md, "Validation targets") it serves, or the
 * DESIGN.md rule it encodes. No magic numbers anywhere else.
 *
 * Validation targets are starting figures from memory, marked "to verify"
 * until a source is attached (see CLAUDE.md).
 */

/**
 * The one table. Systems read `T.NAME`; the CLI may override entries for
 * tuning runs through applyOverrides() before a world is created.
 */
export const T = {

  /** Seed the `sim` CLI uses when none is given. Serves: reproducibility. */
  DEFAULT_SEED: 1,

  // ---------------------------------------------------------------------------
  // World (DESIGN.md "World"). These shape the pyramid every target is measured
  // against; none is tied to a single validation line.
  // ---------------------------------------------------------------------------

  /** Clubs per tier, index 0 = tier 1. DESIGN: 20, then 24 in tiers 2–5. */
  TIER_SIZES: [20, 24, 24, 24, 24] as readonly number[],

  /** Prestige range drawn per tier (0–100, slow-moving). Overlaps so yo-yo clubs exist. */
  PRESTIGE_BY_TIER: [
    [45, 95],
    [30, 62],
    [20, 46],
    [10, 34],
    [3, 20],
  ] as readonly (readonly [number, number])[],

  /** Wealth = prestige + normal(0, sd), clamped 0–100. Rich small clubs and poor big ones both exist. */
  WEALTH_NOISE_SD: 10,

  /** Owner type mix. Serves: unjust sackings ≈ 20–30% (impatient and erratic owners sack unjustly). */
  OWNER_TYPE_WEIGHTS: {
    patient: 0.3,
    normal: 0.45,
    impatient: 0.2,
    erratic: 0.05,
  } as Readonly<Record<'patient' | 'normal' | 'impatient' | 'erratic', number>>,

  /** Owner ambition drawn uniformly in this range (0–1). Serves: expectation spread. */
  AMBITION_RANGE: [0.2, 1] as readonly [number, number],

  /** Fan patience drawn uniformly (0–100). Held on the club for later phases. */
  FAN_PATIENCE_RANGE: [30, 80] as readonly [number, number],

  /** Squad strength target set by wealth: target = intercept + slope × wealth ("gravity"). With the summer spend the equilibrium sits about 8 above it, so the top of tier 1 spreads out instead of piling at 100. Serves: 2–4 long top-tier tenures. */
  GRAVITY_INTERCEPT: 0,
  GRAVITY_SLOPE: 0.85,

  /** Initial strength = gravity target + normal(0, sd). Serves: season-one surprises. */
  STRENGTH_INITIAL_NOISE_SD: 6,

  /** First-XI mean age at genesis, uniform. DESIGN: peak 25–29. */
  SQUAD_AGE_INITIAL_RANGE: [24, 30] as readonly [number, number],

  /** Squad size at genesis, uniform. */
  SQUAD_SIZE_RANGE: [22, 28] as readonly [number, number],

  /** Morale at genesis (0–100). */
  MORALE_INITIAL: 50,

  /** Wage budget in £m per season = coefficient × wealth². Serves: earnings scale. */
  WAGE_BUDGET_PER_WEALTH_SQ: 0.02,

  /** Number of regions towns are spread over; rivals are drawn within a region. */
  REGIONS: 12,

  /** Rivals per club, at most. Serves: derby defeat −4 frequency. */
  RIVALS_PER_CLUB: 2,

  /** Share of clubs named after their town alone (no "United", "Town" suffix). */
  CLUB_PLAIN_NAME_SHARE: 0.5,

  // ---------------------------------------------------------------------------
  // European opponents (DESIGN.md "World"): foreign sides generated for each
  // competition and stage. Serves: the Champions Cup comes home about one
  // year in five, and rarely from outside the top three of tier 1.
  // ---------------------------------------------------------------------------

  /** Strength of a generated opponent by competition and stage (mean, sd), drawn afresh before each stage so the later rounds are harder whoever survives. */
  EUROPE_OPPONENT_STRENGTH: {
    championsCup: { group: { mean: 94, sd: 4 }, quarter: { mean: 96, sd: 3 }, semi: { mean: 98, sd: 3 }, final: { mean: 99, sd: 2 } },
    europaCup: { group: { mean: 86, sd: 4 }, quarter: { mean: 89, sd: 3 }, semi: { mean: 91, sd: 3 }, final: { mean: 93, sd: 2 } },
    conferenceCup: { group: { mean: 80, sd: 4 }, quarter: { mean: 84, sd: 3 }, semi: { mean: 87, sd: 3 }, final: { mean: 89, sd: 2 } },
  } as Readonly<Record<'championsCup' | 'europaCup' | 'conferenceCup', Readonly<Record<'group' | 'quarter' | 'semi' | 'final', { mean: number; sd: number }>>>>,
  /** Share of generated opponents carrying a prefix ("Real", "FC"), and the share of their squads from their own name pool. */
  EUROPEAN_OPPONENT_PREFIX_SHARE: 0.5,
  EUROPEAN_OPPONENT_NATIONAL_SHARE: 0.8,
  /** Id offset for generated opponents so ids never collide with home clubs. */
  EUROPEAN_OPPONENT_ID_BASE: 1000,

  // ---------------------------------------------------------------------------
  // Managers (DESIGN.md "Managers", "Reputation → employability band")
  // ---------------------------------------------------------------------------

  /**
   * Population size, topped up each summer. DESIGN's "~400 managers" was
   * written for 170 posts, 54 of them abroad. With the foreign leagues gone
   * (v0.6) the same managers-per-post ratio would be 280 for 116 posts, but
   * the abroad posts were also the safe long spells that kept careers going,
   * so the supply is trimmed to 260 (with AI_REST_MONTHS_AFTER_EXIT 6) to put
   * second jobs and career length back in range on the validation seed.
   * Serves: every career target, above all 40–50% never getting a second job
   * and a median career of 6–8 seasons.
   */
  POPULATION: 260,

  /** Starting age for new entrants, inclusive. DESIGN: 33–38. */
  START_AGE_RANGE: [33, 38] as readonly [number, number],

  /** Age range of genesis incumbents, who have been around a while. */
  INCUMBENT_AGE_RANGE: [36, 60] as readonly [number, number],

  /**
   * Reputation of new entrants (genesis unemployed and later cohorts), uniform.
   * Sits in the non-league and tier-4 bands so first jobs are small.
   * Serves: median first spell ≈ 1.5 seasons; 40–50% never get a second job.
   */
  ENTRY_REPUTATION_RANGE: [8, 32] as readonly [number, number],

  /** Genesis incumbents' reputation by tier, index 0 = tier 1. Matches the bands. */
  INCUMBENT_REPUTATION_BY_TIER: [
    [72, 92],
    [58, 78],
    [40, 62],
    [22, 44],
    [6, 26],
  ] as readonly (readonly [number, number])[],

  /** Base ability range, uniform per component (0–100). */
  ABILITY_RANGE: [30, 70] as readonly [number, number],

  /** Incumbents at higher tiers are a little better: + (5 − tier) × this. */
  INCUMBENT_ABILITY_PER_TIER: 3,

  /** Agent quality (0–100), uniform. Serves: shortlist randomness. */
  AGENT_RANGE: [20, 90] as readonly [number, number],

  /** Trust in the manager at genesis (0–100) before background offsets. */
  TRUST_BASE: 50,

  /**
   * Background offsets. DESIGN: ex-pro = high player trust, low board trust;
   * coach = tactically strong, no name; analyst = dealing/development, no
   * player trust. "No name" is a reputation offset.
   */
  BACKGROUND_OFFSETS: {
    'ex-pro': { reputation: 6, playersTrust: 25, boardTrust: -15, tactical: 0, development: 0, dealing: 0 },
    coach: { reputation: -6, playersTrust: 0, boardTrust: 0, tactical: 15, development: 0, dealing: 0 },
    analyst: { reputation: 0, playersTrust: -20, boardTrust: 5, tactical: 0, development: 15, dealing: 15 },
  } as Readonly<
    Record<
      'ex-pro' | 'coach' | 'analyst',
      { reputation: number; playersTrust: number; boardTrust: number; tactical: number; development: number; dealing: number }
    >
  >,

  /** Background mix for new entrants. */
  BACKGROUND_WEIGHTS: {
    'ex-pro': 0.5,
    coach: 0.35,
    analyst: 0.15,
  } as Readonly<Record<'ex-pro' | 'coach' | 'analyst', number>>,

  /** Share of managers in the home pyramid (and its unemployed pool) who are home nationals. */
  HOME_NATIONAL_SHARE: 0.85,


  /**
   * Reputation → employability bands. DESIGN: 0–20 non-league ·
   * 20–40 tier 4 · 40–60 tier 3 · 60–75 tier 2 · 75–90 tier 1 · 90+ elite.
   * `tiers` are the tiers the band covers.
   * Serves: 40–50% never get a second job (typecasting by band).
   */
  REPUTATION_BANDS: [
    { min: 0, tiers: [5], elite: false },
    { min: 20, tiers: [4], elite: false },
    { min: 40, tiers: [3], elite: false },
    { min: 60, tiers: [2], elite: false },
    { min: 75, tiers: [1], elite: false },
    { min: 90, tiers: [1], elite: true },
  ] as readonly {
    min: number
    tiers: readonly (1 | 2 | 3 | 4 | 5)[]
    elite: boolean
  }[],

  /** Tier-1 clubs ranked in the top N by prestige are "elite" (90+ band, −10 credit on hire). */
  ELITE_PRESTIGE_RANK: 6,

  // ---------------------------------------------------------------------------
  // Calendar (DESIGN.md "World", "Turn structure"): 52 weeks, 41 of season
  // and 11 of summer; two slots a week, the weekend and the midweek; the
  // League Cup and Europe midweek, the Cup on its weekends. Serves: every
  // fixture scheduled, no club more than twice in a week (tested).
  // ---------------------------------------------------------------------------

  /** Weeks in a season: MATCH_WEEKS of football then the summer. */
  MATCH_WEEKS: 41,
  SUMMER_WEEKS: 11,
  get SEASON_WEEKS(): number {
    return this.MATCH_WEEKS + this.SUMMER_WEEKS
  },

  /** "Monthly" rolls happen every this many weeks. */
  MONTH_WEEKS: 4,

  /** League rounds per tier, index 0 = tier 1. DESIGN: 38 or 46. */
  LEAGUE_ROUNDS_BY_TIER: [38, 46, 46, 46, 46] as readonly number[],
  /** Weekends a tier's league sits out (tier 1: 38 rounds in 41 weeks); index 0 = tier 1. */
  LEAGUE_IDLE_WEEKS_BY_TIER: [[16, 33, 37], [], [], [], []] as readonly (readonly number[])[],
  /** Weeks a tier plays two league rounds, weekend and midweek (tiers 2–5: 46 in 41), chosen clear of every cup round. */
  LEAGUE_DOUBLE_WEEKS_BY_TIER: [[], [10, 18, 24, 36, 39], [10, 18, 24, 36, 39], [10, 18, 24, 36, 39], [10, 18, 24, 36, 39]] as readonly (readonly number[])[],

  /** The Cup (FA Cup format): weekends; tiers 4–5 in round one, tier 3 in two, tiers 1–2 in three; the fourth round pares the field to 32 on a midweek; the semi-finals and the final on neutral ground. */
  THE_CUP_ROUNDS: [
    { week: 3, slot: 0, entrants: [4, 5] },
    { week: 7, slot: 0, entrants: [3] },
    { week: 11, slot: 0, entrants: [1, 2] },
    { week: 15, slot: 1, entrants: [] },
    { week: 19, slot: 0, entrants: [] },
    { week: 23, slot: 0, entrants: [] },
    { week: 27, slot: 0, entrants: [] },
    { week: 32, slot: 0, entrants: [], neutral: true },
    { week: 40, slot: 0, entrants: [], neutral: true },
  ] as readonly CupRoundSpec[],
  /** The League Cup (EFL Cup format): midweeks; tiers 2–4 in round one, tier 1 in two, tier-1 clubs in Europe in three; two-leg semi-finals; a final. */
  LEAGUE_CUP_ROUNDS: [
    { week: 1, slot: 1, entrants: [2, 3, 4] },
    { week: 5, slot: 1, entrants: [1] },
    { week: 9, slot: 1, entrants: ['europe'] },
    { week: 13, slot: 1, entrants: [] },
    { week: 17, slot: 1, entrants: [] },
    { week: 25, slot: 1, entrants: [], secondLeg: { week: 29, slot: 1 } },
    { week: 34, slot: 1, entrants: [], neutral: true },
  ] as readonly CupRoundSpec[],
  /** Europe: four groups of four over six midweeks, then two-leg quarter-finals and semi-finals and a one-off final. */
  EUROPE_GROUP_WEEKS: [6, 8, 12, 16, 20, 22] as readonly number[],
  EUROPE_KNOCKOUT_ROUNDS: [
    { week: 26, slot: 1, entrants: [], secondLeg: { week: 28, slot: 1 } },
    { week: 31, slot: 1, entrants: [], secondLeg: { week: 33, slot: 1 } },
    { week: 37, slot: 1, entrants: [], neutral: true },
  ] as readonly CupRoundSpec[],
  EUROPE_CLUBS: 16,
  EUROPE_GROUPS: 4,
  /** Home places (DESIGN.md "World"): the top four of tier 1; fifth and the Cup winner; sixth and the League Cup winner. A place passes down the table when a club has already qualified. */
  EUROPE_LEAGUE_PLACES: { championsCup: 4, europaCup: 1, conferenceCup: 1 } as const,
  /** Prize money and prestige by the stage reached (DESIGN.md "World"), onto wealth and prestige; the winner's on top. */
  EUROPE_PRIZE: {
    championsCup: { group: { wealth: 1, prestige: 1 }, quarter: { wealth: 1, prestige: 1 }, semi: { wealth: 1, prestige: 1 }, final: { wealth: 1, prestige: 1 }, winner: { wealth: 2, prestige: 2 } },
    europaCup: { group: { wealth: 1, prestige: 0 }, quarter: { wealth: 1, prestige: 1 }, semi: { wealth: 0, prestige: 1 }, final: { wealth: 1, prestige: 1 }, winner: { wealth: 1, prestige: 1 } },
    conferenceCup: { group: { wealth: 0, prestige: 0 }, quarter: { wealth: 1, prestige: 0 }, semi: { wealth: 0, prestige: 1 }, final: { wealth: 1, prestige: 0 }, winner: { wealth: 1, prestige: 1 } },
  } as Readonly<Record<'championsCup' | 'europaCup' | 'conferenceCup', Readonly<Record<'group' | 'quarter' | 'semi' | 'final' | 'winner', { wealth: number; prestige: number }>>>>,

  /** Clubs promoted and relegated across each tier boundary. */
  UP_DOWN_PER_BOUNDARY: 3,

  /** Size of the bottom zone: "bottom four" in crisis hires and survival tags. */
  BOTTOM_ZONE: 4,

  // ---------------------------------------------------------------------------
  // Match model (DESIGN.md "Match"): what both paths read before kick-off.
  // Drives result variance and so every credit-based target: median first
  // spell, 30% inside a season.
  // ---------------------------------------------------------------------------

  /** Results kept for form. DESIGN: last six. */
  FORM_WINDOW: 6,

  /** Strength swing from form: ±this at all wins / all losses over the window. */
  FORM_WEIGHT: 3,

  /** Strength swing from the manager's tactical ability: ±this at 100 / 0. Serves: good managers last, bad ones fail (first spell, top-tier tenures). */
  ABILITY_WEIGHT: 8,

  /** Strength swing from squad morale: ±this at 100 / 0. */
  MORALE_WEIGHT: 3,

  /** Bands are sums of effective rating ÷ 100, a quality-weighted count; a side of nobodies still has a back line, so the ratio is floored. Serves: no formation or style beats the mean points per game by more than 10%. */
  BAND_FLOOR: 1,
  /** Expected goals for a side are bounded here, so the scoreline table always has mass. */
  LAMBDA_MIN: 0.02,
  LAMBDA_MAX: 6,
  /** The pressing style: faster condition drain, more fouls (its other effects are the minute engine's). */
  STYLE_EFFECTS: {
    pressing: { drain: 1.3, fouls: 1.3 },
  } as const,
  /** The big-game trait: effective rating in a cup tie, derby or against a top side. */
  BIG_GAME_BONUS: 3,

  /** AI picks attack when the opponent is weaker by this many points, defend when stronger. */
  AI_MENTALITY_GAP: 12,

  /** Goals per side considered when summing outcome probabilities. */
  MAX_GOALS: 10,

  /** League points for a win and a draw. */
  POINTS_WIN: 3,
  POINTS_DRAW: 1,

  /** Midpoint of the 0–100 ability and morale scales; effects are measured from here. */
  SCALE_MIDPOINT: 50,

  /** Players in the first XI; ownership and youth counts are shares of this. */
  FIRST_XI: 11,

  /** Tactical ability assumed for a club with no manager or a generated European opponent. */
  CARETAKER_ABILITY: 40,

  /** Morale change per result, scaled by the manager's motivation: win × (base + motivation/100), loss × (base − motivation/100). */
  MORALE_WIN: 4,
  MORALE_LOSS: -5,
  MORALE_WIN_MOTIVATION_BASE: 0.5,
  MORALE_LOSS_MOTIVATION_BASE: 1.5,
  /** Morale drifts back toward MORALE_INITIAL by this share each week. */
  MORALE_DECAY: 0.1,

  /** Cup ties level after normal time go to a shoot-out; better side wins with base + this × strength gap share. */
  SHOOTOUT_STRENGTH_EDGE: 0.2,

  // ---------------------------------------------------------------------------
  // Players (DESIGN.md "Players"). Club strength stays the master number:
  // squads are generated and re-anchored to it. Serves: every population
  // target through the anchoring rule; the best XI averages club strength.
  // ---------------------------------------------------------------------------

  /** Squad size by tier, index 0 = tier 1. DESIGN: 22 in tiers 1–2, 20 in 3–4, 18 in 5. */
  SQUAD_SIZE_BY_TIER: [22, 22, 20, 20, 18] as readonly number[],
  EUROPEAN_OPPONENT_SQUAD_SIZE: 22,
  /** Keepers in every squad; the outfield splits by these shares. DESIGN: for a 22, about 2 GK, 7 D, 8 M, 4–5 F. */
  SQUAD_KEEPERS: 2,
  SQUAD_OUTFIELD_MIX: { D: 0.35, M: 0.4 } as const,
  /** Side draw for outfield players: left, centre, right, either. */
  SIDE_WEIGHTS: [0.2, 0.5, 0.2, 0.1] as readonly number[],
  /** Ages at generation, uniform. */
  PLAYER_AGE_RANGE: [18, 33] as readonly [number, number],
  /** Starters are drawn around club strength, backups below it. */
  STARTER_RATING_SD: 4,
  BACKUP_RATING_GAP: 7,
  BACKUP_RATING_SD: 4,
  /** Potential = rating + years to 24 × this + noise. Hidden. */
  POTENTIAL_GAIN_PER_YEAR: 2,
  POTENTIAL_NOISE_SD: 3,
  /** Under this age a player still grows toward potential. DESIGN: under 24. */
  YOUTH_AGE: 24,
  /** Zero, one or two traits per player. */
  TRAIT_COUNT_WEIGHTS: [0.45, 0.4, 0.15] as readonly number[],
  /** Trait draw weights by position (1 where unlisted). */
  TRAIT_POSITION_WEIGHTS: {
    poacher: { GK: 0, D: 0.1, M: 0.4, F: 3 },
    playmaker: { GK: 0, D: 0.3, M: 3, F: 0.8 },
    pace: { GK: 0, D: 1, M: 1.2, F: 1.5 },
    aerial: { GK: 0.3, D: 2, M: 0.6, F: 1.5 },
    'tough tackler': { GK: 0, D: 2.5, M: 1.5, F: 0.2 },
    leader: { GK: 1.5, D: 1.5, M: 1, F: 0.8 },
    'big-game': { GK: 1, D: 1, M: 1, F: 1 },
    consistent: { GK: 1.5, D: 1, M: 1, F: 1 },
    versatile: { GK: 0, D: 1.5, M: 1.5, F: 1 },
    loyal: { GK: 1, D: 1, M: 1, F: 1 },
    'injury-prone': { GK: 0.5, D: 1, M: 1, F: 1 },
    'hot-headed': { GK: 0.3, D: 1.5, M: 1.2, F: 1 },
  } as Readonly<Record<string, Readonly<Record<'GK' | 'D' | 'M' | 'F', number>>>>,
  /** Positional penalties. DESIGN: adjacent −15, distant −30, wrong side −5; versatile halves them. */
  POSITION_PENALTY_ADJACENT: 15,
  POSITION_PENALTY_DISTANT: 30,
  SIDE_PENALTY: 5,
  VERSATILE_PENALTY_SHARE: 0.5,
  /** Condition (0–100). DESIGN: below 80 it costs rating, below 70 it raises injury risk. */
  CONDITION_MAX: 100,
  CONDITION_RATING_FROM: 80,
  CONDITION_RATING_PER_POINT: 0.25,
  CONDITION_INJURY_FROM: 70,
  /** Player morale swings effective rating by ± this at 100 / 0. */
  PLAYER_MORALE_RATING_SWING: 3,
  /** The assistant's youth-first lean: selection bonus for under-24s. */
  YOUTH_LEAN_SELECTION_BONUS: 4,
  /** Share of AI managers who lean youth-first. */
  AI_YOUTH_FIRST_SHARE: 0.3,
  /** Bench size. DESIGN: five. */
  BENCH_SIZE: 5,
  /** The formation a club falls back on. */
  DEFAULT_FORMATION: '4-4-2' as const,
  /** AI preferred formations, weights in FORMATION_NAMES order. */
  FORMATION_WEIGHTS: [3, 1, 2, 1.5, 0.5, 1, 1, 1.5, 0.8, 1, 0.8, 0.5] as readonly number[],
  /** AI styles, weights for possession, direct, counter, pressing. */
  STYLE_WEIGHTS: [1, 1, 1, 1] as readonly number[],
  /** Wage in £k a week = base × e^(exp × rating), veterans discounted. */
  WAGE_BASE_K: 0.5,
  WAGE_RATING_EXP: 0.055,
  WAGE_MIN_K: 1,
  WAGE_VETERAN_AGE: 32,
  WAGE_VETERAN_SHARE: 0.8,
  /** Value in £m = base × (rating/100)^power, discounted per year from the peak age. */
  VALUE_BASE_M: 40,
  VALUE_RATING_POWER: 3,
  VALUE_PEAK_AGE: 27,
  VALUE_AGE_DECAY: 0.08,
  VALUE_AGE_FLOOR: 0.2,
  /** No player is worth less than this, £m. */
  VALUE_MIN_M: 0.1,
  /** Contract years at generation, uniform. */
  PLAYER_CONTRACT_YEARS: [1, 4] as readonly [number, number],
  // Match aftermath (DESIGN.md "Players": condition, injuries, suspensions,
  // morale, ratings out of ten). Serves: yellows ≈ 3–4 a match, reds ≈ 0.2,
  // match ratings average ≈ 6.9 with a spread of about 0.6.
  MATCH_MINUTES: 90,
  /** Condition lost over ninety minutes and won back each week of rest: a weekly starter is fresh, a midweek game leaves him short. */
  CONDITION_DRAIN_PER_90: 22,
  CONDITION_RECOVERY_PER_WEEK: 24,
  /** Injuries per player per match; low condition and the injury-prone multiply it. DESIGN: 1–20 weeks. */
  INJURY_P_PER_MATCH: 0.012,
  INJURY_LOW_CONDITION_MULT: 1.6,
  INJURY_PRONE_MULT: 2,
  INJURY_MIN_WEEKS: 1,
  INJURY_MAX_WEEKS: 20,
  /** Cards per outfield player per match. Serves: ≈ 3–4 yellows and ≈ 0.2 reds a match (to verify). */
  YELLOW_P: 0.16,
  RED_P: 0.01,
  GK_CARD_SHARE: 0.15,
  TOUGH_TACKLER_CARD_MULT: 1.5,
  HOT_HEADED_CARD_MULT: 1.5,
  HOT_HEADED_RED_MULT: 2.5,
  /** Bans: five yellows one match, ten two; a red one to three. */
  YELLOW_BANS: { '5': 1, '10': 2 } as Readonly<Record<string, number>>,
  RED_BAN: [1, 3] as readonly [number, number],
  /** Scorers and assisters are drawn by position, then by trait. */
  SCORER_POSITION_WEIGHTS: { GK: 0.01, D: 0.6, M: 2, F: 6 } as Readonly<Record<'GK' | 'D' | 'M' | 'F', number>>,
  ASSIST_POSITION_WEIGHTS: { GK: 0.05, D: 1, M: 3, F: 2 } as Readonly<Record<'GK' | 'D' | 'M' | 'F', number>>,
  POACHER_SCORER_MULT: 1.6,
  PLAYMAKER_ASSIST_MULT: 1.6,
  ASSIST_P: 0.7,
  /** The one-shot model's stand-in shot counts for the record: base plus per goal. */
  ONE_SHOT_SHOTS_BASE: 9,
  ONE_SHOT_SHOTS_PER_GOAL: 1.5,
  ONE_SHOT_ON_TARGET_SHARE: 0.35,
  ONE_SHOT_CORNERS: 4.5,
  ONE_SHOT_FOULS: 11,
  /** Match ratings out of ten: base, the result, level against the XI, events, noise. Serves: mean ≈ 6.9, spread ≈ 0.6. */
  RATING_BASE: 6.6,
  RATING_WIN: 0.5,
  RATING_DRAW: 0.1,
  RATING_LOSS: -0.35,
  RATING_PER_POINT: 25,
  RATING_PER_GOAL: 0.8,
  RATING_PER_ASSIST: 0.4,
  RATING_CLEAN_SHEET: 0.4,
  RATING_PER_GOAL_CONCEDED: 0.12,
  RATING_NOISE_SD: 0.35,
  RATING_MIN: 3,
  RATING_MAX: 10,
  /** Player morale: the result (scaled by the manager's motivation like the team's), playing time, a leader, weekly settling. */
  PLAYER_MORALE_WIN: 3,
  PLAYER_MORALE_LOSS: -4,
  PLAYER_MORALE_STARTED: 1,
  PLAYER_MORALE_LEFT_OUT: -1,
  LEADER_MORALE_LIFT: 2,
  PLAYER_MORALE_DECAY: 0.08,

  // Contracts and requests (DESIGN.md "Players": renew or release, new-deal and leave requests).
  /** A player asks for a new deal when his demand tops his wage by this share. */
  NEW_DEAL_GAP: 0.3,
  NEW_DEAL_YEARS: 3,
  NEW_DEAL_MORALE_GAIN: 8,
  /** A starter-level player (within this of club strength) starting under this share of the club's games asks to leave. */
  WANTS_AWAY_RATING_BELOW: 5,
  WANTS_AWAY_START_SHARE: 0.3,
  WANTS_AWAY_MIN_GAMES: 8,
  /** Monthly chance a player with a grievance raises it. Serves: most months zero or one decision. */
  REQUEST_P: 0.5,
  /** Refusing a request: morale lost, bond lost; the refusal counts toward "difficult" as a fallout. */
  REFUSAL_MORALE_LOSS: 15,
  BOND_REFUSAL_LOSS: 3,
  /** Years on a renewal the assistant recommends. */
  RENEW_YEARS_PLAYER: 2,
  /** The loyal rule: bonded above this, a loyal player asks this share of his wage. */
  BOND_LOYAL_THRESHOLD: 10,
  LOYAL_WAGE_SHARE: 0.8,
  /** Bond moves (DESIGN.md "Your players"): a start, a debut, a promotion, a renewal, a decision that backed him. */
  BOND_START: 1,
  BOND_DEBUT: 5,
  BOND_PROMOTION: 5,
  BOND_RENEWAL: 3,
  BOND_BACKED: 5,

  // Your players (DESIGN.md "Your players"). Serves: a starter gains at
  // least three times a bench player over a season; buying finished players
  // yields under 10% of players-made points; the best maker's Legacy within
  // 20% of the best trophy-winner's.
  /** A full season of starts moves an under-24 this far toward potential. */
  GROWTH_PER_SEASON: 4,
  EXPECTED_STARTS: 46,
  /** Growth × (base + slope × development ÷ 100). */
  DEV_FACTOR_BASE: 0.6,
  DEV_FACTOR_SLOPE: 0.8,
  /** Players-made points per rating point of growth under the manager. */
  GROWTH_POINTS_PER_RATING: 3,
  /** Tag weights: debut and promotion in full, a signing less; a finished player (bought at this rating or above) almost nothing. */
  TAG_WEIGHTS: { debut: 1, promoted: 1, signed: 0.5 } as Readonly<Record<'debut' | 'promoted' | 'signed', number>>,
  BOUGHT_FINISHED_RATING: 70,
  BOUGHT_FINISHED_WEIGHT: 0.05,
  /** Milestone points: a tier above the one he was made in, a transfer above the fee threshold, a top-tier or European title. */
  MILESTONE_POINTS: { tierAbove: 8, transfer: 10, title: 20, promotion: 0, cupFinal: 0, retired: 0 } as Readonly<Record<string, number>>,
  /** £m: a transfer at or above this is a milestone. */
  TRANSFER_MILESTONE_FEE: 3,
  /** A tagged player who leaves waits as a free agent for a club within this many strength points of his rating. */
  MOVE_ON_STRENGTH_WINDOW: 10,
  /** A generated player older than this has debuted somewhere already. */
  DEBUT_AGE_LIMIT: 19,
  /** Seasons a free agent waits before retiring. */
  FREE_AGENT_MAX_SEASONS: 1,

  // ---------------------------------------------------------------------------
  // The minute engine (DESIGN.md "Match"). Serves: goals per game ≈ 2.7,
  // home / draw / away ≈ 45 / 26 / 29, yellows ≈ 3–4, reds ≈ 0.2 (to verify);
  // Interface: a match is one press in To full time, four to six in To key events.
  // ---------------------------------------------------------------------------

  /** How Continue plays a match until the player changes it: one press to the result (Interface: a match is one press in To full time). */
  MATCH_PLAY_DEFAULT: 'fullTime' as const,

  /** Pressure target per point of effective XI difference, and per midfielder of presence (a quality-weighted count). */
  PRESSURE_PER_POINT: 1.0,
  PRESSURE_PER_MID: 3,
  /** Home advantage as a pressure lean. DESIGN names 8; 12 nets out to the home-win target once a leading side sits deep. To verify against real home-win rates. */
  HOME_PRESSURE_LEAN: 12,
  /** Mentality (DESIGN: shifts every band's weight and the pressure lean): the lean, the tempo of the whole match per attacking side (− per defending side), and the share moved between a side's attack and defence bands. */
  MENTALITY_LEAN: 6,
  MENTALITY_TEMPO: 0.15,
  MENTALITY_BAND_SHIFT: 0.1,
  /** A leading side sits deeper by this unless attacking. */
  LEAD_SIT_DEEP: 16,
  /** Style leans on pressure: possession with a better XI, pressing, counter sits back. */
  STYLE_PRESSURE: { possessionBetter: 6, pressing: 7, counter: -5 } as const,
  /** Pressure moves this share of the way to its target each minute, with noise. */
  PRESSURE_DRIFT: 0.3,
  PRESSURE_NOISE_SD: 6,
  /** A goal swings momentum by this for the scorers; momentum fades by this share each minute. */
  MOMENTUM_GOAL: 6,
  MOMENTUM_DECAY: 0.9,
  /** The home share of chances is a logistic in pressure with this scale: the lean of 8 gives ≈ 58%. Serves: home / draw / away ≈ 45 / 26 / 29. */
  CHANCE_SHARE_SCALE: 25,
  /** Chances per minute at level pressure, and the extra share at full pressure. Serves: ≈ 24 shots a match (to verify). */
  CHANCE_BASE: 0.36,
  CHANCE_PRESSURE: 0.2,
  /** Chance probability scales with the square root of openness (our attack over their defence, against the standard), within bounds. */
  OPENNESS_MIN: 0.7,
  OPENNESS_MAX: 1.4,
  /** Style, one rule each, on chances: fewer but better; more of lower quality; on the break; more of them. */
  STYLE_CHANCE: {
    possession: { chance: 0.85, quality: 1.15 },
    direct: { perTrait: 0.03, quality: 0.9 },
    counter: { onBreak: 1.25, notOnBreak: 0.9, quality: 1.1 },
    pressing: { chance: 1.08 },
  } as const,
  /** Openness counts a midfielder as this much of an attacker and this much of a defender; the standard is a 4-4-2 against a 4-4-2 (3.4 ÷ 7). DESIGN: 4-5-1 wins the midfield against 4-4-2 but creates less. */
  MID_ATTACK_SHARE: 0.35,
  MID_DEFENCE_SHARE: 0.5,
  OPENNESS_STANDARD: 3.4 / 7,
  /** Width against a narrow back line (fewer wide defenders than this, from a shape this wide or more), and the overload of a back line this long, on chance frequency. */
  WIDTH_CHANCE: 1.06,
  NARROW_DEFENCE_WIDTH: 2,
  WIDE_ATTACK_WIDTH: 4,
  OVERLOAD_CHANCE: 0.9,
  OVERLOAD_BACK_LINE: 5,
  /** Conversion: P(goal) = base × e^(sens × edge), edge from attacker against keeper and defenders in rating points ÷ EDGE_SCALE, plus ln(quality). Serves: goals per game ≈ 2.7. */
  GOAL_BASE_P: 0.11,
  GOAL_SENS: 0.12,
  GOAL_P_MAX: 0.5,
  EDGE_SCALE: 10,
  QUALITY_FLOOR: 0.2,
  /** Keeper and defence shares of the stop, and an outfielder in goal's penalty. */
  KEEPER_SHARE: 0.6,
  DEFENCE_SHARE: 0.4,
  NO_KEEPER_PENALTY: 30,
  /** A chance that is not a goal: save, miss or block. Serves: about a third of shots on target (to verify). */
  SAVE_SHARE: 0.3,
  MISS_SHARE: 0.45,
  /** Share of chances that are not goals that go for a corner. Serves: ≈ 9 corners a match (to verify). */
  CORNER_SHARE: 0.4,
  /** Fouls per minute and the card odds per foul. Serves: ≈ 3–4 yellows and ≈ 0.2 reds a match. */
  FOUL_BASE: 0.22,
  YELLOW_PER_FOUL: 0.15,
  RED_PER_FOUL: 0.003,
  /** A booked player fouls this share as often: second yellows are rare. */
  BOOKED_CAUTION: 0.3,
  /** Injuries per side per minute, drawn by the injury rule. */
  INJURY_MINUTE_P: 0.0014,
  /** Substitutions by rule: from this minute for tiredness, chasing from this one, holding from this one; tired below this condition; at least this many minutes between a side's own changes. */
  SUB_TIRED_FROM: 55,
  SUB_TIRED_BELOW: 60,
  SUB_CHASE_FROM: 65,
  SUB_HOLD_FROM: 78,
  SUBS_MAX: 3,
  SUB_MIN_GAP: 8,
  /** Added time per half, uniform. */
  STOPPAGE_FIRST: [0, 3] as readonly [number, number],
  STOPPAGE_SECOND: [1, 5] as readonly [number, number],
  /** Possession moves this much per point of the share of minutes a side spent on top (cosmetic; to verify against ≈ 53% at home). */
  POSSESSION_SWING: 0.6,
  /** Live rating moves in the match view: a save, a card; a short cameo counts a little less. */
  LIVE_RATING_START: 6,
  LIVE_RATING_SAVE: 0.05,
  LIVE_RATING_YELLOW: -0.3,
  LIVE_RATING_RED: -1,
  LIVE_RATING_CAMEO: -0.2,
  /** Headless full match must finish under this many milliseconds. */
  MATCH_HEADLESS_MS: 50,

  /** Anchoring tolerance the tests allow after rounding to one decimal; below the minimum strength the rating floor gets in the way. */
  ANCHOR_TOLERANCE: 0.15,
  /** Genesis squads under this strength sit on the rating floor and cannot be anchored exactly; the anchoring test skips them. */
  ANCHOR_MIN_STRENGTH: 12,
  /** Anchoring passes, and the residue below which it stops. */
  ANCHOR_PASSES: 4,
  ANCHOR_RESIDUE: 0.02,
  /** The age curve. DESIGN: peak 26–30, decline from 31, keepers from 33. */
  PEAK_AGE_PLAYER: [26, 30] as readonly [number, number],
  DECLINE_FROM: 31,
  GK_DECLINE_FROM: 33,
  /** Rating lost per summer from the decline age, growing by this share each further year. */
  DECLINE_PER_YEAR: 1.5,
  DECLINE_ACCELERATION: 0.25,
  /** Players may retire from this age, and do at this one. */
  PLAYER_RETIRE_FROM: 33,
  PLAYER_RETIRE_P: 0.3,
  PLAYER_RETIRE_AT: 37,
  /** Out of contract and this far below club strength: released. */
  RELEASE_BELOW_STRENGTH: 12,
  /** Academy promotions: age, rating below club strength, extra hidden potential. */
  ACADEMY_AGE_RANGE: [17, 19] as readonly [number, number],
  ACADEMY_RATING_GAP: 15,
  ACADEMY_POTENTIAL_BONUS: 12,

  // ---------------------------------------------------------------------------
  // Squad (DESIGN.md "Squad"). Serves: ceiling resets (turnover), ownership
  // and blame, and the long-tenure targets through strength maintenance.
  // ---------------------------------------------------------------------------






  /** Mean age of promoted academy players. */
  ACADEMY_AGE: 19,


  /** Transfer budget in £m per season = coefficient × wealth². Serves: earnings, big-spender ranks. */
  TRANSFER_BUDGET_PER_WEALTH_SQ: 0.012,



  /** The winter pot is this share of the normal budget. DESIGN: two windows. */
  WINTER_BUDGET_SHARE: 0.3,


  /** Academy players promoted into the XI = floor((development − offset) / step), clamped 0–max. */
  YOUTH_DEVELOPMENT_OFFSET: 25,
  YOUTH_DEVELOPMENT_STEP: 12,
  YOUTH_MAX_PER_SUMMER: 5,




  // ---------------------------------------------------------------------------
  // Prestige and wealth drift (DESIGN.md: prestige "slow-moving").
  // ---------------------------------------------------------------------------

  /** Share of the gap to the finish-implied prestige closed each season. */
  PRESTIGE_DRIFT_RATE: 0.15,

  /** Prestige added by a trophy that season. */
  PRESTIGE_TROPHY_BONUS: 3,

  /** Wealth follows prestige: share of the gap closed each season. */
  WEALTH_DRIFT_RATE: 0.2,

  // ---------------------------------------------------------------------------
  // Expectation (DESIGN.md "Expectation"). Serves: median first spell ≈ 1.5
  // seasons and the 30% inside-a-season share, through the season-end delta.
  // ---------------------------------------------------------------------------

  /** Owner ambition lifts the target by up to this many places (ambition 1). */
  EXPECT_AMBITION_PLACES: 3,

  /** After a missed target, the target eases one place toward the structural one. */
  EXPECT_EASE_PER_MISS: 1,

  /** Interview promises. DESIGN: promotion +30% budget, +3 places; stability −10%, −2 places. */
  PROMISE_EFFECTS: {
    'top-half': { budget: 1, places: 0 },
    promotion: { budget: 1.3, places: -3 },
    stability: { budget: 0.9, places: 2 },
  } as Readonly<Record<'top-half' | 'promotion' | 'stability', { budget: number; places: number }>>,

  // ---------------------------------------------------------------------------
  // Credit (DESIGN.md "Credit"). Serves: median first spell, 30% inside a
  // season, 10% reach 20 seasons (ceiling and staleness).
  // ---------------------------------------------------------------------------

  CREDIT_ON_HIRE: 55,
  /** Crisis hire: bottom zone, just relegated, or predecessor sacked mid-season. */
  CREDIT_CRISIS_BONUS: 15,
  /** Hire at an elite (top-six-prestige) club. */
  CREDIT_ELITE_PENALTY: -10,
  /** Per match: Δ = K × (points − expected points). */
  CREDIT_K: 2.5,
  /** Losses weighted × this. DESIGN started at 1.5 so credit erodes unless you overachieve; validation showed that erosion killed every long top-tier tenure, so it sits at 1 (no drift, variance only). */
  CREDIT_LOSS_WEIGHT: 1.0,
  /** From this consecutive defeat on, an extra penalty each. */
  CREDIT_CONSEC_DEFEAT_FROM: 3,
  CREDIT_CONSEC_DEFEAT: -2,
  CREDIT_DERBY_DEFEAT: -4,
  CREDIT_CUP_EXIT_LOWER: -6,
  /** Beating a side in the top N of its division. */
  CREDIT_BEAT_TOP: 2,
  CREDIT_TOP_SIDE_RANK: 3,
  /** Monthly: position worse than expectation by this many places or more. */
  CREDIT_MONTH_GAP_PLACES: 4,
  CREDIT_MONTH_GAP: -3,
  /** Season end: (expectation − finish) × this, clamped ± the clamp. */
  CREDIT_SEASON_PER_PLACE: 3,
  CREDIT_SEASON_CLAMP: 20,
  CREDIT_PROMOTION: 20,
  CREDIT_RELEGATION: -25,
  CREDIT_TROPHY: 15,
  /** Ceiling stays here for the first seasons, then falls per season (staleness). */
  CREDIT_CEILING: 100,
  CEILING_FULL_SEASONS: 3,
  CEILING_STALENESS_PER_SEASON: 10,
  /** First-XI turnover in one summer that resets the ceiling. */
  CEILING_RESET_TURNOVER: 0.5,
  /** Blame: for this many seasons, negative deltas × (base + share × ownership). DESIGN started at two seasons of 0.5 + 0.5 × ownership; that made first spells the longest of all, so it is one season of 0.85 + 0.15 × ownership. Serves: median first spell ≈ 1.5, 30% inside a season. */
  BLAME_SEASONS: 1,
  BLAME_BASE: 0.85,
  BLAME_OWNERSHIP_SHARE: 0.15,

  // ---------------------------------------------------------------------------
  // Sacking (DESIGN.md "Sacking"). Serves: unjust sackings ≈ 20–30%, median
  // first spell.
  // ---------------------------------------------------------------------------

  SACK_THRESHOLD: {
    patient: 15,
    normal: 25,
    impatient: 35,
  } as Readonly<Record<'patient' | 'normal' | 'impatient', number>>,
  /** Erratic owners: uniform in this range, re-rolled monthly. */
  SACK_THRESHOLD_ERRATIC: [10, 45] as readonly [number, number],
  /** Weekly roll while below threshold: base × (1 − perYear × years remaining), floored. DESIGN started at 10%; 4% let eight weeks pass more often; 3.2% (with the floor at 2.4%) keeps the per-season hazard where it was once the year grew from 46 weeks to 52. Serves: unjust ≈ 20–30%, median career 6–8. */
  SACK_ROLL_BASE: 0.032,
  SACK_ROLL_PER_YEAR: 0.2,
  SACK_ROLL_FLOOR: 0.024,
  /** Credit at or below this: sacked at once, and counted as deserved. DESIGN started at 5; 9 since the fast path (phase 3c), whose draw-heavier results had stretched the median first spell to the top of its band. */
  CREDIT_INSTANT_SACK: 9,
  /** A sacking is "deserved" after this many consecutive weeks below threshold. */
  DESERVED_WEEKS: 8,
  REP_SACKED_DESERVED: -8,
  REP_SACKED_UNJUST: -2,

  // ---------------------------------------------------------------------------
  // Shocks (DESIGN.md "Shocks"). Serves: unjust sackings ≈ 20–30%.
  // ---------------------------------------------------------------------------

  /** Wealth below this counts as a low-wealth club. */
  LOW_WEALTH: 30,
  TAKEOVER_P: 0.01,
  TAKEOVER_LOW_WEALTH_MULT: 1.5,
  /** New owner replaces the manager within this many months with this chance, whatever the results. */
  TAKEOVER_REPLACE_P: 0.25,
  TAKEOVER_REPLACE_MONTHS: 6,
  CRISIS_P: 0.005,
  CRISIS_LOW_WEALTH_MULT: 3,
  CRISIS_BUDGET_CUT: 0.4,
  CRISIS_EXPECTATION_EASE: 3,
  /** Forced star sale: only at low-wealth clubs. */
  STAR_SALE_P: 0.01,
  STAR_SALE_EXPECTATION_EASE: 1,
  /** Dressing-room fallout rolls once per losing run of this length. */
  FALLOUT_TRIGGER_DEFEATS: 4,
  FALLOUT_P: 0.25,
  FALLOUT_OWNERSHIP_GAIN: 1 / 11,
  /** AI sells the player when its motivation ability is below this. */
  AI_FALLOUT_SELL_BELOW_MOTIVATION: 50,
  /** The player who turns is the best outfielder at least this old. */
  FALLOUT_SENIOR_AGE: 27,
  /** Board rows: monthly roll while credit is within the margin above threshold. */
  BOARD_ROW_P: 0.05,
  BOARD_ROW_MARGIN: 10,
  BOARD_ROW_CREDIT: -3,

  // ---------------------------------------------------------------------------
  // Ways out (DESIGN.md "Ways out"). Serves: careers across three or four clubs.
  // ---------------------------------------------------------------------------

  /** Mutual consent is offered while credit sits in this window. */
  MUTUAL_WINDOW: [10, 25] as readonly [number, number],
  MUTUAL_PAYOUT_SHARE: 0.5,
  REP_MUTUAL: -4,
  /** AI accepts a mutual-consent offer with this chance each month it is offered. At 0.3 consent removed most long-suffering managers before eight weeks. Serves: unjust ≈ 20–30%. */
  AI_MUTUAL_ACCEPT_P: 0.044, // 0.05 × 46/52: ten monthly rolls a year now, not nine
  /** Resigning: reputation hit depends on credit at the split. */
  RESIGN_CREDIT_SPLIT: 50,
  REP_RESIGN_HIGH: -1,
  REP_RESIGN_LOW: -5,
  /** AI resigns with this monthly chance while below threshold (jumping before the push). */
  AI_RESIGN_P: 0.018, // 0.02 × 46/52, as above
  /** Contract expiry: renewed above this credit, otherwise released. */
  EXPIRY_RENEW_CREDIT: 40,
  REP_RELEASED: -3,
  /** Years on a renewal. */
  RENEW_YEARS: 2,

  // ---------------------------------------------------------------------------
  // Reputation moves at season end (DESIGN.md "Reputation moves"). Serves:
  // 40–50% never get a second job; median career 6–8 seasons.
  // ---------------------------------------------------------------------------

  REP_SEASON_PER_PLACE: 2,
  REP_SEASON_CLAMP: 8,
  REP_TROPHY: 6,
  /** Tier weights on the trophy reputation gain. */
  REP_TROPHY_WEIGHT: {
    'league-1': 1,
    'league-2': 0.6,
    'league-3': 0.4,
    'league-4': 0.3,
    'league-5': 0.2,
    nationalCup: 0.8,
    leagueCup: 0.5,
    championsCup: 1.2,
    europaCup: 0.9,
    conferenceCup: 0.6,
  } as Readonly<Record<string, number>>,
  REP_PROMOTION: 5,
  REP_RELEGATION: -6,

  // ---------------------------------------------------------------------------
  // Contracts and pay (DESIGN.md "Job market": salary by tier × reputation).
  // Serves: earnings scale in Legacy.
  // ---------------------------------------------------------------------------

  /** £m per season at reputation 50, index 0 = tier 1. */
  SALARY_BASE_BY_TIER: [3, 1, 0.4, 0.2, 0.08] as readonly number[],
  /** Salary = base × (SALARY_REP_FLOOR + reputation / 100). */
  SALARY_REP_FLOOR: 0.5,
  /** Genesis incumbents: contract years left and seasons already served, uniform. */
  GENESIS_CONTRACT_YEARS: [1, 3] as readonly [number, number],
  GENESIS_TENURE_SEASONS: [0, 4] as readonly [number, number],
  /** Ownership a genesis incumbent has built per season served. */
  GENESIS_OWNERSHIP_PER_SEASON: 0.35,

  // ---------------------------------------------------------------------------
  // Job market (DESIGN.md "Job market"). Serves: 40–50% never get a second
  // job, median career 6–8 seasons across three or four clubs.
  // ---------------------------------------------------------------------------

  /** Weeks after a vacancy opens before the shortlist is drawn, then before the hire. */
  VACANCY_SHORTLIST_DELAY_WEEKS: 1,
  VACANCY_HIRE_DELAY_WEEKS: 2,
  /** After this many weeks unfilled, the search widens by one band a week. */
  VACANCY_WIDEN_AFTER_WEEKS: 3,
  /** Shortlist size, uniform. DESIGN: three to five. */
  SHORTLIST_SIZE: [3, 5] as readonly [number, number],
  /** Shortlist score weights: reputation, tag fit, agent quality, randomness. */
  SHORTLIST_WEIGHTS: { reputation: 1, tagFit: 0.6, agent: 0.4, random: 0.4 } as const,
  /** Shortlist weight multipliers by age. Serves: careers end by 72, a handful past 1,000 games. */
  AGE_PENALTY: [
    { from: 60, mult: 0.5 },
    { from: 67, mult: 0.2 },
  ] as readonly { from: number; mult: number }[],
  /** A manager one band below the club's band qualifies with a wanted tag. */
  TAG_BAND_BELOW: 1,
  /** AI applies to clubs at most this many bands below its own band ... */
  AI_APPLY_BANDS_BELOW: 1,
  /** ... until this many months unemployed, after which it applies anywhere it qualifies. */
  AI_APPLY_ANY_AFTER_MONTHS: 24,
  /**
   * After losing a job an AI manager takes this many months before applying
   * again. Serves: a handful past 1,000 games (immediate rehiring made 10% of
   * careers continuous for 20 years). Was 9 with the foreign posts; 6 since
   * v0.6 so the smaller market still gives 50–60% a second job.
   */
  AI_REST_MONTHS_AFTER_EXIT: 6,
  /** Most tags on a vacancy's want-list. */
  WANT_TAGS_MAX: 2,
  /** Contract years offered, weights for 1, 2, 3, 4 years. DESIGN: one to four. */
  CONTRACT_YEARS_WEIGHTS: [0.15, 0.4, 0.3, 0.15] as readonly number[],
  /** Contract years offered to a manager with no previous job. Serves: ~30% of first spells end inside a season. */
  FIRST_JOB_CONTRACT_YEARS_WEIGHTS: [0.45, 0.4, 0.15, 0] as readonly number[],
  /** Salary × (1 − factor × (years − 2)): longer contracts pay less per year. */
  SALARY_PER_YEAR_FACTOR: 0.08,
  /** AI promises promotion when the structural target is this high or better (tiers 2–5). */
  AI_PROMISE_PROMOTION_RANK: 4,
  /** Employed managers are approached only by clubs at least this much more prestigious. */
  POACH_PRESTIGE_GAP: 10,
  /** Share of vacancies where the club calls one employed manager (the best fit) rather than only the unemployed. */
  POACH_ATTEMPT_P: 0.1,
  /** A manager must have been in post this many weeks before a bigger club calls. Serves: a handful past 1,000 games. */
  POACH_MIN_WEEKS: 52,
  AI_ACCEPT_APPROACH_P: 0.5,
  /** Declining an approach. DESIGN: credit +3 (the mean of BETS.approach.decline), loyalty progress. */
  LOYALTY_PER_DECLINE: 1,
  REP_POACHED: 2,
  /** The new club pays the buy-out if it is under this share of its wage budget; otherwise the manager must walk out. */
  BUYOUT_AFFORD_SHARE: 0.5,
  /** AI walks out (no buy-out) only for a club this much more prestigious, with this chance. */
  WALKOUT_MIN_PRESTIGE_GAP: 20,
  AI_WALKOUT_P: 0.5,
  REP_WALKOUT: -3,

  // ---------------------------------------------------------------------------
  // Unemployment and permadeath (DESIGN.md "Job market", "Permadeath").
  // Serves: 40–50% never get a second job; careers end.
  // ---------------------------------------------------------------------------

  UNEMPLOYED_DECAY_AFTER_MONTHS: 3,
  UNEMPLOYED_DECAY: -1,
  /** Punditry halves the decay. */
  PUNDITRY_DECAY_SHARE: 0.5,
  /** Stepping down to an assistant role: once, then decay stops. */
  REP_STEP_DOWN: -5,
  /** £m per month. */
  PUNDITRY_INCOME_PER_MONTH: 0.01,
  ASSISTANT_INCOME_PER_MONTH: 0.03,
  /** AI activity choices by months out of work and reputation. */
  AI_PUNDITRY_AFTER_MONTHS: 6,
  AI_PUNDITRY_MIN_REP: 40,
  AI_ASSISTANT_AFTER_MONTHS: 12,
  AI_ASSISTANT_MAX_REP: 40,
  /** Career ends after this many months without a shortlist. DESIGN: 24. */
  NO_SHORTLIST_MONTHS: 24,
  /** Career ends at this age. DESIGN: 72. */
  RETIRE_AGE: 72,
  /** Monthly chance of a career-ending scandal. */
  SCANDAL_P: 0.0005,
  /** AI voluntary retirement from this age: base + per-year × (age − from), doubled when unemployed. Serves: ~10% reach 20 seasons, a handful past 1,000 games. */
  AI_RETIRE_FROM: 55,
  AI_RETIRE_BASE_P: 0.05,
  AI_RETIRE_PER_YEAR: 0.03,
  AI_RETIRE_UNEMPLOYED_MULT: 2,

  // ---------------------------------------------------------------------------
  // Tags (DESIGN.md "Tags"). Windows are seasons; expiry is seasons after the
  // last qualifying season. Serves: typecasting, second-job rate.
  // ---------------------------------------------------------------------------

  TAG_RULES: {
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
  } as const,

  // ---------------------------------------------------------------------------
  // Cohorts (DESIGN.md "~400 managers"). Serves: a steady flow of first-timers.
  // ---------------------------------------------------------------------------

  /** Each summer the population of non-retired managers is topped up to POPULATION. */
  COHORT_TOP_UP: true,

  // ---------------------------------------------------------------------------
  // Play (DESIGN.md "Turn structure", "What the player controls in v1").
  // ---------------------------------------------------------------------------

  /** Weeks a human decision waits before its default applies. */
  HUMAN_DECISION_DEADLINE_WEEKS: 1,
  /**
   * Chance a qualifying application by the human makes the shortlist, where
   * AI names merely wait to be picked. Serves: a first interview within a
   * few weeks of applying widely; "waiting is a bet" still holds for the job itself.
   */
  HUMAN_SHORTLIST_P: 0.3,
  /** The agent's fit score (DESIGN.md "Job market"): tier within the band, tag match, the club's need, and what each band below the human's own costs. */
  AGENT_FIT: { tier: 1, tags: 0.6, need: 0.4, perBandBelow: 0.5, needWidened: 0.7, needNormal: 0.4 } as const,
  /** Contract lengths the human may ask for at interview. DESIGN: one to four. */
  HUMAN_CONTRACT_YEARS_OPTIONS: [1, 2, 3, 4] as readonly number[],
  /** Chance a match week brings a press question. Serves: most weeks zero or one decision. */
  PRESS_QUESTION_P: 0.3,
  /** The board writes when credit is within this of the threshold. */
  BOARD_WARN_MARGIN: 10,
  /** A promise to the board: credit now, a harder target. The trade is fixed; the dice on top are in BETS.board.promise. */
  BOARD_PROMISE: { credit: 3, places: 1 } as const,

  // ---------------------------------------------------------------------------
  // Decisions are bets (DESIGN.md "Decisions are bets"). Every option rolls
  // mean + sd × z on the seeded RNG. Within a kind every option has the same
  // mean, so a gamble is fair and not free. Serves: decisionFairnessGap and
  // decisionVarianceRatio.
  // ---------------------------------------------------------------------------

  /** z is clamped to ±this: no roll is a career in itself. */
  BET_ROLL_CLAMP: 2.5,
  /** Confidence in words by sd, per unit: up to the first is a sure thing, up to the second likely, beyond a gamble. */
  BET_CONFIDENCE_BANDS: {
    credit: [1, 2.5],
    reputation: [0.4, 1],
    morale: [1.5, 3.5],
  } as Record<'credit' | 'reputation' | 'morale', readonly [number, number]>,
  /**
   * The dice behind every option, by decision kind and key. Means are equal
   * inside a kind; the cautious option has the lowest sd and is the default.
   * Credit moves the spell's credit, reputation the manager's, morale the
   * player's or the squad's.
   */
  BETS: {
    /** The press: what the room makes of the answer. */
    press: { unit: 'morale', options: { measured: { mean: 0, sd: 1 }, confident: { mean: 0, sd: 3 }, defiant: { mean: 0, sd: 3 } } },
    /** The board's warning: how the answer lands with them. A promise also trades credit now for a harder target (BOARD_PROMISE). */
    board: { unit: 'credit', options: { accept: { mean: 0, sd: 0.5 }, pushBack: { mean: 0, sd: 3 }, promise: { mean: 0, sd: 2 } } },
    /** A fallout: the dressing room after you back down or sell him. Selling also moves ownership and strength. */
    fallout: { unit: 'morale', options: { 'back-down': { mean: -5, sd: 2 }, sell: { mean: -5, sd: 6 } } },
    /** An approach: declining earns credit here; accepting rolls the new board's welcome onto the new spell's credit. */
    approach: { unit: 'credit', options: { decline: { mean: 3, sd: 0.5 }, accept: { mean: 3, sd: 4 } } },
    /** The interview promise: how the board read it, rolled onto credit at hire. */
    offer: { unit: 'credit', options: { 'top-half': { mean: 0, sd: 0.5 }, promotion: { mean: 0, sd: 2.5 }, stability: { mean: 0, sd: 1.5 } } },
    /** A month out of work: waiting keeps your name in play or out of it; the slide itself is UNEMPLOYED_DECAY. */
    activity: { unit: 'reputation', options: { wait: { mean: 0, sd: 0.8 }, punditry: { mean: 0, sd: 0.3 }, assistant: { mean: 0, sd: 0.15 } } },
    /** A renewal: the market's read of signing on or letting it run. */
    renewal: { unit: 'reputation', options: { accept: { mean: 0, sd: 0.3 }, decline: { mean: 0, sd: 1.5 } } },
    /** Mutual consent offered: leaving quietly or fighting on. */
    mutualConsent: { unit: 'reputation', options: { accept: { mean: 0, sd: 0.3 }, decline: { mean: 0, sd: 1.5 } } },
    /** A player asks for a new deal: his morale after the answer, on top of the fixed gain or loss. */
    newDeal: { unit: 'morale', options: { accept: { mean: 0, sd: 1 }, refuse: { mean: 0, sd: 4 } } },
    /** A player wants away: the squad's morale after he stays or goes. */
    wantsAway: { unit: 'morale', options: { keep: { mean: 0, sd: 1 }, sell: { mean: 0, sd: 4 } } },
    /** An expiring contract: the assistant's advice is the safe path; the other is the gamble (his morale renewed, the squad's on a release). */
    playerContract: { unit: 'morale', options: { safe: { mean: 0, sd: 1 }, risky: { mean: 0, sd: 3 } } },
  } as const,
  /**
   * AI managers answer the board's warning with these weights, so the
   * population rolls the board kind on both sides. A promise props credit
   * (+BOARD_PROMISE.credit a time): at 0.2 it cut sackings a third and
   * pushed neverSecondJobShare and thousandGameCount out of band; at 0.05
   * the population matches main over seeds 1–3. Serves: sackings per season,
   * neverSecondJobShare, thousandGameCount.
   */
  AI_BOARD_ANSWER_WEIGHTS: { accept: 0.7, pushBack: 0.25, promise: 0.05 } as const,
  /** AI managers give the press a bold answer (confident or defiant) this often; the roll is on morale, mean zero. */
  AI_PRESS_BOLD_P: 0.5,
  /** AI managers decline a renewal with this chance when their reputation band is above the club's tier (they think they can do better). At 0.3 careers shortened (neverSecondJobShare +0.02, careerMedianSeasons −0.3 over seeds 1–3); 0.15 leaves them where main had them. Serves: the renewal kind rolled on both sides. */
  AI_DECLINE_RENEWAL_P: 0.15,
  /** AI clubs answer their players' requests too: a new deal is given if the wage bill allows, a wants-away is sold with this chance. Serves: newDeal and wantsAway rolls in the population. */
  AI_SELL_WANTS_AWAY_P: 0.3,
  /** AI clubs settle an expiring contract against their own rule with this chance, so the population rolls the risky side too. */
  AI_CONTRACT_GAMBLE_P: 0.1,
  /** Weeks a wage is paid in a year, for the wage bill against the wage budget (£k a week × this / 1000 = £m a year). */
  WAGE_WEEKS_PER_YEAR: 52,
  /** Rolls a kind needs on both sides before it counts toward the fairness lines: under this the 10% gap is inside the sampling noise. */
  BET_MIN_ROLLS: 50,
  /** Rolls a kind must show on each side over 500 careers to prove the AI rolls it at all (rare kinds are reported, not measured). */
  BET_PRESENT_ROLLS: 20,
  /** The fairness gap is tested net of sampling noise: this many standard errors of the difference are allowed before a gap counts. A kind rolled 150 times cannot resolve a 10% gap otherwise. */
  BET_GAP_SE_ALLOWANCE: 2,
  /** Rolls the career page keeps in view. */
  CAREER_RECENT_ROLLS: 8,
  /** The team sheet's words: a player under this condition is a gamble; a rating gap under this is "likely", beyond it a gamble. */
  SELECTION_WORDS_TIRED_BELOW: 60,
  SELECTION_WORDS_GAP: 5,

  // ---------------------------------------------------------------------------
  // Transfers (DESIGN.md "Transfers"): two windows, the director of football,
  // every signing a bet. Serves: signingsBeatShare ≈ 40%, signingsShortShare
  // ≈ 25%, and the population through the flip.
  // ---------------------------------------------------------------------------

  /** January: the calendar month, season weeks inclusive; the last is deadline day. */
  JANUARY_WINDOW_WEEKS: [21, 24] as readonly [number, number],
  /** Summer (DESIGN.md "Transfers"): opens at the last match of the season and closes at the end of the third week of the next; the close is deadline day. */
  get SUMMER_WINDOW_OPENS(): number {
    return this.MATCH_WEEKS - 1
  },
  SUMMER_WINDOW_CLOSES: 2,
  /** The director's judgement: base + per wealth + noise, clamped. Scouting level (phase 5) will add to it. */
  DIRECTOR_JUDGEMENT_BASE: 35,
  DIRECTOR_JUDGEMENT_PER_WEALTH: 0.4,
  DIRECTOR_JUDGEMENT_SD: 8,
  DIRECTOR_JUDGEMENT_RANGE: [15, 95] as readonly [number, number],
  /** Cards a week in a window. DESIGN: up to three. */
  DIRECTOR_CARDS_PER_WEEK: 3,
  /** On arrival (DESIGN.md "Transfers"): the assessment names this many positions needing cover and this many players he would sell; up to this many cards, of which this many free agents to sign now when no window is open. */
  ARRIVAL_NEEDS: 2,
  ARRIVAL_SELL_NAMES: 3,
  ARRIVAL_CARDS: 3,
  ARRIVAL_FREE_CARDS: 1,
  /** An AI manager arriving outside a window signs up to this many free agents to his needs, so the population keeps trading. */
  AI_ARRIVAL_FREE_AGENTS: 1,
  /** The estimate's error: sd = DIRECTOR_ESTIMATE_SD × (DIRECTOR_JUDGEMENT_SCALE_AT_ZERO − judgement / 100). At judgement 50 the sd is 3: 43% beat the estimate by SIGNING_BEAT_MARGIN, 25% fall short by SIGNING_SHORT_MARGIN. */
  DIRECTOR_ESTIMATE_SD: 3,
  DIRECTOR_JUDGEMENT_SCALE_AT_ZERO: 1.5,
  /** The range on the card: this many rating points either side at judgement 50, scaled the same way. */
  DIRECTOR_RANGE_HALF: 6,
  /** A recommendation must promise at least this much over the weakest starter, and sit within reach of the squad's level. */
  DIRECTOR_MIN_GAIN: 1.5,
  DIRECTOR_REACH_ABOVE: 12,
  DIRECTOR_REACH_BELOW: 4,
  /** Candidates: real players at other clubs, free agents, and players from abroad generated at the level asked (this share of the cards). */
  DIRECTOR_ABROAD_SHARE: 0.4,
  /** Ages a generated candidate from abroad can have. */
  ABROAD_AGE_RANGE: [21, 30] as readonly [number, number],
  /** How many real players the director looks at before ranking. Serves: sim speed. */
  DIRECTOR_SEARCH_LIMIT: 60,
  /** The fee: value × premium for a contracted player; a share of it for one in his last year; nothing for a free agent. */
  DIRECTOR_FEE_PREMIUM: 1.1,
  EXPIRING_FEE_SHARE: 0.5,
  /** A bargain is a fee under this share of value. */
  BARGAIN_FEE_SHARE: 0.8,
  /** The director's confidence: sure thing when the estimated gain clears this many half-widths of his range, likely above the smaller one. */
  DIRECTOR_CONFIDENCE_SURE: 1.5,
  DIRECTOR_CONFIDENCE_LIKELY: 0.5,
  /** The wage the director offers: the player's demand, up by this share to move. */
  SIGNING_WAGE_PREMIUM: 0.1,
  SIGNING_CONTRACT_YEARS: 3,
  /** The selling club's roll: base at fee = value, moved by the premium; halved in January for a starter. */
  BID_CLUB_ACCEPT_BASE: 0.65,
  BID_CLUB_ACCEPT_PER_PREMIUM: 1.0,
  BID_CLUB_JANUARY_STARTER_MULT: 0.5,
  BID_CLUB_ACCEPT_ABROAD: 0.8,
  BID_ACCEPT_RANGE: [0.05, 0.95] as readonly [number, number],
  /** The player's roll: base, a step per tier up or down, a bonus per +10% wage. */
  BID_PLAYER_ACCEPT_BASE: 0.75,
  BID_PLAYER_TIER_STEP: 0.15,
  BID_PLAYER_WAGE_BONUS_PER_10PCT: 0.05,
  /** The truth is out after this many matches; a hit beats the estimate by the first margin, a flop falls short by the second. */
  SIGNING_REVEAL_MATCHES: 5,
  SIGNING_BEAT_MARGIN: 0.5,
  SIGNING_SHORT_MARGIN: 2,
  /** A hit lifts credit and reputation; a flop costs credit (the board question your signings). */
  SIGNING_HIT_CREDIT: 3,
  SIGNING_HIT_REP: 0.5,
  SIGNING_FLOP_CREDIT: -3,
  /** A player sold who shines elsewhere (this season average over this many apps, within this many seasons) costs the seller reputation. */
  SOLD_SHINES_RATING: 7.2,
  SOLD_SHINES_MIN_APPS: 10,
  SOLD_SHINES_SEASONS: 2,
  SOLD_SHINES_REP: -1,
  /** Sales the director proposes: on a bid, when the wage bill is over budget by this factor, or for a player this unsettled. */
  WAGE_OVERRUN_FACTOR: 1.05,
  UNSETTLED_MORALE: 35,
  /** A big bid is this many times the player's value; refusing one for an unsettled player costs his morale and counts as a fallout. */
  BIG_BID_SHARE: 1.4,
  REFUSED_BIG_BID_MORALE: -10,
  /** An AI director sells to a bid at this chance when the fee clears value; the human is asked. */
  AI_SELL_ON_BID_P: 0.6,
  /**
   * AI clubs trade through their directors toward the level their wealth
   * sets (the flip): a quota of bids per window, more the further below
   * the level, none when above it. Serves: the population through the flip.
   */
  AI_SIGNINGS_SUMMER: 3,
  AI_SIGNINGS_JANUARY: 1,
  /** One more bid per this much of the gap below the level, up to the cap. */
  AI_GAP_PER_SIGNING: 3,
  AI_SIGNINGS_MAX: 6,
  /** The director aims this far above the wealth level (0: the level itself; generation is pegged to it too). */
  AI_TRADE_TARGET_BIAS: 0,
  /**
   * Ambition: the aim rises with wealth squared (× this at wealth 100), the
   * way the old spend gains compounded for the rich. Without it the top
   * tier sat at 68 ± 9 and home clubs won the European Cup in 2% of
   * seasons (target 10–60%). Serves: europeanTitlesHomeShare, topTierLongTenures.
   */
  AI_TRADE_AMBITION: 12,
  /** An AI club over its wage budget sells up to this many of its highest-paid at each window close. */
  AI_WAGE_SALES_PER_CLOSE: 2,
  /** A club this far above its level stops buying. */
  AI_TRADE_HOLD_ABOVE: 3,
  /** An AI director bids only for an estimated gain of at least this over the weakest starter. */
  AI_APPROVE_MIN_GAIN: 1,
  /** Share of an AI director's attempts that go abroad (generated at the level asked); the rest at home clubs and the pool. */
  AI_ABROAD_SHARE: 0.5,
  /** An AI club over its wage budget sells its highest-paid reserve at each window close. */
  AI_SELL_ON_WAGES: true,
  /** A club whose squad is at the tier's size plus this releases its lowest-value reserve to make room for a signing. */
  SIGNING_MAKES_ROOM: true,
  SIGNING_ROOM_OVER: 2,
  /** The director's ranking: the estimate less this many points per whole pot the fee costs. */
  DIRECTOR_FEE_WEIGHT: 4,
  /** A candidate from abroad is generated this far above the floor the slot needs. */
  DIRECTOR_ABROAD_GAIN: 2,
  /** The club id a candidate from abroad carries until he signs or is forgotten. */
  ABROAD_CLUB_ID: -1,

  // ---------------------------------------------------------------------------
  // Following you (DESIGN.md "Your players"). Serves: followMovesPerJobChange
  // ≈ 0.5, never more than FOLLOW_MAX per move.
  // ---------------------------------------------------------------------------

  /** A tagged player asks to follow when his bond is at least this. */
  FOLLOW_BOND_THRESHOLD: 10,
  /** At most this many per move. DESIGN: two. */
  FOLLOW_MAX: 2,
  /** The old club's asking price: value × this. */
  FOLLOW_ASKING_PREMIUM: 1.2,
  /** An AI manager takes a follower who asks with this chance (the human is asked by a card). At 0.6, seed 1 gave 0.33 moves per job change (a third of asks complete after the two rolls); 0.85 aims at the 0.5 target. */
  AI_FOLLOW_P: 0.85,

  // ---------------------------------------------------------------------------
  // Requests (DESIGN.md "Requests"): each a bet with a stated likelihood.
  // Serves: the player's asks cost something and pay something.
  // ---------------------------------------------------------------------------

  /** The board: base chance, moved by credit over the threshold (per 30 credit, clamped ±1) and each refusal already this season. */
  REQUEST_BOARD_BASE_P: 0.4,
  REQUEST_BOARD_CREDIT_SWING: 0.35,
  REQUEST_BOARD_CREDIT_SCALE: 30,
  REQUEST_BOARD_PER_REFUSAL: -0.1,
  REQUEST_BACKING_BONUS_P: 0.1,
  REQUEST_P_RANGE: [0.05, 0.9] as readonly [number, number],
  /** What a grant is worth: this share of the normal budget on the pot, this share of the wage budget, this much credit for backing. */
  REQUEST_BUDGET_SHARE: 0.25,
  REQUEST_WAGE_SHARE: 0.15,
  REQUEST_BACKING_CREDIT: 3,
  /** Granted raises expectation by this many places; refused costs this much credit; the third refusal in a season is a board row (difficult progress). */
  REQUEST_GRANT_PLACES: 1,
  REQUEST_REFUSAL_CREDIT: -2,
  REQUEST_THIRD_REFUSAL: 3,
  /** The director finds a buyer or a loan club at these chances in a window. */
  REQUEST_SELL_P: 0.6,
  REQUEST_LOAN_P: 0.55,
  /** A buyer pays value × this. */
  REQUEST_SELL_PREMIUM: 1.0,
  /** Players: a contract talk from morale and bond; the captaincy from standing (top of the squad, a leader, seniority); playing time from morale. */
  REQUEST_CONTRACT_BASE_P: 0.5,
  REQUEST_CONTRACT_MORALE_SWING: 0.4,
  REQUEST_CONTRACT_BOND_BONUS: 0.2,
  REQUEST_CAPTAIN_BASE_P: 0.45,
  REQUEST_CAPTAIN_TOP_RANK: 5,
  REQUEST_CAPTAIN_TOP_BONUS: 0.3,
  REQUEST_CAPTAIN_LEADER_BONUS: 0.2,
  REQUEST_CAPTAIN_SENIOR_AGE: 27,
  REQUEST_CAPTAIN_SENIOR_BONUS: 0.1,
  REQUEST_PLAYING_BASE_P: 0.6,
  REQUEST_PLAYING_MORALE_SWING: 0.3,
  /** Morale on a player's yes or no. */
  REQUEST_PLAYER_GRANT_MORALE: 6,
  REQUEST_PLAYER_REFUSE_MORALE: -4,
  /** A promise of playing time: this many starts within this many weeks, or it is a fallout (morale, bond, the count). */
  PROMISE_STARTS: 3,
  PROMISE_WEEKS: 6,
  PROMISE_BROKEN_MORALE: -15,
  PROMISE_KEPT_MORALE: 4,
  /** Likelihood in words: a sure thing from this chance up, likely from the second. */
  REQUEST_WORDS: [0.7, 0.45] as readonly [number, number],
  /** Rows a search returns at most. */
  SEARCH_LIMIT: 40,
  /** The board also reads wealth (per 50 points, clamped ±1), the table against the target (per this many places, clamped ±1) and solvency (a flat penalty when the club is not). */
  REQUEST_BOARD_WEALTH_SWING: 0.12,
  REQUEST_BOARD_EXPECTATION_SWING: 0.15,
  REQUEST_BOARD_EXPECTATION_SCALE: 5,
  REQUEST_BOARD_INSOLVENT_PENALTY: 0.25,
  /** Cadence (DESIGN.md "Requests"): one board request a month (MONTH_WEEKS), a refused ask locked for this many months. */
  REQUEST_LOCK_MONTHS: 3,
  /** A level up: each level already held lowers the chance; the works cost this share of the normal budget off the pot. */
  REQUEST_LEVEL_PER_LEVEL: -0.08,
  REQUEST_LEVEL_COST_SHARE: 0.2,
  /** The stadium: likely when attendance runs at this share of capacity (the bonus) and the club is solvent; the works cost this share of the normal budget, off the pot first and cash after. */
  STADIUM_NEAR_CAPACITY: 0.9,
  STADIUM_NEAR_CAPACITY_BONUS_P: 0.25,
  STADIUM_COST_SHARE: 0.6,
  /** A new contract: each year asked beyond the first lowers the chance; the salary rises by this share on the tier's rate. */
  REQUEST_NEW_CONTRACT_YEARS: [1, 2, 3] as readonly number[],
  REQUEST_NEW_CONTRACT_PER_YEAR: -0.08,
  REQUEST_NEW_CONTRACT_SALARY_RISE: 0.1,

  // ---------------------------------------------------------------------------
  // Club levels and the stadium (DESIGN.md "Club", "Requests"): four levels
  // set by wealth that a granted request raises; a stadium whose capacity
  // caps attendance and which only a granted request expands.
  // Serves: the level and stadium requests have a cost now and an effect
  // later; the population is unmoved because every effect is centred on
  // level 3, the level of a club of middling wealth.
  // ---------------------------------------------------------------------------

  /** Levels run 1–5: one per this many points of wealth, from 1. Level 3 is the neutral point of every effect below. */
  LEVEL_MAX: 5,
  LEVEL_WEALTH_STEP: 20,
  LEVEL_NEUTRAL: 3,
  /** Coaching: growth with minutes × (1 + this × (level − 3)). */
  COACHING_DEV_PER_LEVEL: 0.08,
  /** Medical: an injury's weeks × (1 − this × (level − 3)), never under a week. */
  MEDICAL_INJURY_PER_LEVEL: 0.1,
  /** Academy: the summer intake's rating and potential move by this per level from 3. */
  ACADEMY_RATING_PER_LEVEL: 1.5,
  ACADEMY_POTENTIAL_PER_LEVEL: 2,
  /** Scouting: the director's judgement moves by this per level from 3 (DESIGN.md "Club": sharper reports and a sharper director). */
  DIRECTOR_JUDGEMENT_PER_SCOUTING_LEVEL: 4,
  /** Capacity in thousands at prestige 50 by tier, ± this share across prestige 0–100, to the nearest step. */
  STADIUM_CAPACITY_BY_TIER: [45, 25, 12, 7, 4] as readonly number[],
  STADIUM_CAPACITY_PRESTIGE_SLOPE: 0.6,
  STADIUM_CAPACITY_STEP: 0.5,
  /** Attendance: demand is the club's implied capacity × (base + swing × form score, −1..1), capped by the stadium. */
  ATTENDANCE_DEMAND_BASE: 0.85,
  ATTENDANCE_FORM_SWING: 0.15,
  /** The works: capacity down by this share for the rest of the season, then up by this share; wealth up by this much at each of this many season ends. */
  STADIUM_WORKS_CUT: 0.15,
  STADIUM_EXPANSION_SHARE: 0.25,
  STADIUM_WEALTH_PER_SEASON: 2,
  STADIUM_WEALTH_SEASONS: 3,
  /** Income from the new seats: £m onto the summer pot per thousand added. */
  STADIUM_INCOME_PER_K: 0.1,

  // ---------------------------------------------------------------------------
  // The score (DESIGN.md "The score"). Serves: Legacy calibration — a 30-year
  // mid-table career and a 12-year trophy-laden career within ~20%.
  // ---------------------------------------------------------------------------

  /** Trophy points. DESIGN starting values. */
  TROPHY_POINTS: {
    championsCup: 120,
    europaCup: 70,
    conferenceCup: 40,
    nationalCup: 50,
    leagueCup: 25,
    /** League titles by tier, index 0 = tier 1. */
    leagueByTier: [100, 40, 25, 15, 10],
    /** Promotion without the title, by the tier promoted from (tier 2 first). */
    promotionFromTier: [20, 12, 8, 5],
  } as const,

  /** Legacy = games × a + earnings(£m) × b + trophy points × c + players made × d. */
  LEGACY_WEIGHTS: { games: 0.2, earnings: 2, trophyPoints: 0.15, playersMade: 0.045 } as const,

  /** Bonuses as a share of the season's salary: for a trophy, for a promotion. Serves: earnings mix. */
  TROPHY_BONUS_SHARE: 0.25,
  PROMOTION_BONUS_SHARE: 0.5,

  /** Reference careers the Legacy weights are checked against (DESIGN: within ~20%). */
  LEGACY_ARCHETYPES: {
    midTableThirtyYears: { games: 1260, earnings: 35, trophyPoints: 30, playersMade: 120 },
    trophyLadenTwelveYears: { games: 600, earnings: 45, trophyPoints: 900, playersMade: 40 },
    /** Thirty years making players at small clubs: little money, few trophies, the fourth line (the population's 30-season makers read about 2,000). */
    makerThirtyYears: { games: 1260, earnings: 12, trophyPoints: 15, playersMade: 2000 },
    tolerance: 0.2,
  } as const,

  // ---------------------------------------------------------------------------
  // Validation targets (DESIGN.md "Validation targets"). Starting figures from
  // memory, TO VERIFY against the LMA end-of-season figures before locking in.
  // population.test.ts asserts these bands over 500 AI careers.
  // ---------------------------------------------------------------------------

  VALIDATION_TARGETS: {
    /** Median first-spell length ≈ 1.5 seasons. To verify. */
    firstSpellMedianSeasons: { target: 1.5, min: 1.2, max: 1.8 },
    /** ~30% of first spells end inside a season. To verify. */
    firstSpellInsideSeasonShare: { target: 0.3, min: 0.22, max: 0.38 },
    /** ~40–50% of first-time managers never get a second job. To verify. */
    neverSecondJobShare: { target: 0.45, min: 0.4, max: 0.5 },
    /** Median career ≈ 6–8 seasons managed. To verify. */
    careerMedianSeasons: { target: 7, min: 6, max: 8 },
    /** ... across three or four clubs. To verify. */
    careerMedianClubs: { target: 3.5, min: 3, max: 4 },
    /** ~10% reach 20 seasons. To verify. */
    twentySeasonShare: { target: 0.1, min: 0.07, max: 0.13 },
    /** A handful pass 1,000 games (of 500 careers). To verify. With the cups in real formats a top club plays 55–65 a season, so 1,000 games is a 17-season career; the count read 12–18 over seeds 1–3 on the 52-week calendar. */
    thousandGameCount: { target: 8, min: 2, max: 20 },
    /** At any moment, two to four top-tier managers have tenure over five years. To verify. */
    topTierLongTenures: { target: 3, min: 2, max: 4 },
    /** Unjust sackings ≈ 20–30% of all sackings. To verify. */
    unjustSackingShare: { target: 0.25, min: 0.2, max: 0.3 },
    /** Match ratings average ≈ 6.9 with a spread of about 0.6. To verify. */
    ratingMean: { target: 6.9, min: 6.6, max: 7.2 },
    ratingSpread: { target: 0.6, min: 0.35, max: 0.85 },
    /** No formation or style beats the mean points per game by more than 10%. */
    formationEdge: { target: 0, min: 0, max: 0.1 },
    styleEdge: { target: 0, min: 0, max: 0.1 },
    /** The best maker's Legacy lands within 20% of the best trophy-winner's: the best career among the ten with most players made against the best among the ten with most trophy points. */
    makerLegacyRatio: { target: 1, min: 0.8, max: 1.25 },
    /** Buying finished players yields under 10% of players-made points. */
    boughtFinishedShare: { target: 0.05, min: 0, max: 0.1 },
    /** Match: goals per game ≈ 2.7; home / draw / away ≈ 45 / 26 / 29; yellows ≈ 3–4; reds ≈ 0.2. All to verify against real league averages. */
    goalsPerGame: { target: 2.7, min: 2.4, max: 3.0 },
    homeWinShare: { target: 0.45, min: 0.4, max: 0.5 },
    drawShare: { target: 0.26, min: 0.22, max: 0.3 },
    awayWinShare: { target: 0.29, min: 0.24, max: 0.34 },
    yellowsPerGame: { target: 3.5, min: 2.8, max: 4.2 },
    redsPerGame: { target: 0.2, min: 0.1, max: 0.3 },
    /** The Champions Cup is hard (DESIGN.md "Validation targets"): won by a home club about one year in five, and rarely from outside the top three of tier 1. */
    championsCupHomeShare: { target: 0.2, min: 0.1, max: 0.35 },
    championsCupOutsideTopThree: { target: 0.1, min: 0, max: 0.25 },
    /** Calendar and cups: every fixture scheduled, no club more than twice in a week; a given tier-5 club reaches the Cup's third round about once in twenty seasons (starting points, read per club). */
    unscheduledFixtures: { target: 0, min: 0, max: 0 },
    clubWeekMaxFixtures: { target: 2, min: 0, max: 2 },
    tier5CupThirdRound: { target: 0.05, min: 0, max: 0.25 },
    /** Decisions (DESIGN.md "Decisions are bets"): per kind, the bold options' mean effect within 10% of the cautious options' (in units of the bold spread), with at least 1.5× the variance. The lines report the worst kind. */
    decisionFairnessGap: { target: 0, min: 0, max: 0.1 },
    decisionVarianceRatio: { target: 3, min: 1.5, max: 1000 },
    /** Signings (DESIGN.md "Transfers"): about 40% beat the director's estimate, about 25% fall short, scaled by his judgement (a starting point, not a real-world figure). */
    signingsBeatShare: { target: 0.4, min: 0.3, max: 0.5 },
    signingsShortShare: { target: 0.25, min: 0.15, max: 0.35 },
    /** Following you (DESIGN.md "Your players"): follow-you moves average about one per two job changes and never exceed two per move. */
    followMovesPerJobChange: { target: 0.5, min: 0.25, max: 0.8 },
    followMaxPerMove: { target: 2, min: 0, max: 2 },
  } as const,

  /** How many of each kind the maker-to-winner comparison takes: the ten biggest makers against the ten biggest trophy-winners. */
  MAKER_WINNER_TOP_N: 10,
  /** Games a formation or style needs in the log before its points per game count toward the edge targets; fewer is noise. */
  EDGE_MIN_GAMES: 600,
  /** Seasons skipped before sampling "at any moment" figures, so genesis spells can age. */
  VALIDATION_WARM_UP_SEASONS: 8,
  /** A "long" top-tier tenure in seasons. */
  LONG_TENURE_SEASONS: 5,
  /** A "20-season" career and a "1,000-game" career. */
  LONG_CAREER_SEASONS: 20,
  LONG_CAREER_GAMES: 1000,

}

export type Tunables = typeof T

/**
 * Override tunables by name, with dotted paths for nested entries
 * (e.g. "SACK_THRESHOLD.patient"). Returns the keys applied; throws on an
 * unknown key so a typo in a tuning run cannot pass silently.
 */
export function applyOverrides(patch: Record<string, unknown>): string[] {
  const applied: string[] = []
  for (const [key, value] of Object.entries(patch)) {
    const parts = key.split('.')
    let target: Record<string, unknown> = T as unknown as Record<string, unknown>
    for (const part of parts.slice(0, -1)) {
      const next = target[part]
      if (typeof next !== 'object' || next === null) throw new Error(`applyOverrides: no tunable ${key}`)
      target = next as Record<string, unknown>
    }
    const last = parts[parts.length - 1] as string
    if (!(last in target)) throw new Error(`applyOverrides: no tunable ${key}`)
    target[last] = value
    applied.push(key)
  }
  return applied
}
