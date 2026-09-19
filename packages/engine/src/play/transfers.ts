/**
 * The director's cards for the human (DESIGN.md "Transfers"): up to three
 * recommendations a week in a window, a sale when a bid arrives, the wage
 * bill is over budget or a player is unsettled. Approve, decline, or ask
 * for a different profile; an approved bid negotiates itself at the close.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clubById, playerById } from '../lookup.js'
import type { Decision, DecisionOption, PlayerId, World } from '../types.js'
import { renderText } from '../text/render.js'
import { plainOption } from './bets.js'
import { hasPending, humanState, pendingDecisions, queueDecision } from './decisions.js'
import { humanClub, placeBid, proposeSale, proposeSignings, refuseSale, sellPlayer, wageBill, windowAt, type Candidate, type SaleProposal, type WindowName } from '../market/director.js'
import { bidToFollow, type Follower } from '../market/follow.js'
import { seasonWeek } from '../season/calendar.js'

/** A recommendation card: the player as ranges, fee, wage, reason, confidence, the pot after. */
export function queueSigning(world: World, c: Candidate, pot: number): Decision {
  const p = c.player
  const lo = Math.round(c.estimate - c.halfWidth)
  const hi = Math.round(c.estimate + c.halfWidth)
  const plo = Math.round(c.potentialEstimate - c.halfWidth)
  const phi = Math.round(c.potentialEstimate + c.halfWidth)
  const after = Math.round((pot - c.fee) * 10) / 10
  const from = p.clubId > 0 ? clubById(world, p.clubId).name : p.abroad ? 'abroad' : 'a free agent'
  const body = renderText('director', `card_${c.reason}`, { name: p.name, age: p.age, position: p.position, lo, hi, plo, phi, fee: c.fee, wage: c.wage, after }, world.week)
  const approve: DecisionOption = plainOption('signing', 'approve', c.fee > 0 ? `Approve the bid (£${c.fee}m)` : 'Approve (a free)', c.confidence, {}, world.week, `the director: ${c.confidence}`)
  const options: DecisionOption[] = [approve, plainOption('signing', 'decline', 'Decline', 'sure thing', {}, world.week), plainOption('signing', 'another', 'Ask for a different profile', 'sure thing', {}, world.week)]
  return queueDecision(world, {
    kind: 'signing',
    from: 'director',
    title: `${p.name}, ${p.position}, ${p.age} — from ${from}`,
    body,
    options,
    defaultKey: 'decline',
    blocking: false,
    payload: {
      playerId: p.id,
      name: p.name,
      position: p.position,
      side: p.side,
      age: p.age,
      traits: [...p.traits],
      fromClubId: p.clubId,
      from,
      fee: c.fee,
      wage: c.wage,
      years: T.SIGNING_CONTRACT_YEARS,
      reason: c.reason,
      confidence: c.confidence,
      lo,
      hi,
      plo,
      phi,
      estimate: c.estimate,
      potentialEstimate: c.potentialEstimate,
      halfWidth: c.halfWidth,
      gain: c.gain,
      pot,
      after,
      need: c.need.slot,
    },
  })
}

