/**
 * The director of football (DESIGN.md "Transfers"): one per club, a
 * judgement from wealth (scouting level joins in phase 5). In a window he
 * brings up to three recommendation cards a week; an approved bid
 * negotiates itself with a roll on the selling club and a roll on the
 * player, and the answer arrives at the next close. Every signing is a
 * bet: his estimate against the truth, revealed over the first five
 * matches. Nothing moves outside the two windows but free agents.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, managerById, playerById, spellOf } from '../lookup.js'
import { POOLS } from '../managers/names.js'
import type { Bid, Club, Confidence, Director, FormationSlot, Manager, Player, PlayerId, Position, SigningReason, TargetProfile, World } from '../types.js'
import { seasonWeek } from '../season/calendar.js'
import { slotsOf } from '../players/formations.js'
import { autoPick, clubFormation, effectiveRating, squadOf } from '../players/select.js'
import { makePlayer, releasePlayer, squadSizeFor, valueFor, forgetPlayer } from '../players/gen.js'
import { wageDemand } from '../players/contracts.js'
import { tagPlayer, milestone } from '../players/made.js'
import { addCredit } from '../tenure/credit.js'
import { bumpReputation } from '../tenure/exits.js'
import { averageRating } from '../match/aftermath.js'
import { levelOf, normalBudget, moveOn, refreshStrength, topUpSquad, trimSquad, windowTurnover, type WindowSummary } from '../season/squad.js'
import { ensureFacilities, levelFromWealth, scoutingJudgementBonus, stadiumIncome } from '../club/facilities.js'

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

export type WindowName = 'summer' | 'january'

export interface WindowState {
  open: boolean
  window: WindowName | null
  /** Season week of deadline day. */
  deadlineWeek: number | null
  /** Weeks until deadline day, 0 on the day. */
  weeksToDeadline: number | null
}

/** Which window a season week falls in, if any. The summer runs across the season boundary: from the last match week to the deadline in the new season. */
export function windowAt(sw: number): WindowName | null {
  const [js, je] = T.JANUARY_WINDOW_WEEKS
  if (sw >= js && sw <= je) return 'january'
  if (sw >= T.SUMMER_WINDOW_OPENS || sw <= T.SUMMER_WINDOW_CLOSES) return 'summer'
  return null
}

export function deadlineOf(window: WindowName): number {
  return window === 'january' ? T.JANUARY_WINDOW_WEEKS[1] : T.SUMMER_WINDOW_CLOSES
}

/** Weeks from a season week to a window's deadline, the summer's counted across the boundary. */
export function weeksToDeadline(window: WindowName, sw: number): number {
  const deadline = deadlineOf(window)
  if (window === 'summer' && sw >= T.SUMMER_WINDOW_OPENS) return T.SEASON_WEEKS - sw + deadline
  return deadline - sw
}

export function isDeadlineWeek(sw: number): boolean {
  const w = windowAt(sw)
  return w !== null && deadlineOf(w) === sw
}

/** The window as the banner shows it. */
export function windowState(world: World): WindowState {
  const sw = seasonWeek(world.week)
  const window = windowAt(sw)
  if (!window) return { open: false, window: null, deadlineWeek: null, weeksToDeadline: null }
  return { open: true, window, deadlineWeek: deadlineOf(window), weeksToDeadline: weeksToDeadline(window, sw) }
}

/**
 * Closes at which the director brings cards for the week that follows:
 * every window week but deadline day, and not the summer's first week
 * (the season closes at that week's close, and the squads change with it).
 */
export function isCardClose(sw: number): WindowName | null {
  const nextSw = (sw + 1) % T.SEASON_WEEKS
  const next = windowAt(nextSw)
  if (!next) return null
  if (deadlineOf(next) === nextSw) return null
  if (next === 'summer' && nextSw === T.MATCH_WEEKS) return null
  return next
}

// ---------------------------------------------------------------------------
// The director himself
// ---------------------------------------------------------------------------

export function judgementFor(rng: Rng | null, wealth: number, scouting: number = levelFromWealth(wealth)): number {
  const base = T.DIRECTOR_JUDGEMENT_BASE + T.DIRECTOR_JUDGEMENT_PER_WEALTH * wealth + scoutingJudgementBonus(scouting)
  const noise = rng ? rng.normal(0, T.DIRECTOR_JUDGEMENT_SD) : 0
  return Math.round(clamp(base + noise, T.DIRECTOR_JUDGEMENT_RANGE[0], T.DIRECTOR_JUDGEMENT_RANGE[1]))
}

export function makeDirector(rng: Rng, wealth: number): Director {
  const pool = POOLS.home
  return { name: `${rng.pick(pool.first)} ${rng.pick(pool.last)}`, judgement: judgementFor(rng, wealth) }
}

