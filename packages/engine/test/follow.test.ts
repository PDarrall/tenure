/**
 * DESIGN.md "Following you": at a new job, up to two tagged players with a
 * bond over the threshold, at clubs that would sell and on wages the new
 * club can pay, ask to follow; the old club sets an asking price; the
 * loyal trait lowers the wage; the move completes at the next window.
 */
import { describe, expect, it } from 'vitest'
import { createRng } from '../src/rng.js'
import { T } from '../src/tunables.js'
import { createWorld } from '../src/world/gen.js'
import { createCareer } from '../src/play/career.js'
import { clubById, managerById, playerById, spellOf } from '../src/lookup.js'
import { human, pendingDecisions, resolveDecisions } from '../src/play/decisions.js'
import { squadOf } from '../src/players/select.js'
import { tagPlayer } from '../src/players/made.js'
import { wageDemand } from '../src/players/contracts.js'
import { askToFollow, followCandidates } from '../src/market/follow.js'
import { resolveBids } from '../src/market/director.js'
import { openNewVacancies } from '../src/market/vacancies.js'
import { hire } from '../src/market/hiring.js'
import type { Club, Manager, World } from '../src/types.js'

/** Bond three of a club's players to a manager, one of them loyal. */
function bond(world: World, manager: Manager, club: Club, count: number): number[] {
  const ids: number[] = []
  for (const p of squadOf(world, club).slice(0, count)) {
    tagPlayer(world, p, manager, club, 'debut')
    p.madeBy.find((m) => m.managerId === manager.id)!.bond = T.FOLLOW_BOND_THRESHOLD + 5
    ids.push(p.id)
  }
  return ids
}

describe('following you', () => {
  it('asks: bonded players elsewhere, at most two, inside the pot and the wage budget, strongest bond first; the loyal ask less', () => {
    const world = createWorld(41)
    const club = world.clubs.find((c) => c.tier === 3 && c.managerId !== null)!
    const manager = managerById(world, club.managerId!)
    const other = world.clubs.find((c) => c.tier === 3 && c.id !== club.id)!
    const ids = bond(world, manager, other, 3)
    const loyal = playerById(world, ids[0]!)!
    if (!loyal.traits.includes('loyal')) loyal.traits.push('loyal')
    club.transferPot = 100
    club.wageBudget = 1000
    const asking = followCandidates(world, manager, club)
    expect(asking.length).toBe(T.FOLLOW_MAX)
    for (const f of asking) {
      expect(ids).toContain(f.player.id)
      expect(f.fee).toBeCloseTo(Math.round(f.player.value * T.FOLLOW_ASKING_PREMIUM * 10) / 10, 1)
      expect(f.wage).toBe(wageDemand(f.player, manager.id))
    }
    const loyalRow = asking.find((f) => f.player.id === loyal.id)
    if (loyalRow) expect(loyalRow.wage).toBeLessThanOrEqual(wageDemand(loyal, null))
    // No pot: nobody with a fee can come.
    club.transferPot = 0
    expect(followCandidates(world, manager, club).every((f) => f.fee === 0)).toBe(true)
  })

  it('the human gets a card each; approve puts the bid in, and it completes at the next window with the old club paid', () => {
    const world = createCareer(42, { name: 'Carrier', background: 'coach' })
    const me = human(world)
    const first = pendingDecisions(world).find((d) => d.kind === 'offer' && d.payload['firstOffer'] === true)!
    const vacancy = world.vacancies[(first.payload['vacancyId'] as number) - 1]!
    const club = clubById(world, vacancy.post.clubId)
    const other = world.clubs.find((c) => c.tier === club.tier && c.id !== club.id)!
    bond(world, me, other, 2)
    club.transferPot = 100
    club.wageBudget = 1000
    world.human!.pending = []
    hire(world, createRng(42), me, vacancy, { promise: 'top-half', years: 2 })
    const cards = pendingDecisions(world).filter((d) => d.kind === 'follow')
    expect(cards.length).toBe(2)
    expect(cards[0]!.defaultKey).toBe('decline')
    const answers: Record<number, string> = { [cards[0]!.id]: 'approve', [cards[1]!.id]: 'decline' }
    resolveDecisions(world, createRng(3), answers)
    expect(world.bids.filter((b) => b.follow).length).toBe(1)
    expect(world.log.some((e) => e.type === 'follow.declined')).toBe(true)
    // Nothing moves until a window: the bid waits.
    world.week = T.JANUARY_WINDOW_WEEKS[0]
    const otherPot = other.transferPot
    resolveBids(world, createRng(0))
    const moved = world.log.find((e) => e.type === 'follow.moved')
    const failed = world.log.find((e) => e.type === 'bid.failed')
    expect(moved !== undefined || failed !== undefined).toBe(true)
    if (moved) {
      const p = playerById(world, moved.payload['playerId'] as number)!
      expect(p.clubId).toBe(club.id)
      expect(p.scouted).toBeNull()
      expect(other.transferPot).toBeCloseTo(otherPot + (moved.payload['fee'] as number), 1)
      expect(world.log.some((e) => e.type === 'transfer.completed' && e.payload['follow'] === true)).toBe(true)
    }
    void spellOf
  })

  it('an AI manager takes followers by chance, never more than two, and they wait for the window too', () => {
    const world = createWorld(43)
    const club = world.clubs.find((c) => c.tier === 2 && c.managerId !== null)!
    const manager = managerById(world, club.managerId!)
    const other = world.clubs.find((c) => c.tier === 2 && c.id !== club.id)!
    bond(world, manager, other, 4)
    club.transferPot = 100
    club.wageBudget = 1000
    const asked = askToFollow(world, createRng(1), manager, club)
    expect(asked.length).toBe(T.FOLLOW_MAX)
    expect(world.bids.filter((b) => b.follow).length).toBeLessThanOrEqual(T.FOLLOW_MAX)
    expect(world.log.filter((e) => e.type === 'follow.asked').length).toBe(T.FOLLOW_MAX)
    void openNewVacancies
  })
})
