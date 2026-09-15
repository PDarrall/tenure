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
  log: Event[]
}
