import type { MatchState } from './match/minute.js'
import type { PreparedFixture } from './season/season.js'
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

export type Mentality = 'attack' | 'balanced' | 'defend'
export type Result = 'W' | 'D' | 'L'

// ---------------------------------------------------------------------------
// Players and tactics (DESIGN.md "Players", "Formations and tactics")
// ---------------------------------------------------------------------------

export type PlayerId = number
export type Position = 'GK' | 'D' | 'M' | 'F'
export type Side = 'L' | 'C' | 'R' | 'any'

/** The twelve traits. Each is exactly one rule in the engine (players/traits.ts). */
export type Trait =
  | 'poacher'
  | 'playmaker'
  | 'pace'
  | 'aerial'
  | 'tough tackler'
  | 'leader'
  | 'big-game'
  | 'consistent'
  | 'versatile'
  | 'loyal'
  | 'injury-prone'
  | 'hot-headed'

/** The CM 01/02 set (to verify against the game's default list). */
export type Formation =
  | '4-4-2'
  | '4-4-2 diamond'
  | '4-3-3'
  | '4-5-1'
  | '4-2-4'
  | '4-1-3-2'
  | '4-3-1-2'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '5-4-1'
  | '5-3-2 sweeper'

export type Style = 'possession' | 'direct' | 'counter' | 'pressing'

/** Part of an AI manager's identity: whether selection leans toward under-24s. */
export type YouthLean = 'youth-first' | 'results-first'

export interface FormationSlot {
  position: Position
  side: Side
}

/** A tactic is three choices. */
export interface Tactic {
  formation: Formation
  mentality: Mentality
  style: Style
}

/** The human's picked side. autoPick lets the assistant choose. */
export interface Selection {
  xi: PlayerId[]
  bench: PlayerId[]
  captain: PlayerId | null
  autoPick: boolean
}

export interface PlayerSeasonStats {
  season: number
  clubId: ClubId
  tier: Tier | null
  apps: number
  starts: number
  minutes: number
  goals: number
  assists: number
  yellows: number
  reds: number
  /** Sum of match ratings and how many were given, for the average. */
  ratingSum: number
  rated: number
  /** Rating gained from minutes this season (Your players). */
  growth: number
  /** Rating when the season's record opened, for the squad screen's change this season. */
  ratingAtStart: number
}

export type MadeCircumstance = 'signed' | 'debut' | 'promoted'

/** A permanent tag: this manager made this player theirs (DESIGN.md "Your players"). */
export interface MadeBy {
  managerId: ManagerId
  clubId: ClubId
  week: number
  circumstance: MadeCircumstance
  /** Rating on the day. */
  rating: number
  /** Grows with starts, a debut, a promotion, a renewal, a decision that backed him. */
  bond: number
  /** Rating gained from minutes while with this manager. */
  growth: number
  /** Tier of the club on the day, for the "tier above" milestone. */
  tier: Tier | null
  /** The tier-above milestone is paid once. */
  tierAboveDone?: boolean
}

export interface Player {
  id: PlayerId
  name: string
  nationality: Nationality
  age: number
  position: Position
  side: Side
  /** 1–100, one decimal. The number. */
  rating: number
  /** Hidden; scouts give a range. */
  potential: number
  /** 0–100. Drops with minutes, recovers with rest. */
  condition: number
  /** 0–100. */
  morale: number
  /** Weeks still out. */
  injuryWeeks: number
  /** Matches still banned. */
  suspension: number
  /** Yellow cards this season. */
  yellows: number
  /** Wage in £k a week; years left on the deal. */
  contract: { years: number; wage: number }
  /** £m. */
  value: number
  traits: Trait[]
  /** Current club id (a European opponent's for its generated squad); 0 when a free agent. */
  clubId: ClubId
  /** Season he became a free agent, while he is one. */
  freeSince?: number | null
  /** The club he left last, for the transfer record. */
  lastClubId?: ClubId
  /** Came through the academy of the club that promoted him. */
  academy: boolean
  /** The director's estimate against the truth while it reveals (DESIGN.md "Every signing is a bet"); absent for anyone not bought through a card. */
  scouted?: Scouted | null
  /** Who sold him last, until the shine check settles. */
  soldBy?: SoldBy | null
  /** A candidate from abroad, generated for a card; forgotten if nobody signs him by the deadline. */
  abroad?: boolean
  /** Out on loan, if so. */
  loan?: Loan | null
  /** What a loan that went well added to his price, as a multiplier on his value. */
  loanPremium?: number
  /** Has played a first-team match. */
  debuted: boolean
  retired: boolean
  season: PlayerSeasonStats
  history: PlayerSeasonStats[]
  madeBy: MadeBy[]
}

