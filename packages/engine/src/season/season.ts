import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import type { Club, ClubId, CupState, Fixture, Manager, Result, SeasonRecord, Tier, World } from '../types.js'
import { matchTemplateKey } from '../text/render.js'
import { leagueFixtures } from './fixtures.js'
import { applyResult, resetTables, tableFor } from './table.js'
import { knockoutExpected, playMatch, type Participant } from './match.js'
import { drawRound, isFinal, seedCups } from './cups.js'
import { decayMorale, managerOf, runWindow, summerSquad, updateMorale } from './squad.js'
import { awardHonour, settleLeagues } from './promotion.js'
import { settleForeignLeagues } from './abroad.js'

export function startSeason(world: World, rng: Rng): void {
  world.fixtures = leagueFixtures(world, rng)
  resetTables(world)
  seedCups(world)
  for (const club of world.clubs) {
    club.thisSeason = { cupFinals: 0, inBottomZone: false, academyPromoted: club.thisSeason.academyPromoted }
    club.form = []
  }
  emit(world, 'season.start', { season: world.season })
}

function clubById(world: World, id: ClubId): Club | undefined {
  return world.clubs.find((c) => c.id === id)
}

function participantFor(world: World, id: ClubId, opponentStrength: number): Participant {
  const club = clubById(world, id)
  if (club) {
    const manager = managerOf(world, club)
    const tactical = manager ? manager.ability.tactical : T.CARETAKER_ABILITY
    const gap = club.squad.strength - opponentStrength
    club.mentality = gap >= T.AI_MENTALITY_GAP ? 'attack' : gap <= -T.AI_MENTALITY_GAP ? 'defend' : 'balanced'
    if (manager) club.shape = manager.preferredShape
    return {
      id,
      strength: club.squad.strength,
      tactical,
      form: club.form,
      morale: club.squad.morale,
      shape: club.shape,
      mentality: club.mentality,
    }
  }
  for (const league of world.foreign) {
    const foreign = league.clubs.find((c) => c.id === id)
    if (foreign) {
      const manager = world.managers.find((m) => m.id === foreign.managerId)
      return {
        id,
        strength: foreign.strength,
        tactical: manager ? manager.ability.tactical : T.CARETAKER_ABILITY,
        form: [],
        morale: T.MORALE_INITIAL,
        shape: manager ? manager.preferredShape : 'A',
        mentality: 'balanced',
      }
    }
  }
  throw new Error(`participantFor: unknown club ${id}`)
}

function strengthOf(world: World, id: ClubId): number {
  const club = clubById(world, id)
  if (club) return club.squad.strength
  for (const league of world.foreign) {
    const foreign = league.clubs.find((c) => c.id === id)
    if (foreign) return foreign.strength
  }
  throw new Error(`strengthOf: unknown club ${id}`)
}

function recordResult(world: World, club: Club | undefined, result: Result): void {
  if (!club) return
  club.form.push(result)
  if (club.form.length > T.FORM_WINDOW) club.form.splice(0, club.form.length - T.FORM_WINDOW)
  const manager = managerOf(world, club)
  updateMorale(club, result, manager ? manager.ability.motivation : T.CARETAKER_ABILITY)
  if (manager) {
    manager.seasonGames++
    manager.history.games++
  }
}

export interface PlayedFixture {
  fixture: Fixture
  winnerId: ClubId | null
  loserId: ClubId | null
  homeManager: Manager | undefined
  awayManager: Manager | undefined
  expHome: number
  expAway: number
  homePoints: number
  awayPoints: number
}

