/**
 * Your players (DESIGN.md "Your players"): tagging on sign, debut or
 * academy promotion; a bond per tagged player; growth with minutes for the
 * under-24s; milestones that follow a player after the manager has left;
 * and the players-made score line, written to the log as points are earned
 * and mirrored on the manager. Every AI manager runs on the same rules.
 */
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { playerById } from '../lookup.js'
import type { Club, MadeBy, MadeCircumstance, Manager, ManagerId, Player, Tier, World } from '../types.js'

export function tagOf(player: Player, managerId: ManagerId): MadeBy | undefined {
  return player.madeBy.find((m) => m.managerId === managerId)
}

/** The tag is permanent: club, week, circumstance and rating on the day. Once per manager. */
export function tagPlayer(world: World, player: Player, manager: Manager, club: { id: number; tier?: Tier }, circumstance: MadeCircumstance): MadeBy | null {
  if (tagOf(player, manager.id)) return null
  const bond = circumstance === 'debut' ? T.BOND_DEBUT : circumstance === 'promoted' ? T.BOND_PROMOTION : 0
  const tag: MadeBy = { managerId: manager.id, clubId: club.id, week: world.week, circumstance, rating: round1(player.rating), bond, growth: 0, tier: club.tier ?? null }
  player.madeBy.push(tag)
  emit(world, 'player.tagged', { playerId: player.id, managerId: manager.id, clubId: club.id, name: player.name, circumstance, rating: tag.rating, age: player.age, position: player.position, season: world.season })
  return tag
}

/** Weight of a tag's points: debut and promotion in full, a signing less, a finished player bought at 70+ almost nothing. */
export function tagWeight(tag: MadeBy): number {
  if (tag.circumstance === 'signed' && tag.rating >= T.BOUGHT_FINISHED_RATING) return T.BOUGHT_FINISHED_WEIGHT
  return T.TAG_WEIGHTS[tag.circumstance]
}

/** Growth speed: the manager's development ability scales it (the club's coaching level joins in phase 5). */
export function developmentFactor(development: number): number {
  return T.DEV_FACTOR_BASE + (T.DEV_FACTOR_SLOPE * development) / 100
}

/**
 * Minutes make players: an under-24 moves toward potential by a step per
 * full season of starts. Returns the gain; bench minutes are zero.
 */
export function growWithMinutes(player: Player, minutes: number, development: number, managerId: ManagerId | null): number {
  if (player.age >= T.YOUTH_AGE || player.rating >= player.potential || minutes <= 0) return 0
  const step = (T.GROWTH_PER_SEASON / T.EXPECTED_STARTS) * (minutes / T.MATCH_MINUTES) * developmentFactor(development)
  const gain = Math.min(step, player.potential - player.rating)
  player.rating = Math.round((player.rating + gain) * 1000) / 1000
  player.season.growth = Math.round((player.season.growth + gain) * 1000) / 1000
  if (managerId !== null) {
    const tag = tagOf(player, managerId)
    if (tag) tag.growth = Math.round((tag.growth + gain) * 1000) / 1000
  }
  return gain
}

/** Points on the fourth line, logged and mirrored on the manager. */
export function awardPlayersMade(world: World, managerId: ManagerId, player: Player, points: number, reason: string): void {
  const rounded = Math.round(points * 100) / 100
  if (rounded <= 0) return
  const manager = world.managers[managerId - 1]
  if (!manager || manager.id !== managerId) return
  manager.history.playersMade = Math.round((manager.history.playersMade + rounded) * 100) / 100
  emit(world, 'players.made', { managerId, playerId: player.id, name: player.name, points: rounded, reason, total: manager.history.playersMade, season: world.season })
}

/** Season end: growth under each tagging manager who is at the club becomes points. */
export function settleSeasonGrowth(world: World, club: Club): void {
  const managerId = club.managerId
  if (managerId === null) return
  for (const id of club.playerIds) {
    const p = playerById(world, id)
    if (!p || p.retired) continue
    const tag = tagOf(p, managerId)
    if (!tag || tag.growth <= 0) continue
    awardPlayersMade(world, managerId, p, tag.growth * T.GROWTH_POINTS_PER_RATING * tagWeight(tag), 'growth')
    emit(world, 'player.grew', { playerId: p.id, managerId, clubId: club.id, name: p.name, growth: round1(tag.growth), rating: round1(p.rating), season: world.season })
    tag.growth = 0
  }
}

/** A milestone reaches every manager who made him, weighted by how he became theirs. */
export function milestone(world: World, player: Player, kind: 'tierAbove' | 'transfer' | 'title' | 'promotion' | 'cupFinal' | 'retired', detail: Record<string, unknown> = {}): void {
  if (player.madeBy.length === 0) return
  emit(world, 'player.milestone', { playerId: player.id, name: player.name, kind, clubId: player.clubId, managers: player.madeBy.map((m) => m.managerId), ...detail, season: world.season })
  const points = T.MILESTONE_POINTS[kind]
  if (!points) return
  for (const tag of player.madeBy) awardPlayersMade(world, tag.managerId, player, points * tagWeight(tag), kind)
}

