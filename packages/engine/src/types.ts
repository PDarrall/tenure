/**
 * State shapes. Everything here is plain, JSON-serialisable data. A saved
 * game is a `World` and nothing else.
 */
import type { RngState } from './rng.js'

export type ClubId = number
export type ManagerId = number
export type SpellId = number
export type VacancyId = number

/** Home pyramid tiers. Tier 5 is the abstracted non-league pool. */
export type Tier = 1 | 2 | 3 | 4 | 5

export type OwnerType = 'patient' | 'normal' | 'impatient' | 'erratic'

/** Three tactical shapes in a rock-paper-scissors loop: A beats B beats C beats A. */
export type Shape = 'A' | 'B' | 'C'
export type Mentality = 'attack' | 'balanced' | 'defend'
export type Result = 'W' | 'D' | 'L'

export type Competition =
  | 'league'
  | 'nationalCup'
  | 'leagueCup'
  | 'european'
  | 'foreignLeague'

export interface Owner {
  type: OwnerType
  /** 0–1. Shifts the board's target finish above the structural one. */
  ambition: number
}

export interface Squad {
  /** 0–100. Drifts toward the level set by wealth ("gravity"). */
  strength: number
  /** Mean age of the first XI. Peak is 25–29. */
  avgAge: number
  size: number
  /** 0–100. */
  morale: number
  /** Academy players in the first XI this season (youth developer tag). */
  academyInXi: number
}

export interface Honour {
  season: number
  competition: Competition
  /** Club it was won with. */
  clubId?: ClubId
  /** Tier the honour was won in (home competitions). */
  tier?: Tier
  /** Foreign league kind for titles won abroad. */
  league?: ForeignLeagueKind
}

export interface Club {
  id: ClubId
  name: string
  city: string
  /** Rivalries are drawn within a region. */
  region: number
  tier: Tier
  /** 0–100, slow-moving. */
  prestige: number
  /** 0–100. */
  wealth: number
  /** £m available on top of the seasonal budget (from sales). */
  cash: number
  owner: Owner
  /** 0–100. */
  fanPatience: number
  squad: Squad
  /** £m per season. */
  wageBudget: number
  honours: Honour[]
  rivals: ClubId[]
  managerId: ManagerId | null
  /** Last results, newest last, capped at FORM_WINDOW. */
  form: Result[]
  shape: Shape
  mentality: Mentality
  /** £m, reset each summer. Ranked within the division for the big-spender tag. */
  netSpendThisSeason: number
  /** Per-season counters, reset at season start. */
  thisSeason: ClubSeasonTally
  /** Season the club was last relegated in, for crisis hires. */
  lastRelegatedSeason: number | null
  /** Strength banked from academy promotions, released next summer. */
  pendingYouthGain: number
}

export type ForeignLeagueKind = 'big' | 'mid' | 'small'

/** An abstract club abroad: a job slot with a name, not a simulated team. */
export interface ForeignClub {
  id: ClubId
  name: string
  league: ForeignLeagueKind
  prestige: number
  strength: number
  managerId: ManagerId | null
}

export interface ForeignLeague {
  kind: ForeignLeagueKind
  name: string
  /** 0–100. Sets the reputation band that can work there. */
  prestige: number
  /** Typical squad strength; used as European opposition. */
  strength: number
  clubs: ForeignClub[]
}

export interface Event {
  week: number
  type: string
  payload: Record<string, unknown>
}

export interface World {
  seed: number
  /** Live generator state. Mutated as the simulation draws numbers. */
  rng: RngState
  /** Global week counter from 0. */
  week: number
  /** 1-based season counter. */
  season: number
  clubs: Club[]
  foreign: ForeignLeague[]
  managers: Manager[]
  /** This season's fixtures, every competition. */
  fixtures: Fixture[]
  /** This season's league tables, one row per club. */
  tables: TableRow[]
  cups: CupState[]
  /** Home clubs entering the European competition this season. */
  europeanEntrants: ClubId[]
  spells: Spell[]
  nextSpellId: SpellId
  vacancies: Vacancy[]
  nextVacancyId: VacancyId
  nextManagerId: ManagerId
  log: Event[]
}

// ---------------------------------------------------------------------------
// Managers (DESIGN.md "Managers", "Career model")
// ---------------------------------------------------------------------------

export type Background = 'ex-pro' | 'coach' | 'analyst'

/** Where a manager is native to: the home pyramid or one of the foreign leagues. */
export type Nationality = 'home' | ForeignLeagueKind

export type Tag =
  | 'promotion specialist'
  | 'survival specialist'
  | 'youth developer'
  | 'big spender'
  | 'overachiever'
  | 'cup manager'
  | 'loyal'
  | 'in demand'
  | 'mercenary'
  | 'difficult'
  | 'abroad'

export interface ManagerTag {
  tag: Tag
  /** Season after which the tag lapses unless renewed. */
  expiresSeason: number
}

/** 0–100 each. Hidden for AI; earned through play for the human. */
export interface Ability {
  tactical: number
  motivation: number
  development: number
  dealing: number
}

/** A job: a home club or an abstract foreign club. */
export type Post =
  | { kind: 'home'; clubId: ClubId }
  | { kind: 'abroad'; league: ForeignLeagueKind; clubId: ClubId }

/** One row per season managed. Tags and validation stats read these. */
export interface SeasonRecord {
  season: number
  post: Post
  /** Tier for home posts, null abroad. */
  tier: Tier | null
  games: number
  finish: number
  expectation: number
  promoted: boolean
  relegated: boolean
  trophies: number
  /** Sat in the bottom zone at a monthly check and finished outside it. */
  bottomFourEscape: boolean
  /** 1 = highest net spend in the division; null abroad. */
  netSpendRank: number | null
  cupFinals: number
  academyInXi: number
  fallouts: number
  boardRows: number
}

