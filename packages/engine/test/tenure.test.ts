import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { activeSpells, ceilingFor, contractEndWeek, remainingValue, salaryFor, startSpell } from '../src/tenure/spell.js'
import { addCredit, advanceCeiling, blameScale, clampToCeiling, matchCreditDelta, monthlyGapDelta, seasonEndDelta } from '../src/tenure/credit.js'
import { expectationAtHire, nextExpectation, resetExpectation, structuralTarget } from '../src/tenure/expectation.js'
import { rollProbability, sack, weeklySackingCheck } from '../src/tenure/sacking.js'
import { checkExpiry, leaveByMutualConsent, resign } from '../src/tenure/exits.js'
import { clubById, managerById, spellOf } from '../src/lookup.js'
import { digestWorld } from '../src/digest.js'
import { T } from '../src/tunables.js'
import type { Spell, World } from '../src/types.js'

function freshSpell(world: World, clubId = 1): Spell {
  const club = clubById(world, clubId)
  const incumbent = managerById(world, club.managerId!)
  const current = spellOf(world, incumbent)!
  current.endWeek = world.week
  current.endReason = 'sacked'
  club.managerId = null
  incumbent.status = { kind: 'unemployed', sinceWeek: 0, activity: 'wait', monthsSinceShortlisted: 0 }
  const entrant = world.managers.find((m) => m.status.kind === 'unemployed' && m.history.spellIds.length === 0)!
  return startSpell(world, createRng(3), entrant, { kind: 'home', clubId }, { years: 2, promise: 'top-half', crisis: false })
}

describe('genesis spells', () => {
  const world = createWorld(1)

  it('gives every employed manager a live spell and every post a manager', () => {
    const live = activeSpells(world)
    const employed = world.managers.filter((m) => m.status.kind === 'employed')
    expect(live).toHaveLength(employed.length)
    expect(live).toHaveLength(world.clubs.length)
    for (const spell of live) {
      const manager = managerById(world, spell.managerId)
      expect(manager.status).toEqual({ kind: 'employed', post: spell.post, spellId: spell.id })
      expect(manager.history.spellIds).toContain(spell.id)
      expect(spell.credit).toBeLessThanOrEqual(spell.ceiling)
      expect(spell.ceiling).toBe(ceilingFor(spell.seasonsCompleted))
      expect(spell.expectation).toBeGreaterThanOrEqual(1)
      expect(spell.contract.endWeek).toBeGreaterThan(0)
      expect(world.log.some((e) => e.type === 'manager.hired' && e.payload['spellId'] === spell.id && e.payload['genesis'] === true)).toBe(true)
    }
  })

  it('sets credit 55, minus 10 at elite clubs, with thresholds by owner type', () => {
    for (const spell of activeSpells(world)) {
      if (spell.post.kind !== 'home') continue
      const club = clubById(world, spell.post.clubId)
      if (club.owner.type === 'erratic') {
        expect(spell.threshold).toBeGreaterThanOrEqual(T.SACK_THRESHOLD_ERRATIC[0])
        expect(spell.threshold).toBeLessThanOrEqual(T.SACK_THRESHOLD_ERRATIC[1])
      } else expect(spell.threshold).toBe(T.SACK_THRESHOLD[club.owner.type])
      if (spell.seasonsCompleted <= T.CEILING_FULL_SEASONS) {
        expect([T.CREDIT_ON_HIRE, T.CREDIT_ON_HIRE + T.CREDIT_ELITE_PENALTY]).toContain(spell.credit)
      }
    }
  })
})

