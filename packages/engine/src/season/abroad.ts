/**
 * The foreign leagues are not simulated match by match. Once a season each
 * league is ranked by strength, manager and luck; the winner takes a title
 * and every manager abroad is credited a season's games.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { managerById } from '../lookup.js'
import type { ForeignClub, Manager, SeasonRecord, World } from '../types.js'

export interface ForeignOutcome {
  finish: Map<number, number>
}

export type ForeignExtrasFor = (managerId: number) => { expectation: number; fallouts: number; boardRows: number }

export function settleForeignLeagues(
  world: World,
  rng: Rng,
  extrasFor: ForeignExtrasFor = () => ({ expectation: 0, fallouts: 0, boardRows: 0 }),
): ForeignOutcome {
  const finishAll = new Map<number, number>()
  for (const league of world.foreign) {
    const scored = league.clubs.map((club) => {
      const manager = club.managerId === null ? undefined : managerById(world, club.managerId)
      const tactical = manager ? manager.ability.tactical : T.CARETAKER_ABILITY
      const score = club.strength + (T.ABILITY_WEIGHT * (tactical - T.SCALE_MIDPOINT)) / T.SCALE_MIDPOINT + rng.normal(0, T.FOREIGN_SEASON_NOISE_SD)
      return { club, manager, score }
    })
    scored.sort((a, b) => b.score - a.score || a.club.id - b.club.id)
    scored.forEach(({ club, manager }, i) => {
      const finish = i + 1
      finishAll.set(club.id, finish)
      if (finish === 1) awardForeignTitle(world, club, manager)
      if (manager) {
        manager.seasonGames += T.FOREIGN_GAMES_PER_SEASON
        manager.history.games += T.FOREIGN_GAMES_PER_SEASON
        const record: SeasonRecord = {
          season: world.season,
          post: { kind: 'abroad', league: league.kind, clubId: club.id },
          tier: null,
          games: T.FOREIGN_GAMES_PER_SEASON,
          finish,
          expectation: extrasFor(manager.id).expectation,
          promoted: false,
          relegated: false,
          trophies: finish === 1 ? 1 : 0,
          bottomFourEscape: false,
          netSpendRank: null,
          cupFinals: 0,
          academyInXi: 0,
          fallouts: 0,
          boardRows: 0,
        }
        manager.history.seasons.push(record)
        emit(world, 'season.record', { managerId: manager.id, ...record })
      }
      club.strength = round1(
        clamp(
          club.strength + T.FOREIGN_GRAVITY_RATE * (league.strength - club.strength) + rng.normal(0, T.FOREIGN_STRENGTH_SHOCK_SD),
          1,
          100,
        ),
      )
    })
    emit(world, 'season.abroad', {
      league: league.kind,
      season: world.season,
      champion: (scored[0] as { club: ForeignClub }).club.id,
    })
  }
  return { finish: finishAll }
}

function awardForeignTitle(world: World, club: ForeignClub, manager: Manager | undefined): void {
  if (manager) manager.history.honours.push({ season: world.season, competition: 'foreignLeague', clubId: club.id, league: club.league })
  emit(world, 'trophy', {
    clubId: club.id,
    managerId: manager ? manager.id : null,
    competition: 'foreignLeague',
    league: club.league,
    season: world.season,
  })
}