/** A sale card: the bid, the wage bill, or the unsettled player; approve or refuse. */
export function queueSale(world: World, s: SaleProposal, clubId: number): Decision {
  const p = s.player
  const club = clubById(world, clubId)
  const bidder = s.bidderId === null ? null : clubById(world, s.bidderId).name
  const body =
    s.reason === 'bid'
      ? renderText('director', 'sale_bid', { club: bidder ?? 'A club', fee: s.fee, name: p.name, position: p.position, age: p.age, rating: Math.round(p.rating), value: p.value, unsettled: s.unsettled ? ' He wants the move.' : '' }, world.week)
      : s.reason === 'wages'
        ? renderText('director', 'sale_wages', { bill: wageBill(world, club), budget: club.wageBudget, name: p.name, position: p.position, age: p.age, wage: p.contract.wage, fee: s.fee }, world.week)
        : renderText('director', 'sale_unsettled', { name: p.name, position: p.position, age: p.age, fee: s.fee }, world.week)
  const big = s.bidderId !== null && s.fee >= p.value * T.BIG_BID_SHARE
  return queueDecision(world, {
    kind: 'sale',
    from: 'director',
    title: s.reason === 'bid' ? `A bid for ${p.name}` : s.reason === 'wages' ? `The wage bill: sell ${p.name}?` : `${p.name} is unsettled`,
    body,
    options: [
      plainOption('sale', 'approve', `Sell (£${s.fee}m)`, 'sure thing', {}, world.week),
      plainOption('sale', 'refuse', 'Keep him', big && s.unsettled ? 'gamble' : 'likely', {}, world.week, big && s.unsettled ? 'a big bid refused for an unsettled player' : undefined),
    ],
    defaultKey: 'refuse',
    blocking: false,
    payload: { playerId: p.id, name: p.name, position: p.position, age: p.age, rating: Math.round(p.rating), fee: s.fee, value: p.value, reason: s.reason, bidderId: s.bidderId, bidder, unsettled: s.unsettled, big },
  })
}

/** Players already on a card or in a bid this week, so the director does not bring them twice. */
function inPlay(world: World): Set<PlayerId> {
  const ids = new Set<PlayerId>()
  for (const d of pendingDecisions(world)) {
    if (d.kind === 'signing' || d.kind === 'sale') ids.add(d.payload['playerId'] as PlayerId)
  }
  for (const b of world.bids) ids.add(b.playerId)
  const state = humanState(world)
  for (const id of state.declinedPlayers ?? []) ids.add(id)
  return ids
}

/**
 * The director's week for the human: cards for next turn. Runs at the close
 * of the week before each window week but deadline day.
 */
export function directorWeek(world: World, rng: Rng, window: WindowName): void {
  const mine = humanClub(world)
  if (!mine) return
  const { club, manager } = mine
  const state = humanState(world)
  const exclude = inPlay(world)
  // A sale first: a bid, the wage bill, an unsettled player.
  if (!hasPending(world, 'sale')) {
    const sale = proposeSale(world, club, exclude)
    if (sale) {
      queueSale(world, sale, club.id)
      exclude.add(sale.player.id)
    }
  }
  const open = T.DIRECTOR_CARDS_PER_WEEK - pendingDecisions(world).filter((d) => d.kind === 'signing').length
  if (open <= 0) return
  if (club.transferPot <= 0 && freeAgentless(world)) {
    emit(world, 'director.note', { clubId: club.id, managerId: manager.id, note: 'no_money', season: world.season })
    return
  }
  const cards = proposeSignings(world, rng, club, open, state.targetProfile ?? null, exclude, window)
  for (const c of cards) queueSigning(world, c, club.transferPot)
  if (cards.length === 0) emit(world, 'director.note', { clubId: club.id, managerId: manager.id, note: club.transferPot <= 0 ? 'no_money' : 'no_room', season: world.season })
  // A profile asked for is served once; the director goes back to needs after.
  if (state.targetProfile && cards.some((c) => c.reason === 'request')) state.targetProfile = null
}

function freeAgentless(world: World): boolean {
  for (const p of world.players) if (p && !p.retired && p.clubId === 0) return false
  return true
}