export type Competition =
  | 'league'
  | 'nationalCup'
  | 'leagueCup'
  | 'championsCup'
  | 'europaCup'
  | 'conferenceCup'

export type CupCompetition = Exclude<Competition, 'league'>
export type EuropeanCompetition = 'championsCup' | 'europaCup' | 'conferenceCup'

/** A round of a cup as the tunables lay it out: its week and slot, who enters, a second leg, a neutral ground. */
export interface CupRoundSpec {
  week: number
  /** 0 the weekend, 1 the midweek. */
  slot: 0 | 1
  /** Tiers entering at this round; 'europe' is the tier-1 clubs in Europe (the League Cup's third round). */
  entrants: readonly (Tier | 'europe')[]
  secondLeg?: { week: number; slot: 0 | 1 }
  neutral?: boolean
}

/** A round as the competition holds it: the spec, its number, its name, and whether it is a group matchday. */
export interface CupRound extends CupRoundSpec {
  round: number
  label: string
  group?: boolean
}

export interface GroupRow {
  clubId: ClubId
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  points: number
}

export interface CupGroup {
  index: number
  clubIds: ClubId[]
  rows: GroupRow[]
}

/** A two-legged tie in play: the first leg's score waits for the second. */
export interface CupTie {
  id: number
  round: number
  /** Home in the first leg. */
  homeId: ClubId
  awayId: ClubId
  firstLeg: { homeGoals: number; awayGoals: number } | null
}

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
  /** The tactic the club last played with; AI clubs take it from their manager. */
  formation: Formation
  style: Style
  mentality: Mentality
  /** The squad, ids into world.players. */
  playerIds: PlayerId[]
  /** £m, reset each summer. Ranked within the division for the big-spender tag. */
  netSpendThisSeason: number
  /** Per-season counters, reset at season start. */
  thisSeason: ClubSeasonTally
  /** Season the club was last relegated in, for crisis hires. */
  lastRelegatedSeason: number | null
  /** Strength banked from academy promotions, released next summer. */
  pendingYouthGain: number
  /** The director of football (DESIGN.md "Transfers"): runs the market inside the budgets; the manager decides. */
  director: Director
  /** £m left to spend this season: the board's budget for the summer, topped up for January, plus sales. */
  transferPot: number
  /** The first XI when the window opened, for the turnover at its close. */
  xiAtWindowOpen?: PlayerId[]
  /** Bids the director has placed this window (AI clubs trade to a quota). */
  windowBids?: number
  /** The four levels (DESIGN.md "Club"), 1–5, set by wealth and raised by a granted request. */
  levels: ClubLevels
  /** The stadium: capacity caps attendance; only a granted request expands it. */
  stadium: Stadium
}

export type LevelName = 'coaching' | 'scouting' | 'medical' | 'academy'

export type ClubLevels = Record<LevelName, number>

/** Works granted this season: capacity is cut until the season ends, then rises; wealth rises at each of the next season ends. */
export interface StadiumExpansion {
  season: number
  from: number
  to: number
  wealthSeasonsLeft: number
}

export interface Stadium {
  /** Thousands. */
  capacity: number
  expansion: StadiumExpansion | null
  /** Seats past works added, thousands: their income comes onto the summer pot. */
  added: number
}

/** One per club. His judgement scales how far his estimates sit from the truth. */
export interface Director {
  name: string
  /** 0–100, from the club's scouting level and wealth. */
  judgement: number
}

/**
 * What the director said about a signing when he was bought, against the
 * truth that reveals over his first matches (DESIGN.md "Every signing is a bet").
 */
export interface Scouted {
  /** The director's point estimate of rating and potential at signing. */
  estimate: number
  potentialEstimate: number
  /** Half the width of the range on the card, from the director's judgement. */
  halfWidth: number
  /** Matches seen since signing; the truth is fully out at SIGNING_REVEAL_MATCHES. */
  matchesSeen: number
  revealed: boolean
  fee: number
  fromClubId: ClubId
  /** Who signed him (the manager the hit or flop lands on). */
  managerId: ManagerId | null
  week: number
}

/** A player sold: who let him go, so a player who shines elsewhere costs the seller. */
export interface SoldBy {
  managerId: ManagerId
  clubId: ClubId
  season: number
  fee: number
  /** Whether the reputation cost has already been paid. */
  settled: boolean
}

