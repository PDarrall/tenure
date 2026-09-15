/**
 * Where tenure meets the calendar. advanceWeek calls these after the
 * football of the week, monthly, at season end and after the summer window.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { round1 } from '../world/gen.js'
import { homeClub, managerById, spellOf } from '../lookup.js'
import { positionOf } from '../season/table.js'
import type { PlayedFixture, SeasonEnd } from '../season/season.js'
import type { WindowSummary } from '../season/squad.js'
import type { Honour, Manager, Spell, World } from '../types.js'
import { addCredit, advanceCeiling, clampToCeiling, matchCreditDelta, monthlyGapDelta, resetCeilingForTurnover, seasonEndDelta } from './credit.js'
import { resetExpectation } from './expectation.js'
import { weeklySackingCheck } from './sacking.js'
import { maybeFallout, monthlyShocks } from './shocks.js'
import { bumpReputation, checkExpiry, monthlyMutualConsent, monthlyResignation } from './exits.js'
import { activeSpells } from './spell.js'

function creditForSide(world: World, rng: Rng, played: PlayedFixture, home: boolean): number | null {
  const manager = home ? played.homeManager : played.awayManager
  if (!manager) return null
  const spell = spellOf(world, manager)
  if (!spell || spell.post.kind !== 'home') return null
  const ownId = home ? played.fixture.homeId : played.fixture.awayId
  const opponentId = home ? played.fixture.awayId : played.fixture.homeId
  const club = homeClub(world, ownId)
  const opponent = homeClub(world, opponentId)
  const points = home ? played.homePoints : played.awayPoints
  const opponentPosition = home ? played.awayPosition : played.homePosition
  const knockout = played.fixture.competition !== 'league'
  const delta = matchCreditDelta(spell, {
    points: knockout ? (points === 3 ? 3 : 0) : points,
    expected: home ? played.expHome : played.expAway,
    derby: club !== undefined && club.rivals.includes(opponentId),
    cupExitToLowerTier: knockout && points < 3 && opponent !== undefined && club !== undefined && opponent.tier > club.tier,
    beatTopSide: opponentPosition !== null && opponentPosition <= T.CREDIT_TOP_SIDE_RANK,
  })
  const applied = addCredit(spell, delta)
  maybeFallout(world, rng, spell)
  return applied
}

/** Credit for every match of the week, written onto the match events. */
export function afterMatches(world: World, rng: Rng, played: PlayedFixture[]): void {
  for (const p of played) {
    const homeDelta = creditForSide(world, rng, p, true)
    const awayDelta = creditForSide(world, rng, p, false)
    p.event.payload['homeCredit'] = homeDelta
    p.event.payload['awayCredit'] = awayDelta
  }
}

/** Salary, contract expiry, takeover replacements and the board's weekly roll. */
export function weekly(world: World, rng: Rng): void {
  for (const spell of activeSpells(world)) {
    const manager = managerById(world, spell.managerId)
    const pay = spell.contract.salary / T.SEASON_WEEKS
    spell.season.earned += pay
    manager.history.earnings += pay
    if (checkExpiry(world, spell)) continue
    weeklySackingCheck(world, rng, spell)
  }
}

/** Monthly: erratic re-rolls, the position gap, shocks, mutual consent, AI resignations. */
export function monthly(world: World, rng: Rng): void {
  for (const spell of activeSpells(world)) {
    if (spell.post.kind !== 'home') {
      if (monthlyMutualConsent(world, rng, spell)) continue
      monthlyResignation(world, rng, spell)
      continue
    }
    const club = homeClub(world, spell.post.clubId)
    if (!club) continue
    if (club.owner.type === 'erratic') {
      spell.threshold = rng.int(T.SACK_THRESHOLD_ERRATIC[0], T.SACK_THRESHOLD_ERRATIC[1])
      emit(world, 'board.thresholdReroll', { spellId: spell.id, managerId: spell.managerId, threshold: spell.threshold })
    }
    const position = positionOf(world, club.id)
    const size = T.TIER_SIZES[club.tier - 1] as number
    if (position > size - T.BOTTOM_ZONE) club.thisSeason.inBottomZone = true
    const gap = monthlyGapDelta(spell, position)
    if (gap !== 0) {
      const applied = addCredit(spell, gap)
      emit(world, 'credit.monthly', { spellId: spell.id, managerId: spell.managerId, position, expectation: spell.expectation, delta: applied, credit: spell.credit })
    }
    monthlyShocks(world, rng, spell)
    if (spell.endWeek !== null) continue
    if (monthlyMutualConsent(world, rng, spell)) continue
    monthlyResignation(world, rng, spell)
  }
}

function trophyWeight(h: Honour): number {
  const key = h.competition === 'league' ? `league-${h.tier}` : h.competition === 'foreignLeague' ? `foreign-${h.league}` : h.competition
  return T.REP_TROPHY_WEIGHT[key] ?? 0
}

