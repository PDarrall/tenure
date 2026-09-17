/**
 * Squads (DESIGN.md "Players"): generated to match club strength, the best
 * XI in the club's preferred formation averaging it, and re-anchored each
 * summer. Foreign squads are generated on demand when a club meets a home
 * side.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { POOLS } from '../managers/names.js'
import type { Club, ForeignClub, Formation, Nationality, Player, PlayerId, PlayerSeasonStats, Position, Side, Tier, Trait, World } from '../types.js'
import { slotsOf } from './formations.js'
import { TRAITS } from './traits.js'
import { bestXiMean } from './select.js'

export function playerName(rng: Rng, nationality: Nationality): string {
  const pool = POOLS[nationality]
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`
}

/** £k a week a player of this rating asks for (DESIGN: by rating, age, tier; tier follows rating here). */
export function wageFor(rating: number, age: number): number {
  const base = T.WAGE_BASE_K * Math.exp(T.WAGE_RATING_EXP * rating)
  const ageFactor = age >= T.WAGE_VETERAN_AGE ? T.WAGE_VETERAN_SHARE : 1
  return Math.max(T.WAGE_MIN_K, Math.round(base * ageFactor))
}

/** £m: a cube of rating, discounted away from the peak age. */
export function valueFor(rating: number, age: number): number {
  const peak = Math.abs(age - T.VALUE_PEAK_AGE)
  const ageFactor = Math.max(T.VALUE_AGE_FLOOR, 1 - T.VALUE_AGE_DECAY * peak)
  return Math.max(T.VALUE_MIN_M, round1(T.VALUE_BASE_M * Math.pow(rating / 100, T.VALUE_RATING_POWER) * ageFactor))
}

export function freshSeasonStats(season: number, clubId: number, tier: Tier | null): PlayerSeasonStats {
  return { season, clubId, tier, apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0, ratingSum: 0, rated: 0, growth: 0 }
}

function drawTraits(rng: Rng, position: Position): Trait[] {
  const counts = [0, 1, 2]
  const n = rng.weighted(counts, T.TRAIT_COUNT_WEIGHTS)
  const traits: Trait[] = []
  for (let i = 0; i < n; i++) {
    const weights = TRAITS.map((t) => (traits.includes(t) ? 0 : (T.TRAIT_POSITION_WEIGHTS[t]?.[position] ?? 1)))
    traits.push(rng.weighted(TRAITS, weights))
  }
  return traits
}

function drawSide(rng: Rng, position: Position): Side {
  if (position === 'GK') return 'any'
  return rng.weighted(['L', 'C', 'R', 'any'] as const, T.SIDE_WEIGHTS)
}

/** Potential: what a young player could reach, hidden. Older players have reached it. */
function drawPotential(rng: Rng, rating: number, age: number): number {
  const years = Math.max(0, T.YOUTH_AGE - age)
  return round1(clamp(rating + years * T.POTENTIAL_GAIN_PER_YEAR + (years > 0 ? rng.normal(0, T.POTENTIAL_NOISE_SD) : 0), rating, 100))
}

export interface PlayerDraft {
  position: Position
  side?: Side
  age: number
  rating: number
  nationality?: Nationality
  academy?: boolean
}

/** Create one player at a club. */
export function makePlayer(world: World, rng: Rng, clubId: number, tier: Tier | null, draft: PlayerDraft, nativeShare = T.HOME_NATIONAL_SHARE): Player {
  const nationality = draft.nationality ?? (rng.chance(nativeShare) ? 'home' : rng.pick(['big', 'mid', 'small'] as const))
  const rating = round1(clamp(draft.rating, 1, 100))
  const player: Player = {
    id: world.nextPlayerId++,
    name: playerName(rng, nationality),
    nationality,
    age: draft.age,
    position: draft.position,
    side: draft.side ?? drawSide(rng, draft.position),
    rating,
    potential: drawPotential(rng, rating, draft.age),
    condition: T.CONDITION_MAX,
    morale: T.MORALE_INITIAL,
    injuryWeeks: 0,
    suspension: 0,
    yellows: 0,
    contract: { years: rng.int(T.PLAYER_CONTRACT_YEARS[0], T.PLAYER_CONTRACT_YEARS[1]), wage: wageFor(rating, draft.age) },
    value: valueFor(rating, draft.age),
    traits: drawTraits(rng, draft.position),
    clubId,
    academy: draft.academy === true,
    // A generated senior has played first-team football somewhere; academy graduates and the very young have not.
    debuted: draft.academy !== true && draft.age > T.DEBUT_AGE_LIMIT,
    retired: false,
    season: freshSeasonStats(world.season, clubId, tier),
    history: [],
    madeBy: [],
  }
  world.players.push(player)
  return player
}

/** Position mix for a squad of `size`: two keepers, the outfield split by the tunable shares. */
export function positionMix(size: number): Record<Position, number> {
  const outfield = size - T.SQUAD_KEEPERS
  const d = Math.round(outfield * T.SQUAD_OUTFIELD_MIX.D)
  const m = Math.round(outfield * T.SQUAD_OUTFIELD_MIX.M)
  return { GK: T.SQUAD_KEEPERS, D: d, M: m, F: outfield - d - m }
}

/** Sides for a position's players: cover the formation's slots first, then spread. */
function sidesFor(rng: Rng, position: Position, count: number, formation: Formation): Side[] {
  const wanted = slotsOf(formation).filter((s) => s.position === position).map((s) => s.side)
  const sides: Side[] = []
  for (let i = 0; i < count; i++) sides.push(wanted[i] !== undefined ? (wanted[i] as Side) : drawSide(rng, position))
  return sides
}

