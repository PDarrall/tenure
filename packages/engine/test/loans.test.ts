import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { createRng } from '../src/rng.js'
import { runWeeks } from '../src/sim/advance.js'
import { T } from '../src/tunables.js'
import { buyPremium, endLoan, exchange, exchangeOut, lendable, loanIn, loanTermsFor, loanUntil, loanWage, loanWeek, noBudget, wageRoom } from '../src/market/loans.js'
import { marketIndex, proposeSignings, wageBill } from '../src/market/director.js'
import { squadOf } from '../src/players/select.js'
import type { Club, Player, World } from '../src/types.js'

/**
 * The market with no budget (DESIGN.md "Transfers"): free agents, loans and
 * exchanges, with wage room the constraint and the loan its own bet.
 */

function settled(seed: number): World {
  const world = createWorld(seed)
  runWeeks(world, 4)
  return world
}

function richInWages(club: Club, world: World): void {
  club.transferPot = 0
  club.wageBudget = wageBill(world, club) * 3
}

describe('no budget is not no market', () => {
  it('knows an empty pot and reads wage room, not cash', () => {
    const world = settled(3)
    const club = world.clubs[0] as Club
    club.transferPot = 0
    expect(noBudget(club)).toBe(true)
    club.transferPot = 40
    expect(noBudget(club)).toBe(false)
    club.wageBudget = wageBill(world, club)
    expect(wageRoom(club, wageBill(world, club))).toBeCloseTo(0, 6)
  })

  it('brings frees, loans and swaps when the pot is empty, and nothing when the wages are full too', () => {
    const world = settled(3)
    const rng = createRng(9)
    const kinds = new Set<string>()
    for (const club of world.clubs.slice(0, 40)) {
      richInWages(club, world)
      const cards = proposeSignings(world, rng, club, 3, null, new Set(), 'summer', { index: marketIndex(world) })
      for (const c of cards) {
        kinds.add(c.kind ?? 'buy')
        // Nothing here costs a fee the club has not got.
        expect(c.fee).toBeLessThanOrEqual(club.transferPot)
      }
    }
    expect([...kinds].sort()).not.toContain('buy')
    expect(kinds.size).toBeGreaterThan(0)

    // No wage room either: only the academy.
    const poor = world.clubs[41] as Club
    poor.transferPot = 0
    poor.wageBudget = 0
    expect(proposeSignings(world, rng, poor, 3, null, new Set(), 'summer', {})).toEqual([])
  })

  it('lends a squad player, not a starter', () => {
    const world = settled(4)
    const club = world.clubs[0] as Club
    const squad = squadOf(world, club).sort((a, b) => b.rating - a.rating)
    expect(lendable(world, squad[0] as Player)).toBe(false)
    expect(lendable(world, squad[squad.length - 1] as Player)).toBe(true)
  })

  it('splits the wage and runs to a term', () => {
    const world = settled(5)
    const rng = createRng(11)
    const p = squadOf(world, world.clubs[1] as Club).sort((a, b) => a.rating - b.rating)[0] as Player
    const terms = loanTermsFor(rng, p, world)
    expect(terms.wageShare).toBeGreaterThanOrEqual(T.LOAN_WAGE_SHARE_RANGE[0])
    expect(terms.wageShare).toBeLessThanOrEqual(T.LOAN_WAGE_SHARE_RANGE[1])
    // The borrower pays his share, the parent the rest.
    expect(loanWage(100, terms)).toBeLessThan(100)
    expect(loanUntil(world, false)).toBeGreaterThan(world.week)
    expect(loanUntil(world, true)).toBeLessThanOrEqual(loanUntil(world, false))
  })

  it('moves him across, pays the fee, and sends him back when the term is up', () => {
    const world = settled(6)
    const from = world.clubs[0] as Club
    const to = world.clubs[1] as Club
    to.transferPot = 5
    const p = squadOf(world, from).sort((a, b) => a.rating - b.rating)[0] as Player
    loanIn(world, p, from, to, { half: false, wageShare: 0.5, fee: 1 }, null)
    expect(p.clubId).toBe(to.id)
    expect(to.playerIds).toContain(p.id)
    expect(from.playerIds).not.toContain(p.id)
    expect(to.transferPot).toBe(4)
    expect(p.loan?.untilWeek).toBeGreaterThan(world.week)
    // The term runs out and he goes home.
    world.week = (p.loan?.untilWeek ?? 0) + 1
    loanWeek(world, createRng(2))
    expect(p.loan).toBeNull()
    expect(p.clubId).toBe(from.id)
    expect(from.playerIds).toContain(p.id)
  })

  it('makes a loan that went well cost more to keep', () => {
    const world = settled(7)
    const from = world.clubs[0] as Club
    const to = world.clubs[1] as Club
    const p = squadOf(world, from).sort((a, b) => a.rating - b.rating)[0] as Player
    loanIn(world, p, from, to, { half: false, wageShare: 0.5, fee: 0 }, null)
    p.season = { ...p.season, apps: T.LOAN_GOOD_APPS + 2, rated: T.LOAN_GOOD_APPS + 2, ratingSum: (T.LOAN_GOOD_RATING + 0.4) * (T.LOAN_GOOD_APPS + 2) }
    expect(buyPremium(p)).toBe(1)
    endLoan(world, p, from, to, 'term')
    expect(buyPremium(p)).toBeCloseTo(T.LOAN_GOOD_PREMIUM, 6)
  })

  it('lets the parent recall a man who is playing well', () => {
    const world = settled(8)
    const from = world.clubs[0] as Club
    const to = world.clubs[1] as Club
    const p = squadOf(world, from).sort((a, b) => a.rating - b.rating)[0] as Player
    loanIn(world, p, from, to, { half: false, wageShare: 0.5, fee: 0 }, null)
    p.season = { ...p.season, apps: T.LOAN_RECALL_APPS + 3, rated: T.LOAN_RECALL_APPS + 3, ratingSum: (T.LOAN_RECALL_RATING + 0.3) * (T.LOAN_RECALL_APPS + 3) }
    // Rolled often enough, the recall comes; the tunable is a weekly chance.
    let recalled = false
    for (let i = 0; i < 400 && !recalled; i++) {
      loanWeek(world, createRng(100 + i))
      recalled = p.loan === null || p.loan === undefined
    }
    expect(recalled).toBe(true)
    expect(p.clubId).toBe(from.id)
  })

  it('swaps two players of about the same worth, with the difference in cash', () => {
    const world = settled(9)
    const club = world.clubs[0] as Club
    const other = world.clubs[1] as Club
    club.transferPot = 10
    const incoming = squadOf(world, other).sort((a, b) => a.rating - b.rating)[0] as Player
    const out = exchangeOut(world, club, incoming, squadOf(world, club))
    if (!out) return
    const potBefore = club.transferPot
    const cash = Math.max(0, incoming.value - out.value)
    exchange(world, out, incoming, club, other, cash, null)
    expect(incoming.clubId).toBe(club.id)
    expect(out.clubId).toBe(other.id)
    expect(club.playerIds).toContain(incoming.id)
    expect(other.playerIds).toContain(out.id)
    expect(club.transferPot).toBeCloseTo(potBefore - cash, 5)
  })
})
