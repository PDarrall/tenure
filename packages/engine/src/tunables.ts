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

  /** Share of foreign clubs carrying a prefix ("Real", "FC"). */
  FOREIGN_PREFIX_SHARE: 0.5,

  /** Abroad: three abstracted leagues, a job market and European opposition. */
  FOREIGN_LEAGUES: [
    { kind: 'big', clubs: 20, prestige: 90, strength: 78 },
    { kind: 'mid', clubs: 18, prestige: 60, strength: 58 },
    { kind: 'small', clubs: 16, prestige: 30, strength: 40 },
  ] as readonly {
    kind: 'big' | 'mid' | 'small'
    clubs: number
    prestige: number
    strength: number
  }[],

  /** Foreign club prestige and strength spread around the league figure. */
  FOREIGN_CLUB_NOISE_SD: 8,

  /** Id offset for foreign clubs so ids never collide with home clubs. */
  FOREIGN_CLUB_ID_BASE: 1000,

  // ---------------------------------------------------------------------------
  // Managers (DESIGN.md "Managers", "Reputation → employability band")
  // ---------------------------------------------------------------------------

  /** Population size, topped up each summer. Serves: every career target. */
  POPULATION: 400,

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

  /** Genesis incumbents abroad, reputation by league kind. */
  INCUMBENT_REPUTATION_ABROAD: {
    big: [72, 92],
    mid: [50, 72],
    small: [10, 40],
  } as Readonly<Record<'big' | 'mid' | 'small', readonly [number, number]>>,

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

  /** Share of managers at a foreign club who are nationals of that league. */
  FOREIGN_NATIONAL_SHARE: 0.8,

  /**
   * Reputation → employability bands. DESIGN: 0–20 non-league / minor abroad ·
   * 20–40 tier 4 · 40–60 tier 3 · 60–75 tier 2 · 75–90 tier 1 · 90+ elite.
   * `tiers` are the home tiers the band covers; `foreign` the leagues abroad.
   * Serves: 40–50% never get a second job (typecasting by band).
   */
  REPUTATION_BANDS: [
    { min: 0, tiers: [5], foreign: ['small'], elite: false },
    { min: 20, tiers: [4], foreign: [], elite: false },
    { min: 40, tiers: [3], foreign: [], elite: false },
    { min: 60, tiers: [2], foreign: ['mid'], elite: false },
    { min: 75, tiers: [1], foreign: [], elite: false },
    { min: 90, tiers: [1], foreign: ['big'], elite: true },
  ] as readonly {
    min: number
    tiers: readonly (1 | 2 | 3 | 4 | 5)[]
    foreign: readonly ('big' | 'mid' | 'small')[]
    elite: boolean
  }[],

  /** Tier-1 clubs ranked in the top N by prestige are "elite" (90+ band, −10 credit on hire). */
  ELITE_PRESTIGE_RANK: 6,

  // ---------------------------------------------------------------------------
  // Calendar (DESIGN.md "Season and match": 38 or 46 league games, cups, two
  // windows, ~40 weekly turns). Weeks are shared by every tier; a week can hold
  // more than one match for a club.
  // ---------------------------------------------------------------------------

  /** Weeks in a season: MATCH_WEEKS of football then the summer. */
  MATCH_WEEKS: 40,
  SUMMER_WEEKS: 6,
  get SEASON_WEEKS(): number {
    return this.MATCH_WEEKS + this.SUMMER_WEEKS
  },

  /** "Monthly" rolls happen every this many weeks. */
  MONTH_WEEKS: 4,

  /** League rounds per tier, index 0 = tier 1. DESIGN: 38 or 46. */
  LEAGUE_ROUNDS_BY_TIER: [38, 46, 46, 46, 46] as readonly number[],

  /** Season week of the winter window (played after that week's matches). */
  WINTER_WINDOW_WEEK: 20,

  /** Season week of the summer window: the second summer week. */
  get SUMMER_WINDOW_WEEK(): number {
    return this.MATCH_WEEKS + 1
  },

  /** Season weeks each cup round is played in. Last entry is the final. */
  NATIONAL_CUP_ROUND_WEEKS: [3, 8, 13, 18, 23, 28, 35] as readonly number[],
  LEAGUE_CUP_ROUND_WEEKS: [1, 6, 11, 16, 21, 26] as readonly number[],
  EUROPEAN_ROUND_WEEKS: [5, 12, 19, 27, 33] as readonly number[],

  /** Tiers whose clubs enter the league cup. DESIGN: tiers 1–2. */
  LEAGUE_CUP_TIERS: [1, 2] as readonly number[],

  /** European places: top N of tier 1 plus the national cup winner. DESIGN: four. */
  EUROPEAN_LEAGUE_PLACES: 4,

  /** Foreign entrants to the European competition, by league kind. Fills a 32-club bracket with the 5 home clubs. */
  EUROPEAN_FOREIGN_ENTRANTS: {
    big: 12,
    mid: 9,
    small: 6,
  } as Readonly<Record<'big' | 'mid' | 'small', number>>,

  /** Clubs promoted and relegated across each tier boundary. */
  UP_DOWN_PER_BOUNDARY: 3,

  /** Size of the bottom zone: "bottom four" in crisis hires and survival tags. */
  BOTTOM_ZONE: 4,

  // ---------------------------------------------------------------------------
  // Match model (DESIGN.md "Season and match"). Drives result variance and so
  // every credit-based target: median first spell, 30% inside a season.
  // ---------------------------------------------------------------------------

  /** Expected goals for the away side of two equal sides. The home side gets HOME_ADVANTAGE_GOALS on top. */
  GOALS_BASE: 1.15,

  /**
   * Home advantage in the one-shot model: a pre-match lean of this many extra
   * expected goals for the home side against an equal opponent. Serves: home
   * win / draw / away win ≈ 45 / 26 / 29 (to verify). Phase 3(c) replaces it
   * with the minute engine's pressure lean.
   */
  HOME_ADVANTAGE_GOALS: 0.35,

  /** Expected goals scale by exp(± sensitivity × strength difference). */
  GOAL_SENSITIVITY: 0.032,

  /** Results kept for form. DESIGN: last six. */
  FORM_WINDOW: 6,

  /** Strength swing from form: ±this at all wins / all losses over the window. */
  FORM_WEIGHT: 3,

  /** Strength swing from the manager's tactical ability: ±this at 100 / 0. Serves: good managers last, bad ones fail (first spell, top-tier tenures). */
  ABILITY_WEIGHT: 8,

  /** Strength swing from squad morale: ±this at 100 / 0. */
  MORALE_WEIGHT: 3,

  /**
   * Structure in the one-shot model (DESIGN.md "Formations and tactics"),
   * until the minute engine owns it. Bands are sums of effective rating ÷ 100.
   * Serves: no formation or style beats the mean points per game by more than 10%.
   */
  /** Expected goals × (1 ± this × midfield-band edge): the midfield drives pressure. */
  MID_EDGE_K: 0.08,
  /** Expected goals × (1 + this × (attack ÷ opposing defence − the standard ratio)): attackers against defenders drive chance quality. */
  ATTACK_DEFENCE_K: 0.2,
  /** The attack-to-defence power ratio of two 4-4-2s (two forwards over a keeper and back four): the zero of the rule above. */
  ATTACK_DEFENCE_STANDARD: 0.4,
  /** A wide side against a back line with fewer wide defenders than this adds this share of chances. */
  WIDTH_EDGE: 0.04,
  NARROW_DEFENCE_WIDTH: 2,
  /** Each defender beyond four cuts chances conceded by this share. */
  OVERLOAD_K: 0.05,
  /** Bounds that keep a side of nobodies from breaking the arithmetic: the least a band counts for, the most structure can lean expected goals. */
  BAND_FLOOR: 1,
  STRUCTURE_FACTOR_MIN: 0.6,
  STRUCTURE_FACTOR_MAX: 1.6,
  /** Expected goals for a side are capped here, so the Poisson table always has mass. */
  LAMBDA_MAX: 6,
  /** Style, one rule each. */
  STYLE_EFFECTS: {
    /** More pressure with a higher-rated XI (× on own goals when better), fewer but better chances (variance). */
    possession: { betterXi: 0.04, variance: 0.95 },
    /** Each pace or aerial player in the XI adds this to own expected goals; more shots of lower quality lets the opponent in a little. */
    direct: { perTrait: 0.015, concede: 1.03 },
    /** Chances after sustained defending: own goals up against an attacking opponent, own pressure down. */
    counter: { vsAttack: 1.06, own: 0.97, concede: 0.97 },
    /** More pressure, more fouls, faster condition drain. */
    pressing: { own: 1.05, concede: 1.03, drain: 1.3, fouls: 1.3 },
  } as const,
  /** The big-game trait: effective rating in a cup tie, derby or against a top side. */
  BIG_GAME_BONUS: 3,

  /** Mentality: attack scales both sides' expected goals up, defend down, by this. */
  MENTALITY_VARIANCE: 0.2,

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

  /** Tactical ability assumed for a club with no manager or an abstract foreign side. */
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
  FOREIGN_SQUAD_SIZE: 22,
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
  /** Condition lost over ninety minutes and won back each week of rest. */
  CONDITION_DRAIN_PER_90: 22,
  CONDITION_RECOVERY_PER_WEEK: 16,
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

  /** Anchoring tolerance the tests allow after rounding to one decimal; below the minimum strength the rating floor gets in the way. */
  ANCHOR_TOLERANCE: 0.15,
  ANCHOR_MIN_STRENGTH: 10,
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

  /** Peak age band. Squads older than the top lose strength each summer. */
  PEAK_AGE: [25, 29] as readonly [number, number],

  /** Strength lost per summer by a squad past its peak, uniform. DESIGN: 3–5. */
  AGEING_LOSS: [3, 5] as readonly [number, number],

  /** Strength gained per summer by a squad younger than the peak band. */
  YOUNG_SQUAD_GROWTH: 1,

  /** Mean age rises by this each summer before turnover. */
  AGE_DRIFT: 1,

  /** Mean age of incoming signings; turnover pulls the squad toward it. */
  SIGNING_AGE: 26,

  /** Mean age of promoted academy players. */
  ACADEMY_AGE: 19,

  /** Share of the gap to the gravity target closed each summer. Serves: 2–4 long top-tier tenures (a flat top produced none). */
  GRAVITY_RATE: 0.5,

  /** Transfer budget in £m per season = coefficient × wealth². Serves: earnings, big-spender ranks. */
  TRANSFER_BUDGET_PER_WEALTH_SQ: 0.012,

  /** Spend returns: gain = SPEND_GAIN_MAX × r / (r + 1), r = spend / normal budget. Diminishing. */
  SPEND_GAIN_MAX: 6,

  /** Dealing ability multiplies spend gain: 1 + this × (dealing − 50) / 50. */
  DEALING_EFFECT: 0.3,

  /** AI spends this share of its summer budget. */
  AI_SPEND_FRACTION: 1,
  /** The winter pot is this share of the normal budget. DESIGN: two windows. */
  WINTER_BUDGET_SHARE: 0.3,

  /** First-XI turnover each summer = base + slope × (spend / normal budget), capped. */
  TURNOVER_BASE: 0.15,
  TURNOVER_PER_BUDGET: 0.25,
  TURNOVER_MAX: 0.7,

  /** Academy players promoted into the XI = floor((development − offset) / step), clamped 0–max. */
  YOUTH_DEVELOPMENT_OFFSET: 25,
  YOUTH_DEVELOPMENT_STEP: 12,
  YOUTH_MAX_PER_SUMMER: 5,

  /** Strength gained next season per academy player in the XI (slow, cheap). */
  YOUTH_GAIN_PER_PLAYER: 0.6,

  /** Strength lost now per academy player replacing a senior (they are raw). */
  YOUTH_COST_PER_PLAYER: 0.4,

  /** Age needed for a youth-promoted player to count as a signing for ownership. */
  ACADEMY_COUNTS_AS_SIGNING: true,

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
  // Abroad (abstract season for the foreign leagues).
  // ---------------------------------------------------------------------------

  /** Games credited to a manager for a season abroad (no match sim). */
  FOREIGN_GAMES_PER_SEASON: 34,

  /** Noise (strength points) added when ranking a foreign league. */
  FOREIGN_SEASON_NOISE_SD: 6,

  /** Foreign club strength drifts toward its league strength by this share per season. */
  FOREIGN_GRAVITY_RATE: 0.3,

  /** Random strength shock per season for foreign clubs (sd). */
  FOREIGN_STRENGTH_SHOCK_SD: 2,

  /**
   * Abroad there is no match-by-match credit, so each month credit moves by
   * normal(mean, sd): the same slow erosion and noise a home spell sees.
   * Serves: careers abroad carry the same hazard as at home.
   */
  ABROAD_MONTHLY_CREDIT_MEAN: -1.5,
  ABROAD_MONTHLY_CREDIT_SD: 4,

  // ---------------------------------------------------------------------------
  // Expectation (DESIGN.md "Expectation"). Serves: median first spell ≈ 1.5
  // seasons and the 30% inside-a-season share, through the season-end delta.
  // ---------------------------------------------------------------------------

  /** Owner ambition lifts the target by up to this many places (ambition 1). */
  EXPECT_AMBITION_PLACES: 3,
  /** Ambition assumed for the abstract foreign clubs. */
  ABROAD_AMBITION: 0.5,

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
  /** Weekly roll while below threshold: base × (1 − perYear × years remaining), floored. DESIGN started at 10%; 4% lets eight weeks pass more often. Serves: unjust ≈ 20–30%. */
  SACK_ROLL_BASE: 0.04,
  SACK_ROLL_PER_YEAR: 0.2,
  SACK_ROLL_FLOOR: 0.03,
  /** Credit at or below this: sacked at once, and counted as deserved. DESIGN started at 5. */
  CREDIT_INSTANT_SACK: 8,
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
  STAR_SALE_STRENGTH: -5,
  STAR_SALE_EXPECTATION_EASE: 1,
  /** Dressing-room fallout rolls once per losing run of this length. */
  FALLOUT_TRIGGER_DEFEATS: 4,
  FALLOUT_P: 0.25,
  /** Back down: squad morale falls. Sell: ownership up, strength down, "difficult" progress. */
  FALLOUT_MORALE_LOSS: 10,
  FALLOUT_STRENGTH_LOSS: 3,
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
  AI_MUTUAL_ACCEPT_P: 0.05,
  /** Resigning: reputation hit depends on credit at the split. */
  RESIGN_CREDIT_SPLIT: 50,
  REP_RESIGN_HIGH: -1,
  REP_RESIGN_LOW: -5,
  /** AI resigns with this monthly chance while below threshold (jumping before the push). */
  AI_RESIGN_P: 0.02,
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
    european: 1.2,
    'foreign-big': 0.9,
    'foreign-mid': 0.5,
    'foreign-small': 0.3,
  } as Readonly<Record<string, number>>,
  REP_PROMOTION: 5,
  REP_RELEGATION: -6,

  // ---------------------------------------------------------------------------
  // Contracts and pay (DESIGN.md "Job market": salary by tier × reputation).
  // Serves: earnings scale in Legacy.
  // ---------------------------------------------------------------------------

  /** £m per season at reputation 50, index 0 = tier 1. */
  SALARY_BASE_BY_TIER: [3, 1, 0.4, 0.2, 0.08] as readonly number[],
  SALARY_BASE_ABROAD: { big: 3, mid: 1, small: 0.3 } as Readonly<Record<'big' | 'mid' | 'small', number>>,
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
  /** After losing a job an AI manager takes this many months before applying again. Serves: a handful past 1,000 games (immediate rehiring made 10% of careers continuous for 20 years). */
  AI_REST_MONTHS_AFTER_EXIT: 9,
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
  POACH_MIN_WEEKS: 46,
  AI_ACCEPT_APPROACH_P: 0.5,
  /** Declining an approach. DESIGN: credit +3, loyalty progress. */
  DECLINE_APPROACH_CREDIT: 3,
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
  AI_ABROAD_AFTER_MONTHS: 9,
  AI_ABROAD_P: 0.3,
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
    abroad: { expiry: 4 },
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
  /** Contract lengths the human may ask for at interview. DESIGN: one to four. */
  HUMAN_CONTRACT_YEARS_OPTIONS: [1, 2, 3, 4] as readonly number[],
  /** Chance a match week brings a press question. Serves: most weeks zero or one decision. */
  PRESS_QUESTION_P: 0.3,
  /** Press responses: confident lifts morale, defiant buys a little credit at morale's expense. */
  PRESS_RESPONSE_EFFECTS: {
    confident: { morale: 2, credit: 0 },
    measured: { morale: 0, credit: 0 },
    defiant: { morale: -2, credit: 1 },
  } as const,
  /** The board writes when credit is within this of the threshold. */
  BOARD_WARN_MARGIN: 10,
  /** Board responses: push back is a coin flip on credit; a promise buys credit and tightens the target. */
  BOARD_RESPONSE_EFFECTS: {
    pushBackSwing: 3,
    promiseCredit: 3,
    promisePlaces: 1,
  } as const,
  /** Selling a senior player: strength lost and £m raised (scaled by the club's normal budget). */
  SELL_STRENGTH_PER_PLAYER: 3,
  SELL_CASH_SHARE_OF_BUDGET: 0.4,

  // ---------------------------------------------------------------------------
  // The score (DESIGN.md "The score"). Serves: Legacy calibration — a 30-year
  // mid-table career and a 12-year trophy-laden career within ~20%.
  // ---------------------------------------------------------------------------

  /** Trophy points. DESIGN starting values. */
  TROPHY_POINTS: {
    european: 120,
    nationalCup: 50,
    leagueCup: 25,
    /** League titles by tier, index 0 = tier 1. */
    leagueByTier: [100, 40, 25, 15, 10],
    /** Promotion without the title, by the tier promoted from (tier 2 first). */
    promotionFromTier: [20, 12, 8, 5],
    foreign: { big: 80, mid: 40, small: 20 },
  } as const,

  /** Legacy = games × a + earnings(£m) × b + trophy points × c + players made × d. */
  LEGACY_WEIGHTS: { games: 0.2, earnings: 2, trophyPoints: 0.15, playersMade: 0.12 } as const,

  /** Bonuses as a share of the season's salary: for a trophy, for a promotion. Serves: earnings mix. */
  TROPHY_BONUS_SHARE: 0.25,
  PROMOTION_BONUS_SHARE: 0.5,

  /** Reference careers the Legacy weights are checked against (DESIGN: within ~20%). */
  LEGACY_ARCHETYPES: {
    midTableThirtyYears: { games: 1260, earnings: 35, trophyPoints: 30, playersMade: 120 },
    trophyLadenTwelveYears: { games: 600, earnings: 45, trophyPoints: 900, playersMade: 40 },
    /** Thirty years making players at small clubs: little money, few trophies, the fourth line. */
    makerThirtyYears: { games: 1260, earnings: 12, trophyPoints: 15, playersMade: 900 },
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
    /** A handful pass 1,000 games (of 500 careers). To verify. */
    thousandGameCount: { target: 5, min: 2, max: 15 },
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
    /** The best maker's Legacy lands within 20% of the best trophy-winner's. */
    makerLegacyRatio: { target: 1, min: 0.8, max: 1.25 },
    /** Buying finished players yields under 10% of players-made points. */
    boughtFinishedShare: { target: 0.05, min: 0, max: 0.1 },
  } as const,

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
