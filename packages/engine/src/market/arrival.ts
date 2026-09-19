/**
 * The director on arrival (DESIGN.md "Transfers", On arrival): the week a
 * manager takes a job, the director's assessment of the squad — the two
 * positions that need cover, the players he would sell — and his first
 * recommendations. In a window they are bids. Outside one they are free
 * agents to sign now, plus targets he lines up for the window, agreed in
 * principle and confirmed as bids the day it opens unless cancelled. AI
 * managers get the same director: a trade round in a window, a free agent
 * to a need outside one.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { round1 } from '../world/gen.js'
import { clubById, playerById } from '../lookup.js'
import { seasonWeek } from '../season/calendar.js'
import { autoPick, clubFormation, effectiveRating, squadOf } from '../players/select.js'
import { aiTradeRound, humanClub, marketIndex, needs, placeBid, proposeSignings, windowAt, type Candidate } from './director.js'
import { queueSigning } from '../play/transfers.js'
import { humanState, pendingDecisions } from '../play/decisions.js'
import type { AgreedTarget, Club, Manager, PlayerId, World } from '../types.js'

export interface Assessment {
  needs: { position: string; side: string; rating: number; name: string | null }[]
  sell: { playerId: PlayerId; name: string; position: string; age: number; wage: number; fee: number }[]
}

/** The director's view of the squad: the weakest slots of the best XI, and the players outside it who cost the most for what they give. */
export function assessSquad(world: World, club: Club): Assessment {
  const wanted = needs(world, club).slice(0, T.ARRIVAL_NEEDS)
  const formation = clubFormation(world, club)
  const xi = new Set(autoPick(world, club, formation).xi)
  const outside = squadOf(world, club).filter((p) => !xi.has(p.id))
  const cost = (p: { contract: { wage: number }; rating: number }) => p.contract.wage / Math.max(1, p.rating)
  const sell = [...outside].sort((a, b) => cost(b) - cost(a) || a.id - b.id).slice(0, T.ARRIVAL_SELL_NAMES)
  return {
    needs: wanted.map((n) => {
      const p = n.playerId === null ? undefined : playerById(world, n.playerId)
      return { position: n.slot.position, side: n.slot.side, rating: p ? round1(effectiveRating(p, n.slot)) : 0, name: p ? p.name : null }
    }),
    sell: sell.map((p) => ({ playerId: p.id, name: p.name, position: p.position, age: p.age, wage: p.contract.wage, fee: round1(p.value) })),
  }
}

function inPlay(world: World, club: Club): Set<PlayerId> {
  const ids = new Set<PlayerId>()
  for (const d of pendingDecisions(world)) if (d.kind === 'signing' || d.kind === 'sale') ids.add(d.payload['playerId'] as PlayerId)
  for (const b of world.bids) if (b.clubId === club.id) ids.add(b.playerId)
  for (const id of humanState(world).declinedPlayers ?? []) ids.add(id)
  for (const t of humanState(world).agreedTargets ?? []) ids.add(t.playerId)
  return ids
}

/** The human takes a job: the assessment as a post, then the first cards. */
export function humanArrival(world: World, rng: Rng, club: Club, manager: Manager): void {
  const assessment = assessSquad(world, club)
  const window = windowAt(seasonWeek(world.week))
  emit(world, 'director.assessment', { clubId: club.id, managerId: manager.id, director: club.director.name, needs: assessment.needs, sell: assessment.sell, window, pot: club.transferPot, season: world.season })
  const exclude = inPlay(world, club)
  if (window) {
    for (const c of proposeSignings(world, rng, club, T.ARRIVAL_CARDS, null, exclude, window)) queueSigning(world, c, club.transferPot)
    return
  }
  // Outside a window: a free agent to sign now, then targets agreed in principle for the window.
  const frees = proposeSignings(world, rng, club, T.ARRIVAL_FREE_CARDS, null, exclude, 'summer', { pool: 'free', abroadShare: 0 })
  for (const c of frees) {
    queueSigning(world, c, club.transferPot, { signNow: true })
    exclude.add(c.player.id)
  }
  const targets = proposeSignings(world, rng, club, T.ARRIVAL_CARDS - frees.length, null, exclude, 'summer', { pool: 'clubs', abroadShare: 0 })
  for (const c of targets) queueSigning(world, c, club.transferPot, { agreed: true })
}