/** Saves from before phase 4: a director per club from wealth alone, an empty bid list, a pot. */
export function ensureDirectors(world: World): void {
  for (const club of world.clubs) {
    if (!club.director) {
      const pool = POOLS.home
      club.director = { name: `${pool.first[club.id % pool.first.length]} ${pool.last[(club.id * 7) % pool.last.length]}`, judgement: judgementFor(null, club.wealth) }
    }
    if (club.transferPot === undefined) club.transferPot = normalBudget(club)
  }
  if (!world.bids) world.bids = []
  if (world.nextBidId === undefined) world.nextBidId = 1
  ensureFacilities(world)
}

/** How far the estimate sits from the truth, by judgement. */
export function estimateSd(judgement: number): number {
  return T.DIRECTOR_ESTIMATE_SD * Math.max(0.1, T.DIRECTOR_JUDGEMENT_SCALE_AT_ZERO - judgement / 100)
}

/** Half the width of the range on the card, by judgement. */
export function rangeHalf(judgement: number): number {
  return round1(T.DIRECTOR_RANGE_HALF * Math.max(0.1, T.DIRECTOR_JUDGEMENT_SCALE_AT_ZERO - judgement / 100))
}

/** The wage bill, £m a season. */
export function wageBill(world: World, club: Club): number {
  return round1((squadOf(world, club).reduce((s, p) => s + p.contract.wage, 0) * T.WAGE_WEEKS_PER_YEAR) / 1000)
}

/** Reset the pot for the summer (the board's budget × the promise) or top it up for January. */
export function refreshPot(world: World, club: Club, window: WindowName, multiplier: number): void {
  const normal = normalBudget(club)
  // The summer pot: the board's budget, plus what an expanded stadium brings in (DESIGN.md "Requests", Expand the stadium).
  club.transferPot = round1(window === 'summer' ? normal * multiplier + stadiumIncome(club) : club.transferPot + normal * T.WINTER_BUDGET_SHARE)
  club.xiAtWindowOpen = [...autoPick(world, club, clubFormation(world, club)).xi]
  club.windowBids = 0
  emit(world, 'window.pot', { clubId: club.id, window, pot: club.transferPot, wageBudget: club.wageBudget, wageBill: wageBill(world, club), season: world.season })
}

// ---------------------------------------------------------------------------
// Needs and candidates
// ---------------------------------------------------------------------------

export interface Need {
  slot: FormationSlot
  /** The starter in it now, or null for an empty slot. */
  playerId: PlayerId | null
  rating: number
}

/** The best XI's slots from weakest up, by the effective rating of who fills them. */
export function needs(world: World, club: Club): Need[] {
  const formation = clubFormation(world, club)
  const slots = slotsOf(formation)
  const xi = autoPick(world, club, formation).xi
  const out: Need[] = slots.map((slot, i) => {
    const p = xi[i] === undefined ? undefined : playerById(world, xi[i] as PlayerId)
    return { slot, playerId: p ? p.id : null, rating: p ? round1(effectiveRating(p, slot)) : 0 }
  })
  return out.sort((a, b) => a.rating - b.rating || a.slot.position.localeCompare(b.slot.position))
}

export interface Candidate {
  player: Player
  fee: number
  /** £k a week. */
  wage: number
  estimate: number
  potentialEstimate: number
  halfWidth: number
  reason: SigningReason
  confidence: Confidence
  /** Estimated gain over the weakest starter in his position. */
  gain: number
  need: Need
}

function feeFor(p: Player): number {
  if (p.clubId === 0) return 0
  if (p.abroad) return p.value
  return round1(p.value * (p.contract.years <= 1 ? T.EXPIRING_FEE_SHARE : T.DIRECTOR_FEE_PREMIUM))
}

function matchesProfile(p: Player, profile: TargetProfile | null | undefined, estimate: number): boolean {
  if (!profile) return true
  if (profile.position && p.position !== profile.position) return false
  if (profile.maxAge !== undefined && p.age > profile.maxAge) return false
  if (profile.minRating !== undefined && estimate < profile.minRating) return false
  return true
}

/** The director's confidence: how far the estimated gain clears his own range. */
function confidenceFor(gain: number, halfWidth: number): Confidence {
  if (gain >= T.DIRECTOR_CONFIDENCE_SURE * halfWidth) return 'sure thing'
  if (gain >= T.DIRECTOR_CONFIDENCE_LIKELY * halfWidth) return 'likely'
  return 'gamble'
}

/** The director's read of a player: the truth plus his error, potential the same for the young. */
export function estimateOf(rng: Rng, director: Director, p: Player): { estimate: number; potentialEstimate: number } {
  const sd = estimateSd(director.judgement)
  const estimate = round1(clamp(p.rating + rng.normal(0, sd), 1, 100))
  const potentialEstimate = p.age < T.YOUTH_AGE ? round1(clamp(Math.max(estimate, p.potential + rng.normal(0, sd)), 1, 100)) : estimate
  return { estimate, potentialEstimate }
}

