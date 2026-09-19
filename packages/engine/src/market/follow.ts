/**
 * Following you (DESIGN.md "Your players"): when a manager takes a new
 * job, up to two tagged players with a bond above the threshold, at clubs
 * that would sell and on wages the new club can pay, ask to follow. The
 * old club sets an asking price, the loyal trait lowers the wage he asks,
 * and the press notice. The move completes at the next window, like any
 * other, with the same two rolls.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { round1 } from '../world/gen.js'
import type { Club, Manager, Player, World } from '../types.js'
import { wageDemand } from '../players/contracts.js'
import { hasTrait } from '../players/traits.js'
import { placeBid, wageBill, type Candidate } from './director.js'
import { queueFollow } from '../play/transfers.js'

export interface Follower {
  player: Player
  bond: number
  fee: number
  wage: number
  loyal: boolean
}

/** Who asks: tagged players over the bond threshold, elsewhere, affordable on fee and wage; the strongest bonds first, at most FOLLOW_MAX. */
export function followCandidates(world: World, manager: Manager, club: Club): Follower[] {
  const out: Follower[] = []
  let bill = wageBill(world, club)
  let pot = club.transferPot
  const tagged: { player: Player; bond: number }[] = []
  for (const p of world.players) {
    if (!p || p.retired || p.clubId === club.id || p.abroad || p.loan) continue
    if (p.clubId < 0) continue
    const tag = p.madeBy.find((m) => m.managerId === manager.id)
    if (!tag || tag.bond < T.FOLLOW_BOND_THRESHOLD) continue
    tagged.push({ player: p, bond: tag.bond })
  }
  tagged.sort((a, b) => b.bond - a.bond || a.player.id - b.player.id)
  for (const { player, bond } of tagged) {
    if (out.length >= T.FOLLOW_MAX) break
    const fee = player.clubId === 0 ? 0 : round1(player.value * T.FOLLOW_ASKING_PREMIUM)
    const wage = wageDemand(player, manager.id)
    if (fee > pot) continue
    if (bill + (wage * T.WAGE_WEEKS_PER_YEAR) / 1000 > club.wageBudget) continue
    out.push({ player, bond, fee, wage, loyal: hasTrait(player, 'loyal') })
    pot -= fee
    bill += (wage * T.WAGE_WEEKS_PER_YEAR) / 1000
  }
  return out
}

/** The bid for a follower: the same negotiation at the next window's close, flagged so no estimate is kept against him. */
export function bidToFollow(world: World, club: Club, manager: Manager, f: Follower): void {
  const candidate: Candidate = {
    player: f.player,
    fee: f.fee,
    wage: f.wage,
    estimate: f.player.rating,
    potentialEstimate: f.player.potential,
    halfWidth: 0,
    reason: 'request',
    confidence: 'likely',
    gain: 0,
    need: { slot: { position: f.player.position, side: f.player.side === 'any' ? 'C' : f.player.side }, playerId: null, rating: 0 },
  }
  const bid = placeBid(world, club, candidate, manager.id)
  bid.follow = true
  emit(world, 'follow.asked', { playerId: f.player.id, name: f.player.name, managerId: manager.id, clubId: club.id, fromClubId: f.player.clubId, fee: f.fee, wage: f.wage, bond: f.bond, loyal: f.loyal, taken: true, season: world.season })
}

/** At a hire: the ones who ask. The human sees a card each; an AI manager takes each with AI_FOLLOW_P. */
export function askToFollow(world: World, rng: Rng, manager: Manager, club: Club): Follower[] {
  const asking = followCandidates(world, manager, club)
  for (const f of asking) {
    if (manager.isHuman) {
      queueFollow(world, f, club)
      emit(world, 'follow.asked', { playerId: f.player.id, name: f.player.name, managerId: manager.id, clubId: club.id, fromClubId: f.player.clubId, fee: f.fee, wage: f.wage, bond: f.bond, loyal: f.loyal, taken: null, season: world.season })
      continue
    }
    if (rng.chance(T.AI_FOLLOW_P)) bidToFollow(world, club, manager, f)
    else emit(world, 'follow.asked', { playerId: f.player.id, name: f.player.name, managerId: manager.id, clubId: club.id, fromClubId: f.player.clubId, fee: f.fee, wage: f.wage, bond: f.bond, loyal: f.loyal, taken: false, season: world.season })
  }
  return asking
}
