/**
 * The director on arrival (DESIGN.md "Transfers", On arrival): the week a
 * manager takes a job, the assessment and the first cards — bids in a
 * window; free agents to sign now and targets agreed in principle outside
 * one, confirmed as bids the day the window opens unless cancelled. AI
 * managers get the same director.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'
import { T } from '../src/tunables.js'
import { createWorld } from '../src/world/gen.js'
import { createCareer } from '../src/play/career.js'
import { advanceWeek, runWeeks } from '../src/sim/advance.js'
import { clubById, managerById, playerById, spellOf } from '../src/lookup.js'
import { human, pendingDecisions } from '../src/play/decisions.js'
import { startSpell } from '../src/tenure/spell.js'
import { seasonWeek } from '../src/season/calendar.js'
import { wageBill, windowAt } from '../src/market/director.js'
import { aiArrival, assessSquad, humanArrival } from '../src/market/arrival.js'
import type { World } from '../src/types.js'

/** A career with the human seated at a tier-3 club with money, on a chosen season week. */
function seated(seed: number, sw: number, tier = 3): { world: World; clubId: number } {
  const world = createCareer(seed, { name: 'Arrival', background: 'coach' })
  const me = human(world)
  const club = world.clubs.find((c) => c.tier === tier && c.managerId !== null)!
  const incumbent = managerById(world, club.managerId!)
  const old = spellOf(world, incumbent)!
  old.endWeek = world.week
  old.endReason = 'sacked'
  incumbent.status = { kind: 'unemployed', sinceWeek: world.week, activity: 'wait', monthsSinceShortlisted: 0 }
  club.managerId = null
  world.human!.pending = []
  startSpell(world, createRng(seed), me, { kind: 'home', clubId: club.id }, { years: 2, promise: 'top-half', crisis: false })
  world.week = sw
  club.transferPot = 30
  club.wageBudget = Math.max(club.wageBudget, wageBill(world, club) * 2)
  return { world, clubId: club.id }
}

