/**
 * The career loop (DESIGN.md "Turn structure"): one match per turn.
 * Continue plays the human's next fixture; everything due before it has
 * arrived first as inbox items and decisions. Weeks with no fixture for
 * the human, and summer weeks, pass as single steps with their own inbox.
 *
 * A match week is a sequence of slots played "at the same time": the
 * earliest unplayed league round of every tier, then any cup round due.
 * The turn plays slots until one includes the human's club. Once the week
 * is played it closes (salaries, the board, the market) and, when the
 * human's club plays again next week and nothing is waiting for an answer,
 * runs straight on into that fixture.
 */
import { rngFromState, type Rng } from '../rng.js'
import { T } from '../tunables.js'
import type { ClubId, CupState, Fixture, FixtureKey, HumanInputs, WatchedWeek, World } from '../types.js'
import { seasonOf, seasonWeek } from '../season/calendar.js'
import { commitFixtureMatch, createFixtureMatch, playCupRound, playFixture, prepareFixture, settleCupRound, startSeason, type PlayedFixture } from '../season/season.js'
import { roundDue, roundFixtures, type RoundDue } from '../season/cups.js'
import { SLOTS } from '../season/calendar.js'
import { runToEnd } from '../match/minute.js'
import { decayMorale } from '../season/squad.js'
import * as tenure from '../tenure/hooks.js'
import { applyInputs } from '../play/inputs.js'
import { human, pendingDecisions } from '../play/decisions.js'
import { closeWeekHooks } from './week.js'
import { ensureDirectors, isDeadlineWeek } from '../market/director.js'

export interface TurnOptions {
  /** Play and close the whole week whatever the human's fixtures: advanceWeek for a career. */
  wholeWeek?: boolean
  /**
   * Stop before the human's fixture with the slot read and the human's
   * division in the minute engine (world.human.watched); the next turn
   * commits whatever the match view played and runs the rest to the end.
   */
  watch?: boolean
}

/** One slot of a week (DESIGN.md "World"): every league round on it and every cup round due, played together. */
export interface Slot {
  sw: number
  slot: 0 | 1
  league: Fixture[]
  cups: { cup: CupState; due: RoundDue }[]
}

/** The club the human manages, if any. */
export function humanClubId(world: World): ClubId | null {
  if (!world.human) return null
  const player = human(world)
  return player.status.kind === 'employed' && player.status.post.kind === 'home' ? player.status.post.clubId : null
}

export function involves(fixture: Fixture, clubId: ClubId): boolean {
  return fixture.homeId === clubId || fixture.awayId === clubId
}

/** A club's fixtures, drawn or played, in a season week. */
export function clubFixturesInWeek(world: World, sw: number, clubId: ClubId): Fixture[] {
  return world.fixtures.filter((f) => f.week === sw && involves(f, clubId))
}

/** Does the club have football left this week: an unplayed fixture (every round is drawn ahead of its week)? */
export function humanHasFixtureIn(world: World, sw: number, clubId: ClubId): boolean {
  return clubFixturesInWeek(world, sw, clubId).some((f) => !f.played)
}

/** The fixtures a slot holds: its league rounds and the ties of its cup rounds, unplayed. */
export function slotFixtures(world: World, slot: Slot): Fixture[] {
  return [...slot.league, ...slot.cups.flatMap(({ cup, due }) => roundFixtures(world, cup, due.round, due.leg).filter((f) => !f.played))]
}

/** The next slot of the week with football in it: the weekend, then the midweek. */
export function nextSlot(world: World, sw: number): Slot | null {
  for (const slot of SLOTS) {
    const league = world.fixtures.filter((f) => f.competition === 'league' && f.week === sw && f.slot === slot && !f.played)
    const cups: Slot['cups'] = []
    for (const cup of world.cups) {
      const due = roundDue(cup, sw, slot)
      if (due && roundFixtures(world, cup, due.round, due.leg).some((f) => !f.played)) cups.push({ cup, due })
    }
    if (league.length > 0 || cups.length > 0) return { sw, slot, league, cups }
  }
  return null
}

export function fixtureKey(f: Fixture): FixtureKey {
  return { competition: f.competition, round: f.round, homeId: f.homeId, awayId: f.awayId }
}

export function findFixture(world: World, key: FixtureKey): Fixture | undefined {
  return world.fixtures.find((f) => f.competition === key.competition && f.round === key.round && f.homeId === key.homeId && f.awayId === key.awayId)
}

/** Does this slot hold an unplayed fixture of the club? */
function slotInvolves(world: World, slot: Slot, clubId: ClubId): boolean {
  return slotFixtures(world, slot).some((f) => involves(f, clubId))
}

/**
 * Read a slot for the match view: the human's division (or the human's cup
 * tie) goes into the minute engine, the human's fixture first; the rest of
 * the slot waits for the fast path at commit.
 */
export function prepareWatchedSlot(world: World, rng: Rng, slot: Slot, sw: number, clubId: ClubId): WatchedWeek {
  const fixtures = slotFixtures(world, slot)
  const mine = fixtures.find((f) => involves(f, clubId))
  if (!mine) throw new Error('prepareWatchedSlot: the human has no fixture in this slot')
  const watchedKind: WatchedWeek['slot'] = mine.competition === 'league' ? { kind: 'league' } : { kind: 'cup', competition: mine.competition }
  const tier = mine.tier
  const watched = [mine, ...fixtures.filter((f) => f !== mine && mine.competition === 'league' && f.competition === 'league' && f.tier === tier)]
  const others = fixtures.filter((f) => !watched.includes(f))
  const prepared = watched.map((f) => prepareFixture(world, rng, f))
  const matches = prepared.map((p) => createFixtureMatch(world, rng, p))
  return { seasonWeek: sw, slot: watchedKind, slotIndex: slot.slot, prepared, matches, others: others.map(fixtureKey) }
}