/** Honours won this season with this spell's club. */
function spellHonours(world: World, manager: Manager, spell: Spell): Honour[] {
  return manager.history.honours.filter((h) => h.season === world.season && h.clubId === spell.post.clubId)
}

function seasonReputation(world: World, manager: Manager, spell: Spell, finish: number, promoted: boolean, relegated: boolean): void {
  const places = Math.max(-T.REP_SEASON_CLAMP, Math.min(T.REP_SEASON_CLAMP, (spell.expectation - finish) * T.REP_SEASON_PER_PLACE))
  if (places !== 0) bumpReputation(world, manager.id, places, 'season vs expectation')
  for (const h of spellHonours(world, manager, spell)) {
    bumpReputation(world, manager.id, round1(T.REP_TROPHY * trophyWeight(h)), `trophy ${h.competition}`)
  }
  if (promoted) bumpReputation(world, manager.id, T.REP_PROMOTION, 'promotion')
  if (relegated) bumpReputation(world, manager.id, T.REP_RELEGATION, 'relegation')
}

/** Season-end credit, reputation and ceiling for every live spell; queue the expectation reset. */
export function seasonEnd(world: World, outcome: SeasonEnd): void {
  for (const spell of activeSpells(world)) {
    const manager = managerById(world, spell.managerId)
    let finish: number | undefined
    let promoted = false
    let relegated = false
    if (spell.post.kind === 'home') {
      finish = outcome.finish.get(spell.post.clubId)
      promoted = outcome.promoted.has(spell.post.clubId)
      relegated = outcome.relegated.has(spell.post.clubId)
    } else {
      finish = outcome.foreignFinish.get(spell.post.clubId)
    }
    if (finish === undefined) continue
    const trophies = spellHonours(world, manager, spell).length
    const delta = seasonEndDelta(spell, { finish, promoted, relegated, trophies })
    const applied = addCredit(spell, delta)
    seasonReputation(world, manager, spell, finish, promoted, relegated)
    advanceCeiling(spell, trophies > 0 || promoted)
    emit(world, 'credit.season', {
      spellId: spell.id,
      managerId: spell.managerId,
      finish,
      expectation: spell.expectation,
      delta: applied,
      credit: spell.credit,
      ceiling: spell.ceiling,
      seasonsCompleted: spell.seasonsCompleted,
      season: world.season,
    })
    emit(world, 'earnings.season', { managerId: manager.id, spellId: spell.id, amount: round1(spell.season.earned), season: world.season })
    spell.pendingReset = { finish, movedTier: promoted || relegated }
    spell.season = { games: 0, points: 0, xiTurnover: 0, fallouts: 0, boardRows: 0, earned: 0 }
  }
}

/** Ownership from the summer churn, ceiling resets, then the expectation reset. */
export function afterSummerWindow(world: World, summaries: WindowSummary[]): void {
  const byClub = new Map(summaries.map((s) => [s.clubId, s]))
  for (const spell of activeSpells(world)) {
    if (spell.post.kind === 'home') {
      const summary = byClub.get(spell.post.clubId)
      if (summary) {
        spell.ownership = round1(Math.min(1, spell.ownership + summary.turnover * (1 - spell.ownership)) * 100) / 100
        spell.season.xiTurnover = summary.turnover
        emit(world, 'ownership.changed', { spellId: spell.id, managerId: spell.managerId, turnover: summary.turnover, ownership: spell.ownership, window: 'summer', season: world.season })
        if (resetCeilingForTurnover(spell, summary.turnover)) {
          emit(world, 'credit.ceilingReset', { spellId: spell.id, managerId: spell.managerId, turnover: summary.turnover, season: world.season })
        }
      }
    }
    clampToCeiling(spell)
    resetExpectation(world, spell)
  }
}

/** Ownership from a winter window. */
export function afterWinterWindow(world: World, summaries: WindowSummary[]): void {
  const byClub = new Map(summaries.map((s) => [s.clubId, s]))
  for (const spell of activeSpells(world)) {
    if (spell.post.kind !== 'home') continue
    const summary = byClub.get(spell.post.clubId)
    if (!summary) continue
    spell.ownership = round1(Math.min(1, spell.ownership + summary.turnover * (1 - spell.ownership)) * 100) / 100
    emit(world, 'ownership.changed', { spellId: spell.id, managerId: spell.managerId, turnover: summary.turnover, ownership: spell.ownership, window: 'winter', season: world.season })
  }
}

/** The budget multiplier the summer window should use for a club. */
export function budgetMultiplierFor(world: World, clubId: number): number {
  const club = homeClub(world, clubId)
  if (!club || club.managerId === null) return 1
  const spell = spellOf(world, managerById(world, club.managerId))
  return spell ? spell.budgetMultiplier : 1
}