/** The human's answer on a recommendation: the bid goes in, or he is set aside, or the director is asked for another profile. */
export function applySigning(world: World, decision: Decision, key: string): void {
  const mine = humanClub(world)
  const state = humanState(world)
  const playerId = decision.payload['playerId'] as PlayerId
  const p = playerById(world, playerId)
  if (!mine || !p || p.retired) return
  const { club, manager } = mine
  if (key === 'approve') {
    if (!windowAt(seasonWeek(world.week))) {
      emit(world, 'bid.failed', { clubId: club.id, managerId: manager.id, playerId, name: p.name, reason: 'closed', season: world.season })
      return
    }
    const candidate: Candidate = {
      player: p,
      fee: decision.payload['fee'] as number,
      wage: decision.payload['wage'] as number,
      estimate: decision.payload['estimate'] as number,
      potentialEstimate: decision.payload['potentialEstimate'] as number,
      halfWidth: decision.payload['halfWidth'] as number,
      reason: decision.payload['reason'] as Candidate['reason'],
      confidence: decision.payload['confidence'] as Candidate['confidence'],
      gain: decision.payload['gain'] as number,
      need: { slot: decision.payload['need'] as Candidate['need']['slot'], playerId: null, rating: 0 },
    }
    placeBid(world, club, candidate, manager.id)
    return
  }
  state.declinedPlayers = [...(state.declinedPlayers ?? []), playerId]
  if (key === 'another') {
    emit(world, 'director.another', { clubId: club.id, managerId: manager.id, playerId, season: world.season })
    // Nothing else changes: the profile the manager asked for (if any) stands; the declined name is not brought back.
  }
}

/** The human's answer on a sale. */
export function applySale(world: World, rng: Rng, decision: Decision, key: string): void {
  const mine = humanClub(world)
  const playerId = decision.payload['playerId'] as PlayerId
  const p = playerById(world, playerId)
  if (!mine || !p || p.retired || p.clubId !== mine.club.id) return
  const fee = decision.payload['fee'] as number
  const bidderId = (decision.payload['bidderId'] as number | null) ?? null
  if (key === 'approve') sellPlayer(world, rng, p, mine.club, fee, mine.manager.id, bidderId)
  else refuseSale(world, p, mine.club, { fee, unsettled: decision.payload['unsettled'] === true, bidderId }, mine.manager.id)
}

/** A follower's card at a hire: approve and the bid goes in at the next window, or decline. */
export function queueFollow(world: World, f: Follower, club: { id: number }): Decision {
  const p = f.player
  const from = p.clubId > 0 ? clubById(world, p.clubId).name : 'the free-agent pool'
  const body = renderText('director', p.clubId === 0 ? 'follow_free' : 'follow_card', { name: p.name, position: p.position, age: p.age, rating: Math.round(p.rating), club: from, fee: f.fee, wage: f.wage, loyal: f.loyal ? ' (loyal: he asks less of you)' : '' }, world.week)
  return queueDecision(world, {
    kind: 'follow',
    from: 'director',
    title: `${p.name} wants to follow you`,
    body,
    options: [
      plainOption('follow', 'approve', f.fee > 0 ? `Bring him (£${f.fee}m)` : 'Bring him (a free)', p.clubId === 0 ? 'sure thing' : 'likely', {}, world.week, `£${f.wage}k a week`),
      plainOption('follow', 'decline', 'Leave him where he is', 'sure thing', {}, world.week),
    ],
    defaultKey: 'decline',
    blocking: false,
    payload: { playerId: p.id, name: p.name, position: p.position, age: p.age, rating: Math.round(p.rating), fromClubId: p.clubId, from, fee: f.fee, wage: f.wage, bond: f.bond, loyal: f.loyal, clubId: club.id },
  })
}

export function applyFollow(world: World, decision: Decision, key: string): void {
  const mine = humanClub(world)
  const p = playerById(world, decision.payload['playerId'] as PlayerId)
  if (!mine || !p || p.retired || p.clubId === mine.club.id) return
  if (key !== 'approve') {
    emit(world, 'follow.declined', { playerId: p.id, name: p.name, managerId: mine.manager.id, clubId: mine.club.id, season: world.season })
    return
  }
  const fee = decision.payload['fee'] as number
  const wage = decision.payload['wage'] as number
  bidToFollow(world, mine.club, mine.manager, { player: p, bond: decision.payload['bond'] as number, fee, wage, loyal: decision.payload['loyal'] === true })
}