describe('expectation', () => {
  it('starts from the strength rank, lifted by ambition and shifted by the promise', () => {
    const world = createWorld(2)
    const club = clubById(world, 5)
    const post = { kind: 'home' as const, clubId: club.id }
    const structural = structuralTarget(world, post)
    const ambition = Math.round(club.owner.ambition * T.EXPECT_AMBITION_PLACES)
    expect(expectationAtHire(world, post, 'top-half')).toBe(Math.max(1, structural - ambition))
    expect(expectationAtHire(world, post, 'promotion')).toBe(Math.max(1, structural - ambition + T.PROMISE_EFFECTS.promotion.places))
    expect(expectationAtHire(world, post, 'stability')).toBe(Math.min(20, structural - ambition + T.PROMISE_EFFECTS.stability.places))
  })

  it('rises to your finish when beaten and eases one place toward structural when missed', () => {
    expect(nextExpectation(10, 10, 4)).toBe(4) // beaten: the bar rises to meet you
    expect(nextExpectation(10, 10, 10)).toBe(10) // met: stays
    expect(nextExpectation(4, 10, 9)).toBe(5) // missed: eases one place toward structural
    expect(nextExpectation(10, 10, 15)).toBe(10) // already at structural: no further easing
    expect(nextExpectation(12, 10, 15)).toBe(12) // easier than structural already: never tightens
    const world = createWorld(2)
    const spell = freshSpell(world, 3)
    const structural = structuralTarget(world, spell.post)
    spell.expectation = 1
    spell.pendingReset = { finish: 20, movedTier: false }
    resetExpectation(world, spell)
    expect(spell.structuralTarget).toBe(structural)
    expect(spell.expectation).toBe(Math.min(structural, 1 + T.EXPECT_EASE_PER_MISS))
    expect(world.log.at(-1)!.type).toBe('expectation.reset')
  })

  it('adds the crisis bonus at hire', () => {
    const world = createWorld(2)
    const club = clubById(world, 30)
    const incumbent = managerById(world, club.managerId!)
    const current = spellOf(world, incumbent)!
    current.endWeek = 0
    current.endReason = 'sacked'
    club.managerId = null
    incumbent.status = { kind: 'unemployed', sinceWeek: 0, activity: 'wait', monthsSinceShortlisted: 0 }
    const entrant = world.managers.find((m) => m.status.kind === 'unemployed' && m.history.spellIds.length === 0)!
    const spell = startSpell(world, createRng(3), entrant, { kind: 'home', clubId: 30 }, { years: 1, promise: 'top-half', crisis: true })
    expect(spell.credit).toBe(T.CREDIT_ON_HIRE + T.CREDIT_CRISIS_BONUS)
    expect(spell.crisisHire).toBe(true)
  })
})

describe('credit', () => {
  const world = createWorld(3)
  const spell = freshSpell(world, 2)

  it('moves by k × (points − expected), weights losses, and adds the extras', () => {
    const base = { derby: false, cupExitToLowerTier: false, beatTopSide: false }
    const K = T.CREDIT_K
    const L = T.CREDIT_LOSS_WEIGHT
    expect(matchCreditDelta(spell, { points: 3, expected: 1.5, ...base })).toBeCloseTo(K * 1.5)
    expect(matchCreditDelta(spell, { points: 0, expected: 1.5, ...base })).toBeCloseTo(-K * 1.5 * L)
    expect(matchCreditDelta(spell, { points: 0, expected: 1.5, ...base, derby: true })).toBeCloseTo(-K * 1.5 * L + T.CREDIT_DERBY_DEFEAT)
    // Third consecutive defeat.
    expect(matchCreditDelta(spell, { points: 0, expected: 1, ...base })).toBeCloseTo(-K * 1 * L + T.CREDIT_CONSEC_DEFEAT)
    expect(spell.consecutiveDefeats).toBe(3)
    expect(matchCreditDelta(spell, { points: 3, expected: 2, ...base, beatTopSide: true })).toBeCloseTo(K * 1 + T.CREDIT_BEAT_TOP)
    expect(spell.consecutiveDefeats).toBe(0)
    expect(matchCreditDelta(spell, { points: 0, expected: 2.5, ...base, cupExitToLowerTier: true })).toBeCloseTo(-K * 2.5 * L + T.CREDIT_CUP_EXIT_LOWER)
  })

  it('scales negative deltas by blame in the first seasons', () => {
    spell.seasonsCompleted = 0
    spell.ownership = 0
    expect(blameScale(spell)).toBe(T.BLAME_BASE)
    spell.ownership = 1
    expect(blameScale(spell)).toBeCloseTo(T.BLAME_BASE + T.BLAME_OWNERSHIP_SHARE)
    spell.seasonsCompleted = T.BLAME_SEASONS
    spell.ownership = 0
    expect(blameScale(spell)).toBe(1)
    spell.seasonsCompleted = 0
    spell.credit = 50
    expect(addCredit(spell, -10)).toBeCloseTo(-10 * T.BLAME_BASE, 5)
    expect(addCredit(spell, 10)).toBe(10)
  })

  it('applies the monthly gap and season-end deltas with clamps', () => {
    spell.expectation = 8
    expect(monthlyGapDelta(spell, 11)).toBe(0)
    expect(monthlyGapDelta(spell, 12)).toBe(T.CREDIT_MONTH_GAP)
    const none = { promoted: false, relegated: false, trophies: 0 }
    expect(seasonEndDelta(spell, { finish: 5, ...none })).toBe(9)
    expect(seasonEndDelta(spell, { finish: 20, ...none })).toBe(-T.CREDIT_SEASON_CLAMP)
    expect(seasonEndDelta(spell, { finish: 8, ...none, promoted: true, trophies: 1 })).toBe(T.CREDIT_PROMOTION + T.CREDIT_TROPHY)
    expect(seasonEndDelta(spell, { finish: 8, ...none, relegated: true })).toBe(T.CREDIT_RELEGATION)
  })

  it('keeps the ceiling at 100 for seasons one to three, then 90 for season four, unless reset', () => {
    spell.seasonsCompleted = 0
    spell.ceiling = 100
    spell.credit = 100
    advanceCeiling(spell, false) // season 1 done, season 2 at 100
    advanceCeiling(spell, false) // season 2 done, season 3 at 100
    expect(spell.ceiling).toBe(100)
    advanceCeiling(spell, false) // season 3 done, season 4 at 90
    expect(spell.ceiling).toBe(90)
    expect(spell.credit).toBe(100) // clamp waits for the summer window
    clampToCeiling(spell)
    expect(spell.credit).toBe(90)
    advanceCeiling(spell, false)
    expect(spell.ceiling).toBe(80)
    advanceCeiling(spell, true)
    expect(spell.ceiling).toBe(100)
    expect(ceilingFor(0)).toBe(100)
    expect(ceilingFor(2)).toBe(100)
    expect(ceilingFor(3)).toBe(90)
    expect(ceilingFor(12)).toBe(0)
  })
})

