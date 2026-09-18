/**
 * The human club's fixtures as the UI shows them (DESIGN.md "Fixtures"):
 * the next fixture with the opponent's form and position, and the season's
 * fixtures and results by competition. Everything here is read from state
 * and the log; nothing is stored twice.
 */
import { T } from '../tunables.js'
import type { ClubId, Competition, Fixture, Result, Tier, World } from '../types.js'
import { seasonWeek } from '../season/calendar.js'
import { drawnCupFixtures } from '../season/season.js'
import { positionOf } from '../season/table.js'
import { homeClub, europeanOpponentById } from '../lookup.js'
import { clubNameOf } from '../text/render.js'
import { competitionLabel } from './inbox.js'
import { humanClubId } from '../sim/turn.js'

export interface FixtureView {
  /** Global week. */
  week: number
  /** 0-based week of the season. */
  seasonWeek: number
  competition: Competition
  competitionLabel: string
  round: number
  opponentId: ClubId
  opponent: string
  home: boolean
  played: boolean
  goalsFor: number | null
  goalsAgainst: number | null
  result: Result | null
  /** Set on a level cup tie: did the club win the shoot-out? */
  shootoutWon: boolean | null
}

export type NextFixture =
  | (FixtureView & {
      kind: 'fixture'
      opponentForm: Result[]
      /** League position in the opponent's own tier; null for a generated European opponent. */
      opponentPosition: number | null
      opponentTier: Tier | null
      /** Set when the opponent is a side generated for a European tie: what is known of it. */
      opponentEuropean: string | null
    })
  | {
      /** A cup round the club is in that has not been drawn yet. */
      kind: 'draw'
      week: number
      seasonWeek: number
      competition: Competition
      competitionLabel: string
      round: number
    }

export interface CompetitionFixtures {
  competition: Competition
  label: string
  fixtures: FixtureView[]
  /** Where the club stands in a cup: '' for the league. */
  status: string
}

function shootoutWinners(world: World, clubId: ClubId): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of world.log) {
    if (e.type !== 'match.played' || e.payload['competition'] === 'league') continue
    const p = e.payload
    if (p['homeId'] !== clubId && p['awayId'] !== clubId) continue
    if (typeof p['shootoutWinnerId'] === 'number') map.set(`${String(p['competition'])}:${String(p['round'])}:${String(p['homeId'])}:${String(p['awayId'])}`, p['shootoutWinnerId'])
  }
  return map
}

function view(world: World, f: Fixture, clubId: ClubId, shootouts: Map<string, number>): FixtureView {
  const home = f.homeId === clubId
  const opponentId = home ? f.awayId : f.homeId
  const goalsFor = f.played ? (home ? f.homeGoals! : f.awayGoals!) : null
  const goalsAgainst = f.played ? (home ? f.awayGoals! : f.homeGoals!) : null
  let result: Result | null = null
  let shootoutWon: boolean | null = null
  if (goalsFor !== null && goalsAgainst !== null) {
    result = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D'
    if (result === 'D' && f.competition !== 'league') {
      const winner = shootouts.get(`${f.competition}:${f.round}:${f.homeId}:${f.awayId}`)
      if (winner !== undefined) {
        shootoutWon = winner === clubId
        result = shootoutWon ? 'W' : 'L'
      }
    }
  }
  const base = world.week - seasonWeek(world.week)
  return {
    week: base + f.week,
    seasonWeek: f.week,
    competition: f.competition,
    competitionLabel: competitionLabel(f.competition),
    round: f.round,
    opponentId,
    opponent: clubNameOf(world, opponentId),
    home,
    played: f.played,
    goalsFor,
    goalsAgainst,
    result,
    shootoutWon,
  }
}

/** The human club's next fixture, or the cup round it is waiting on, or null when it has none this season. */
export function nextFixture(world: World): NextFixture | null {
  const clubId = humanClubId(world)
  if (clubId === null) return null
  const sw = seasonWeek(world.week)
  const base = world.week - sw
  const shootouts = new Map<string, number>()
  for (let w = sw; w < T.MATCH_WEEKS; w++) {
    const league = world.fixtures.filter((f) => f.competition === 'league' && f.week === w && !f.played && (f.homeId === clubId || f.awayId === clubId)).sort((a, b) => a.round - b.round)
    const first = league[0]
    if (first) return withOpponent(world, view(world, first, clubId, shootouts))
    for (const cup of world.cups) {
      if (cup.roundWeeks[cup.roundsPlayed] !== w || cup.remaining.length <= 1 || !cup.remaining.includes(clubId)) continue
      const drawn = drawnCupFixtures(world, cup)
      if (drawn.length === 0) {
        return { kind: 'draw', week: base + w, seasonWeek: w, competition: cup.competition, competitionLabel: competitionLabel(cup.competition), round: cup.roundsPlayed + 1 }
      }
      const mine = drawn.find((f) => f.homeId === clubId || f.awayId === clubId)
      if (mine) return withOpponent(world, view(world, mine, clubId, shootouts))
      // A bye: nothing to play this round.
    }
  }
  return null
}

function withOpponent(world: World, v: FixtureView): NextFixture {
  const club = homeClub(world, v.opponentId)
  if (club) {
    return { kind: 'fixture', ...v, opponentForm: [...club.form], opponentPosition: world.tables.length ? positionOf(world, club.id) : null, opponentTier: club.tier, opponentEuropean: null }
  }
  const opponent = europeanOpponentById(world, v.opponentId)
  return { kind: 'fixture', ...v, opponentForm: [], opponentPosition: null, opponentTier: null, opponentEuropean: opponent ? `European opposition, strength ${Math.round(opponent.strength)}` : 'European opposition' }
}

/** This season's fixtures and results for the human's club, by competition. */
export function seasonFixtures(world: World): CompetitionFixtures[] {
  const clubId = humanClubId(world)
  if (clubId === null) return []
  const shootouts = shootoutWinners(world, clubId)
  const out: CompetitionFixtures[] = []
  const league = world.fixtures.filter((f) => f.competition === 'league' && (f.homeId === clubId || f.awayId === clubId)).sort((a, b) => a.week - b.week || a.round - b.round)
  out.push({ competition: 'league', label: competitionLabel('league'), fixtures: league.map((f) => view(world, f, clubId, shootouts)), status: '' })
  for (const cup of world.cups) {
    const ties = world.fixtures.filter((f) => f.competition === cup.competition && (f.homeId === clubId || f.awayId === clubId)).sort((a, b) => a.round - b.round)
    const entered = ties.length > 0 || cup.remaining.includes(clubId) || cup.winnerId === clubId
    if (!entered) continue
    let status: string
    if (cup.winnerId === clubId) status = 'Winners.'
    else if (cup.remaining.includes(clubId)) {
      const nextWeek = cup.roundWeeks[cup.roundsPlayed]
      status = nextWeek === undefined ? 'Still in.' : `Still in: round ${cup.roundsPlayed + 1} in week ${nextWeek + 1}.`
    } else {
      const exit = ties.filter((f) => f.played).at(-1)
      status = exit ? `Out in round ${exit.round}.` : 'Out.'
    }
    out.push({ competition: cup.competition, label: competitionLabel(cup.competition), fixtures: ties.map((f) => view(world, f, clubId, shootouts)), status })
  }
  return out
}
