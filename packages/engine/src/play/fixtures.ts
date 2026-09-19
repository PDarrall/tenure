/**
 * The human club's fixtures as the UI shows them (DESIGN.md "Fixtures"):
 * the next fixture with the opponent's form and position, the season's
 * fixtures and results by competition with the cups' rounds named and
 * Europe's group tables, and the calendar's weeks with what happens in
 * them. Everything here is read from state and the log; nothing is
 * stored twice.
 */
import { T } from '../tunables.js'
import type { ClubId, Competition, CupState, Fixture, GroupRow, Result, Tier, World } from '../types.js'
import { seasonWeek } from '../season/calendar.js'
import { cupRoundLabel, groupStandings } from '../season/cups.js'
import { positionOf } from '../season/table.js'
import { homeClub, europeanOpponentById } from '../lookup.js'
import { clubNameOf } from '../text/render.js'
import { competitionLabel } from './inbox.js'
import { humanClubId } from '../sim/turn.js'
import { deadlineOf, windowAt } from '../market/director.js'

export interface FixtureView {
  /** Global week. */
  week: number
  /** 0-based week of the season. */
  seasonWeek: number
  /** 0 the weekend, 1 the midweek. */
  slot: 0 | 1
  competition: Competition
  competitionLabel: string
  round: number
  /** The round as the cup names it ("Quarter-final", "Group stage, matchday 2"); '' for the league. */
  roundLabel: string
  leg: 1 | 2 | null
  neutral: boolean
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
      /** A cup round the club is in that has not been drawn yet (every round is drawn ahead now; kept for the shells). */
      kind: 'draw'
      week: number
      seasonWeek: number
      competition: Competition
      competitionLabel: string
      round: number
    }

export interface GroupView {
  /** 'A', 'B', … */
  name: string
  rows: (GroupRow & { name: string; mine: boolean })[]
}

