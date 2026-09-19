/**
 * Where tenure meets the calendar. advanceWeek calls these after the
 * football of the week, monthly, at season end and after the summer window.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
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
import { answerBoard, answerPress, hasPending, queueBoard, queuePress, queueWindow } from '../play/decisions.js'
import { normalBudget } from '../season/squad.js'
import { matchTemplateKey } from '../text/render.js'

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

/** The AI's answer to the press: bold (confident or defiant) with AI_PRESS_BOLD_P, else measured. */
function aiPress(world: World, rng: Rng, manager: Manager | undefined): void {
  if (!manager || manager.isHuman) return
  const spell = spellOf(world, manager)
  if (!spell || spell.post.kind !== 'home') return
  if (!rng.chance(T.PRESS_QUESTION_P)) return
  const key = rng.chance(T.AI_PRESS_BOLD_P) ? (rng.chance(0.5) ? 'confident' : 'defiant') : 'measured'
  answerPress(world, rng, spell, key)
}

/** Credit for every match of the week, written onto the match events; the press want a word with every manager, the human by a card. */
export function afterMatches(world: World, rng: Rng, played: PlayedFixture[]): void {
  for (const p of played) {
    const homeDelta = creditForSide(world, rng, p, true)
    const awayDelta = creditForSide(world, rng, p, false)
    p.event.payload['homeCredit'] = homeDelta
    p.event.payload['awayCredit'] = awayDelta
    aiPress(world, rng, p.homeManager)
    aiPress(world, rng, p.awayManager)
  }
  const state = world.human
  if (!state) return
  const player = managerById(world, state.managerId)
  const spell = spellOf(world, player)
  if (!spell || spell.post.kind !== 'home') return
  const own = played.filter((p) => p.fixture.homeId === spell.post.clubId || p.fixture.awayId === spell.post.clubId)
  for (const p of own) p.event.payload['positionAfter'] = positionOf(world, spell.post.clubId)
  const last = own[own.length - 1]
  if (!last || hasPending(world, 'press')) return
  if (rng.chance(T.PRESS_QUESTION_P)) {
    const home = last.fixture.homeId === spell.post.clubId
    const points = home ? last.homePoints : last.awayPoints
    const result = points >= T.POINTS_WIN ? 'win' : points >= T.POINTS_DRAW ? 'draw' : 'loss'
    const streak = spell.consecutiveDefeats >= T.CREDIT_CONSEC_DEFEAT_FROM ? 'streak' : result
    queuePress(world, spell, `${streak}:${matchTemplateKey(last.fixture.homeGoals ?? 0, last.fixture.awayGoals ?? 0, false)}`)
  }
}

/** Salary, contract expiry, takeover replacements and the board's weekly roll. */
export function weekly(world: World, rng: Rng): void {
  for (const spell of activeSpells(world)) {
    const manager = managerById(world, spell.managerId)
    const pay = spell.contract.salary / T.SEASON_WEEKS
    spell.season.earned += pay
    manager.history.earnings += pay
    if (checkExpiry(world, rng, spell)) continue
    weeklySackingCheck(world, rng, spell)
  }
}

/** Monthly: erratic re-rolls, the position gap, shocks, mutual consent, AI resignations. */
export function monthly(world: World, rng: Rng): void {
  for (const spell of activeSpells(world)) {
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
    if (monthlyResignation(world, rng, spell)) continue
    if (world.human && spell.managerId === world.human.managerId) {
      const mood = boardMood(spell)
      emit(world, 'board.note', { spellId: spell.id, managerId: spell.managerId, mood, position, expectation: spell.expectation, season: world.season })
      if (spell.credit < spell.threshold + T.BOARD_WARN_MARGIN && !hasPending(world, 'board')) queueBoard(world, spell)
    } else if (spell.credit < spell.threshold + T.BOARD_WARN_MARGIN) {
      // The AI answers the same warning with the same dice.
      const keys = Object.keys(T.AI_BOARD_ANSWER_WEIGHTS) as (keyof typeof T.AI_BOARD_ANSWER_WEIGHTS)[]
      answerBoard(world, rng, spell, rng.weighted(keys, keys.map((k) => T.AI_BOARD_ANSWER_WEIGHTS[k])))
    }
  }
}

/** How the board feel, in words the player can see instead of the credit number. */
export function boardMood(spell: Spell): 'secure' | 'settled' | 'uneasy' | 'under review' | 'on the brink' {
  const gap = spell.credit - spell.threshold
  if (spell.credit <= T.CREDIT_INSTANT_SACK + 2) return 'on the brink'
  if (gap < 0) return 'under review'
  if (gap < T.BOARD_WARN_MARGIN) return 'uneasy'
  if (gap < 3 * T.BOARD_WARN_MARGIN) return 'settled'
  return 'secure'
}

/** Ask the human for a window plan the week before the window runs. */
export function queueWindowDecision(world: World, summer: boolean): void {
  const state = world.human
  if (!state) return
  const player = managerById(world, state.managerId)
  const spell = spellOf(world, player)
  if (!spell || spell.post.kind !== 'home') return
  const club = homeClub(world, spell.post.clubId)
  if (!club) return
  const kind = summer ? 'summerWindow' : 'winterWindow'
  if (hasPending(world, kind)) return
  const pot = summer ? round1(normalBudget(club) * spell.budgetMultiplier) : round1(normalBudget(club) * T.WINTER_BUDGET_SHARE)
  queueWindow(world, summer, pot)
}

function trophyWeight(h: Honour): number {
  const key = h.competition === 'league' ? `league-${h.tier}` : h.competition
  return T.REP_TROPHY_WEIGHT[key] ?? 0
}

/** Honours won this season with this spell's club. */
function spellHonours(world: World, manager: Manager, spell: Spell): Honour[] {
  return manager.history.honours.filter((h) => h.season === world.season && h.clubId === spell.post.clubId)
}

/**
 * The market judges a season against the structural expectation (the
 * squad's strength rank), not the board's target, so reputation is
 * zero-sum across a division rather than draining as boards ratchet.
 */
function seasonReputation(world: World, manager: Manager, spell: Spell, finish: number, promoted: boolean, relegated: boolean): void {
  const places = Math.max(-T.REP_SEASON_CLAMP, Math.min(T.REP_SEASON_CLAMP, (spell.structuralTarget - finish) * T.REP_SEASON_PER_PLACE))
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
    const finish = outcome.finish.get(spell.post.clubId)
    const promoted = outcome.promoted.has(spell.post.clubId)
    const relegated = outcome.relegated.has(spell.post.clubId)
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
      structural: spell.structuralTarget,
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
