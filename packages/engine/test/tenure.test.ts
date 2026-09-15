import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runSeasons, runWeeks } from '../src/sim/advance.js'
import { activeSpells, ceilingFor, contractEndWeek, remainingValue, salaryFor, startSpell } from '../src/tenure/spell.js'
import { addCredit, advanceCeiling, blameScale, matchCreditDelta, monthlyGapDelta, seasonEndDelta } from '../src/tenure/credit.js'
import { expectationAtHire, resetExpectation, structuralTarget } from '../src/tenure/expectation.js'
import { rollProbability, sack, weeklySackingCheck } from '../src/tenure/sacking.js'
import { checkExpiry, leaveByMutualConsent, resign } from '../src/tenure/exits.js'
import { clubById, managerById, spellOf } from '../src/lookup.js'
import { digestWorld } from '../src/digest.js'
import * as T from '../src/tunables.js'
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
    expect(live).toHaveLength(world.clubs.length + world.foreign.reduce((n, l) => n + l.clubs.length, 0))
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
    const world = createWorld(2)
    const spell = freshSpell(world, 3)
    spell.expectation = 10
    spell.structuralTarget = 10
    spell.pendingReset = { finish: 4, movedTier: false }
    resetExpectation(world, spell)
    expect(spell.expectation).toBe(4)
    spell.pendingReset = { finish: 15, movedTier: false }
    resetExpectation(world, spell)
    expect(spell.expectation).toBe(5)
  })
})

describe('credit', () => {
  const world = createWorld(3)
  const spell = freshSpell(world, 2)

  it('moves by k × (points − expected), weights losses, and adds the extras', () => {
    const base = { derby: false, cupExitToLowerTier: false, beatTopSide: false }
    expect(matchCreditDelta(spell, { points: 3, expected: 1.5, ...base })).toBeCloseTo(3)
    expect(matchCreditDelta(spell, { points: 0, expected: 1.5, ...base })).toBeCloseTo(-4.5)
    expect(matchCreditDelta(spell, { points: 0, expected: 1.5, ...base, derby: true })).toBeCloseTo(-8.5)
    // Third consecutive defeat.
    expect(matchCreditDelta(spell, { points: 0, expected: 1, ...base })).toBeCloseTo(-3 - 2)
    expect(spell.consecutiveDefeats).toBe(3)
    expect(matchCreditDelta(spell, { points: 3, expected: 2, ...base, beatTopSide: true })).toBeCloseTo(2 + 2)
    expect(spell.consecutiveDefeats).toBe(0)
    expect(matchCreditDelta(spell, { points: 0, expected: 2.5, ...base, cupExitToLowerTier: true })).toBeCloseTo(-7.5 - 6)
  })

  it('scales negative deltas by blame in the first two seasons', () => {
    spell.seasonsCompleted = 0
    spell.ownership = 0
    expect(blameScale(spell)).toBe(0.5)
    spell.ownership = 1
    expect(blameScale(spell)).toBe(1)
    spell.seasonsCompleted = 2
    spell.ownership = 0
    expect(blameScale(spell)).toBe(1)
    spell.seasonsCompleted = 0
    spell.credit = 50
    expect(addCredit(spell, -10)).toBe(-5)
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

  it('keeps the ceiling at 100 for three seasons, then loses 10 a season unless reset', () => {
    spell.seasonsCompleted = 0
    spell.ceiling = 100
    spell.credit = 100
    for (let i = 0; i < 3; i++) advanceCeiling(spell, false)
    expect(spell.ceiling).toBe(100)
    advanceCeiling(spell, false)
    expect(spell.ceiling).toBe(90)
    expect(spell.credit).toBe(90)
    advanceCeiling(spell, false)
    expect(spell.ceiling).toBe(80)
    advanceCeiling(spell, true)
    expect(spell.ceiling).toBe(100)
    expect(ceilingFor(13)).toBe(0)
  })
})

describe('sacking', () => {
  it('rolls at 10% × (1 − 0.2 × years left) with a 3% floor', () => {
    const world = createWorld(4)
    const spell = freshSpell(world, 4)
    spell.contract.endWeek = contractEndWeek(world, 4)
    expect(rollProbability(world, spell)).toBeCloseTo(T.SACK_ROLL_FLOOR)
    spell.contract.endWeek = contractEndWeek(world, 1)
    expect(rollProbability(world, spell)).toBeCloseTo(0.08)
  })

  it('sacks at once at credit 5, pays out the contract and marks it unjust', () => {
    const world = createWorld(4)
    const spell = freshSpell(world, 4)
    const manager = managerById(world, spell.managerId)
    const repBefore = manager.reputation
    spell.credit = 5
    const owed = remainingValue(world, spell)
    expect(weeklySackingCheck(world, createRng(1), spell)).toBe(true)
    expect(spell.endReason).toBe('sacked')
    expect(spell.deserved).toBe(false)
    expect(spell.payout).toBe(owed)
    expect(manager.history.earnings).toBeGreaterThanOrEqual(owed)
    expect(manager.reputation).toBe(repBefore + T.REP_SACKED_UNJUST)
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
    expect(Math.abs(spell.payout - owed * T.MUTUAL_PAYOUT_SHARE)).toBeLessThanOrEqual(0.05)
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
    expect(checkExpiry(world, keep)).toBe(false)
    expect(keep.contract.endWeek).toBeGreaterThan(world.week)
    expect(keep.contract.yearsAtSigning).toBe(T.RENEW_YEARS)
    const drop = freshSpell(world, 11)
    drop.credit = 40
    drop.contract.endWeek = world.week
    const manager = managerById(world, drop.managerId)
    const rep = manager.reputation
    expect(checkExpiry(world, drop)).toBe(true)
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

  it('stays deterministic with tenure in the loop', () => {
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