/** A candidate from abroad at the level asked: generated, forgotten if nobody signs him by the deadline. */
function abroadCandidate(world: World, rng: Rng, club: Club, need: Need, target: number): Player {
  const nationality = rng.pick(['big', 'mid', 'small'] as const)
  const p = makePlayer(world, rng, T.ABROAD_CLUB_ID, null, {
    position: need.slot.position,
    side: need.slot.side,
    age: rng.int(T.ABROAD_AGE_RANGE[0], T.ABROAD_AGE_RANGE[1]),
    rating: target + rng.normal(0, T.STARTER_RATING_SD),
    nationality,
  })
  p.abroad = true
  void club
  return p
}

/** Every player at a home club or in the pool, by position, strongest first: built once per close so every director's search is a walk down a band. */
export type MarketIndex = Record<Position, Player[]>

export function marketIndex(world: World): MarketIndex {
  const index: MarketIndex = { GK: [], D: [], M: [], F: [] }
  for (const p of world.players) {
    // A generated European side's players are made for the tie and go with it: they are nobody's to buy.
    if (!p || p.retired || p.clubId < 0 || p.clubId >= T.EUROPEAN_OPPONENT_ID_BASE || p.abroad || p.loan) continue
    index[p.position].push(p)
  }
  for (const position of ['GK', 'D', 'M', 'F'] as const) index[position].sort((a, b) => b.rating - a.rating || a.id - b.id)
  return index
}

export interface ProposeOptions {
  /** The level the director searches around: the squad's own by default; an AI director aims at its wealth level. */
  aim?: number
  /** Share of the cards from abroad. */
  abroadShare?: number
  index?: MarketIndex
  /** Where to look: anywhere (the default), the free-agent pool only, or other clubs only (targets for a window). */
  pool?: 'any' | 'free' | 'clubs'
}

/**
 * Up to `count` recommendations: the weakest slots first, the manager's
 * profile if one is set, a share from abroad. Real candidates come from
 * other home clubs and the free-agent pool, inside the pot and the wage
 * budget.
 */
export function proposeSignings(world: World, rng: Rng, club: Club, count: number, profile: TargetProfile | null | undefined, exclude: Set<PlayerId>, window: WindowName, options: ProposeOptions = {}): Candidate[] {
  const director = club.director
  const wanted = needs(world, club)
  if (wanted.length === 0) return []
  const strength = club.squad.strength
  const aim = Math.max(strength, options.aim ?? strength)
  const bill = wageBill(world, club)
  const half = rangeHalf(director.judgement)
  const out: Candidate[] = []
  const used = new Set<PlayerId>(exclude)
  const abroadCards = Math.round(count * (options.abroadShare ?? T.DIRECTOR_ABROAD_SHARE))
  const ceiling = aim + T.DIRECTOR_REACH_ABOVE
  const index = options.index ?? marketIndex(world)
  for (let i = 0; i < count; i++) {
    const need = profile?.position ? (wanted.find((n) => n.slot.position === profile.position) ?? wanted[0]!) : wanted[i % wanted.length]!
    const floor = Math.max(need.rating + T.DIRECTOR_MIN_GAIN, aim - T.DIRECTOR_REACH_BELOW)
    const fromAbroad = i >= count - abroadCards
    let best: Candidate | null = null
    const pool = options.pool ?? 'any'
    const consider = (p: Player, reason: SigningReason) => {
      if (used.has(p.id) || p.retired || p.clubId === club.id) return
      if (pool === 'free' && p.clubId !== 0) return
      if (pool === 'clubs' && p.clubId <= 0) return
      if (p.position !== need.slot.position) return
      if (p.rating < floor || p.rating > ceiling) return
      const fee = feeFor(p)
      if (fee > club.transferPot) return
      const wage = Math.round(wageDemand(p) * (1 + T.SIGNING_WAGE_PREMIUM))
      if (bill + (wage * T.WAGE_WEEKS_PER_YEAR) / 1000 > club.wageBudget) return
      const { estimate, potentialEstimate } = estimateOf(rng, director, p)
      if (!matchesProfile(p, profile, estimate)) return
      const gain = round1(estimate - need.rating)
      const bargain = fee < p.value * T.BARGAIN_FEE_SHARE
      const candidate: Candidate = { player: p, fee, wage, estimate, potentialEstimate, halfWidth: half, reason: profile ? 'request' : bargain ? 'bargain' : reason, confidence: confidenceFor(gain, half), gain, need }
      // The director ranks by what he thinks he sees, less what it costs of the pot.
      const score = (c: Candidate) => c.estimate - (c.fee / Math.max(1, club.transferPot)) * T.DIRECTOR_FEE_WEIGHT
      if (!best || score(candidate) > score(best)) best = candidate
    }
    if (fromAbroad && pool === 'any') {
      const target = clamp(Math.max(floor + T.DIRECTOR_ABROAD_GAIN, aim), floor, ceiling)
      consider(abroadCandidate(world, rng, club, need, target), 'need')
    } else {
      // Down the band from the ceiling: the strongest affordable first, a limited look.
      let seen = 0
      for (const p of index[need.slot.position]) {
        if (p.rating > ceiling) continue
        if (p.rating < floor) break
        if (seen >= T.DIRECTOR_SEARCH_LIMIT) break
        seen++
        consider(p, p.clubId === 0 ? 'bargain' : 'need')
      }
    }
    if (best) {
      const found = best as Candidate
      used.add(found.player.id)
      out.push(found)
    }
  }
  void window
  return out
}

