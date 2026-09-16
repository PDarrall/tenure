import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import type { Club, ClubId, CupState, Event, Fixture, Manager, Result, SeasonRecord, Tier, World } from '../types.js'
import { homeClub, managerAt } from '../lookup.js'
import { matchTemplateKey } from '../text/render.js'
import { leagueFixtures } from './fixtures.js'
import { applyResult, positionOf, resetTables, tableFor } from './table.js'
import { knockoutExpected, playMatch, type Participant } from './match.js'
import { drawRound, isFinal, seedCups } from './cups.js'
import { decayMorale, runHumanWindow, runWindow, summerSquad, updateMorale, type WindowSummary } from './squad.js'
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
  return homeClub(world, id)
}

function participantFor(world: World, id: ClubId, opponentStrength: number): Participant {
  const club = clubById(world, id)
  if (club) {
    const manager = managerAt(world, club)
    const tactical = manager ? manager.ability.tactical : T.CARETAKER_ABILITY
    const gap = club.squad.strength - opponentStrength
    if (manager && manager.isHuman && world.human) {
      // The player picks a shape and a mentality per match; they stick until changed.
      club.shape = world.human.shape
      club.mentality = world.human.mentality
    } else {
      club.mentality = gap >= T.AI_MENTALITY_GAP ? 'attack' : gap <= -T.AI_MENTALITY_GAP ? 'defend' : 'balanced'
      if (manager) club.shape = manager.preferredShape
    }
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
  const manager = managerAt(world, club)
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
  /** League positions at kick-off (home clubs only), for the "top-three side" rule. */
  homePosition: number | null
  awayPosition: number | null
  /** The match.played event, so later systems can annotate it. */
  event: Event
}

/** Play one fixture: sample the result, update form, morale, tables and the log. */
export function playFixture(world: World, rng: Rng, fixture: Fixture): PlayedFixture {
  const knockout = fixture.competition !== 'league'
  const home = participantFor(world, fixture.homeId, strengthOf(world, fixture.awayId))
  const away = participantFor(world, fixture.awayId, strengthOf(world, fixture.homeId))
  const homePosition = clubById(world, fixture.homeId) ? positionOf(world, fixture.homeId) : null
  const awayPosition = clubById(world, fixture.awayId) ? positionOf(world, fixture.awayId) : null
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
  const homePoints = homeResult === 'W' ? T.POINTS_WIN : homeResult === 'D' ? T.POINTS_DRAW : 0
  const awayPoints = awayResult === 'W' ? T.POINTS_WIN : awayResult === 'D' ? T.POINTS_DRAW : 0
  const homeManager = homeClub ? managerAt(world, homeClub) : undefined
  const awayManager = awayClub ? managerAt(world, awayClub) : undefined

  const event = emit(world, 'match.played', {
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

  return { fixture, winnerId, loserId, homeManager, awayManager, expHome, expAway, homePoints, awayPoints, homePosition, awayPosition, event }
}

function tierOfClub(world: World, id: ClubId): Tier | null {
  return clubById(world, id)?.tier ?? null
}

/** The ties of a cup's next round that are drawn but not yet played. */
export function drawnCupFixtures(world: World, cup: CupState): Fixture[] {
  const round = cup.roundsPlayed + 1
  return world.fixtures.filter((f) => f.competition === cup.competition && f.round === round && !f.played)
}

/**
 * Draw a cup round: the ties that play in `seasonWk`, everyone else has a bye.
 * The fixtures exist unplayed from here, so a career can show the tie before
 * it is played; one `cup.tie` event per tie and one `cup.bye` per bye.
 */
export function drawCupRound(world: World, rng: Rng, cup: CupState, seasonWk: number): Fixture[] {
  const final = isFinal(cup)
  const pairs = drawRound(rng, cup)
  const round = cup.roundsPlayed + 1
  if (final) {
    cup.finalistIds = [...cup.remaining]
    for (const id of cup.remaining) {
      const club = clubById(world, id)
      if (club) club.thisSeason.cupFinals++
      emit(world, 'cup.final', { competition: cup.competition, clubId: id, managerId: club?.managerId ?? null, season: world.season })
    }
  }
  const drawn: Fixture[] = []
  const playing = new Set<ClubId>()
  for (const [homeId, awayId] of pairs) {
    const fixture: Fixture = { week: seasonWk, competition: cup.competition, round, homeId, awayId, played: false }
    world.fixtures.push(fixture)
    drawn.push(fixture)
    playing.add(homeId)
    playing.add(awayId)
    emit(world, 'cup.tie', { competition: cup.competition, round, week: seasonWk, homeId, awayId, final, season: world.season })
  }
  for (const id of cup.remaining) {
    if (!playing.has(id)) emit(world, 'cup.bye', { competition: cup.competition, round, week: seasonWk, clubId: id, season: world.season })
  }
  return drawn
}

/** Play a cup round: the ties drawn earlier, or a draw made now (the simulation draws at kick-off). */
export function playCupRound(world: World, rng: Rng, cup: CupState, seasonWk: number): PlayedFixture[] {
  const final = isFinal(cup)
  let fixtures = drawnCupFixtures(world, cup)
  if (fixtures.length === 0) fixtures = drawCupRound(world, rng, cup, seasonWk)
  const played: PlayedFixture[] = []
  const round = cup.roundsPlayed + 1
  const out = new Set<ClubId>()
  for (const fixture of fixtures) {
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
  /** Finish per foreign club. */
  foreignFinish: Map<ClubId, number>
}

/** What the season needs from the tenure system to complete a season record. */
export interface RecordExtras {
  expectation: number
  fallouts: number
  boardRows: number
}
export type ExtrasFor = (managerId: number) => RecordExtras

export const noExtras: ExtrasFor = () => ({ expectation: 0, fallouts: 0, boardRows: 0 })

function netSpendRank(world: World, club: Club, tier: Tier): number {
  const division = world.clubs.filter((c) => c.tier === tier)
  const sorted = [...division].sort((a, b) => b.netSpendThisSeason - a.netSpendThisSeason || a.id - b.id)
  return sorted.findIndex((c) => c.id === club.id) + 1
}

/** Close the season: foreign leagues, home divisions, season records, ageing, drift. */
export function endSeason(world: World, rng: Rng, extrasFor: ExtrasFor = noExtras): SeasonEnd {
  const foreign = settleForeignLeagues(world, rng, extrasFor)
  // Net-spend ranks are taken against the tiers as played, before any swap.
  const spendRank = new Map<ClubId, number>()
  for (const club of world.clubs) spendRank.set(club.id, netSpendRank(world, club, club.tier))
  const outcome = settleLeagues(world)

  for (const club of world.clubs) {
    const manager = managerAt(world, club)
    const tier = outcome.playedTier.get(club.id) as Tier
    const finish = outcome.finish.get(club.id) as number
    const size = T.TIER_SIZES[tier - 1] as number
    if (manager) {
      const extras = extrasFor(manager.id)
      const record: SeasonRecord = {
        season: world.season,
        post: { kind: 'home', clubId: club.id },
        tier,
        games: manager.seasonGames,
        finish,
        expectation: extras.expectation,
        promoted: outcome.promoted.has(club.id),
        relegated: outcome.relegated.has(club.id),
        trophies: club.honours.filter((h) => h.season === world.season).length,
        bottomFourEscape: club.thisSeason.inBottomZone && finish <= size - T.BOTTOM_ZONE,
        netSpendRank: spendRank.get(club.id) as number,
        cupFinals: club.thisSeason.cupFinals,
        academyInXi: club.squad.academyInXi,
        fallouts: extras.fallouts,
        boardRows: extras.boardRows,
      }
      manager.history.seasons.push(record)
      emit(world, 'season.record', { managerId: manager.id, ...record })
    }
    club.netSpendThisSeason = 0
  }

  let aged = 0
  for (const manager of world.managers) {
    manager.seasonGames = 0
    if (manager.status.kind !== 'retired') {
      manager.age++
      aged++
    }
  }
  emit(world, 'managers.aged', { season: world.season, count: aged })
  for (const club of world.clubs) summerSquad(world, rng, club)

  emit(world, 'season.end', {
    season: world.season,
    champions: Object.fromEntries([...outcome.champions.entries()]),
    promoted: [...outcome.promoted],
    relegated: [...outcome.relegated],
  })
  return { ...outcome, foreignFinish: foreign.finish }
}

export type BudgetMultiplierFor = (clubId: ClubId) => number
const flatBudget: BudgetMultiplierFor = () => 1

/** The human's club follows the player's plan when one is set; every other club is AI-run. */
function windowFor(world: World, club: Club, summer: boolean, multiplier: number): WindowSummary {
  const state = world.human
  if (state && club.managerId === state.managerId && state.windowChoice) {
    const summary = runHumanWindow(world, club, summer, multiplier, state.windowChoice)
    state.windowChoice = null
    return summary
  }
  return runWindow(world, club, summer, multiplier)
}

export function summerWindow(world: World, multiplierFor: BudgetMultiplierFor = flatBudget): WindowSummary[] {
  return world.clubs.map((club) => windowFor(world, club, true, multiplierFor(club.id)))
}

export function winterWindow(world: World): WindowSummary[] {
  return world.clubs.map((club) => windowFor(world, club, false, 1))
}

export { tableFor }