/** A bid the director has made: it negotiates itself at the next close (one roll on the club, one on the player). */
export interface Bid {
  id: number
  clubId: ClubId
  playerId: PlayerId
  fee: number
  /** £k a week offered. */
  wage: number
  years: number
  week: number
  /** The manager who approved it (the signing is theirs). */
  managerId: ManagerId | null
  /** Why the director proposed him; kept for the news. */
  reason: SigningReason
  /** A player following his manager to a new club (DESIGN.md "Following you"): no estimate to reveal, the old club's asking price. */
  follow?: boolean
}

export type SigningReason = 'need' | 'request' | 'bargain'

/** What the manager asked the director for: shapes next week's cards. */
export interface TargetProfile {
  position?: Position
  maxAge?: number
  minRating?: number
}

/** A request (DESIGN.md "Requests"): to the board, the director or a player; each a bet with a stated likelihood. */
export type RequestAsk =
  | 'budget'
  | 'wages'
  | 'stadium'
  | 'coaching'
  | 'academy'
  | 'medical'
  | 'scouting'
  | 'backing'
  | 'newContract'
  | 'profile'
  | 'named'
  | 'sell'
  | 'loan'
  | 'talks'
  | 'contract'
  | 'captaincy'
  | 'playingTime'

/** A board ask refused: not to be repeated at this club until the week named (DESIGN.md "Requests"). */
export interface RequestLock {
  ask: RequestAsk
  clubId: ClubId
  untilWeek: number
}

/** A signing agreed in principle outside a window: the director's card as it stood, confirmed as a bid when the window opens. */
export interface AgreedTarget {
  playerId: PlayerId
  fromClubId: number
  name: string
  position: Position
  fee: number
  wage: number
  estimate: number
  potentialEstimate: number
  halfWidth: number
  reason: SigningReason
  confidence: Confidence
  gain: number
  need: FormationSlot
  week: number
}

export interface Request {
  to: 'board' | 'director' | 'player'
  ask: RequestAsk
  playerId?: PlayerId
  profile?: TargetProfile
  /** A new contract: the length asked for. */
  years?: number
}

/** A promise of playing time: this many starts by this week, or it is a fallout. */
export interface PlayingPromise {
  playerId: PlayerId
  week: number
  byWeek: number
  startsAtPromise: number
  startsNeeded: number
}

/** A player out on loan (DESIGN.md "Transfers"): a season or half of one, the parent club paying part of the wage, sometimes with a fee. */
export interface Loan {
  fromClubId: ClubId
  toClubId: ClubId
  season: number
  /** The week the loan runs to: the January deadline for half a season, the last match week for a whole one. */
  untilWeek: number
  /** The share of the wage the borrowing club pays. */
  wageShare: number
  fee: number
  /** His season appearances when the loan began, so the loan's own games can be counted off it. */
  startApps: number
}

/** A foreign side generated for a European competition (DESIGN.md "World"): a name, a strength drawn by competition and stage, a squad while a tie against a home club is on. */
export interface EuropeanOpponent {
  id: ClubId
  name: string
  competition: EuropeanCompetition
  strength: number
  /** Generated when the tie is prepared, dropped once it is settled. */
  playerIds: PlayerId[]
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
  /** This season's European field beyond the home entrants, regenerated each season. */
  europeanOpponents: EuropeanOpponent[]
  managers: Manager[]
  /** This season's fixtures, every competition. */
  fixtures: Fixture[]
  /** This season's league tables, one row per club. */
  tables: TableRow[]
  cups: CupState[]
  /** Home clubs in each European competition this season (DESIGN.md "World": by finish and cup wins, places passing down). */
  europeanPlaces: Record<EuropeanCompetition, ClubId[]>
  /** Weeks in the year this world was made for: a save from another calendar cannot be continued. */
  calendar: number
  spells: Spell[]
  nextSpellId: SpellId
  vacancies: Vacancy[]
  nextVacancyId: VacancyId
  nextManagerId: ManagerId
  /** Every player, by id − 1; a slot is null once a player has gone and nobody keeps his record. */
  players: (Player | null)[]
  nextPlayerId: PlayerId
  /** Bids waiting for the next close, the human's and the AI's. */
  bids: Bid[]
  nextBidId: number
  /** The human player, if this world is a career rather than a simulation. */
  human: HumanState | null
  /** 'career' keeps only events that concern the human plus season-level news. */
  logPolicy: LogPolicy
  log: Event[]
}

