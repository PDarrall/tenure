/**
 * The cups (DESIGN.md "World"): the Cup (every club, tiered entry, single
 * ties, neutral semi-finals and final), the League Cup (tiers 1–4, tiered
 * entry, midweeks, two-leg semi-finals) and three European competitions
 * (groups of four then two-leg knockouts and a one-off final). Every round
 * has its week and slot from the template. A round with entrants pairs
 * everyone (one bye when odd); the first round without pares the field to
 * a power of two. The next round is drawn the moment a round is settled,
 * so the tie is on the card early.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp } from '../world/gen.js'
import { homeClub, playerById } from '../lookup.js'
import { milestone } from '../players/made.js'
import type { Club, ClubId, CupCompetition, CupGroup, CupRound, CupRoundSpec, CupState, EuropeanCompetition, Fixture, GroupRow, Tier, World } from '../types.js'
import { EUROPEAN_COMPETITIONS, generateEuropeanFields, isEuropean, redrawOpponents, type EuropeStage } from './europe.js'
import { roundRobin } from './fixtures.js'

/** Matches in a knockout round of n clubs when paring: down to a power of two, then halve. */
export function matchesThisRound(n: number): number {
  let pow = 1
  while (pow * 2 <= n) pow *= 2
  return n === pow ? n / 2 : n - pow
}

/** Rounds needed to reduce n clubs to one by paring. */
export function roundsNeeded(n: number): number {
  let rounds = 0
  let left = n
  while (left > 1) {
    left -= matchesThisRound(left)
    rounds++
  }
  return rounds
}

/** Rounds from the template: group matchdays first, then the knockout rounds named from the end. */
export function buildRounds(specs: readonly CupRoundSpec[], groupWeeks: readonly number[] = []): CupRound[] {
  const rounds: CupRound[] = []
  groupWeeks.forEach((week, i) => rounds.push({ week, slot: 1, entrants: [], round: i + 1, label: `Group stage, matchday ${i + 1}`, group: true }))
  specs.forEach((spec, i) => {
    const fromEnd = specs.length - i
    const label = fromEnd === 1 ? 'Final' : fromEnd === 2 ? 'Semi-final' : fromEnd === 3 ? 'Quarter-final' : `Round ${i + 1}`
    const round: CupRound = { week: spec.week, slot: spec.slot, entrants: [...spec.entrants], round: groupWeeks.length + i + 1, label }
    if (spec.secondLeg) round.secondLeg = { ...spec.secondLeg }
    if (spec.neutral) round.neutral = true
    rounds.push(round)
  })
  return rounds
}

function makeCup(competition: CupCompetition, rounds: CupRound[], entrants: ClubId[][], groups: CupGroup[] = []): CupState {
  return { competition, rounds, remaining: [], entrants, roundsPlayed: 0, winnerId: null, finalistIds: [], groups, ties: [], nextTieId: 1 }
}