// ---------------------------------------------------------------------------
// Bids
// ---------------------------------------------------------------------------

export function placeBid(world: World, club: Club, candidate: Candidate, managerId: number | null): Bid {
  const bid: Bid = {
    id: world.nextBidId++,
    clubId: club.id,
    playerId: candidate.player.id,
    fee: candidate.fee,
    wage: candidate.wage,
    years: T.SIGNING_CONTRACT_YEARS,
    week: world.week,
    managerId,
    reason: candidate.reason,
  }
  world.bids.push(bid)
  emit(world, 'bid.made', { bidId: bid.id, clubId: club.id, managerId, playerId: candidate.player.id, name: candidate.player.name, fromClubId: candidate.player.clubId, fee: bid.fee, wage: bid.wage, estimate: candidate.estimate, season: world.season })
  return bid
}

function tierOfClub(world: World, clubId: number): number | null {
  const club = clubId > 0 ? clubById(world, clubId) : undefined
  return club ? club.tier : null
}

/** The selling club's answer: the premium over value, halved in January for a starter; abroad and free agents by their own rates. */
export function clubAcceptP(world: World, p: Player, fee: number, window: WindowName | null): number {
  if (p.clubId === 0) return 1
  if (p.abroad) return T.BID_CLUB_ACCEPT_ABROAD
  const seller = clubById(world, p.clubId)
  let prob = T.BID_CLUB_ACCEPT_BASE + T.BID_CLUB_ACCEPT_PER_PREMIUM * (fee / Math.max(0.1, p.value) - 1)
  if (window === 'january') {
    const xi = autoPick(world, seller, clubFormation(world, seller)).xi
    if (xi.includes(p.id)) prob *= T.BID_CLUB_JANUARY_STARTER_MULT
  }
  return clamp(prob, T.BID_ACCEPT_RANGE[0], T.BID_ACCEPT_RANGE[1])
}

/** The player's answer: a step per tier up or down, a bonus per 10% on the wage. */
export function playerAcceptP(world: World, p: Player, buyer: Club, wage: number): number {
  const from = tierOfClub(world, p.clubId)
  let prob = T.BID_PLAYER_ACCEPT_BASE
  if (from !== null) prob += T.BID_PLAYER_TIER_STEP * (from - buyer.tier)
  prob += T.BID_PLAYER_WAGE_BONUS_PER_10PCT * ((wage / Math.max(1, p.contract.wage) - 1) / 0.1)
  return clamp(prob, T.BID_ACCEPT_RANGE[0], T.BID_ACCEPT_RANGE[1])
}

/** Every bid negotiates itself: one roll on the club, one on the player; the answer is logged. Outside a window only bids for free agents resolve; the rest wait. */
export function resolveBids(world: World, rng: Rng): void {
  const window = windowAt(seasonWeek(world.week))
  const pending = world.bids
  world.bids = []
  for (const bid of pending) {
    const buyer = clubById(world, bid.clubId)
    const p = playerById(world, bid.playerId)
    if (!window && p && !p.retired && p.clubId !== 0) {
      world.bids.push(bid)
      continue
    }
    if (!p || p.retired || p.clubId === buyer.id) {
      emit(world, 'bid.failed', { bidId: bid.id, clubId: buyer.id, managerId: bid.managerId, playerId: bid.playerId, name: p ? p.name : '?', reason: 'gone', season: world.season })
      continue
    }
    if (bid.fee > buyer.transferPot) {
      emit(world, 'bid.failed', { bidId: bid.id, clubId: buyer.id, managerId: bid.managerId, playerId: p.id, name: p.name, reason: 'money', season: world.season })
      continue
    }
    const clubP = clubAcceptP(world, p, bid.fee, window)
    const clubRoll = rng.float()
    if (clubRoll >= clubP) {
      emit(world, 'bid.failed', { bidId: bid.id, clubId: buyer.id, managerId: bid.managerId, playerId: p.id, name: p.name, fromClubId: p.clubId, reason: 'club', p: round1(clubP * 100) / 100, roll: round1(clubRoll * 100) / 100, season: world.season })
      continue
    }
    const playerP = playerAcceptP(world, p, buyer, bid.wage)
    const playerRoll = rng.float()
    if (playerRoll >= playerP) {
      emit(world, 'bid.failed', { bidId: bid.id, clubId: buyer.id, managerId: bid.managerId, playerId: p.id, name: p.name, fromClubId: p.clubId, reason: 'player', p: round1(playerP * 100) / 100, roll: round1(playerRoll * 100) / 100, season: world.season })
      continue
    }
    completeSigning(world, rng, bid, p, buyer, { clubP, playerP })
  }
}