// ---------------------------------------------------------------------------
// Managers (DESIGN.md "Managers", "Career model")
// ---------------------------------------------------------------------------

export type Background = 'ex-pro' | 'coach' | 'analyst'

/** Where a person is from: the home pyramid or one of three continental name pools. Nothing else reads it. */
export type Nationality = 'home' | 'big' | 'mid' | 'small'

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

/** A job: a home club. There are no posts abroad (DESIGN.md "World"). */
export type Post = { kind: 'home'; clubId: ClubId }

/** One row per season managed. Tags and validation stats read these. */
export interface SeasonRecord {
  season: number
  post: Post
  tier: Tier
  games: number
  finish: number
  expectation: number
  promoted: boolean
  relegated: boolean
  trophies: number
  /** Sat in the bottom zone at a monthly check and finished outside it. */
  bottomFourEscape: boolean
  /** 1 = highest net spend in the division. */
  netSpendRank: number | null
  cupFinals: number
  academyInXi: number
  fallouts: number
  boardRows: number
}

export type UnemployedActivity = 'wait' | 'punditry' | 'assistant'

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
  /** The fourth score line (DESIGN.md "Your players"), mirrored from players.made events. */
  playersMade: number
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
  /** Part of the manager's identity (DESIGN.md "Formations and tactics"). */
  preferredFormation: Formation
  style: Style
  youthLean: YouthLean
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
  /** 0 the weekend, 1 the midweek (DESIGN.md "World": no club plays more than twice in a week). */
  slot: 0 | 1
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
  /** A neutral ground: no home lean (the Cup's semi-finals and final, every final). */
  neutral?: boolean
  /** Leg of a two-legged tie. */
  leg?: 1 | 2
  tieId?: number
  /** The first leg's score carried into the second, from this fixture's home side's view. */
  aggregate?: { home: number; away: number }
  /** Group index for a European group matchday. */
  group?: number
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
  competition: CupCompetition
  /** Every round in order, the final last; group matchdays first in Europe. */
  rounds: CupRound[]
  /** Clubs in the competition and not out: the whole field during a group stage. Generated opponents' ids appear in Europe. */
  remaining: ClubId[]
  /** Clubs entering at each round, by round index. */
  entrants: ClubId[][]
  /** Rounds played to the end (a two-legged round counts once its second leg is played). */
  roundsPlayed: number
  winnerId: ClubId | null
  finalistIds: ClubId[]
  groups: CupGroup[]
  /** Two-legged ties in play. */
  ties: CupTie[]
  nextTieId: number
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
  /** Board requests refused this season (DESIGN.md "Requests"); the third is a board row. Absent in older saves. */
  refusals?: number
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
  /** The senior player behind an open fallout, if any. */
  falloutPlayerId?: number | null
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

// ---------------------------------------------------------------------------
// Play (DESIGN.md "Turn structure", phase 2): one human manager, one week per
// turn, decisions queued by the engine and answered from outside.
// ---------------------------------------------------------------------------

export type DecisionKind =
  | 'offer'
  | 'approach'
  | 'mutualConsent'
  | 'renewal'
  | 'fallout'
  | 'summerWindow'
  | 'winterWindow'
  | 'press'
  | 'board'
  | 'activity'
  | 'playerContract'
  | 'newDeal'
  | 'wantsAway'
  | 'signing'
  | 'sale'
  | 'follow'

/** How sure the adviser is of an option, in words (DESIGN.md "Decisions are bets"). */
export type Confidence = 'sure thing' | 'likely' | 'gamble'

/** What an option's roll moves: the spell's credit, the manager's reputation, or morale (a player's or the squad's). */
export type BetUnit = 'credit' | 'reputation' | 'morale'

/**
 * The hidden dice behind an option: the roll is mean + sd × z, in `unit`.
 * The words on the card (likely, downside, confidence) are drawn from these.
 */
export interface Bet {
  mean: number
  sd: number
  unit: BetUnit
}

export interface DecisionOption {
  key: string
  label: string
  detail?: string
  /** What it will likely do, in words. */
  likely?: string
  /** What could go wrong, in words. */
  downside?: string
  confidence?: Confidence
  /** The dice; absent when the option has no roll of its own (it is settled by another system, or is a plain refusal). */
  bet?: Bet
  /** The cautious option: lowest variance, what Continue applies. */
  isDefault?: boolean
  /** A bold option: higher variance than the default. Counted for the fairness target. */
  bold?: boolean
}

