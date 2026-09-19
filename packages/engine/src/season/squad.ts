import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, gravityTarget, round1 } from '../world/gen.js'
import { managerAt } from '../lookup.js'
import type { Club, Formation, FormationSlot, Manager, Player, Position, Result, Tier, World } from '../types.js'
import { forgetPlayer, makePlayer, pickFreeAgent, positionMix, releasePlayer, signFreeAgent, squadSizeFor, valueFor, freeAgents } from '../players/gen.js'
import { bestXiMean, clubFormation, squadOf, autoPick } from '../players/select.js'
import { slotsOf } from '../players/formations.js'
import { rollContract, wageDemand as contractWageDemand } from '../players/contracts.js'
import { milestone, tagPlayer } from '../players/made.js'

export function managerOf(world: World, club: Club): Manager | undefined {
  return managerAt(world, club)
}

/**
 * The level a club's wealth sets (DESIGN.md "Transfers": AI clubs trade
 * toward it). Generated players — reserves, academy graduates, candidates
 * from abroad — are pegged to it rather than to the squad's current
 * strength, so a squad that has grown past its means is refilled from
 * below and one that has fallen behind is refilled from above.
 */
export function levelOf(club: Club): number {
  return clamp(gravityTarget(club.wealth), 1, 100)
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
  /** Share of the first XI replaced over the window. */
  turnover: number
}

/**
 * Strength is derived from the squad (DESIGN.md "Transfers", the flip): the
 * best XI's mean in the club's formation, cached on the club for the table,
 * the odds and the structural target. Refreshed after anything that moves a
 * player, and weekly as players grow.
 */
export function refreshStrength(world: World, club: Club): number {
  const formation = clubFormation(world, club)
  const squad = squadOf(world, club)
  club.squad.strength = squad.length ? round1(clamp(bestXiMean(world, club, formation), 1, 100)) : 1
  club.squad.size = squad.length
  const xi = autoPick(world, club, formation).xi
  const ages = xi.map((id) => world.players[id - 1]?.age ?? 0).filter((a) => a > 0)
  if (ages.length) club.squad.avgAge = round1(ages.reduce((a, b) => a + b, 0) / ages.length)
  return club.squad.strength
}

export function refreshStrengths(world: World): void {
  for (const club of world.clubs) refreshStrength(world, club)
}

/** The first XI replaced over a window: the share of the XI at the window's open who are not in it at the close. */
export function windowTurnover(world: World, club: Club): number {
  const before = club.xiAtWindowOpen ?? []
  if (before.length === 0) return 0
  const now = new Set(autoPick(world, club, clubFormation(world, club)).xi)
  const gone = before.filter((id) => !now.has(id)).length
  return round1((gone / before.length) * 100) / 100
}

export interface SummerSquadSummary {
  youth: number
}

/**
 * Summer for a club: the academy promotes (by the manager's development
 * ability), then the players age, decline, retire and settle their
 * contracts; strength follows from what is left.
 */
export function summerSquad(world: World, rng: Rng, club: Club): SummerSquadSummary {
  const manager = managerOf(world, club)
  const development = manager ? manager.ability.development : T.SCALE_MIDPOINT
  const youth = clamp(Math.floor((development - T.YOUTH_DEVELOPMENT_OFFSET) / T.YOUTH_DEVELOPMENT_STEP), 0, T.YOUTH_MAX_PER_SUMMER)
  club.squad.academyInXi = youth
  club.thisSeason.academyPromoted = youth
  club.pendingYouthGain = 0
  promoteAcademy(world, rng, club, youth)
  summerPlayers(world, rng, club)
  emit(world, 'squad.summer', { clubId: club.id, youth, strength: club.squad.strength, avgAge: club.squad.avgAge })
  return { youth }
}

/** Academy graduates: generated below the squad's level with potential to grow, tagged as the manager's. */
export function promoteAcademy(world: World, rng: Rng, club: Club, youth: number): void {
  const manager = managerOf(world, club)
  const formation = clubFormation(world, club)
  const slots = slotsOf(formation)
  for (let i = 0; i < youth; i++) {
    const slot = slots[1 + rng.int(0, slots.length - 2)]!
    const p = makePlayer(world, rng, club.id, club.tier, {
      position: slot.position,
      side: slot.side,
      age: rng.int(T.ACADEMY_AGE_RANGE[0], T.ACADEMY_AGE_RANGE[1]),
      rating: levelOf(club) - T.ACADEMY_RATING_GAP + rng.normal(0, T.STARTER_RATING_SD),
      academy: true,
    })
    p.potential = Math.min(100, p.potential + T.ACADEMY_POTENTIAL_BONUS)
    club.playerIds.push(p.id)
    emit(world, 'player.promoted', { playerId: p.id, clubId: club.id, managerId: manager ? manager.id : null, name: p.name, rating: p.rating, season: world.season })
    if (manager) tagPlayer(world, p, manager, club, 'promoted')
  }
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
      const ruleKeep = p.rating >= club.squad.strength - T.RELEASE_BELOW_STRENGTH
      // The AI follows its rule, and gambles against it now and then so the population rolls both sides.
      const keep = choice === undefined ? (rng.chance(T.AI_CONTRACT_GAMBLE_P) ? !ruleKeep : ruleKeep) : choice !== 'release'
      if (choice === undefined && club.managerId !== null) rollContract(world, rng, p, keep, ruleKeep, club.managerId)
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
  refreshStrength(world, club)
}

/** A squad short of the tier's size takes generated backups. */
/**
 * The slot a squad most needs filling: the position furthest below its share
 * of the squad (positionMix), with the shape's own slots as the floor, so a
 * club never fills up with defenders because they come first in the list.
 */
export function neededSlot(world: World, club: Club, formation: Formation): FormationSlot {
  const slots = slotsOf(formation)
  const mix = positionMix(squadSizeFor(club.tier))
  const have: Record<Position, number> = { GK: 0, D: 0, M: 0, F: 0 }
  for (const p of squadOf(world, club)) have[p.position]++
  let best: Position = 'D'
  let deficit = -Infinity
  for (const position of ['GK', 'D', 'M', 'F'] as const) {
    const starters = slots.filter((s) => s.position === position).length
    const want = Math.max(mix[position], starters)
    const d = (want - have[position]) / Math.max(1, want)
    if (d > deficit) {
      deficit = d
      best = position
    }
  }
  // The side: the shape's slot of that position the squad covers least.
  const candidates = slots.filter((s) => s.position === best)
  if (candidates.length === 0) return { position: best, side: 'C' }
  const squad = squadOf(world, club)
  let chosen = candidates[0]!
  let fewest = Infinity
  for (const slot of candidates) {
    const covering = squad.filter((p) => p.position === best && (p.side === slot.side || p.side === 'any')).length
    if (covering < fewest) {
      fewest = covering
      chosen = slot
    }
  }
  return chosen
}

export function topUpSquad(world: World, rng: Rng, club: Club): void {
  const size = squadSizeFor(club.tier)
  const formation = clubFormation(world, club)
  while (club.playerIds.filter((id) => world.players[id - 1] && !world.players[id - 1]!.retired).length < size) {
    const slot = neededSlot(world, club, formation)
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
      rating: levelOf(club) - T.BACKUP_RATING_GAP + rng.normal(0, T.BACKUP_RATING_SD),
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
