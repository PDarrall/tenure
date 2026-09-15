import * as T from '../tunables.js'
import type { ClubId, Fixture, TableRow, Tier, World } from '../types.js'

export function resetTables(world: World): void {
  world.tables = world.clubs.map((c) => ({
    clubId: c.id,
    tier: c.tier,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }))
}

function compareRows(a: TableRow, b: TableRow): number {
  return (
    b.points - a.points ||
    b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.clubId - b.clubId
  )
}

/** The table for a tier, best first. */
export function tableFor(world: World, tier: Tier): TableRow[] {
  return world.tables.filter((r) => r.tier === tier).sort(compareRows)
}

/** 1-based league position of a club within its tier. */
export function positionOf(world: World, clubId: ClubId): number {
  const row = world.tables.find((r) => r.clubId === clubId)
  if (!row) throw new Error(`positionOf: no table row for club ${clubId}`)
  return tableFor(world, row.tier).findIndex((r) => r.clubId === clubId) + 1
}

/** Apply a played league fixture to the table. */
export function applyResult(world: World, fixture: Fixture): void {
  if (fixture.competition !== 'league') return
  const hg = fixture.homeGoals
  const ag = fixture.awayGoals
  if (hg === undefined || ag === undefined) throw new Error('applyResult: fixture has no score')
  const home = world.tables.find((r) => r.clubId === fixture.homeId)
  const away = world.tables.find((r) => r.clubId === fixture.awayId)
  if (!home || !away) throw new Error('applyResult: missing table rows')
  for (const [row, gf, ga] of [
    [home, hg, ag],
    [away, ag, hg],
  ] as const) {
    row.played++
    row.goalsFor += gf
    row.goalsAgainst += ga
    if (gf > ga) {
      row.won++
      row.points += T.POINTS_WIN
    } else if (gf === ga) {
      row.drawn++
      row.points += T.POINTS_DRAW
    } else {
      row.lost++
    }
  }
}
