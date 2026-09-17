import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, gravityTarget, round1 } from '../world/gen.js'
import { managerAt } from '../lookup.js'
import type { Club, Manager, Player, Position, Result, Tier, World } from '../types.js'
import { anchorSquad, forgetPlayer, makePlayer, pickFreeAgent, releasePlayer, signFreeAgent, squadSizeFor, valueFor, freeAgents } from '../players/gen.js'
import { clubFormation, squadOf, autoPick } from '../players/select.js'
import { slotsOf } from '../players/formations.js'
import { wageDemand as contractWageDemand } from '../players/contracts.js'
import { milestone, tagPlayer } from '../players/made.js'

export function managerOf(world: World, club: Club): Manager | undefined {
  return managerAt(world, club)
}

/** The transfer budget a club normally has for a summer, £m. */
export function normalBudget(club: Club): number {
  return round1(T.TRANSFER_BUDGET_PER_WEALTH_SQ * club.wealth * club.wealth)
}

export function updateMorale(club: Club, result: Result, motivation: number): void {
  const delta =
    result === 'W'
      ? T.MORALE_WIN * (T.MORALE_WIN_MOTIVATION_BASE + motivation / 100)
      : result === 'L'
        ? T.MORALE_LOSS * (T.MORALE_LOSS_MOTIVATION_BASE - motivation / 100)
        : 0
  club.squad.morale = round1(clamp(club.squad.morale + delta, 0, 100))
}

export function decayMorale(club: Club): void {
  club.squad.morale = round1(club.squad.morale + T.MORALE_DECAY * (T.MORALE_INITIAL - club.squad.morale))
}

export interface WindowSummary {
  clubId: number
  managerId: number | null
  spend: number
  gain: number
  /** Share of the first XI replaced. */
  turnover: number
  youth: number
}

/**
 * A transfer window for an AI club: spend the pot, take the diminishing
 * strength gain, churn the squad, and in summer promote academy players.
 */