function emptyRow(clubId: ClubId): GroupRow {
  return { clubId, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
}

/** Create this season's cups from the clubs as they stand, and draw their opening rounds. */
export function seedCups(world: World, rng: Rng): void {
  const byTier = (tier: Tier) =>
    world.clubs
      .filter((c) => c.tier === tier)
      .map((c) => c.id)
      .sort((a, b) => a - b)
  const inEurope = new Set(EUROPEAN_COMPETITIONS.flatMap((c) => world.europeanPlaces[c]))
  const entrantsFor = (specs: readonly CupRoundSpec[], leagueCup: boolean): ClubId[][] =>
    specs.map((spec) => {
      const ids: ClubId[] = []
      for (const e of spec.entrants) {
        if (e === 'europe') ids.push(...byTier(1).filter((id) => inEurope.has(id)))
        else if (leagueCup && e === 1) ids.push(...byTier(1).filter((id) => !inEurope.has(id)))
        else ids.push(...byTier(e))
      }
      return ids.sort((a, b) => a - b)
    })
  const cups: CupState[] = [makeCup('nationalCup', buildRounds(T.THE_CUP_ROUNDS), entrantsFor(T.THE_CUP_ROUNDS, false)), makeCup('leagueCup', buildRounds(T.LEAGUE_CUP_ROUNDS), entrantsFor(T.LEAGUE_CUP_ROUNDS, true))]
  // Europe: the home places plus a generated field to EUROPE_CLUBS, in groups of four.
  const counts = { championsCup: 0, europaCup: 0, conferenceCup: 0 }
  for (const competition of EUROPEAN_COMPETITIONS) counts[competition] = Math.max(0, T.EUROPE_CLUBS - world.europeanPlaces[competition].length)
  const fields = generateEuropeanFields(world, rng, counts)
  const size = T.EUROPE_CLUBS / T.EUROPE_GROUPS
  for (const competition of EUROPEAN_COMPETITIONS) {
    const clubs = [...world.europeanPlaces[competition], ...fields[competition].map((o) => o.id)]
    rng.shuffle(clubs)
    const groups: CupGroup[] = []
    for (let g = 0; g < T.EUROPE_GROUPS; g++) {
      const ids = clubs.slice(g * size, (g + 1) * size)
      groups.push({ index: g, clubIds: ids, rows: ids.map(emptyRow) })
    }
    const cup = makeCup(competition, buildRounds(T.EUROPE_KNOCKOUT_ROUNDS, T.EUROPE_GROUP_WEEKS), [], groups)
    cup.remaining = [...clubs].sort((a, b) => a - b)
    cups.push(cup)
  }
  world.cups = cups
  for (const cup of world.cups) drawOpeningRounds(world, rng, cup)
}

/** The group matchdays entire, or the first knockout round. */
function drawOpeningRounds(world: World, rng: Rng, cup: CupState): void {
  if (cup.groups.length === 0) {
    drawRound(world, rng, cup)
    return
  }
  for (const group of cup.groups) {
    const rounds = roundRobin(group.clubIds)
    rounds.forEach((pairs, md) => {
      const round = cup.rounds[md]
      if (!round) throw new Error(`${cup.competition}: group matchday ${md + 1} has no week`)
      for (const [homeId, awayId] of pairs) world.fixtures.push({ week: round.week, slot: round.slot, competition: cup.competition, round: round.round, homeId, awayId, played: false, group: group.index })
    })
    emit(world, 'europe.group', { competition: cup.competition, group: group.index, clubIds: [...group.clubIds], week: cup.rounds[0]?.week ?? 0, season: world.season })
  }
}

/** The stage a European round belongs to, for opponents' strength and prize money. */
export function stageOf(cup: CupState, round: CupRound): EuropeStage {
  if (round.group) return 'group'
  const fromEnd = cup.rounds.length - cup.rounds.indexOf(round)
  return fromEnd === 1 ? 'final' : fromEnd === 2 ? 'semi' : 'quarter'
}

export function cupRoundLabel(cup: CupState, round: number): string {
  return cup.rounds.find((r) => r.round === round)?.label ?? `Round ${round}`
}

function tierOf(world: World, id: ClubId): Tier | null {
  return homeClub(world, id)?.tier ?? null
}

/**
 * Draw the next knockout round: the round's entrants join the field, the
 * pairs are drawn (everyone in an entry round, one bye when odd; a pare to
 * a power of two otherwise), the fixtures land on the round's week and
 * slot, a second leg on its own. `pairs` overrides the draw (Europe's
 * quarter-finals pair group winners with runners-up).
 */
export function drawRound(world: World, rng: Rng, cup: CupState, pairs?: [ClubId, ClubId][]): Fixture[] {
  const index = cup.roundsPlayed
  const round = cup.rounds[index]
  if (!round || round.group) throw new Error(`${cup.competition}: no knockout round to draw at ${index}`)
  const joining = cup.entrants[index] ?? []
  cup.remaining = [...new Set([...cup.remaining, ...joining])].sort((a, b) => a - b)
  if (isEuropean(cup.competition)) redrawOpponents(world, rng, cup.remaining, cup.competition, stageOf(cup, round))
  let drawnPairs: [ClubId, ClubId][]
  if (pairs) drawnPairs = pairs
  else {
    const ids = [...cup.remaining]
    rng.shuffle(ids)
    const matches = joining.length > 0 ? Math.floor(ids.length / 2) : matchesThisRound(ids.length)
    drawnPairs = []
    for (let i = 0; i < matches; i++) drawnPairs.push([ids[2 * i] as ClubId, ids[2 * i + 1] as ClubId])
  }
  const final = cup.remaining.length === 2
  if (final) {
    cup.finalistIds = [...cup.remaining]
    for (const id of cup.remaining) {
      const club = homeClub(world, id)
      if (club) club.thisSeason.cupFinals++
      emit(world, 'cup.final', { competition: cup.competition, clubId: id, managerId: club?.managerId ?? null, season: world.season })
      if (club)
        for (const pid of club.playerIds) {
          const p = playerById(world, pid)
          if (p && !p.retired && p.madeBy.length > 0 && p.season.apps > 0) milestone(world, p, 'cupFinal', { competition: cup.competition })
        }
    }
  }
  const drawn: Fixture[] = []
  const playing = new Set<ClubId>()
  for (const [homeId, awayId] of drawnPairs) {
    const base: Fixture = { week: round.week, slot: round.slot, competition: cup.competition, round: round.round, homeId, awayId, played: false }
    if (round.neutral) base.neutral = true
    if (round.secondLeg) {
      const tieId = cup.nextTieId++
      cup.ties.push({ id: tieId, round: round.round, homeId, awayId, firstLeg: null })
      const first: Fixture = { ...base, leg: 1, tieId }
      const second: Fixture = { ...base, homeId: awayId, awayId: homeId, week: round.secondLeg.week, slot: round.secondLeg.slot, leg: 2, tieId }
      world.fixtures.push(first, second)
      drawn.push(first, second)
    } else {
      world.fixtures.push(base)
      drawn.push(base)
    }
    playing.add(homeId)
    playing.add(awayId)
    emit(world, 'cup.tie', { competition: cup.competition, round: round.round, label: round.label, week: round.week, homeId, awayId, homeTier: tierOf(world, homeId), awayTier: tierOf(world, awayId), final, legs: round.secondLeg ? 2 : 1, neutral: round.neutral === true, season: world.season })
  }
  for (const id of cup.remaining) {
    if (!playing.has(id)) emit(world, 'cup.bye', { competition: cup.competition, round: round.round, label: round.label, week: round.week, clubId: id, season: world.season })
  }
  return drawn
}

export interface RoundDue {
  round: CupRound
  leg: 1 | 2
}

/** The round (and leg) of a cup that plays in this week and slot, if any. */
export function roundDue(cup: CupState, sw: number, slot: 0 | 1): RoundDue | null {
  const round = cup.rounds[cup.roundsPlayed]
  if (!round) return null
  if (round.week === sw && round.slot === slot) return { round, leg: 1 }
  if (round.secondLeg && round.secondLeg.week === sw && round.secondLeg.slot === slot) return { round, leg: 2 }
  return null
}

/** The fixtures of a round, one leg of it when it has two. */
export function roundFixtures(world: World, cup: CupState, round: CupRound, leg: 1 | 2 = 1): Fixture[] {
  return world.fixtures.filter((f) => f.competition === cup.competition && f.round === round.round && (round.secondLeg ? f.leg === leg : true))
}

/** A played group match into its group's rows. */
export function applyGroupResult(cup: CupState, fixture: Fixture): void {
  const group = cup.groups[fixture.group ?? -1]
  if (!group || fixture.homeGoals === undefined || fixture.awayGoals === undefined) return
  const home = group.rows.find((r) => r.clubId === fixture.homeId)
  const away = group.rows.find((r) => r.clubId === fixture.awayId)
  if (!home || !away) return
  for (const [row, gf, ga] of [
    [home, fixture.homeGoals, fixture.awayGoals],
    [away, fixture.awayGoals, fixture.homeGoals],
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
    } else row.lost++
  }
}

/** A group's rows, best first. */
export function groupStandings(group: CupGroup): GroupRow[] {
  return [...group.rows].sort((a, b) => b.points - a.points || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || a.clubId - b.clubId)
}

/** Prize money and prestige for the stage a club reached (DESIGN.md "World"). */
export function awardEuropePrize(world: World, club: Club, competition: EuropeanCompetition, stage: EuropeStage | 'winner'): void {
  const prize = T.EUROPE_PRIZE[competition][stage]
  club.wealth = Math.round(clamp(club.wealth + prize.wealth, 0, 100))
  club.prestige = Math.round(clamp(club.prestige + prize.prestige, 0, 100))
  emit(world, 'europe.prize', { competition, clubId: club.id, managerId: club.managerId, stage, wealth: prize.wealth, prestige: prize.prestige, season: world.season })
}

/** After the group stage: the top two of each group go through, group winners drawn against runners-up of other groups. */
export function knockoutPairsFromGroups(rng: Rng, cup: CupState): [ClubId, ClubId][] {
  const winners: ClubId[] = []
  const runners: ClubId[] = []
  for (const group of cup.groups) {
    const rows = groupStandings(group)
    winners.push(rows[0]!.clubId)
    runners.push(rows[1]!.clubId)
  }
  const order = cup.groups.map((_, i) => i)
  rng.shuffle(order)
  // The runner-up hosts the first leg; the group winner has the second at home.
  return order.map((g, i): [ClubId, ClubId] => [runners[order[(i + 1) % order.length] as number] as ClubId, winners[g] as ClubId])
}

export function isFinal(cup: CupState): boolean {
  return cup.remaining.length === 2 && cup.roundsPlayed === cup.rounds.length - 1
}