export type UnemployedActivity = 'wait' | 'punditry' | 'assistant' | 'abroad'

export type RetirementReason = 'no-offers' | 'age' | 'scandal' | 'voluntary'

export type ManagerStatus =
  | { kind: 'employed'; post: Post; spellId: SpellId }
  | { kind: 'unemployed'; sinceWeek: number; activity: UnemployedActivity; monthsSinceShortlisted: number }
  | { kind: 'retired'; week: number; reason: RetirementReason }

export interface ManagerHistory {
  spellIds: SpellId[]
  honours: Honour[]
  /** £m: salary, bonuses, payouts and unemployment income. */
  earnings: number
  games: number
  trophyPoints: number
  walkouts: number
  /** The −5 for stepping down to an assistant role is charged once per career. */
  steppedDown: boolean
  seasons: SeasonRecord[]
}

export interface Manager {
  id: ManagerId
  name: string
  nationality: Nationality
  /** Whole years; incremented each summer. */
  age: number
  /** Matches managed this season, reset each summer. */
  seasonGames: number
  background: Background
  /** 0–100, employability. */
  reputation: number
  /** 0–100, weight in shortlisting. */
  agent: number
  tags: ManagerTag[]
  ability: Ability
  /** 0–100 each. */
  trust: { players: number; board: number }
  preferredShape: Shape
  history: ManagerHistory
  status: ManagerStatus
  /** Season the manager entered the population; 0 for genesis. */
  cohortSeason: number
  isHuman: boolean
}

// ---------------------------------------------------------------------------
// Season (DESIGN.md "Season and match")
// ---------------------------------------------------------------------------

export interface Fixture {
  /** Season week (0-based) the match is played in. */
  week: number
  competition: Competition
  /** Cup round, 1-based; league round for the league. */
  round: number
  homeId: ClubId
  awayId: ClubId
  /** Tier for league fixtures. */
  tier?: Tier
  played: boolean
  homeGoals?: number
  awayGoals?: number
}

export interface TableRow {
  clubId: ClubId
  tier: Tier
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface CupState {
  competition: 'nationalCup' | 'leagueCup' | 'european'
  /** Season weeks of each round; last is the final. */
  roundWeeks: number[]
  /** Clubs still in. Foreign ids appear in the European competition. */
  remaining: ClubId[]
  /** Rounds already drawn and played. */
  roundsPlayed: number
  winnerId: ClubId | null
  finalistIds: ClubId[]
}

export interface ClubSeasonTally {
  cupFinals: number
  inBottomZone: boolean
  academyPromoted: number
}

// ---------------------------------------------------------------------------
// Tenure (DESIGN.md "Tenure model")
// ---------------------------------------------------------------------------

export type Promise = 'top-half' | 'promotion' | 'stability'

export type SpellEndReason = 'sacked' | 'mutual' | 'resigned' | 'poached' | 'expired' | 'retired'

export interface Contract {
  /** Global week the contract runs to (a season-end week). */
  endWeek: number
  /** £m per season. */
  salary: number
  yearsAtSigning: number
  promise: Promise
}

export interface SpellSeasonTally {
  games: number
  points: number
  /** Share of the first XI replaced in the last summer window. */
  xiTurnover: number
  fallouts: number
  boardRows: number
  /** £m earned in this season of the spell. */
  earned: number
}

export interface Spell {
  id: SpellId
  managerId: ManagerId
  post: Post
  startWeek: number
  endWeek: number | null
  endReason: SpellEndReason | null
  contract: Contract
  /** Multiplier on the club's normal transfer budget (promise, crisis). */
  budgetMultiplier: number
  /** Board target finish. */
  expectation: number
  /** Finish the squad's strength rank implies. */
  structuralTarget: number
  /** 0–ceiling. The sacking variable. */
  credit: number
  ceiling: number
  /** Board's sacking threshold; erratic owners re-roll monthly. */
  threshold: number
  seasonsCompleted: number
  /** Share of the first XI the manager signed, 0–1. */
  ownership: number
  /** Weeks with credit below the threshold over the whole spell; eight make a sacking deserved. */
  weeksBelowThreshold: number
  consecutiveDefeats: number
  crisisHire: boolean
  /** Extra seasons toward the loyal tag from declined approaches. */
  loyaltyBonus: number
  /** Set when a takeover has decided to replace the manager. */
  takeover: { week: number; replaceWeek: number } | null
  /** Set when a fallout has already been rolled for the current losing run. */
  falloutRolled: boolean
  season: SpellSeasonTally
  /** £m paid on the way out. */
  payout: number
  /** Whether a sacking was deserved (below threshold for DESERVED_WEEKS). */
  deserved: boolean | null
  /** Last season's finish, waiting for the summer expectation reset. */
  pendingReset: { finish: number; movedTier: boolean } | null
}

// ---------------------------------------------------------------------------
// Market (DESIGN.md "Job market", "Career model")
// ---------------------------------------------------------------------------

export type VacancyReason = SpellEndReason | 'unknown'

export interface Vacancy {
  id: VacancyId
  post: Post
  openedWeek: number
  reason: VacancyReason
  ownerType: OwnerType
  expectation: number
  /** £m normal summer budget. */
  budget: number
  contract: { years: number; salary: number }
  wantTags: Tag[]
  /** Managers who put themselves forward (the human, and AI by band). */
  applicants: ManagerId[]
  shortlist: ManagerId[]
  /** The one employed manager the club chose to call, if any. */
  poachTargetId: ManagerId | null
  /** Bands the search has widened by while unfilled. */
  widened: number
  /** True if the hire counts as a crisis appointment. */
  crisis: boolean
  filledWeek: number | null
  hiredManagerId: ManagerId | null
}