describe('sacking', () => {
  it('rolls at 10% × (1 − 0.2 × years left) with a 3% floor', () => {
    const world = createWorld(4)
    const spell = freshSpell(world, 4)
    spell.contract.endWeek = contractEndWeek(world, 4)
    expect(rollProbability(world, spell)).toBeCloseTo(Math.max(T.SACK_ROLL_FLOOR, T.SACK_ROLL_BASE * (1 - T.SACK_ROLL_PER_YEAR * 4)))
    spell.contract.endWeek = contractEndWeek(world, 1)
    expect(rollProbability(world, spell)).toBeCloseTo(Math.max(T.SACK_ROLL_FLOOR, T.SACK_ROLL_BASE * (1 - T.SACK_ROLL_PER_YEAR)))
  })

  it('sacks at once at the instant line, pays out the contract and counts the collapse as deserved', () => {
    const world = createWorld(4)
    const spell = freshSpell(world, 4)
    const manager = managerById(world, spell.managerId)
    const repBefore = manager.reputation
    spell.credit = T.CREDIT_INSTANT_SACK
    const owed = remainingValue(world, spell)
    expect(weeklySackingCheck(world, createRng(1), spell)).toBe(true)
    expect(spell.endReason).toBe('sacked')
    expect(spell.deserved).toBe(true)
    expect(spell.payout).toBe(owed)
    expect(manager.history.earnings).toBeGreaterThanOrEqual(owed)
    expect(manager.reputation).toBe(repBefore + T.REP_SACKED_DESERVED)
    expect(manager.status.kind).toBe('unemployed')
    expect(clubById(world, 4).managerId).toBeNull()
    expect(world.log.at(-1)!.type).toBe('manager.sacked')
  })

  it('calls it deserved after eight weeks below the threshold', () => {
    const world = createWorld(4)
    const spell = freshSpell(world, 6)
    const manager = managerById(world, spell.managerId)
    const repBefore = manager.reputation
    spell.credit = spell.threshold - 1
    spell.weeksBelowThreshold = T.DESERVED_WEEKS
    sack(world, spell, 'credit')
    expect(spell.deserved).toBe(true)
    expect(manager.reputation).toBe(repBefore + T.REP_SACKED_DESERVED)
  })
})