/** Settle a watched slot: finish any match still running, commit them, play the rest on the fast path, run the hooks. */
export function commitWatched(world: World, rng: Rng): PlayedFixture[] {
  const w = world.human?.watched
  if (!world.human || !w) return []
  const played: PlayedFixture[] = []
  w.prepared.forEach((prepared, i) => {
    const state = w.matches[i]
    if (!state) return
    const live = findFixture(world, fixtureKey(prepared.fixture))
    if (!live || live.played) return
    prepared.fixture = live
    if (!state.over) runToEnd(state)
    played.push(commitFixtureMatch(world, rng, prepared, state))
  })
  for (const key of w.others) {
    const f = findFixture(world, key)
    if (f && !f.played) played.push(playFixture(world, rng, f))
  }
  // Every cup round the slot held is settled now that its ties are played.
  for (const cup of world.cups) {
    const due = roundDue(cup, w.seasonWeek, w.slotIndex ?? 0)
    if (!due) continue
    const ties = played.filter((p) => p.fixture.competition === cup.competition && p.fixture.round === due.round.round)
    if (ties.length > 0 && roundFixtures(world, cup, due.round, due.leg).every((f) => f.played)) settleCupRound(world, rng, cup, ties, due.leg)
  }
  tenure.afterMatches(world, rng, played)
  world.human.watched = null
  return played
}

/** Forget a prepared slot (the human went back to change the side); the next turn reads it again. */
export function discardWatched(world: World): void {
  if (world.human) world.human.watched = null
}

function playSlot(world: World, rng: Rng, slot: Slot): PlayedFixture[] {
  const played = slot.league.map((f) => playFixture(world, rng, f))
  for (const { cup, due } of slot.cups) played.push(...playCupRound(world, rng, cup, due))
  tenure.afterMatches(world, rng, played)
  return played
}

/** A fresh career, or a save from before the turn loop, reaches week 0 with no fixtures drawn. */
function ensureSeasonStarted(world: World, rng: Rng, sw: number): void {
  if (sw === 0 && !world.fixtures.some((f) => !f.played)) startSeason(world, rng)
}

/** Close a career week: morale settles, the shared hooks run, the clock moves. */
function closeWeek(world: World, rng: Rng, sw: number): void {
  if (sw < T.MATCH_WEEKS) for (const club of world.clubs) decayMorale(club)
  closeWeekHooks(world, rng, sw)
  world.week++
  world.season = seasonOf(world.week)
  if (seasonWeek(world.week) === 0) startSeason(world, rng)
}

function statusKey(world: World): string {
  const player = human(world)
  return player.status.kind === 'employed' ? `employed:${player.status.spellId}` : player.status.kind
}

/**
 * Play one turn of a career. Returns the number of the human club's
 * fixtures played, 0 for a step with no match in it.
 */
export function advanceTurn(world: World, inputs: HumanInputs = {}, options: TurnOptions = {}): number {
  if (!world.human) throw new Error('advanceTurn needs a career; a simulation uses advanceWeek')
  const rng = rngFromState(world.rng)
  // Saves from before phase 3(d) have no watched slot.
  if (world.human.watched === undefined) world.human.watched = null
  if (world.human.agentWithdrawn === undefined) world.human.agentWithdrawn = []
  ensureDirectors(world)
  applyInputs(world, rng, inputs)
  const startStatus = statusKey(world)
  let fixturesPlayed = 0
  if (world.human.watched) {
    const club = humanClubId(world)
    const played = commitWatched(world, rng)
    if (club !== null && played.some((p) => involves(p.fixture, club))) {
      fixturesPlayed++
      if (!options.wholeWeek) return fixturesPlayed
    }
  }
  for (;;) {
    const sw = seasonWeek(world.week)
    if (sw >= T.MATCH_WEEKS) {
      // A summer week is one step.
      closeWeek(world, rng, sw)
      return fixturesPlayed
    }
    ensureSeasonStarted(world, rng, sw)
    const club = humanClubId(world)
    const slot = nextSlot(world, sw)
    if (slot) {
      if (options.watch && !options.wholeWeek && club !== null && slotInvolves(world, slot, club)) {
        // The pre-match step: the side is picked and the odds are set; the match view plays it.
        world.human.watched = prepareWatchedSlot(world, rng, slot, sw, club)
        return fixturesPlayed
      }
      const played = playSlot(world, rng, slot)
      if (club !== null && played.some((p) => involves(p.fixture, club))) {
        fixturesPlayed++
        if (!options.wholeWeek) return fixturesPlayed
      }
      continue
    }
    // The week's football is done.
    const hadFixture = club !== null && clubFixturesInWeek(world, sw, club).some((f) => f.played)
    closeWeek(world, rng, sw)
    if (options.wholeWeek) return fixturesPlayed
    const next = seasonWeek(world.week)
    if (next >= T.MATCH_WEEKS) return fixturesPlayed // into the summer
    if (isDeadlineWeek(sw) && club !== null) return fixturesPlayed // deadline day is its own step, with its own inbox
    if (statusKey(world) !== startStatus) return fixturesPlayed // hired, sacked, moved or retired at the close: show it
    if (!hadFixture) return fixturesPlayed // a week with no fixture is its own step
    const clubNow = humanClubId(world)
    if (clubNow === null || !humanHasFixtureIn(world, next, clubNow)) continue // run on through the blank week that follows a match
    if (pendingDecisions(world).length > 0) return fixturesPlayed // the pre-match step: something wants an answer first
  }
}