/** An AI manager takes a job: a trade round in a window; a free agent to the weakest slot outside one. */
export function aiArrival(world: World, rng: Rng, club: Club, manager: Manager): void {
  const window = windowAt(seasonWeek(world.week))
  if (window) {
    aiTradeRound(world, rng, club, window, marketIndex(world))
    return
  }
  const pending = new Set(world.bids.filter((b) => b.clubId === club.id).map((b) => b.playerId))
  for (const c of proposeSignings(world, rng, club, T.AI_ARRIVAL_FREE_AGENTS, null, pending, 'summer', { pool: 'free', abroadShare: 0 })) {
    if (c.gain >= T.AI_APPROVE_MIN_GAIN) placeBid(world, club, c, manager.id)
  }
}

/** Approving a target outside a window: agreed in principle, a bid the day the window opens. */
export function agreeTarget(world: World, club: Club, manager: Manager, c: Candidate): void {
  const state = humanState(world)
  const target: AgreedTarget = {
    playerId: c.player.id,
    fromClubId: c.player.clubId,
    name: c.player.name,
    position: c.player.position,
    fee: c.fee,
    wage: c.wage,
    estimate: c.estimate,
    potentialEstimate: c.potentialEstimate,
    halfWidth: c.halfWidth,
    reason: c.reason,
    confidence: c.confidence,
    gain: c.gain,
    need: { ...c.need.slot },
    week: world.week,
  }
  state.agreedTargets = [...(state.agreedTargets ?? []).filter((t) => t.playerId !== target.playerId), target]
  emit(world, 'target.agreed', { clubId: club.id, managerId: manager.id, playerId: target.playerId, name: target.name, fromClubId: target.fromClubId, fee: target.fee, wage: target.wage, season: world.season })
}

/** The manager cancels agreed targets before the window opens. */
export function cancelAgreed(world: World, ids: readonly PlayerId[]): void {
  const state = humanState(world)
  const mine = humanClub(world)
  const gone = (state.agreedTargets ?? []).filter((t) => ids.includes(t.playerId))
  state.agreedTargets = (state.agreedTargets ?? []).filter((t) => !ids.includes(t.playerId))
  for (const t of gone) emit(world, 'target.cancelled', { clubId: mine?.club.id ?? null, managerId: mine?.manager.id ?? null, playerId: t.playerId, name: t.name, season: world.season })
}

/** The window opens: every agreed target still where he was and inside the pot becomes a bid; the rest lapse. */
export function confirmAgreedTargets(world: World): void {
  const state = world.human
  if (!state || !state.agreedTargets || state.agreedTargets.length === 0) return
  const mine = humanClub(world)
  const targets = state.agreedTargets
  state.agreedTargets = []
  if (!mine) return
  const { club, manager } = mine
  for (const t of targets) {
    const p = playerById(world, t.playerId)
    if (!p || p.retired || p.clubId !== t.fromClubId || p.clubId === club.id || t.fee > club.transferPot) {
      emit(world, 'target.lapsed', { clubId: club.id, managerId: manager.id, playerId: t.playerId, name: t.name, why: !p || p.retired || p.clubId !== t.fromClubId ? 'gone' : 'money', season: world.season })
      continue
    }
    const seller = p.clubId > 0 ? clubById(world, p.clubId) : null
    const candidate: Candidate = { player: p, fee: t.fee, wage: t.wage, estimate: t.estimate, potentialEstimate: t.potentialEstimate, halfWidth: t.halfWidth, reason: t.reason, confidence: t.confidence, gain: t.gain, need: { slot: { ...t.need }, playerId: null, rating: 0 } }
    placeBid(world, club, candidate, manager.id)
    emit(world, 'target.confirmed', { clubId: club.id, managerId: manager.id, playerId: p.id, name: p.name, fromClubId: p.clubId, from: seller ? seller.name : 'the pool', fee: t.fee, season: world.season })
  }
}