describe('ways out', () => {
  it('mutual consent pays half and costs 4 reputation', () => {
    const world = createWorld(5)
    const spell = freshSpell(world, 7)
    const manager = managerById(world, spell.managerId)
    const rep = manager.reputation
    const owed = remainingValue(world, spell)
    leaveByMutualConsent(world, spell)
    expect(spell.endReason).toBe('mutual')
    expect(Math.abs(spell.payout - owed * T.MUTUAL_PAYOUT_SHARE)).toBeLessThanOrEqual(0.051)
    expect(manager.reputation).toBe(rep + T.REP_MUTUAL)
  })

  it('resigning pays nothing and costs 1 on a high, 5 on a low', () => {
    const world = createWorld(5)
    const a = freshSpell(world, 8)
    a.credit = 70
    const ma = managerById(world, a.managerId)
    const repA = ma.reputation
    resign(world, a)
    expect(a.payout).toBe(0)
    expect(ma.reputation).toBe(repA + T.REP_RESIGN_HIGH)
    const b = freshSpell(world, 9)
    b.credit = 30
    const mb = managerById(world, b.managerId)
    const repB = mb.reputation
    resign(world, b)
    expect(mb.reputation).toBe(repB + T.REP_RESIGN_LOW)
  })

  it('renews at expiry above 40 credit and releases below it', () => {
    const world = createWorld(5)
    const keep = freshSpell(world, 10)
    keep.credit = 41
    world.week = keep.contract.endWeek
    world.season = Math.floor(world.week / T.SEASON_WEEKS) + 1
    expect(checkExpiry(world, createRng(1), keep)).toBe(false)
    expect(keep.contract.endWeek).toBeGreaterThan(world.week)
    expect(keep.contract.yearsAtSigning).toBe(T.RENEW_YEARS)
    const drop = freshSpell(world, 11)
    drop.credit = 40
    drop.contract.endWeek = world.week
    const manager = managerById(world, drop.managerId)
    const rep = manager.reputation
    expect(checkExpiry(world, createRng(1), drop)).toBe(true)
    expect(drop.endReason).toBe('expired')
    expect(manager.reputation).toBe(rep + T.REP_RELEASED)
  })

  it('prices salary by tier and reputation', () => {
    const world = createWorld(1)
    const top = world.clubs.find((c) => c.tier === 1)!
    const low = world.clubs.find((c) => c.tier === 5)!
    expect(salaryFor(world, { kind: 'home', clubId: top.id }, 50)).toBeGreaterThan(salaryFor(world, { kind: 'home', clubId: low.id }, 90))
    expect(salaryFor(world, { kind: 'home', clubId: top.id }, 90)).toBeGreaterThan(salaryFor(world, { kind: 'home', clubId: top.id }, 50))
  })
})

describe('tenure over seasons', () => {
  const world = createWorld(1)
  runSeasons(world, 3)

  it('sacks managers, some unjustly, and logs every step', () => {
    const sackings = world.log.filter((e) => e.type === 'manager.sacked')
    expect(sackings.length).toBeGreaterThan(10)
    const unjust = sackings.filter((e) => e.payload['deserved'] === false)
    expect(unjust.length).toBeGreaterThan(0)
    expect(world.log.some((e) => e.type === 'credit.season')).toBe(true)
    expect(world.log.some((e) => e.type === 'expectation.reset')).toBe(true)
    expect(world.log.some((e) => e.type === 'earnings.season')).toBe(true)
    const matches = world.log.filter((e) => e.type === 'match.played' && e.payload['competition'] === 'league')
    expect(matches.every((e) => 'homeCredit' in e.payload && 'awayCredit' in e.payload)).toBe(true)
  })

  it('keeps every live spell consistent with its manager and club', () => {
    for (const spell of activeSpells(world)) {
      const manager = managerById(world, spell.managerId)
      expect(manager.status).toEqual({ kind: 'employed', post: spell.post, spellId: spell.id })
      if (spell.post.kind === 'home') expect(clubById(world, spell.post.clubId).managerId).toBe(manager.id)
      expect(spell.credit).toBeGreaterThanOrEqual(0)
      expect(spell.credit).toBeLessThanOrEqual(spell.ceiling)
    }
    for (const spell of world.spells.filter((s) => s.endWeek !== null)) {
      const manager = managerById(world, spell.managerId)
      expect(manager.status.kind === 'employed' && manager.status.spellId === spell.id).toBe(false)
    }
    for (const club of world.clubs) {
      if (club.managerId !== null) {
        const spell = spellOf(world, managerById(world, club.managerId))!
        expect(spell.post).toEqual({ kind: 'home', clubId: club.id })
      }
    }
  })

  it('writes expectation into season records and accrues salary', () => {
    const employed = world.managers.filter((m) => m.status.kind === 'employed' && m.history.seasons.length > 0)
    expect(employed.some((m) => m.history.seasons.some((s) => s.expectation > 0))).toBe(true)
    expect(employed.every((m) => m.history.earnings > 0)).toBe(true)
  })

  it('stays deterministic with tenure in the loop', { timeout: 60_000 }, () => {
    const again = createWorld(1)
    runSeasons(again, 3)
    expect(digestWorld(again).hash).toBe(digestWorld(world).hash)
    const live = createWorld(9)
    runWeeks(live, 30)
    const restored = JSON.parse(JSON.stringify(live))
    runWeeks(live, 60)
    runWeeks(restored, 60)
    expect(digestWorld(restored).hash).toBe(digestWorld(live).hash)
  })
})

