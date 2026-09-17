/** Shared readers for the screens: who the human is, which club, how to say a number. */
import { hasTrait, seasonWeek, tunables, type Club, type Manager, type Player, type World } from '@tenure/engine'

export function player(world: World): Manager {
  return world.managers[world.human!.managerId - 1] as Manager
}

/** The human's home club, if they manage one. */
export function humanClub(world: World): Club | null {
  const me = player(world)
  if (me.status.kind !== 'employed' || me.status.post.kind !== 'home') return null
  return world.clubs[me.status.post.clubId - 1] ?? null
}

export function weekLabel(sw: number): string {
  return sw < tunables.MATCH_WEEKS ? `week ${sw + 1}` : `summer week ${sw - tunables.MATCH_WEEKS + 1}`
}

export function thisWeekLabel(world: World): string {
  return weekLabel(seasonWeek(world.week))
}

export function bandName(rep: number): string {
  if (rep >= 90) return 'elite'
  if (rep >= 75) return 'tier 1'
  if (rep >= 60) return 'tier 2'
  if (rep >= 40) return 'tier 3'
  if (rep >= 20) return 'tier 4'
  return 'non-league'
}

export function rating(p: { rating: number }): number {
  return Math.round(p.rating)
}

/** Change since the season's record opened, signed, one decimal. */
export function ratingChange(p: Player): string {
  const d = Math.round((p.rating - p.season.ratingAtStart) * 10) / 10
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : `${d}`
}

export function averageRatingOf(p: Player): string {
  return p.season.rated ? (p.season.ratingSum / p.season.rated).toFixed(1) : '–'
}

/** Made by the human: the star on the squad screen. */
export function isMine(world: World, p: Player): boolean {
  return world.human !== null && p.madeBy.some((m) => m.managerId === world.human!.managerId)
}

export function fitness(p: Player): string {
  if (p.injuryWeeks > 0) return `injured ${p.injuryWeeks}w`
  if (p.suspension > 0) return `banned ${p.suspension}`
  return `${Math.round(p.condition)}`
}

export function positionLabel(p: { position: string; side: string }): string {
  return p.side === 'any' || p.position === 'GK' ? p.position : `${p.position}${p.side}`
}

export function traitsOf(p: Player): string {
  return p.traits.join(', ')
}

export function isLeader(p: Player): boolean {
  return hasTrait(p, 'leader')
}