/** Make room: a full squad releases its lowest-value player outside the XI. */
function makeRoom(world: World, rng: Rng, club: Club): void {
  if (!T.SIGNING_MAKES_ROOM) return
  const size = squadSizeFor(club.tier) + T.SIGNING_ROOM_OVER
  const squad = squadOf(world, club)
  if (squad.length < size) return
  const xi = new Set(autoPick(world, club, clubFormation(world, club)).xi)
  const reserves = squad.filter((p) => !xi.has(p.id)).sort((a, b) => a.value - b.value || a.id - b.id)
  const out = reserves[0] ?? squad.sort((a, b) => a.value - b.value || a.id - b.id)[0]
  if (!out) return
  releasePlayer(world, out, club)
  emit(world, 'player.left', { playerId: out.id, clubId: club.id, name: out.name, rating: out.rating, fee: 0, reason: 'released', season: world.season })
  moveOn(world, rng, out, club)
}

/** The transfer: money, the player's record, the director's estimate kept against the truth, the manager's tag. */
export function completeSigning(world: World, rng: Rng, bid: Bid, p: Player, buyer: Club, rolls: { clubP: number; playerP: number }): void {
  const from = p.clubId
  const seller = from > 0 && !p.abroad ? clubById(world, from) : undefined
  const fee = bid.fee
  if (seller) {
    releasePlayer(world, p, seller)
    seller.transferPot = round1(seller.transferPot + fee)
    seller.cash = round1(seller.cash + fee)
    seller.netSpendThisSeason = round1(seller.netSpendThisSeason - fee)
    const sellerManager = seller.managerId === null ? null : managerById(world, seller.managerId)
    p.soldBy = { managerId: sellerManager ? sellerManager.id : 0, clubId: seller.id, season: world.season, fee, settled: sellerManager === null }
    emit(world, 'player.left', { playerId: p.id, clubId: seller.id, managerId: seller.managerId, name: p.name, rating: p.rating, fee, reason: 'sold', toClubId: buyer.id, season: world.season })
  }
  makeRoom(world, rng, buyer)
  buyer.transferPot = round1(Math.max(0, buyer.transferPot - fee))
  buyer.netSpendThisSeason = round1(buyer.netSpendThisSeason + fee)
  buyer.playerIds.push(p.id)
  p.clubId = buyer.id
  p.lastClubId = from > 0 ? from : (p.lastClubId ?? 0)
  p.freeSince = null
  p.abroad = false
  p.condition = T.CONDITION_MAX
  p.injuryWeeks = 0
  p.suspension = 0
  p.yellows = 0
  p.contract = { years: bid.years, wage: bid.wage }
  p.season = { ...p.season, clubId: buyer.id, tier: buyer.tier }
  const director = buyer.director
  const { estimate, potentialEstimate } = bid.follow ? { estimate: p.rating, potentialEstimate: p.potential } : estimateOf(rng, director, p)
  // A follower is known: nothing to reveal. Anyone else is the director's bet.
  p.scouted = bid.follow ? null : { estimate, potentialEstimate, halfWidth: rangeHalf(director.judgement), matchesSeen: 0, revealed: false, fee, fromClubId: from, managerId: bid.managerId, week: world.week }
  const manager = bid.managerId === null ? undefined : managerById(world, bid.managerId)
  if (manager) tagPlayer(world, p, manager, buyer, 'signed')
  if (fee >= T.TRANSFER_MILESTONE_FEE) milestone(world, p, 'transfer', { fee, fromClubId: from, toClubId: buyer.id })
  refreshStrength(world, buyer)
  if (seller) refreshStrength(world, seller)
  emit(world, 'player.signed', { playerId: p.id, clubId: buyer.id, managerId: bid.managerId, name: p.name, rating: p.rating, fee, season: world.season })
  emit(world, 'transfer.completed', {
    bidId: bid.id,
    playerId: p.id,
    name: p.name,
    position: p.position,
    age: p.age,
    fromClubId: from,
    clubId: buyer.id,
    managerId: bid.managerId,
    fee,
    wage: bid.wage,
    years: bid.years,
    free: from === 0,
    abroad: from === T.ABROAD_CLUB_ID,
    estimate,
    lo: Math.round(estimate - (p.scouted ? p.scouted.halfWidth : 0)),
    hi: Math.round(estimate + (p.scouted ? p.scouted.halfWidth : 0)),
    reason: bid.reason,
    follow: bid.follow === true,
    clubP: round1(rolls.clubP * 100) / 100,
    playerP: round1(rolls.playerP * 100) / 100,
    pot: buyer.transferPot,
    season: world.season,
  })
  if (bid.follow) emit(world, 'follow.moved', { playerId: p.id, name: p.name, managerId: bid.managerId, clubId: buyer.id, fromClubId: from, fee, wage: bid.wage, season: world.season })
}

