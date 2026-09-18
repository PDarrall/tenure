/** Shared readers for the screens: who the human is, which club, how to say a number. */
import { hasTrait, nextFixture, ordinal, seasonWeek, spellOf, tableFor, tunables, type Club, type Manager, type Player, type World } from '@tenure/engine'
import { humanMatch, watched, type Session } from '../controller.js'

export function player(world: World): Manager {
  return world.managers[world.human!.managerId - 1] as Manager
}

/** The human's club, if they manage one. */
export function humanClub(world: World): Club | null {
  const me = player(world)
  if (me.status.kind !== 'employed' || me.status.post.kind !== 'home') return null
  return world.clubs[me.status.post.clubId - 1] ?? null
}

export function weekLabel(sw: number): string {
  return sw < tunables.MATCH_WEEKS ? `Week ${sw + 1}` : `Summer week ${sw - tunables.MATCH_WEEKS + 1}`
}

/** "Season 3 · Week 12" */
export function seasonLine(world: World): string {
  return `Season ${world.season} · ${weekLabel(seasonWeek(world.week))}`
}

export function bandName(rep: number): string {
  if (rep >= 90) return 'elite'
  if (rep >= 75) return 'tier 1'
  if (rep >= 60) return 'tier 2'
  if (rep >= 40) return 'tier 3'
  if (rep >= 20) return 'tier 4'
  return 'non-league'
}

/** "reputation 41, the tier 3 band" */
export function bandLine(rep: number): string {
  const band = bandName(rep)
  return `reputation ${Math.round(rep)}, ${band === 'elite' || band === 'non-league' ? `the ${band} band` : `the ${band} band`}`
}

export function rating(p: { rating: number }): number {
  return Math.round(p.rating)
}

/** Change since the season's record opened, signed, one decimal. */
export function ratingChange(p: Player): string {
  const d = Math.round((p.rating - p.season.ratingAtStart) * 10) / 10
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`
}

export function ratingChangeUp(p: Player): boolean {
  return p.rating - p.season.ratingAtStart > 0.05
}

export function averageRatingOf(p: Player): string {
  return p.season.rated ? (p.season.ratingSum / p.season.rated).toFixed(1) : '–'
}

/** Made by the human: the mark on the squad screen. */
export function isMine(world: World, p: Player): boolean {
  return world.human !== null && p.madeBy.some((m) => m.managerId === world.human!.managerId)
}

export function fitness(p: Player): string {
  if (p.injuryWeeks > 0) return `injured ${p.injuryWeeks}w`
  if (p.suspension > 0) return `banned ${p.suspension}`
  return `${Math.round(p.condition)}`
}

/** "cond 92 · mor 78 · 2 yrs", or the injury in place of condition. */
export function stateLine(p: Player): string {
  const cond = p.injuryWeeks > 0 ? `inj ${p.injuryWeeks}w` : p.suspension > 0 ? `ban ${p.suspension}` : `cond ${Math.round(p.condition)}`
  return `${cond} · mor ${Math.round(p.morale)} · ${p.contract.years} yr${p.contract.years === 1 ? '' : 's'}`
}

export function positionLabel(p: { position: string; side: string }): string {
  return p.side === 'any' || p.position === 'GK' ? p.position : `${p.position}${p.side}`
}

export function traitsOf(p: Player): string {
  return p.traits.join(' · ')
}

export function isLeader(p: Player): boolean {
  return hasTrait(p, 'leader')
}

export function ordinalOf(n: number): string {
  return ordinal(n)
}

/** Where the club stands: "14th of 24". */
export function standing(world: World, club: Club): { pos: number; of: number } {
  const table = tableFor(world, club.tier)
  return { pos: table.findIndex((r) => r.clubId === club.id) + 1, of: table.length }
}

export function money(m: number): string {
  return `£${m}m`
}

/** What Continue will do, for its second line. */
export function continueNext(session: Session): { next: string; kickOff: boolean } {
  const world = session.world
  const me = player(world)
  if (session.inputs.retire) return { next: 'Retire · the career ends', kickOff: false }
  if (session.inputs.resign) return { next: 'Resign · walk out this week', kickOff: false }
  if (me.status.kind === 'unemployed') return { next: 'Pass the week', kickOff: false }
  if (me.status.kind !== 'employed') return { next: 'The career is over', kickOff: false }
  const m = humanMatch(session)
  const w = watched(session)
  if (w && m && !m.over && m.played === 0) {
    const club = humanClub(world)
    const away = club !== null && m.away.clubId === club.id
    return { next: `Kick off · ${away ? m.home.name : m.away.name} (${away ? 'A' : 'H'})`, kickOff: true }
  }
  const sw = seasonWeek(world.week)
  if (sw >= tunables.MATCH_WEEKS) return { next: 'Pass the week · the summer', kickOff: false }
  const next = nextFixture(world)
  if (!next) return { next: 'Pass the week · no fixture', kickOff: false }
  if (next.kind === 'draw') return { next: next.seasonWeek === sw ? `Pass the week · the ${next.competitionLabel} draw` : 'Pass the week · no fixture', kickOff: false }
  if (next.seasonWeek === sw) return { next: `Match day · ${next.opponent} (${next.home ? 'H' : 'A'})`, kickOff: false }
  return { next: `Pass the week · ${next.opponent} (${next.home ? 'H' : 'A'}) in ${weekLabel(next.seasonWeek).toLowerCase()}`, kickOff: false }
}

/** The standing line under a club's name: "14th of 24 · target 12th · board uneasy · contract to season 4". */
export function standingLine(world: World, boardMood: (spell: NonNullable<ReturnType<typeof spellOf>>) => string): string | null {
  const me = player(world)
  const spell = spellOf(world, me)
  const club = humanClub(world)
  if (!spell || !club) return null
  const { pos, of } = standing(world, club)
  return `${ordinal(pos)} of ${of} · target ${ordinal(spell.expectation)} · board ${boardMood(spell)} · contract to season ${Math.floor(spell.contract.endWeek / tunables.SEASON_WEEKS) + 1}`
}