/** Play one fixture: sample the result, update form, morale, tables and the log. */
export function playFixture(world: World, rng: Rng, fixture: Fixture): PlayedFixture {
  const knockout = fixture.competition !== 'league'
  const home = participantFor(world, fixture.homeId, strengthOf(world, fixture.awayId))
  const away = participantFor(world, fixture.awayId, strengthOf(world, fixture.homeId))
  const outcome = playMatch(rng, home, away, knockout)
  fixture.played = true
  fixture.homeGoals = outcome.homeGoals
  fixture.awayGoals = outcome.awayGoals

  const homeClub = clubById(world, fixture.homeId)
  const awayClub = clubById(world, fixture.awayId)
  let winnerId: ClubId | null = null
  let loserId: ClubId | null = null
  let homeResult: Result
  let awayResult: Result
  if (outcome.homeGoals > outcome.awayGoals || outcome.shootoutWinnerId === fixture.homeId) {
    winnerId = fixture.homeId
    loserId = fixture.awayId
    homeResult = 'W'
    awayResult = 'L'
  } else if (outcome.awayGoals > outcome.homeGoals || outcome.shootoutWinnerId === fixture.awayId) {
    winnerId = fixture.awayId
    loserId = fixture.homeId
    homeResult = 'L'
    awayResult = 'W'
  } else {
    homeResult = 'D'
    awayResult = 'D'
  }
  recordResult(world, homeClub, homeResult)
  recordResult(world, awayClub, awayResult)
  applyResult(world, fixture)

  let expHome = outcome.odds.expHome
  let expAway = outcome.odds.expAway
  if (knockout) {
    const exp = knockoutExpected(outcome.odds, home, away)
    expHome = exp.home
    expAway = exp.away
  }
  const homePoints = homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0
  const awayPoints = awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0
  const homeManager = homeClub ? managerOf(world, homeClub) : undefined
  const awayManager = awayClub ? managerOf(world, awayClub) : undefined

  emit(world, 'match.played', {
    competition: fixture.competition,
    round: fixture.round,
    tier: fixture.tier ?? null,
    homeId: fixture.homeId,
    awayId: fixture.awayId,
    homeGoals: outcome.homeGoals,
    awayGoals: outcome.awayGoals,
    shootoutWinnerId: outcome.shootoutWinnerId ?? null,
    homeManagerId: homeManager ? homeManager.id : null,
    awayManagerId: awayManager ? awayManager.id : null,
    expHome: Math.round(expHome * 100) / 100,
    expAway: Math.round(expAway * 100) / 100,
    text: matchTemplateKey(outcome.homeGoals, outcome.awayGoals, outcome.shootoutWinnerId !== undefined),
  })

  return { fixture, winnerId, loserId, homeManager, awayManager, expHome, expAway, homePoints, awayPoints }
}

function tierOfClub(world: World, id: ClubId): Tier | null {
  return clubById(world, id)?.tier ?? null
}

function playCupRound(world: World, rng: Rng, cup: CupState, seasonWk: number): PlayedFixture[] {
  const final = isFinal(cup)
  const pairs = drawRound(rng, cup)
  const played: PlayedFixture[] = []
  const round = cup.roundsPlayed + 1
  if (final) {
    cup.finalistIds = [...cup.remaining]
    for (const id of cup.remaining) {
      const club = clubById(world, id)
      if (club) club.thisSeason.cupFinals++
      emit(world, 'cup.final', { competition: cup.competition, clubId: id, managerId: club?.managerId ?? null, season: world.season })
    }
  }
  const out = new Set<ClubId>()
  for (const [homeId, awayId] of pairs) {
    const fixture: Fixture = { week: seasonWk, competition: cup.competition, round, homeId, awayId, played: false }
    world.fixtures.push(fixture)
    const result = playFixture(world, rng, fixture)
    played.push(result)
    if (result.loserId === null || result.winnerId === null) throw new Error('cup tie without a winner')
    out.add(result.loserId)
    const loserTier = tierOfClub(world, result.loserId)
    const winnerTier = tierOfClub(world, result.winnerId)
    emit(world, 'cup.exit', {
      competition: cup.competition,
      round,
      clubId: result.loserId,
      managerId: clubById(world, result.loserId)?.managerId ?? null,
      opponentId: result.winnerId,
      toLowerTier: loserTier !== null && winnerTier !== null && winnerTier > loserTier,
      final,
      season: world.season,
    })
  }
  cup.remaining = cup.remaining.filter((id) => !out.has(id))
  cup.roundsPlayed++
  if (cup.remaining.length === 1) {
    cup.winnerId = cup.remaining[0] as ClubId
    const club = clubById(world, cup.winnerId)
    if (club) awardHonour(world, club, cup.competition)
    else emit(world, 'trophy', { clubId: cup.winnerId, managerId: null, competition: cup.competition, tier: null, season: world.season })
  }
  return played
}