export function runWindow(world: World, rng: Rng, club: Club, summer: boolean, budgetMultiplier: number): WindowSummary {
  const manager = managerOf(world, club)
  const dealing = manager ? manager.ability.dealing : T.SCALE_MIDPOINT
  const development = manager ? manager.ability.development : T.SCALE_MIDPOINT
  const normal = normalBudget(club)
  const pot = summer ? normal * budgetMultiplier : normal * T.WINTER_BUDGET_SHARE
  const spend = round1(Math.max(0, pot * (summer ? T.AI_SPEND_FRACTION : 1)))
  const r = normal > 0 ? spend / normal : 0
  const gain = round1(((T.SPEND_GAIN_MAX * r) / (r + 1)) * (1 + (T.DEALING_EFFECT * (dealing - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT))
  let turnover = summer ? T.TURNOVER_BASE + T.TURNOVER_PER_BUDGET * r : T.TURNOVER_PER_BUDGET * r
  turnover = clamp(turnover, 0, T.TURNOVER_MAX)

  let youth = 0
  if (summer) {
    youth = clamp(Math.floor((development - T.YOUTH_DEVELOPMENT_OFFSET) / T.YOUTH_DEVELOPMENT_STEP), 0, T.YOUTH_MAX_PER_SUMMER)
    club.squad.academyInXi = youth
    club.thisSeason.academyPromoted = youth
    club.pendingYouthGain = round1(club.pendingYouthGain + T.YOUTH_GAIN_PER_PLAYER * youth)
    if (T.ACADEMY_COUNTS_AS_SIGNING) turnover = clamp(turnover + youth / T.FIRST_XI, 0, 1)
  }

  const oldAge = club.squad.avgAge
  const seniorShare = summer ? Math.max(0, turnover - youth / T.FIRST_XI) : turnover
  club.squad.avgAge = round1(
    oldAge * (1 - turnover) + T.SIGNING_AGE * seniorShare + (summer ? (T.ACADEMY_AGE * youth) / T.FIRST_XI : 0),
  )
  club.squad.strength = round1(clamp(club.squad.strength + gain - T.YOUTH_COST_PER_PLAYER * youth, 1, 100))
  club.netSpendThisSeason = round1(club.netSpendThisSeason + spend)

  const summary: WindowSummary = {
    clubId: club.id,
    managerId: club.managerId,
    spend,
    gain,
    turnover: round1(turnover * 100) / 100,
    youth,
  }
  emit(world, 'squad.window', { ...summary, summer, season: world.season })
  applyWindowToSquad(world, rng, club, turnover, youth, 0)
  return summary
}

/**
 * The player's window: a share of the pot, a number of academy promotions,
 * and senior sales that raise cash and hand the XI to the manager.
 */
export function runHumanWindow(
  world: World,
  rng: Rng,
  club: Club,
  summer: boolean,
  budgetMultiplier: number,
  choice: { spend: number; youth: number; sell: number },
): WindowSummary {
  const manager = managerOf(world, club)
  const dealing = manager ? manager.ability.dealing : T.SCALE_MIDPOINT
  const normal = normalBudget(club)
  const pot = summer ? normal * budgetMultiplier : normal * T.WINTER_BUDGET_SHARE
  const spend = round1(Math.max(0, pot * clamp(choice.spend, 0, 1)))
  const r = normal > 0 ? spend / normal : 0
  const gain = round1(((T.SPEND_GAIN_MAX * r) / (r + 1)) * (1 + (T.DEALING_EFFECT * (dealing - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT))
  const youth = summer ? clamp(Math.floor(choice.youth), 0, T.YOUTH_MAX_PER_SUMMER) : 0
  const sold = clamp(Math.floor(choice.sell), 0, T.FIRST_XI)
  let turnover = summer ? T.TURNOVER_BASE + T.TURNOVER_PER_BUDGET * r : T.TURNOVER_PER_BUDGET * r
  turnover = clamp(turnover + sold / T.FIRST_XI, 0, T.TURNOVER_MAX)
  if (summer && youth > 0) {
    club.squad.academyInXi = youth
    club.thisSeason.academyPromoted = youth
    club.pendingYouthGain = round1(club.pendingYouthGain + T.YOUTH_GAIN_PER_PLAYER * youth)
    if (T.ACADEMY_COUNTS_AS_SIGNING) turnover = clamp(turnover + youth / T.FIRST_XI, 0, 1)
  }
  const cash = round1(sold * T.SELL_CASH_SHARE_OF_BUDGET * normal)
  club.cash = round1(club.cash + cash)
  const oldAge = club.squad.avgAge
  const seniorShare = Math.max(0, turnover - youth / T.FIRST_XI)
  club.squad.avgAge = round1(oldAge * (1 - turnover) + T.SIGNING_AGE * seniorShare + (T.ACADEMY_AGE * youth) / T.FIRST_XI)
  club.squad.strength = round1(clamp(club.squad.strength + gain - T.YOUTH_COST_PER_PLAYER * youth - T.SELL_STRENGTH_PER_PLAYER * sold, 1, 100))
  club.netSpendThisSeason = round1(club.netSpendThisSeason + spend - cash)
  const summary: WindowSummary = { clubId: club.id, managerId: club.managerId, spend, gain, turnover: round1(turnover * 100) / 100, youth }
  emit(world, 'squad.window', { ...summary, summer, sold, cash, human: true, season: world.season })
  applyWindowToSquad(world, rng, club, turnover, youth, sold)
  return summary
}

export interface SummerSquadSummary {
  ageing: number
  gravity: number
  youthReleased: number
}

/** Summer squad drift before the window: release youth gains, age, gravitate. */
export function summerSquad(world: World, rng: Rng, club: Club): SummerSquadSummary {
  const youthReleased = club.pendingYouthGain
  club.pendingYouthGain = 0
  club.squad.avgAge = round1(club.squad.avgAge + T.AGE_DRIFT)
  let ageing = 0
  if (club.squad.avgAge > T.PEAK_AGE[1]) ageing = -rng.int(T.AGEING_LOSS[0], T.AGEING_LOSS[1])
  else if (club.squad.avgAge < T.PEAK_AGE[0]) ageing = T.YOUNG_SQUAD_GROWTH
  const gravity = round1(T.GRAVITY_RATE * (gravityTarget(club.wealth) - club.squad.strength))
  club.squad.strength = round1(clamp(club.squad.strength + youthReleased + ageing + gravity, 1, 100))
  club.squad.academyInXi = 0
  emit(world, 'squad.summer', { clubId: club.id, youthReleased, ageing, gravity, strength: club.squad.strength })
  summerPlayers(world, rng, club)
  return { ageing, gravity, youthReleased }
}


/** The starting XI's ids, the assistant's pick in the club's formation. */
function firstXi(world: World, club: Club): number[] {
  return autoPick(world, club, clubFormation(world, club)).xi
}

/**
 * Turnover in player terms: the abstract window replaces a share of the XI
 * with generated signings at the club's new level, and promotes academy
 * players. Strength is the master number, so the squad is re-anchored after.
 */
export function applyWindowToSquad(world: World, rng: Rng, club: Club, turnover: number, youth: number, sold: number): void {
  const manager = managerOf(world, club)
  const xi = firstXi(world, club)
  const leaving = Math.min(xi.length, Math.round(turnover * T.FIRST_XI))
  // Sold players go first (the manager's own sale), then the churn from the lowest-value starters.
  const starters = xi.map((id) => world.players[id - 1]).filter((p): p is Player => p !== null && p !== undefined)
  starters.sort((a, b) => a.value - b.value || a.id - b.id)
  const out = starters.slice(0, leaving)
  for (const p of out) {
    releasePlayer(world, p, club)
    emit(world, 'player.left', { playerId: p.id, clubId: club.id, name: p.name, rating: p.rating, fee: p.value, reason: sold > 0 ? 'sold' : 'window', season: world.season })
    moveOn(world, rng, p, club)
  }
  const formation = clubFormation(world, club)
  const slots = slotsOf(formation)
  const signings = leaving - Math.min(leaving, youth)
  for (let i = 0; i < signings; i++) {
    const slot = slots[(i + 1) % slots.length]!
    const fromPool = signFromPool(world, club, slot.position)
    const p =
      fromPool ??
      makePlayer(world, rng, club.id, club.tier, {
        position: slot.position,
        side: slot.side,
        age: T.SIGNING_AGE + rng.int(-3, 3),
        rating: club.squad.strength + rng.normal(0, T.STARTER_RATING_SD),
      })
    if (!fromPool) club.playerIds.push(p.id)
    emit(world, 'player.signed', { playerId: p.id, clubId: club.id, managerId: manager ? manager.id : null, name: p.name, rating: p.rating, fee: p.value, season: world.season })
    if (manager) tagPlayer(world, p, manager, club, 'signed')
  }
  for (let i = 0; i < youth; i++) {
    const slot = slots[1 + rng.int(0, slots.length - 2)]!
    const p = makePlayer(world, rng, club.id, club.tier, {
      position: slot.position,
      side: slot.side,
      age: rng.int(T.ACADEMY_AGE_RANGE[0], T.ACADEMY_AGE_RANGE[1]),
      rating: club.squad.strength - T.ACADEMY_RATING_GAP + rng.normal(0, T.STARTER_RATING_SD),
      academy: true,
    })
    p.potential = Math.min(100, p.potential + T.ACADEMY_POTENTIAL_BONUS)
    club.playerIds.push(p.id)
    emit(world, 'player.promoted', { playerId: p.id, clubId: club.id, managerId: manager ? manager.id : null, name: p.name, rating: p.rating, season: world.season })
    if (manager) tagPlayer(world, p, manager, club, 'promoted')
  }
  trimSquad(world, rng, club)
  anchorSquad(world, club, club.squad.strength, formation)
}

/**
 * A player nobody made is forgotten when he leaves; a tagged player keeps
 * living: he joins a home club at his level and the move is a milestone
 * when the fee clears the threshold.
 */
export function moveOn(world: World, _rng: Rng, p: Player, from: Club): void {
  if (p.madeBy.length === 0) {
    forgetPlayer(world, p)
    return
  }
  // He waits in the pool; a club at his level takes him at its next window or top-up.
  p.lastClubId = from.id
  p.clubId = 0
  p.freeSince = world.season
}

/** A club signs a free agent at its level for a slot, and the move is a milestone above the fee threshold. */
function signFromPool(world: World, club: Club, position: Position): Player | null {
  const p = pickFreeAgent(world, club, position)
  if (!p) return null
  const from = p.lastClubId ?? 0
  signFreeAgent(world, p, club, club.tier)
  if (p.value >= T.TRANSFER_MILESTONE_FEE) milestone(world, p, 'transfer', { fee: p.value, fromClubId: from, toClubId: club.id })
  return p
}

/** Free agents a season on: a year older, the decline, then retirement for those nobody took. */
export function summerFreeAgents(world: World, rng: Rng): void {
  for (const p of freeAgents(world)) {
    p.age++
    const declineFrom = p.position === 'GK' ? T.GK_DECLINE_FROM : T.DECLINE_FROM
    if (p.age >= declineFrom) p.rating = round1(clamp(p.rating - T.DECLINE_PER_YEAR * (1 + (p.age - declineFrom) * T.DECLINE_ACCELERATION), 1, 100))
    p.value = valueFor(p.rating, p.age)
    const waited = world.season - (p.freeSince ?? world.season)
    if (waited >= T.FREE_AGENT_MAX_SEASONS || p.age >= T.PLAYER_RETIRE_AT || (p.age >= T.PLAYER_RETIRE_FROM && rng.chance(T.PLAYER_RETIRE_P))) {
      emit(world, 'player.retired', { playerId: p.id, clubId: 0, name: p.name, age: p.age, rating: round1(p.rating), season: world.season })
      milestone(world, p, 'retired', { age: p.age })
      forgetPlayer(world, p)
    }
  }
}

/** Keep the squad at the tier's size: the lowest-value surplus players leave. */
export function trimSquad(world: World, rng: Rng, club: Club): void {
  const size = squadSizeFor(club.tier)
  const players = squadOf(world, club).sort((a, b) => b.value - a.value || a.id - b.id)
  for (const p of players.slice(size)) {
    releasePlayer(world, p, club)
    emit(world, 'player.left', { playerId: p.id, clubId: club.id, name: p.name, rating: p.rating, fee: p.value, reason: 'released', season: world.season })
    moveOn(world, rng, p, club)
  }
}

/**
 * Summer for the players: a year older, the curve (peak 26–30, decline from
 * 31, keepers from 33), retirements, contracts a year shorter, then the
 * re-anchor to the club's new strength.
 */
export function summerPlayers(world: World, rng: Rng, club: Club): void {
  for (const p of squadOf(world, club)) {
    p.age++
    const declineFrom = p.position === 'GK' ? T.GK_DECLINE_FROM : T.DECLINE_FROM
    if (p.age >= declineFrom) p.rating = round1(clamp(p.rating - T.DECLINE_PER_YEAR * (1 + (p.age - declineFrom) * T.DECLINE_ACCELERATION), 1, 100))
    if (p.age >= T.PLAYER_RETIRE_FROM && (p.age >= T.PLAYER_RETIRE_AT || rng.chance(T.PLAYER_RETIRE_P))) {
      releasePlayer(world, p, club)
      emit(world, 'player.retired', { playerId: p.id, clubId: club.id, name: p.name, age: p.age, rating: round1(p.rating), season: world.season })
      milestone(world, p, 'retired', { age: p.age })
      forgetPlayer(world, p)
      continue
    }
    p.contract.years = Math.max(0, p.contract.years - 1)
    if (p.contract.years === 0) {
      const choice = world.human && club.managerId === world.human.managerId ? world.human.contractChoices[p.id] : undefined
      if (choice !== undefined) delete world.human!.contractChoices[p.id]
      // Out of contract: the human's answer, else the club keeps anyone near its level and lets the rest go.
      const keep = choice === undefined ? p.rating >= club.squad.strength - T.RELEASE_BELOW_STRENGTH : choice !== 'release'
      if (keep) {
        if (choice !== undefined && choice !== 'release') p.contract = { years: choice.years, wage: choice.wage }
        else p.contract = { years: rng.int(T.PLAYER_CONTRACT_YEARS[0], T.PLAYER_CONTRACT_YEARS[1]), wage: wageDemand(p) }
        emit(world, 'player.renewed', { playerId: p.id, clubId: club.id, managerId: club.managerId, name: p.name, years: p.contract.years, wage: p.contract.wage, season: world.season })
      } else {
        releasePlayer(world, p, club)
        emit(world, 'player.left', { playerId: p.id, clubId: club.id, name: p.name, rating: p.rating, fee: 0, reason: 'released', season: world.season })
        moveOn(world, rng, p, club)
        continue
      }
    }
    p.yellows = 0
    p.condition = T.CONDITION_MAX
    p.injuryWeeks = 0
    p.suspension = 0
    p.value = valueFor(p.rating, p.age)
  }
  topUpSquad(world, rng, club)
  anchorSquad(world, club, club.squad.strength, clubFormation(world, club))
}

/** A squad short of the tier's size takes generated backups. */
export function topUpSquad(world: World, rng: Rng, club: Club): void {
  const size = squadSizeFor(club.tier)
  const slots = slotsOf(clubFormation(world, club))
  let i = 0
  while (club.playerIds.filter((id) => world.players[id - 1] && !world.players[id - 1]!.retired).length < size) {
    const have = squadOf(world, club)
    const keepers = have.filter((p) => p.position === 'GK').length
    const slot = keepers < T.SQUAD_KEEPERS ? slots[0]! : slots[1 + ((i++) % (slots.length - 1))]!
    const fromPool = signFromPool(world, club, slot.position)
    if (fromPool) {
      const manager = managerOf(world, club)
      if (manager) tagPlayer(world, fromPool, manager, club, 'signed')
      continue
    }
    const p = makePlayer(world, rng, club.id, club.tier, {
      position: slot.position,
      side: slot.side,
      age: rng.int(T.PLAYER_AGE_RANGE[0], T.PLAYER_AGE_RANGE[1]),
      rating: club.squad.strength - T.BACKUP_RATING_GAP + rng.normal(0, T.BACKUP_RATING_SD),
    })
    club.playerIds.push(p.id)
  }
}

/** What a player asks for a week (players/contracts.ts owns the rule, the loyal one included). */
function wageDemand(p: Player): number {
  return contractWageDemand(p, null)
}

export function tierOf(club: Club): Tier {
  return club.tier
}