export interface Decision {
  id: number
  kind: DecisionKind
  /** Week it was raised. */
  week: number
  /** Week from which the default applies if unanswered. */
  deadlineWeek: number
  /** Who is asking: board, agent, press, staff. */
  from: 'board' | 'agent' | 'press' | 'staff' | 'director'
  title: string
  body: string
  options: DecisionOption[]
  defaultKey: string
  /** The turn cannot sensibly proceed without an answer. */
  blocking: boolean
  payload: Record<string, unknown>
}

/** Summer or winter window plan for the human's club. */
export interface WindowChoice {
  /** Share of the pot to spend, 0–1. */
  spend: number
  /** Academy players to promote (summer only). */
  youth: number
  /** Senior players sold for cash. */
  sell: number
}

export interface HumanState {
  managerId: ManagerId
  pending: Decision[]
  nextDecisionId: number
  /** Sticky per-match choices. */
  tactic: Tactic
  selection: Selection
  /** Vacancies the human turned down; the club moves on. */
  declinedVacancies: VacancyId[]
  /** Plan for the next window, set by a decision. */
  windowChoice: WindowChoice | null
  /** Answers to this summer's expiring contracts, read when the summer settles them. */
  contractChoices: Record<number, 'release' | { years: number; wage: number }>
  /** A match week stopped before kick-off so the human can watch it (phase 3d); null between matches. */
  watched: WatchedWeek | null
  /** How Continue plays a match from the match screen (DESIGN.md "Interface", Result first); MATCH_PLAY_DEFAULT when unset. */
  matchPlay?: MatchPlay
  /** Vacancies the human withdrew from: the agent never puts them forward there again. */
  agentWithdrawn: VacancyId[]
  /** What the manager asked the director for; null when nothing is asked. */
  targetProfile?: TargetProfile | null
  /** The director has said once that the pot is empty and he is looking at frees, loans and swaps. */
  noBudgetTold?: boolean
  /** The manager's shortlist: players to name to the director. */
  shortlist?: PlayerId[]
  /** Candidates declined this window, so the director does not bring the same name back. */
  declinedPlayers?: PlayerId[]
  /** Targets agreed in principle outside a window (DESIGN.md "Transfers", On arrival): bids the day the window opens unless cancelled. */
  agreedTargets?: AgreedTarget[]
  /** Promises of playing time still to be kept. */
  promises?: PlayingPromise[]
  /** The week of the last request to the board: one a month (DESIGN.md "Requests"). */
  boardAskedWeek?: number
  /** Board asks refused and locked. */
  requestLocks?: RequestLock[]
}

/** Enough of a fixture to find it again in world.fixtures. */
export interface FixtureKey {
  competition: Competition
  round: number
  homeId: ClubId
  awayId: ClubId
}

/**
 * A slot of a match week read before kick-off and held for the match view:
 * the human's division (or the human's cup tie) runs in the minute engine,
 * everything else in the slot waits for the fast path at commit. Plain data,
 * so a save taken mid-match resumes at the same minute.
 */
/** To full time: one press to the result. To key events: each press plays to the next pause. */
export type MatchPlay = 'fullTime' | 'keyEvents'

export interface WatchedWeek {
  seasonWeek: number
  slot: { kind: 'league' } | { kind: 'cup'; competition: CupCompetition }
  /** Which slot of the week: 0 the weekend, 1 the midweek. */
  slotIndex: 0 | 1
  /** The fixtures played in the minute engine, the human's first. */
  prepared: PreparedFixture[]
  matches: MatchState[]
  /** The rest of the slot, played on the fast path when the watched matches are committed. */
  others: FixtureKey[]
}

export interface HumanInputs {
  tactic?: Partial<Tactic>
  selection?: Partial<Selection>
  /** Players the human wants to talk terms with: a contract decision is queued for each. */
  contractOffers?: PlayerId[]
  /** Vacancies to put the human's name forward for. */
  apply?: VacancyId[]
  withdraw?: VacancyId[]
  /** Decision id → chosen option key. */
  answers?: Record<number, string>
  /** Asks of the board, the director and players (DESIGN.md "Requests"), each resolved with a roll this turn. */
  requests?: Request[]
  shortlistAdd?: PlayerId[]
  shortlistRemove?: PlayerId[]
  /** Agreed targets the manager calls off before the window opens. */
  cancelAgreed?: PlayerId[]
  activity?: UnemployedActivity
  resign?: boolean
  retire?: boolean
}

export type LogPolicy = 'full' | 'career'