/** All football in one season week: league rounds, then any cup round due. */
export function playWeek(world: World, rng: Rng, seasonWk: number): PlayedFixture[] {
  const played: PlayedFixture[] = []
  for (const fixture of world.fixtures) {
    if (fixture.week === seasonWk && !fixture.played && fixture.competition === 'league') {
      played.push(playFixture(world, rng, fixture))
    }
  }
  for (const cup of world.cups) {
    if (cup.roundWeeks[cup.roundsPlayed] === seasonWk && cup.remaining.length > 1) {
      played.push(...playCupRound(world, rng, cup, seasonWk))
    }
  }
  for (const club of world.clubs) decayMorale(club)
  return played
}

export interface SeasonEnd {
  finish: Map<ClubId, number>
  playedTier: Map<ClubId, Tier>
  promoted: Set<ClubId>
  relegated: Set<ClubId>
}

function netSpendRank(world: World, club: Club, tier: Tier): number {
  const division = world.clubs.filter((c) => c.tier === tier)
  const sorted = [...division].sort((a, b) => b.netSpendThisSeason - a.netSpendThisSeason || a.id - b.id)
  return sorted.findIndex((c) => c.id === club.id) + 1
}

/** Close the season: foreign leagues, home divisions, season records, ageing, drift. */
export function endSeason(world: World, rng: Rng): SeasonEnd {
  settleForeignLeagues(world, rng)
  // Net-spend ranks are taken against the tiers as played, before any swap.
  const spendRank = new Map<ClubId, number>()
  for (const club of world.clubs) spendRank.set(club.id, netSpendRank(world, club, club.tier))
  const outcome = settleLeagues(world)

  for (const club of world.clubs) {
    const manager = managerOf(world, club)
    const tier = outcome.playedTier.get(club.id) as Tier
    const finish = outcome.finish.get(club.id) as number
    const size = T.TIER_SIZES[tier - 1] as number
    if (manager) {
      const record: SeasonRecord = {
        season: world.season,
        post: { kind: 'home', clubId: club.id },
        tier,
        games: manager.seasonGames,
        finish,
        expectation: 0,
        promoted: outcome.promoted.has(club.id),
        relegated: outcome.relegated.has(club.id),
        trophies: club.honours.filter((h) => h.season === world.season).length,
        bottomFourEscape: club.thisSeason.inBottomZone && finish <= size - T.BOTTOM_ZONE,
        netSpendRank: spendRank.get(club.id) as number,
        cupFinals: club.thisSeason.cupFinals,
        academyInXi: club.squad.academyInXi,
        fallouts: 0,
        boardRows: 0,
      }
      manager.history.seasons.push(record)
    }
    club.netSpendThisSeason = 0
  }

  for (const manager of world.managers) {
    manager.seasonGames = 0
    if (manager.status.kind !== 'retired') manager.age++
  }
  for (const club of world.clubs) summerSquad(world, rng, club)

  emit(world, 'season.end', {
    season: world.season,
    champions: Object.fromEntries([...outcome.champions.entries()]),
    promoted: [...outcome.promoted],
    relegated: [...outcome.relegated],
  })
  return outcome
}

export function summerWindow(world: World): void {
  for (const club of world.clubs) runWindow(world, club, true, 1)
}

export function winterWindow(world: World): void {
  for (const club of world.clubs) runWindow(world, club, false, 1)
}

export { tableFor }