describe('the director on arrival', () => {
  it('outside a window: an assessment of two positions and up to three sales, a free agent to sign now, targets agreed for the window', () => {
    const { world, clubId } = seated(5, 10)
    expect(windowAt(seasonWeek(world.week))).toBeNull()
    const club = clubById(world, clubId)
    const me = human(world)
    const assessment = assessSquad(world, club)
    expect(assessment.needs.length).toBe(T.ARRIVAL_NEEDS)
    expect(assessment.sell.length).toBeLessThanOrEqual(T.ARRIVAL_SELL_NAMES)
    humanArrival(world, createRng(5), club, me)
    const post = world.log.find((e) => e.type === 'director.assessment' && e.payload['clubId'] === clubId)
    expect(post).toBeDefined()
    expect((post!.payload['needs'] as unknown[]).length).toBe(T.ARRIVAL_NEEDS)
    const cards = pendingDecisions(world).filter((d) => d.kind === 'signing')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBeLessThanOrEqual(T.ARRIVAL_CARDS)
    const frees = cards.filter((d) => d.payload['signNow'] === true)
    const agreed = cards.filter((d) => d.payload['agreed'] === true)
    expect(frees.length + agreed.length).toBe(cards.length)
    for (const d of frees) expect(playerById(world, d.payload['playerId'] as number)!.clubId).toBe(0)
    for (const d of agreed) expect(playerById(world, d.payload['playerId'] as number)!.clubId).toBeGreaterThan(0)
    expect(agreed.length).toBeGreaterThan(0)

    // Approve everything: the free agent signs this week with no window open; the targets are agreed in principle.
    const answers: Record<number, string> = {}
    for (const d of cards) answers[d.id] = 'approve'
    const freeId = frees[0]?.payload['playerId'] as number | undefined
    advanceWeek(world, { answers })
    if (freeId !== undefined) {
      expect(world.log.some((e) => e.type === 'transfer.completed' && e.payload['playerId'] === freeId && e.payload['clubId'] === clubId)).toBe(true)
      expect(playerById(world, freeId)!.clubId).toBe(clubId)
    }
    const targets = world.human!.agreedTargets ?? []
    expect(targets.map((t) => t.playerId).sort()).toEqual(agreed.map((d) => d.payload['playerId'] as number).sort())
    expect(world.log.filter((e) => e.type === 'target.agreed')).toHaveLength(agreed.length)

    // Call one off; the rest become bids the day the January window opens, or lapse if the player has moved.
    const cancelled = targets[0]!.playerId
    advanceWeek(world, { cancelAgreed: [cancelled] })
    expect(world.log.some((e) => e.type === 'target.cancelled' && e.payload['playerId'] === cancelled)).toBe(true)
    expect((world.human!.agreedTargets ?? []).some((t) => t.playerId === cancelled)).toBe(false)
    const kept = (world.human!.agreedTargets ?? []).map((t) => t.playerId)
    while (seasonWeek(world.week) < T.JANUARY_WINDOW_WEEKS[0]) advanceWeek(world, {})
    expect(world.human!.agreedTargets ?? []).toHaveLength(0)
    for (const id of kept) {
      const confirmed = world.log.some((e) => e.type === 'target.confirmed' && e.payload['playerId'] === id)
      const lapsed = world.log.some((e) => e.type === 'target.lapsed' && e.payload['playerId'] === id)
      expect(confirmed || lapsed).toBe(true)
      if (confirmed) expect(world.log.some((e) => e.type === 'bid.made' && e.payload['playerId'] === id && e.payload['clubId'] === clubId)).toBe(true)
    }
    expect(world.log.some((e) => (e.type === 'target.confirmed' || e.type === 'bid.made') && e.payload['playerId'] === cancelled)).toBe(false)
  })

  it('in a window: the first cards are bids, and an approved one negotiates at the close', () => {
    const { world, clubId } = seated(6, T.JANUARY_WINDOW_WEEKS[0])
    const club = clubById(world, clubId)
    humanArrival(world, createRng(6), club, human(world))
    const cards = pendingDecisions(world).filter((d) => d.kind === 'signing')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((d) => d.payload['signNow'] !== true && d.payload['agreed'] !== true)).toBe(true)
    const first = cards[0]!
    advanceWeek(world, { answers: { [first.id]: 'approve' } })
    const id = first.payload['playerId'] as number
    expect(world.log.some((e) => e.type === 'bid.made' && e.payload['playerId'] === id)).toBe(true)
    expect(world.log.some((e) => (e.type === 'transfer.completed' || e.type === 'bid.failed') && e.payload['playerId'] === id)).toBe(true)
  })

  it('an AI manager arriving outside a window signs a free agent to a need, so the population keeps trading', () => {
    const world = createWorld(4)
    runWeeks(world, T.SEASON_WEEKS + 10)
    expect(windowAt(seasonWeek(world.week))).toBeNull()
    const pool = world.players.filter((p) => p && !p.retired && p.clubId === 0)
    expect(pool.length).toBeGreaterThan(0)
    const club = world.clubs.filter((c) => c.tier === 3 && c.managerId !== null).sort((a, b) => a.squad.strength - b.squad.strength)[0]!
    const manager = managerById(world, club.managerId!)
    club.wageBudget = Math.max(club.wageBudget, wageBill(world, club) * 2)
    const before = world.bids.length
    aiArrival(world, createRng(4), club, manager)
    const placed = world.bids.slice(before)
    expect(placed.length).toBeLessThanOrEqual(T.AI_ARRIVAL_FREE_AGENTS)
    for (const b of placed) expect(playerById(world, b.playerId)!.clubId).toBe(0)
    advanceWeek(world, {})
    for (const b of placed) expect(world.log.some((e) => (e.type === 'transfer.completed' || e.type === 'bid.failed') && e.payload['bidId'] === b.id)).toBe(true)
  })
})