/** An Rng whose every roll goes one way, for forcing rare events. */
function forcedRng(succeed: boolean): import('../src/rng.js').Rng {
  const real = createRng(1)
  return {
    float: () => (succeed ? 0 : 0.999999),
    int: (min, max) => (succeed ? max : min),
    chance: () => succeed,
    pick: (items) => real.pick(items),
    weighted: (items) => items[0] as never,
    shuffle: (items) => items,
    normal: (mean) => mean,
    state: real.state,
  }
}

describe('shocks and rare exits (forced rolls)', () => {
  it('counts the weeks below threshold through the roll path and calls the eighth deserved', async () => {
    const { weeklySackingCheck } = await import('../src/tenure/sacking.js')
    const world = createWorld(6)
    const spell = freshSpell(world, 12)
    spell.credit = spell.threshold - 1
    for (let i = 0; i < T.DESERVED_WEEKS - 1; i++) expect(weeklySackingCheck(world, forcedRng(false), spell)).toBe(false)
    expect(spell.weeksBelowThreshold).toBe(T.DESERVED_WEEKS - 1)
    expect(weeklySackingCheck(world, forcedRng(true), spell)).toBe(true)
    expect(spell.deserved).toBe(true)
  })

  it('takeover, crisis, star sale and board row all land when every roll succeeds', async () => {
    const { monthlyShocks } = await import('../src/tenure/shocks.js')
    const world = createWorld(6)
    const poor = [...world.clubs].sort((a, b) => a.wealth - b.wealth)[0]!
    const spell = freshSpell(world, poor.id)
    // Low enough to sit within the board-row margin whatever threshold the new owner brings.
    spell.credit = Math.min(...Object.values(T.SACK_THRESHOLD), T.SACK_THRESHOLD_ERRATIC[0]) + T.BOARD_ROW_MARGIN - 1
    const strength = poor.squad.strength
    const expectation = spell.expectation
    monthlyShocks(world, forcedRng(true), spell)
    const types = world.log.slice(-8).map((e) => e.type)
    expect(types).toContain('shock.takeover')
    expect(types).toContain('shock.crisis')
    expect(types).toContain('shock.starSale')
    expect(types).toContain('shock.boardRow')
    expect(spell.takeover).not.toBeNull()
    expect(spell.budgetMultiplier).toBeCloseTo(1 - T.CRISIS_BUDGET_CUT, 2)
    // The star sale is a real sale: the best outfielder is gone, the fee is in the pot, strength follows the squad.
    const sale = world.log.find((e) => e.type === 'shock.starSale')!
    expect(sale.payload['playerId']).not.toBeNull()
    expect(poor.playerIds).not.toContain(sale.payload['playerId'])
    expect(poor.squad.strength).toBeLessThanOrEqual(strength)
    expect(spell.expectation).toBe(Math.min(24, expectation + T.CRISIS_EXPECTATION_EASE + T.STAR_SALE_EXPECTATION_EASE))
    expect(spell.season.boardRows).toBe(1)
    // A later takeover whose owner keeps the manager clears the pending replacement.
    const keep = forcedRng(true)
    keep.chance = (() => {
      let calls = 0
      return () => ++calls !== 2
    })()
    monthlyShocks(world, keep, spell)
    expect(spell.takeover).toBeNull()
  })

  it('a takeover replacement sacks unjustly on its week', async () => {
    const { weeklySackingCheck } = await import('../src/tenure/sacking.js')
    const world = createWorld(6)
    const spell = freshSpell(world, 14)
    spell.takeover = { week: world.week, replaceWeek: world.week }
    expect(weeklySackingCheck(world, forcedRng(false), spell)).toBe(true)
    expect(spell.deserved).toBe(false)
    expect(world.log.at(-1)!.payload['cause']).toBe('takeover')
  })

  it('a fallout after four straight defeats is resolved by the AI', async () => {
    const { maybeFallout } = await import('../src/tenure/shocks.js')
    const world = createWorld(6)
    const spell = freshSpell(world, 15)
    const club = clubById(world, 15)
    const manager = managerById(world, spell.managerId)
    spell.consecutiveDefeats = T.FALLOUT_TRIGGER_DEFEATS
    const morale = club.squad.morale
    const strength = club.squad.strength
    maybeFallout(world, forcedRng(true), spell)
    expect(spell.season.fallouts).toBe(1)
    expect(spell.falloutRolled).toBe(true)
    const resolved = world.log.at(-1)!
    expect(resolved.type).toBe('shock.falloutResolved')
    if (manager.ability.motivation < T.AI_FALLOUT_SELL_BELOW_MOTIVATION) {
      expect(resolved.payload['choice']).toBe('sell')
      expect(club.squad.strength).toBeLessThanOrEqual(strength) // he is gone; strength follows the squad
      expect(spell.ownership).toBeCloseTo(T.FALLOUT_OWNERSHIP_GAIN, 2)
    } else {
      expect(resolved.payload['choice']).toBe('back-down')
      // The dressing room's morale is the roll: mean the back-down loss, within the clamp.
      const dice = T.BETS.fallout.options['back-down']
      expect(club.squad.morale).toBeGreaterThanOrEqual(morale + dice.mean - dice.sd * T.BET_ROLL_CLAMP - 0.1)
      expect(club.squad.morale).toBeLessThanOrEqual(morale + dice.mean + dice.sd * T.BET_ROLL_CLAMP + 0.1)
      expect(world.log.some((e) => e.type === 'decision.rolled' && e.payload['kind'] === 'fallout' && e.payload['key'] === 'back-down')).toBe(true)
    }
    maybeFallout(world, forcedRng(true), spell)
    expect(spell.season.fallouts).toBe(1) // once per losing run
  })

  it('offers mutual consent in the window and the AI can take it; the AI can also resign below threshold', async () => {
    const { monthlyMutualConsent, monthlyResignation } = await import('../src/tenure/exits.js')
    const world = createWorld(6)
    const a = freshSpell(world, 16)
    a.credit = T.MUTUAL_WINDOW[0]
    expect(monthlyMutualConsent(world, forcedRng(false), a)).toBe(false)
    expect(world.log.some((e) => e.type === 'manager.mutualOffered' && e.payload['spellId'] === a.id)).toBe(true)
    expect(world.log.at(-1)!.type).toBe('decision.rolled') // fighting on is a roll too
    expect(monthlyMutualConsent(world, forcedRng(true), a)).toBe(true)
    expect(a.endReason).toBe('mutual')
    const b = freshSpell(world, 17)
    b.credit = b.threshold - 1
    expect(monthlyResignation(world, forcedRng(true), b)).toBe(true)
    expect(b.endReason).toBe('resigned')
    const c = freshSpell(world, 18)
    c.credit = c.threshold + 5
    expect(monthlyResignation(world, forcedRng(true), c)).toBe(false)
  })

  it('a big summer turnover resets the ceiling', async () => {
    const { resetCeilingForTurnover } = await import('../src/tenure/credit.js')
    const world = createWorld(6)
    const spell = freshSpell(world, 19)
    spell.ceiling = 70
    expect(resetCeilingForTurnover(spell, T.CEILING_RESET_TURNOVER - 0.01)).toBe(false)
    expect(spell.ceiling).toBe(70)
    expect(resetCeilingForTurnover(spell, T.CEILING_RESET_TURNOVER)).toBe(true)
    expect(spell.ceiling).toBe(T.CREDIT_CEILING)
  })

  it('pays the top-three bonus only against a side in the top three at kick-off', () => {
    const world = createWorld(6)
    runWeeks(world, 12)
    const matches = world.log.filter((e) => e.type === 'match.played' && e.payload['competition'] === 'league')
    expect(matches.length).toBeGreaterThan(100)
    // Reputation and season-end moves are logged as reputation.changed once a season has ended.
    runWeeks(world, T.SEASON_WEEKS)
    const reps = world.log.filter((e) => e.type === 'reputation.changed' && e.payload['reason'] === 'season vs expectation')
    expect(reps.length).toBeGreaterThan(50)
    for (const e of reps) expect(Math.abs(e.payload['delta'] as number)).toBeLessThanOrEqual(T.REP_SEASON_CLAMP)
  })
})