/** The bond grows with every start under the manager. */
export function bondForStart(player: Player, managerId: ManagerId | null): void {
  if (managerId === null) return
  const tag = tagOf(player, managerId)
  if (tag) tag.bond += T.BOND_START
}

/** Season-end milestones for tagged players at home clubs: a tier above the debut tier, promotion, a title. */
export function seasonMilestones(world: World, outcome: { promoted: Set<number>; champions: Map<Tier, number> }, europeanWinner: number | null): void {
  const titleClubs = new Set<number>()
  for (const [tier, clubId] of outcome.champions) if (tier === 1) titleClubs.add(clubId)
  if (europeanWinner !== null) titleClubs.add(europeanWinner)
  for (const club of world.clubs) {
    const promoted = outcome.promoted.has(club.id)
    const title = titleClubs.has(club.id)
    if (!promoted && !title) continue
    for (const id of club.playerIds) {
      const p = playerById(world, id)
      if (!p || p.retired || p.madeBy.length === 0 || p.season.apps === 0) continue
      if (title) milestone(world, p, 'title', { competition: club.id === europeanWinner ? 'european' : 'league', tier: club.tier })
      if (promoted) milestone(world, p, 'promotion', { fromTier: club.tier })
    }
  }
}

/** At kick-off of a season: a tagged player whose club now plays above the tier he was made in, once. */
export function tierAboveMilestones(world: World): void {
  for (const club of world.clubs) {
    for (const id of club.playerIds) {
      const p = playerById(world, id)
      if (!p || p.retired || p.madeBy.length === 0) continue
      const first = p.madeBy[0] as MadeBy
      if (first.tier === null || club.tier >= first.tier) continue
      if (p.madeBy.some((m) => m.tierAboveDone)) continue
      for (const m of p.madeBy) m.tierAboveDone = true
      milestone(world, p, 'tierAbove', { fromTier: first.tier, tier: club.tier })
    }
  }
}

/** The fourth line, re-derived from the log (the counter mirrors it). */
export function playersMadeFromLog(world: World, managerId: ManagerId): number {
  let total = 0
  for (const e of world.log) if (e.type === 'players.made' && e.payload['managerId'] === managerId) total += e.payload['points'] as number
  return Math.round(total * 100) / 100
}

export interface MadePlayerSummary {
  playerId: number
  name: string
  position: string
  circumstance: MadeCircumstance
  club: string
  season: number
  ratingThen: number
  ratingNow: number
  growth: number
  points: number
  /** Where he is now. */
  now: string
}

function clubName(world: World, clubId: number): string {
  const home = world.clubs[clubId - 1]
  if (home && home.id === clubId) return home.name
  for (const league of world.foreign) for (const c of league.clubs) if (c.id === clubId) return c.name
  return clubId === 0 ? 'no club' : `Club ${clubId}`
}

/** The career page's record of people: players made, ordered by growth under the manager. */
export function madePlayers(world: World, managerId: ManagerId): MadePlayerSummary[] {
  const points = new Map<number, number>()
  for (const e of world.log) {
    if (e.type !== 'players.made' || e.payload['managerId'] !== managerId) continue
    const id = e.payload['playerId'] as number
    points.set(id, (points.get(id) ?? 0) + (e.payload['points'] as number))
  }
  const out: MadePlayerSummary[] = []
  for (const p of world.players) {
    if (!p) continue
    const tag = tagOf(p, managerId)
    if (!tag) continue
    const club = world.clubs[p.clubId - 1]
    const now = p.retired ? 'retired' : p.clubId === 0 ? 'without a club' : club && club.id === p.clubId ? `${club.name} (tier ${club.tier})` : `${clubName(world, p.clubId)} (abroad)`
    const growthUnder = (p.season.growth + p.history.reduce((s, h) => s + h.growth, 0)) // all growth; per-manager share is in points
    out.push({
      playerId: p.id,
      name: p.name,
      position: p.position,
      circumstance: tag.circumstance,
      club: clubName(world, tag.clubId),
      season: Math.floor(tag.week / T.SEASON_WEEKS) + 1,
      ratingThen: tag.rating,
      ratingNow: round1(p.rating),
      growth: round1(Math.max(0, Math.min(growthUnder, p.rating - tag.rating + (p.retired ? 0 : 0)))),
      points: Math.round((points.get(p.id) ?? 0) * 100) / 100,
      now,
    })
  }
  return out.sort((a, b) => b.points - a.points || b.growth - a.growth || a.playerId - b.playerId)
}

export function clampRating(r: number): number {
  return clamp(r, 1, 100)
}