/**
 * Generate a whole squad for a club at `strength`: starters around it,
 * backups below, then the anchor shift so the best XI in `formation`
 * averages exactly the club's strength.
 */
export function generateSquad(world: World, rng: Rng, club: { id: number; playerIds: PlayerId[] }, strength: number, formation: Formation, size: number, tier: Tier | null, nativeShare = T.HOME_NATIONAL_SHARE): void {
  const mix = positionMix(size)
  const slots = slotsOf(formation)
  for (const position of ['GK', 'D', 'M', 'F'] as Position[]) {
    const count = mix[position]
    const starters = slots.filter((s) => s.position === position).length
    const sides = sidesFor(rng, position, count, formation)
    for (let i = 0; i < count; i++) {
      const starter = i < starters
      const rating = starter ? strength + rng.normal(0, T.STARTER_RATING_SD) : strength - T.BACKUP_RATING_GAP + rng.normal(0, T.BACKUP_RATING_SD)
      const age = rng.int(T.PLAYER_AGE_RANGE[0], T.PLAYER_AGE_RANGE[1])
      const p = makePlayer(world, rng, club.id, tier, { position, side: sides[i] as Side, age, rating }, nativeShare)
      club.playerIds.push(p.id)
    }
  }
  anchorSquad(world, club, strength, formation)
}

/** Shift every rating so the best XI in the formation averages the club's strength. */
export function anchorSquad(world: World, club: { playerIds: PlayerId[] }, strength: number, formation: Formation): number {
  const mean = bestXiMean(world, club, formation)
  if (club.playerIds.length === 0) return 0
  const shift = strength - mean
  if (Math.abs(shift) < 1e-9) return 0
  for (const id of club.playerIds) {
    const p = world.players[id - 1]
    if (!p || p.retired) continue
    p.rating = round1(clamp(p.rating + shift, 1, 100))
    if (p.potential < p.rating) p.potential = p.rating
    p.value = valueFor(p.rating, p.age)
  }
  return shift
}

/** A foreign club's squad, generated the first time it is needed. */
export function ensureForeignSquad(world: World, rng: Rng, club: ForeignClub): void {
  if (club.playerIds.length > 0) return
  generateSquad(world, rng, club, club.strength, T.DEFAULT_FORMATION, T.FOREIGN_SQUAD_SIZE, null, T.FOREIGN_NATIONAL_SHARE)
}

export function squadSizeFor(tier: Tier): number {
  return T.SQUAD_SIZE_BY_TIER[tier - 1] as number
}

/** Genesis squads for every home club. */
export function generateHomeSquads(world: World, rng: Rng): void {
  for (const club of world.clubs) {
    const manager = club.managerId === null ? undefined : world.managers[club.managerId - 1]
    const formation = manager ? manager.preferredFormation : T.DEFAULT_FORMATION
    club.formation = formation
    generateSquad(world, rng, club, club.squad.strength, formation, squadSizeFor(club.tier), club.tier)
  }
  emit(world, 'players.created', { count: world.players.length })
}

/** Release a player from his club: a free agent, or gone for good if nobody keeps his record. */
export function releasePlayer(world: World, player: Player, club: { playerIds: PlayerId[] }): void {
  club.playerIds = club.playerIds.filter((id) => id !== player.id)
  player.clubId = 0
  player.freeSince = world.season
}

/** Free agents: players with a record somebody keeps, waiting for a club. */
export function freeAgents(world: World): Player[] {
  const out: Player[] = []
  for (const p of world.players) if (p && !p.retired && p.clubId === 0) out.push(p)
  return out
}

/** The best free agent for a slot at a club's level, if any: same role, within the strength window. */
export function pickFreeAgent(world: World, club: { squad: { strength: number } }, position: Position): Player | null {
  let best: Player | null = null
  for (const p of freeAgents(world)) {
    if (p.position !== position) continue
    if (Math.abs(p.rating - club.squad.strength) > T.MOVE_ON_STRENGTH_WINDOW) continue
    if (!best || p.rating > best.rating || (p.rating === best.rating && p.id < best.id)) best = p
  }
  return best
}

/** A free agent joins a club: a transfer on the record, a milestone above the fee threshold, and he is the new manager's signing. */
export function signFreeAgent(world: World, player: Player, club: Club, tier: Tier | null): void {
  const from = player.lastClubId ?? 0
  club.playerIds.push(player.id)
  player.clubId = club.id
  player.freeSince = null
  player.condition = T.CONDITION_MAX
  player.injuryWeeks = 0
  player.suspension = 0
  player.yellows = 0
  player.contract = { years: Math.max(1, Math.min(T.PLAYER_CONTRACT_YEARS[1], Math.round((T.PLAYER_CONTRACT_YEARS[0] + T.PLAYER_CONTRACT_YEARS[1]) / 2))), wage: wageFor(player.rating, player.age) }
  player.season = { ...player.season, clubId: club.id, tier }
  const fee = player.value
  emit(world, 'player.transfer', { playerId: player.id, name: player.name, fromClubId: from, clubId: club.id, fee, rating: round1(player.rating), season: world.season })
}

/** Drop a player whose record nobody needs, so the world stays small. Tagged players are kept. */
export function forgetPlayer(world: World, player: Player): void {
  player.retired = true
  if (player.madeBy.length === 0) world.players[player.id - 1] = null
}

/** Replace a club's playerIds array in place (callers keep references). */
export function setSquad(club: Club | ForeignClub, ids: PlayerId[]): void {
  club.playerIds = ids
}