export interface CompetitionFixtures {
  competition: Competition
  label: string
  fixtures: FixtureView[]
  /** Where the club stands in a cup: '' for the league. */
  status: string
  /** Europe's group, while the club is in one. */
  group: GroupView | null
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
  const cup = f.competition === 'league' ? undefined : world.cups.find((c) => c.competition === f.competition)
  return {
    week: base + f.week,
    seasonWeek: f.week,
    slot: f.slot,
    competition: f.competition,
    competitionLabel: competitionLabel(f.competition),
    round: f.round,
    roundLabel: cup ? cupRoundLabel(cup, f.round) : '',
    leg: f.leg ?? null,
    neutral: f.neutral === true,
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

function byDate(a: Fixture, b: Fixture): number {
  return a.week - b.week || a.slot - b.slot || a.round - b.round
}

/** The human club's next fixture, or null when it has none left this season. */
export function nextFixture(world: World): NextFixture | null {
  const clubId = humanClubId(world)
  if (clubId === null) return null
  const sw = seasonWeek(world.week)
  const shootouts = new Map<string, number>()
  const mine = world.fixtures.filter((f) => !f.played && f.week >= sw && (f.homeId === clubId || f.awayId === clubId)).sort(byDate)
  const first = mine[0]
  return first ? withOpponent(world, view(world, first, clubId, shootouts)) : null
}

function withOpponent(world: World, v: FixtureView): NextFixture {
  const club = homeClub(world, v.opponentId)
  if (club) {
    return { kind: 'fixture', ...v, opponentForm: [...club.form], opponentPosition: world.tables.length ? positionOf(world, club.id) : null, opponentTier: club.tier, opponentEuropean: null }
  }
  const opponent = europeanOpponentById(world, v.opponentId)
  return { kind: 'fixture', ...v, opponentForm: [], opponentPosition: null, opponentTier: null, opponentEuropean: opponent ? `European opposition, strength ${Math.round(opponent.strength)}` : 'European opposition' }
}

function groupView(world: World, cup: CupState, clubId: ClubId): GroupView | null {
  const group = cup.groups.find((g) => g.clubIds.includes(clubId))
  if (!group) return null
  return { name: String.fromCharCode(65 + group.index), rows: groupStandings(group).map((r) => ({ ...r, name: clubNameOf(world, r.clubId), mine: r.clubId === clubId })) }
}

/** This season's fixtures and results for the human's club, by competition. */
export function seasonFixtures(world: World): CompetitionFixtures[] {
  const clubId = humanClubId(world)
  if (clubId === null) return []
  const shootouts = shootoutWinners(world, clubId)
  const out: CompetitionFixtures[] = []
  const league = world.fixtures.filter((f) => f.competition === 'league' && (f.homeId === clubId || f.awayId === clubId)).sort(byDate)
  out.push({ competition: 'league', label: competitionLabel('league'), fixtures: league.map((f) => view(world, f, clubId, shootouts)), status: '', group: null })
  for (const cup of world.cups) {
    const ties = world.fixtures.filter((f) => f.competition === cup.competition && (f.homeId === clubId || f.awayId === clubId)).sort(byDate)
    const entered = ties.length > 0 || cup.remaining.includes(clubId) || cup.winnerId === clubId || cup.entrants.some((e) => e.includes(clubId))
    if (!entered) continue
    let status: string
    const inGroup = cup.groups.some((g) => g.clubIds.includes(clubId)) && cup.roundsPlayed < cup.groups.length * 0 + cup.rounds.filter((r) => r.group).length
    if (cup.winnerId === clubId) status = 'Winners.'
    else if (cup.remaining.includes(clubId)) {
      const next = cup.rounds[cup.roundsPlayed]
      status = next ? (inGroup ? `In the group stage.` : `Still in: the ${next.label.toLowerCase()} in week ${next.week + 1}.`) : 'Still in.'
    } else if (cup.entrants.some((e) => e.includes(clubId))) {
      const entry = cup.rounds[cup.entrants.findIndex((e) => e.includes(clubId))]
      status = entry ? `Enter at the ${entry.label.toLowerCase()}, week ${entry.week + 1}.` : 'Yet to enter.'
    } else {
      const exit = ties.filter((f) => f.played).at(-1)
      status = exit ? `Out at the ${cupRoundLabel(cup, exit.round).toLowerCase()}.` : 'Out.'
    }
    out.push({ competition: cup.competition, label: competitionLabel(cup.competition), fixtures: ties.map((f) => view(world, f, clubId, shootouts)), status, group: groupView(world, cup, clubId) })
  }
  return out
}

export interface CalendarWeek {
  /** 0-based week of the season. */
  seasonWeek: number
  /** "Week 12" or "Summer week 3". */
  label: string
  summer: boolean
  /** What the week holds beyond the league: cup rounds, the window, the season's end, the new fixtures. */
  events: string[]
  current: boolean
}

/** The 52 weeks of the year and what happens in each (DESIGN.md "World"): the cups' rounds, the windows, the summer's steps. */
export function calendarOf(world: World): CalendarWeek[] {
  const sw = seasonWeek(world.week)
  const weeks: CalendarWeek[] = []
  for (let w = 0; w < T.SEASON_WEEKS; w++) {
    const summer = w >= T.MATCH_WEEKS
    const events: string[] = []
    for (const cup of world.cups) {
      for (const round of cup.rounds) {
        if (round.week === w) events.push(`${competitionLabel(cup.competition)}: ${round.label.toLowerCase()}${round.secondLeg ? ', first leg' : ''}`)
        if (round.secondLeg && round.secondLeg.week === w) events.push(`${competitionLabel(cup.competition)}: ${round.label.toLowerCase()}, second leg`)
      }
    }
    const window = windowAt(w)
    const before = windowAt((w + T.SEASON_WEEKS - 1) % T.SEASON_WEEKS)
    if (window && !before) events.push(window === 'summer' ? 'The summer window opens' : 'The January window opens')
    if (window && deadlineOf(window) === w) events.push(window === 'summer' ? 'Summer deadline day' : 'January deadline day')
    if (w === T.MATCH_WEEKS - 1) events.push('The last match week; expiring contracts decided')
    if (w === T.MATCH_WEEKS) events.push('The season ends: tables settle, honours, the awards')
    if (w === T.SEASON_WEEKS - 1) events.push("Next season's fixtures come out")
    weeks.push({ seasonWeek: w, label: summer ? `Summer week ${w - T.MATCH_WEEKS + 1}` : `Week ${w + 1}`, summer, events, current: w === sw })
  }
  return weeks
}