// ---------------------------------------------------------------------------
// The reveal
// ---------------------------------------------------------------------------

/** What the manager sees of a scouted player while the truth comes out: ranges narrowing on the truth; null once revealed. */
export function scoutedView(p: Player): { lo: number; hi: number; plo: number; phi: number; seen: number; of: number } | null {
  const s = p.scouted
  if (!s || s.revealed) return null
  const progress = Math.min(1, s.matchesSeen / T.SIGNING_REVEAL_MATCHES)
  const half = s.halfWidth * (1 - progress)
  const centre = s.estimate + (p.rating - s.estimate) * progress
  const pcentre = s.potentialEstimate + (p.potential - s.potentialEstimate) * progress
  return { lo: Math.round(centre - half), hi: Math.round(centre + half), plo: Math.round(pcentre - half), phi: Math.round(pcentre + half), seen: s.matchesSeen, of: T.SIGNING_REVEAL_MATCHES }
}

/** After a match: a signing seen enough times is revealed: hit, flop or as estimated, with the credit and reputation that follow. */
export function revealSignings(world: World, clubIds: Iterable<number>): void {
  for (const clubId of clubIds) {
    const club = clubId > 0 ? world.clubs[clubId - 1] : undefined
    if (!club || club.id !== clubId) continue
    for (const p of squadOf(world, club)) {
      const s = p.scouted
      if (!s || s.revealed || s.matchesSeen < T.SIGNING_REVEAL_MATCHES) continue
      s.revealed = true
      const gap = round1(p.rating - s.estimate)
      const verdict = gap >= T.SIGNING_BEAT_MARGIN ? 'hit' : gap <= -T.SIGNING_SHORT_MARGIN ? 'flop' : 'even'
      const manager = s.managerId === null ? undefined : managerById(world, s.managerId)
      const spell = manager ? spellOf(world, manager) : undefined
      let credit = 0
      let rep = 0
      if (manager && spell && spell.post.kind === 'home' && spell.post.clubId === club.id) {
        if (verdict === 'hit') {
          credit = addCredit(spell, T.SIGNING_HIT_CREDIT)
          rep = bumpReputation(world, manager.id, T.SIGNING_HIT_REP, 'signing hit')
        } else if (verdict === 'flop') credit = addCredit(spell, T.SIGNING_FLOP_CREDIT)
      }
      emit(world, 'signing.revealed', { playerId: p.id, clubId: club.id, managerId: s.managerId, name: p.name, estimate: s.estimate, truth: p.rating, gap, verdict, creditDelta: credit, repDelta: rep, judgement: club.director.judgement, human: manager ? manager.isHuman : false, season: world.season })
    }
  }
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

export type SaleReason = 'bid' | 'wages' | 'unsettled'

export interface SaleProposal {
  player: Player
  fee: number
  reason: SaleReason
  /** The bidding club, when a bid came in. */
  bidderId: number | null
  unsettled: boolean
}

/** Is he unsettled: low morale, or wanting away. */
export function unsettled(p: Player): boolean {
  return p.morale < T.UNSETTLED_MORALE
}

/** What the director would sell this week: a bid that came in, the wage bill over budget, an unsettled player. One proposal. */
export function proposeSale(world: World, club: Club, exclude: Set<PlayerId>): SaleProposal | null {
  const squad = squadOf(world, club).filter((p) => !exclude.has(p.id))
  if (squad.length === 0) return null
  const bid = world.bids.find((b) => {
    const p = playerById(world, b.playerId)
    return p !== undefined && p.clubId === club.id && !exclude.has(p.id)
  })
  if (bid) {
    const p = playerById(world, bid.playerId) as Player
    return { player: p, fee: bid.fee, reason: 'bid', bidderId: bid.clubId, unsettled: unsettled(p) }
  }
  const bill = wageBill(world, club)
  if (bill > club.wageBudget * T.WAGE_OVERRUN_FACTOR) {
    const xi = new Set(autoPick(world, club, clubFormation(world, club)).xi)
    const outside = squad.filter((p) => !xi.has(p.id)).sort((a, b) => b.contract.wage - a.contract.wage || a.id - b.id)
    const p = outside[0] ?? [...squad].sort((a, b) => b.contract.wage - a.contract.wage || a.id - b.id)[0]
    if (p) return { player: p, fee: round1(p.value), reason: 'wages', bidderId: null, unsettled: unsettled(p) }
  }
  const restless = squad.filter(unsettled).sort((a, b) => a.morale - b.morale || a.id - b.id)[0]
  if (restless) return { player: restless, fee: round1(restless.value), reason: 'unsettled', bidderId: null, unsettled: true }
  return null
}

/** Sell: the fee into the pot, the record of who let him go, and he moves on (to the bidder, or into the pool for a club at his level). */
export function sellPlayer(world: World, rng: Rng, p: Player, from: Club, fee: number, managerId: number | null, toClubId: number | null): void {
  releasePlayer(world, p, from)
  from.transferPot = round1(from.transferPot + fee)
  from.cash = round1(from.cash + fee)
  from.netSpendThisSeason = round1(from.netSpendThisSeason - fee)
  p.soldBy = { managerId: managerId ?? 0, clubId: from.id, season: world.season, fee, settled: managerId === null }
  emit(world, 'player.left', { playerId: p.id, clubId: from.id, managerId, name: p.name, rating: p.rating, fee, reason: 'sold', toClubId, season: world.season })
  emit(world, 'player.sold', { playerId: p.id, clubId: from.id, managerId, name: p.name, rating: p.rating, fee, toClubId, pot: from.transferPot, season: world.season })
  if (toClubId !== null) {
    const buyer = clubById(world, toClubId)
    const bid = world.bids.find((b) => b.playerId === p.id && b.clubId === toClubId)
    world.bids = world.bids.filter((b) => b.playerId !== p.id)
    const wage = bid ? bid.wage : Math.round(wageDemand(p) * (1 + T.SIGNING_WAGE_PREMIUM))
    completeSigning(world, rng, bid ?? { id: 0, clubId: toClubId, playerId: p.id, fee, wage, years: T.SIGNING_CONTRACT_YEARS, week: world.week, managerId: buyer.managerId, reason: 'need' }, p, buyer, { clubP: 1, playerP: 1 })
    return
  }
  world.bids = world.bids.filter((b) => b.playerId !== p.id)
  p.lastClubId = from.id
  moveOn(world, rng, p, from)
  refreshStrength(world, from)
}

/** Refusing: nothing moves; a big bid refused for an unsettled player costs his morale and counts as a fallout. */
export function refuseSale(world: World, p: Player, club: Club, proposal: { fee: number; unsettled: boolean; bidderId: number | null }, managerId: number): void {
  world.bids = world.bids.filter((b) => b.playerId !== p.id)
  const big = proposal.bidderId !== null && proposal.fee >= p.value * T.BIG_BID_SHARE
  let morale = 0
  if (big && proposal.unsettled) {
    const before = p.morale
    p.morale = round1(clamp(p.morale + T.REFUSED_BIG_BID_MORALE, 0, 100))
    morale = round1(p.morale - before)
    const spell = spellOf(world, managerById(world, managerId))
    if (spell) spell.season.fallouts++
  }
  emit(world, 'sale.refused', { playerId: p.id, clubId: club.id, managerId, name: p.name, fee: proposal.fee, big, unsettled: proposal.unsettled, moraleDelta: morale, season: world.season })
}

/** Season end: a player sold within the last seasons who shone at his new club costs the seller reputation. */
export function settleSoldShines(world: World): void {
  for (const p of world.players) {
    if (!p || p.retired || !p.soldBy || p.soldBy.settled) continue
    const sold = p.soldBy
    if (world.season - sold.season > T.SOLD_SHINES_SEASONS) {
      sold.settled = true
      continue
    }
    if (p.clubId === sold.clubId || p.clubId <= 0) continue
    const avg = averageRating(p.season)
    if (avg === null || p.season.apps < T.SOLD_SHINES_MIN_APPS || avg < T.SOLD_SHINES_RATING) continue
    sold.settled = true
    if (sold.managerId > 0) {
      const manager = managerById(world, sold.managerId)
      if (manager.status.kind !== 'retired') bumpReputation(world, manager.id, T.SOLD_SHINES_REP, 'sold player shines')
      emit(world, 'sold.shines', { playerId: p.id, name: p.name, managerId: sold.managerId, fromClubId: sold.clubId, clubId: p.clubId, average: round1(avg), apps: p.season.apps, season: world.season })
    }
  }
}

// ---------------------------------------------------------------------------
// The window's close
// ---------------------------------------------------------------------------

/**
 * Deadline day: every bid has been answered; candidates from abroad nobody
 * signed are forgotten; every squad is back at its tier's size (the
 * reserves fill from the pool and the academy, the surplus goes); the
 * summary goes in the log.
 */
export function closeWindow(world: World, rng: Rng, window: WindowName): void {
  for (const club of world.clubs) {
    trimSquad(world, rng, club)
    topUpSquad(world, rng, club)
    refreshStrength(world, club)
  }
  const opened = openedWeek(world, window)
  for (const club of world.clubs) {
    let signings = 0
    let sales = 0
    let spend = 0
    for (const e of world.log) {
      if (e.week < opened || e.week > world.week) continue
      if (e.type === 'transfer.completed' && e.payload['clubId'] === club.id) {
        signings++
        spend += e.payload['fee'] as number
      }
      if (e.type === 'player.sold' && e.payload['clubId'] === club.id) sales++
    }
    if (world.human && club.managerId === world.human.managerId) {
      emit(world, 'window.deadline', { clubId: club.id, managerId: club.managerId, window, signings, sales, spend: round1(spend), pot: club.transferPot, season: world.season })
    }
  }
  // Last, so nobody generated while the squads settled is left waiting.
  forgetAbroadCandidates(world)
  emit(world, 'window.closed', { window, season: world.season })
}

/**
 * Outside a window there are no candidates from abroad waiting: the ones
 * nobody signed are forgotten, and one who did sign is a home player now,
 * not a candidate. Run at the close and again on any week with no window, so
 * the invariant does not depend on what happened inside the week.
 */
export function forgetAbroadCandidates(world: World): void {
  for (const p of world.players) {
    if (!p || p.retired || !p.abroad) continue
    if (p.clubId === T.ABROAD_CLUB_ID) forgetPlayer(world, p)
    else p.abroad = false
  }
}

// ---------------------------------------------------------------------------
// AI clubs: the same director, trading toward the level wealth sets
// ---------------------------------------------------------------------------

/** One window-week round for an AI club: a bid toward its wealth level while its quota lasts; a sale when the wage bill is over. */
export function aiTradeRound(world: World, rng: Rng, club: Club, window: WindowName, index: MarketIndex): void {
  if (club.managerId === null) return
  const manager = managerById(world, club.managerId)
  if (manager.isHuman) return
  // The wage budget binds: over it, the highest-paid go, starters included, up to a few a close.
  for (let n = 0; T.AI_SELL_ON_WAGES && n < T.AI_WAGE_SALES_PER_CLOSE && wageBill(world, club) > club.wageBudget * T.WAGE_OVERRUN_FACTOR; n++) {
    const priciest = squadOf(world, club).sort((a, b) => b.contract.wage - a.contract.wage || a.id - b.id)[0]
    if (!priciest || squadOf(world, club).length <= T.FIRST_XI) break
    sellPlayer(world, rng, priciest, club, priciest.value, manager.id, null)
  }
  const target = levelOf(club) + T.AI_TRADE_TARGET_BIAS + T.AI_TRADE_AMBITION * (club.wealth / 100) ** 2
  const gap = target - club.squad.strength
  if (gap < -T.AI_TRADE_HOLD_ABOVE) return
  const quota = Math.min(T.AI_SIGNINGS_MAX, (window === 'summer' ? T.AI_SIGNINGS_SUMMER : T.AI_SIGNINGS_JANUARY) + Math.ceil(Math.max(0, gap) / T.AI_GAP_PER_SIGNING))
  const placed = club.windowBids ?? 0
  if (placed >= quota) return
  const pending = new Set(world.bids.filter((b) => b.clubId === club.id).map((b) => b.playerId))
  const cards = proposeSignings(world, rng, club, 1, null, pending, window, { aim: target, abroadShare: T.AI_ABROAD_SHARE, index })
  for (const c of cards) {
    if (c.gain < T.AI_APPROVE_MIN_GAIN) continue
    placeBid(world, club, c, manager.id)
    club.windowBids = placed + 1
  }
}

/** Every AI club's round at a window-week close. */
export function aiTradeRounds(world: World, rng: Rng, window: WindowName): void {
  const index = marketIndex(world)
  for (const club of world.clubs) aiTradeRound(world, rng, club, window, index)
}

/** The window's summaries for the tenure model: the first XI's turnover per club. */
export function windowSummaries(world: World): WindowSummary[] {
  return world.clubs.map((club) => ({ clubId: club.id, managerId: club.managerId, turnover: windowTurnover(world, club) }))
}

/** The global week the current window opened; the summer's may lie in the season before. */
function openedWeek(world: World, window: WindowName): number {
  const sw = seasonWeek(world.week)
  if (window === 'january') return world.week - (sw - T.JANUARY_WINDOW_WEEKS[0])
  if (sw >= T.SUMMER_WINDOW_OPENS) return world.week - (sw - T.SUMMER_WINDOW_OPENS)
  return world.week - sw - (T.SEASON_WEEKS - T.SUMMER_WINDOW_OPENS)
}

/** The human's manager and club in a window, if employed at a home club. */
export function humanClub(world: World): { manager: Manager; club: Club } | null {
  if (!world.human) return null
  const manager = managerById(world, world.human.managerId)
  if (manager.status.kind !== 'employed' || manager.status.post.kind !== 'home') return null
  return { manager, club: clubById(world, manager.status.post.clubId) }
}

export { valueFor }
