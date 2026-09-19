/**
 * Requests (DESIGN.md "Requests"): the manager can ask at any time, and
 * each ask is a bet with a stated likelihood. The board: budget, wages,
 * backing. The director: a profile, a named player, a sale, a loan. A
 * player: a contract, the captaincy, playing time. Granted raises
 * expectation; refused costs credit; a third refusal in a season is
 * progress toward "difficult"; a promise unkept is a fallout.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, playerById, spellOf } from '../lookup.js'
import type { Club, Confidence, Manager, Player, PlayerId, Request, RequestAsk, Spell, TargetProfile, World } from '../types.js'
import { human, humanState } from './decisions.js'
import { queueContract } from '../players/contracts.js'
import { hasTrait } from '../players/traits.js'
import { squadOf } from '../players/select.js'
import { tagOf } from '../players/made.js'
import { addCredit } from '../tenure/credit.js'
import { clubAcceptP, estimateOf, humanClub, placeBid, playerAcceptP, rangeHalf, wageBill, windowAt, type Candidate } from '../market/director.js'
import { queueSale } from './transfers.js'
import { seasonWeek } from '../season/calendar.js'
import { wageDemand } from '../players/contracts.js'
import { normalBudget } from '../season/squad.js'

export interface Likelihood {
  p: number
  words: Confidence
  available: boolean
  /** Why not, when unavailable: a key in text/requests.json. */
  why?: string
}

export function wordsFor(p: number): Confidence {
  if (p >= T.REQUEST_WORDS[0]) return 'sure thing'
  if (p >= T.REQUEST_WORDS[1]) return 'likely'
  return 'gamble'
}

function likelihood(p: number, available = true, why?: string): Likelihood {
  const clamped = clamp(p, T.REQUEST_P_RANGE[0], T.REQUEST_P_RANGE[1])
  const out: Likelihood = { p: round1(clamped * 100) / 100, words: wordsFor(clamped), available }
  if (why) out.why = why
  return out
}

function boardP(spell: Spell, club: Club, ask: RequestAsk): number {
  const refusals = spell.season.refusals ?? 0
  const swing = clamp((spell.credit - spell.threshold) / T.REQUEST_BOARD_CREDIT_SCALE, -1, 1)
  return T.REQUEST_BOARD_BASE_P + T.REQUEST_BOARD_CREDIT_SWING * swing + T.REQUEST_BOARD_PER_REFUSAL * refusals + (ask === 'backing' ? T.REQUEST_BACKING_BONUS_P : 0) + (club.owner.ambition - 0.5) * 0.1
}

function rankInSquad(world: World, club: Club, p: Player): number {
  const sorted = squadOf(world, club).sort((a, b) => b.rating - a.rating || a.id - b.id)
  return sorted.findIndex((q) => q.id === p.id) + 1
}

/** The stated likelihood of a request, before it is made. */
export function requestLikelihood(world: World, req: Request): Likelihood {
  const mine = humanClub(world)
  if (!mine) return likelihood(0, false, 'gone')
  const { club, manager } = mine
  const spell = spellOf(world, manager)
  if (!spell) return likelihood(0, false, 'gone')
  const sw = seasonWeek(world.week)
  const window = windowAt(sw)
  const own = req.playerId === undefined ? undefined : playerById(world, req.playerId)
  switch (req.ask) {
    case 'budget':
    case 'wages':
    case 'backing':
      return likelihood(boardP(spell, club, req.ask))
    case 'profile':
      return likelihood(1)
    case 'named': {
      if (!own || own.retired) return likelihood(0, false, 'gone')
      if (own.clubId === club.id) return likelihood(0, false, 'own')
      if (!window) return likelihood(0, false, 'closed')
      const fee = feeOf(own)
      if (fee > club.transferPot) return likelihood(0, false, 'money')
      const wage = Math.round(wageDemand(own) * (1 + T.SIGNING_WAGE_PREMIUM))
      if (wageBill(world, club) + (wage * T.WAGE_WEEKS_PER_YEAR) / 1000 > club.wageBudget) return likelihood(0, false, 'wagebill')
      return likelihood(clubAcceptP(world, own, fee, window) * playerAcceptP(world, own, club, wage))
    }
    case 'sell':
    case 'loan': {
      if (!own || own.retired || own.clubId !== club.id) return likelihood(0, false, 'gone')
      if (!window) return likelihood(0, false, 'closed')
      return likelihood(req.ask === 'sell' ? T.REQUEST_SELL_P : T.REQUEST_LOAN_P)
    }
    case 'contract': {
      if (!own || own.retired || own.clubId !== club.id) return likelihood(0, false, 'gone')
      const tag = tagOf(own, manager.id)
      return likelihood(T.REQUEST_CONTRACT_BASE_P + (T.REQUEST_CONTRACT_MORALE_SWING * (own.morale - 50)) / 50 + (tag && tag.bond >= T.BOND_LOYAL_THRESHOLD ? T.REQUEST_CONTRACT_BOND_BONUS : 0))
    }
    case 'captaincy': {
      if (!own || own.retired || own.clubId !== club.id) return likelihood(0, false, 'gone')
      let p = T.REQUEST_CAPTAIN_BASE_P
      if (rankInSquad(world, club, own) <= T.REQUEST_CAPTAIN_TOP_RANK) p += T.REQUEST_CAPTAIN_TOP_BONUS
      if (hasTrait(own, 'leader')) p += T.REQUEST_CAPTAIN_LEADER_BONUS
      if (own.age >= T.REQUEST_CAPTAIN_SENIOR_AGE) p += T.REQUEST_CAPTAIN_SENIOR_BONUS
      return likelihood(p)
    }
    case 'playingTime': {
      if (!own || own.retired || own.clubId !== club.id) return likelihood(0, false, 'gone')
      if ((humanState(world).promises ?? []).some((pr) => pr.playerId === own.id)) return likelihood(0, false, 'gone')
      return likelihood(T.REQUEST_PLAYING_BASE_P + (T.REQUEST_PLAYING_MORALE_SWING * (own.morale - 50)) / 50)
    }
  }
}

function feeOf(p: Player): number {
  if (p.clubId === 0) return 0
  return round1(p.value * (p.contract.years <= 1 ? T.EXPIRING_FEE_SHARE : T.DIRECTOR_FEE_PREMIUM))
}

export interface RequestOffer {
  to: Request['to']
  ask: RequestAsk
  label: string
  detail: string
  likelihood: Likelihood
  /** Asks of a player or for a player need one named. */
  needsPlayer: boolean
}

/** What can be asked, with the likelihood of each (player asks are shown with the best case; requestLikelihood gives a named one). */
export function requestOptions(world: World): RequestOffer[] {
  const mine = humanClub(world)
  if (!mine) return []
  const { club } = mine
  const normal = normalBudget(club)
  const rows: RequestOffer[] = [
    { to: 'board', ask: 'budget', label: 'More transfer budget', detail: `£${round1(normal * T.REQUEST_BUDGET_SHARE)}m on the pot; the target a place harder if they say yes`, likelihood: requestLikelihood(world, { to: 'board', ask: 'budget' }), needsPlayer: false },
    { to: 'board', ask: 'wages', label: 'More wage budget', detail: `£${round1(club.wageBudget * T.REQUEST_WAGE_SHARE)}m a season; the target a place harder if they say yes`, likelihood: requestLikelihood(world, { to: 'board', ask: 'wages' }), needsPlayer: false },
    { to: 'board', ask: 'backing', label: 'Backing in a dispute', detail: `credit +${T.REQUEST_BACKING_CREDIT} if they stand behind you; the target a place harder`, likelihood: requestLikelihood(world, { to: 'board', ask: 'backing' }), needsPlayer: false },
    { to: 'director', ask: 'profile', label: 'A target profile', detail: 'next week’s cards follow it', likelihood: requestLikelihood(world, { to: 'director', ask: 'profile' }), needsPlayer: false },
    { to: 'director', ask: 'named', label: 'Go for a named player', detail: 'from the shortlist; a card if the numbers work', likelihood: likelihood(windowAt(seasonWeek(world.week)) ? 0.5 : 0, windowAt(seasonWeek(world.week)) !== null, windowAt(seasonWeek(world.week)) ? undefined : 'closed'), needsPlayer: true },
    { to: 'director', ask: 'sell', label: 'Sell a player', detail: 'the director finds a buyer', likelihood: likelihood(T.REQUEST_SELL_P, windowAt(seasonWeek(world.week)) !== null, windowAt(seasonWeek(world.week)) ? undefined : 'closed'), needsPlayer: true },
    { to: 'director', ask: 'loan', label: 'Loan a player out', detail: 'for the rest of the season', likelihood: likelihood(T.REQUEST_LOAN_P, windowAt(seasonWeek(world.week)) !== null, windowAt(seasonWeek(world.week)) ? undefined : 'closed'), needsPlayer: true },
    { to: 'player', ask: 'contract', label: 'Talk terms', detail: 'he sits down, or he does not', likelihood: likelihood(T.REQUEST_CONTRACT_BASE_P), needsPlayer: true },
    { to: 'player', ask: 'captaincy', label: 'Offer the armband', detail: 'his standing decides', likelihood: likelihood(T.REQUEST_CAPTAIN_BASE_P), needsPlayer: true },
    { to: 'player', ask: 'playingTime', label: 'Promise playing time', detail: `${T.PROMISE_STARTS} starts in ${T.PROMISE_WEEKS} weeks, or it is a fallout`, likelihood: likelihood(T.REQUEST_PLAYING_BASE_P), needsPlayer: true },
  ]
  return rows
}

function profileWords(profile: TargetProfile): string {
  const parts: string[] = []
  if (profile.position) parts.push(profile.position === 'GK' ? 'a keeper' : profile.position === 'D' ? 'a defender' : profile.position === 'M' ? 'a midfielder' : 'a forward')
  if (profile.maxAge !== undefined) parts.push(`under ${profile.maxAge + 1}`)
  if (profile.minRating !== undefined) parts.push(`rated ${profile.minRating} or better`)
  return parts.length ? parts.join(', ') : 'anyone who improves the eleven'
}

/** Make a request: the roll at the stated likelihood, and what follows. */
export function makeRequest(world: World, rng: Rng, req: Request): void {
  const mine = humanClub(world)
  if (!mine) return
  const { club, manager } = mine
  const spell = spellOf(world, manager)
  if (!spell) return
  const like = requestLikelihood(world, req)
  const p = req.playerId === undefined ? undefined : playerById(world, req.playerId)
  if (!like.available) {
    emit(world, 'request.unavailable', { to: req.to, ask: req.ask, managerId: manager.id, clubId: club.id, playerId: req.playerId ?? null, name: p ? p.name : null, why: like.why ?? 'gone', season: world.season })
    return
  }
  const roll = rng.float()
  const granted = roll < like.p
  const base = { to: req.to, ask: req.ask, managerId: manager.id, clubId: club.id, playerId: req.playerId ?? null, name: p ? p.name : null, p: like.p, roll: round1(roll * 100) / 100, granted, season: world.season }
  switch (req.ask) {
    case 'budget':
    case 'wages':
    case 'backing':
      boardAnswer(world, spell, club, manager, req.ask, granted, base)
      return
    case 'profile': {
      const profile = req.profile ?? {}
      humanState(world).targetProfile = profile
      emit(world, 'request.answered', { ...base, granted: true, profile: profileWords(profile) })
      return
    }
    case 'named': {
      if (!p) return
      // The director's card for him arrives now: the same estimate, fee and wage the market would set; the roll is the deal's.
      const fee = feeOf(p)
      const wage = Math.round(wageDemand(p) * (1 + T.SIGNING_WAGE_PREMIUM))
      const { estimate, potentialEstimate } = estimateOf(rng, club.director, p)
      const candidate: Candidate = { player: p, fee, wage, estimate, potentialEstimate, halfWidth: rangeHalf(club.director.judgement), reason: 'request', confidence: like.words, gain: 0, need: { slot: { position: p.position, side: p.side === 'any' ? 'C' : p.side }, playerId: null, rating: 0 } }
      placeBid(world, club, candidate, manager.id)
      emit(world, 'request.answered', { ...base, granted: true, fee, wage })
      return
    }
    case 'sell': {
      if (!p) return
      if (!granted) {
        emit(world, 'request.answered', base)
        return
      }
      const buyer = buyerFor(world, rng, club, p)
      if (!buyer) {
        emit(world, 'request.answered', { ...base, granted: false })
        return
      }
      const fee = round1(Math.max(T.VALUE_MIN_M, p.value * T.REQUEST_SELL_PREMIUM))
      queueSale(world, { player: p, fee, reason: 'bid', bidderId: buyer.id, unsettled: p.morale < T.UNSETTLED_MORALE }, club.id)
      emit(world, 'request.answered', { ...base, fee, buyerId: buyer.id, buyer: buyer.name })
      return
    }
    case 'loan': {
      if (!p) return
      const to = granted ? buyerFor(world, rng, club, p) : null
      if (!to) {
        emit(world, 'request.answered', { ...base, granted: false })
        return
      }
      loanOut(world, p, club, to)
      emit(world, 'request.answered', { ...base, toClubId: to.id, buyer: to.name })
      return
    }
    case 'contract': {
      if (!p) return
      if (granted) {
        if (!humanState(world).pending.some((d) => d.kind === 'playerContract' && d.payload['playerId'] === p.id)) queueContract(world, p, manager.id)
      } else nudge(p, T.REQUEST_PLAYER_REFUSE_MORALE)
      emit(world, 'request.answered', base)
      return
    }
    case 'captaincy': {
      if (!p) return
      if (granted) {
        humanState(world).selection.captain = p.id
        nudge(p, T.REQUEST_PLAYER_GRANT_MORALE)
      } else nudge(p, T.REQUEST_PLAYER_REFUSE_MORALE)
      emit(world, 'request.answered', base)
      return
    }
    case 'playingTime': {
      if (!p) return
      if (granted) {
        nudge(p, T.REQUEST_PLAYER_GRANT_MORALE)
        const state = humanState(world)
        state.promises = [...(state.promises ?? []), { playerId: p.id, week: world.week, byWeek: world.week + T.PROMISE_WEEKS, startsAtPromise: p.season.starts, startsNeeded: T.PROMISE_STARTS }]
      } else nudge(p, T.REQUEST_PLAYER_REFUSE_MORALE)
      emit(world, 'request.answered', { ...base, starts: T.PROMISE_STARTS, weeks: T.PROMISE_WEEKS })
      return
    }
  }
}

function nudge(p: Player, delta: number): void {
  p.morale = round1(clamp(p.morale + delta, 0, 100))
}

function boardAnswer(world: World, spell: Spell, club: Club, manager: Manager, ask: 'budget' | 'wages' | 'backing', granted: boolean, base: Record<string, unknown>): void {
  if (granted) {
    let amount = 0
    if (ask === 'budget') {
      amount = round1(normalBudget(club) * T.REQUEST_BUDGET_SHARE)
      club.transferPot = round1(club.transferPot + amount)
    } else if (ask === 'wages') {
      amount = round1(club.wageBudget * T.REQUEST_WAGE_SHARE)
      club.wageBudget = round1(club.wageBudget + amount)
    } else amount = addCredit(spell, T.REQUEST_BACKING_CREDIT)
    spell.expectation = Math.max(1, spell.expectation - T.REQUEST_GRANT_PLACES)
    emit(world, 'request.answered', { ...base, amount, pot: club.transferPot, wageBudget: club.wageBudget, expectation: spell.expectation, credit: spell.credit })
    return
  }
  const credit = addCredit(spell, T.REQUEST_REFUSAL_CREDIT)
  spell.season.refusals = (spell.season.refusals ?? 0) + 1
  const third = spell.season.refusals === T.REQUEST_THIRD_REFUSAL
  if (third) spell.season.boardRows++
  emit(world, 'request.answered', { ...base, creditDelta: credit, credit: spell.credit, refusals: spell.season.refusals, third })
  void manager
}

/** A home club at his level with room in the pot, for a sale or a loan; the human's own club never. */
function buyerFor(world: World, rng: Rng, from: Club, p: Player): Club | null {
  const fits = world.clubs.filter((c) => c.id !== from.id && c.managerId !== null && Math.abs(c.squad.strength - p.rating) <= T.MOVE_ON_STRENGTH_WINDOW)
  if (fits.length === 0) return null
  const paying = fits.filter((c) => c.transferPot >= p.value * T.REQUEST_SELL_PREMIUM)
  const pool = paying.length ? paying : fits
  return rng.pick(pool.sort((a, b) => a.id - b.id))
}

/** A loan: he plays for the other club until the season's end, then comes back. */
export function loanOut(world: World, p: Player, from: Club, to: Club): void {
  from.playerIds = from.playerIds.filter((id) => id !== p.id)
  to.playerIds.push(p.id)
  p.clubId = to.id
  p.loan = { fromClubId: from.id, toClubId: to.id, season: world.season }
  p.season = { ...p.season, clubId: to.id, tier: to.tier }
  emit(world, 'player.loaned', { playerId: p.id, name: p.name, fromClubId: from.id, clubId: to.id, managerId: from.managerId, season: world.season })
}

/** Season's end: every loan returns. */
export function returnLoans(world: World): void {
  for (const p of world.players) {
    if (!p || p.retired || !p.loan) continue
    const loan = p.loan
    const to = world.clubs[loan.toClubId - 1]
    const from = world.clubs[loan.fromClubId - 1]
    if (to && to.id === loan.toClubId) to.playerIds = to.playerIds.filter((id) => id !== p.id)
    p.loan = null
    if (!from || from.id !== loan.fromClubId) continue
    from.playerIds.push(p.id)
    p.clubId = from.id
    emit(world, 'player.loanReturned', { playerId: p.id, name: p.name, clubId: from.id, fromClubId: loan.toClubId, managerId: from.managerId, season: world.season })
  }
}

/** Weekly: promises past their week are kept or broken. */
export function checkPromises(world: World): void {
  const state = world.human
  if (!state || !state.promises || state.promises.length === 0) return
  const me = human(world)
  const spell = spellOf(world, me)
  const clubId = me.status.kind === 'employed' && me.status.post.kind === 'home' ? me.status.post.clubId : null
  const keep: typeof state.promises = []
  for (const promise of state.promises) {
    const p = playerById(world, promise.playerId)
    if (!p || p.retired || clubId === null || p.clubId !== clubId) continue // he or you left: the promise lapses
    if (world.week < promise.byWeek) {
      keep.push(promise)
      continue
    }
    const starts = p.season.starts - promise.startsAtPromise
    if (starts >= promise.startsNeeded) {
      nudge(p, T.PROMISE_KEPT_MORALE)
      const tag = tagOf(p, me.id)
      if (tag) tag.bond += T.BOND_BACKED
      emit(world, 'promise.kept', { playerId: p.id, name: p.name, managerId: me.id, clubId, starts, season: world.season })
    } else {
      nudge(p, T.PROMISE_BROKEN_MORALE)
      if (spell) spell.season.fallouts++
      const tag = tagOf(p, me.id)
      if (tag) tag.bond = Math.max(0, tag.bond - T.BOND_REFUSAL_LOSS)
      emit(world, 'promise.broken', { playerId: p.id, name: p.name, managerId: me.id, clubId, starts, needed: promise.startsNeeded, season: world.season })
    }
  }
  state.promises = keep
}

// ---------------------------------------------------------------------------
// The shortlist and search
// ---------------------------------------------------------------------------

export interface SearchFilter {
  position?: Player['position']
  maxAge?: number
  minRating?: number
  maxRating?: number
  limit?: number
}

export interface SearchRow {
  playerId: PlayerId
  name: string
  age: number
  position: Player['position']
  side: Player['side']
  clubId: number
  club: string
  tier: number | null
  /** Rating as the director's range around it. */
  lo: number
  hi: number
  fee: number
  wage: number
  contractYears: number
  traits: Player['traits']
  shortlisted: boolean
}

/** Players at other clubs and in the free-agent pool, by position, age and rating; ratings as the director's ranges. */
export function searchPlayers(world: World, filter: SearchFilter = {}): SearchRow[] {
  const mine = humanClub(world)
  const half = mine ? rangeHalf(mine.club.director.judgement) : T.DIRECTOR_RANGE_HALF
  const ownId = mine ? mine.club.id : -1
  const shortlist = new Set(world.human?.shortlist ?? [])
  const rows: SearchRow[] = []
  for (const p of world.players) {
    if (!p || p.retired || p.clubId === ownId || p.abroad || p.loan) continue
    if (p.clubId < 0) continue
    if (filter.position && p.position !== filter.position) continue
    if (filter.maxAge !== undefined && p.age > filter.maxAge) continue
    if (filter.minRating !== undefined && p.rating < filter.minRating) continue
    if (filter.maxRating !== undefined && p.rating > filter.maxRating) continue
    const club = p.clubId > 0 ? clubById(world, p.clubId) : null
    rows.push({
      playerId: p.id,
      name: p.name,
      age: p.age,
      position: p.position,
      side: p.side,
      clubId: p.clubId,
      club: club ? club.name : 'Free agent',
      tier: club ? club.tier : null,
      lo: Math.round(p.rating - half),
      hi: Math.round(p.rating + half),
      fee: feeOf(p),
      wage: Math.round(wageDemand(p) * (1 + T.SIGNING_WAGE_PREMIUM)),
      contractYears: p.contract.years,
      traits: [...p.traits],
      shortlisted: shortlist.has(p.id),
    })
  }
  rows.sort((a, b) => b.hi - a.hi || a.age - b.age || a.playerId - b.playerId)
  return rows.slice(0, filter.limit ?? T.SEARCH_LIMIT)
}

/** The shortlist as rows. */
export function shortlistRows(world: World): SearchRow[] {
  const ids = new Set(world.human?.shortlist ?? [])
  if (ids.size === 0) return []
  return searchPlayers(world, { limit: 1000 }).filter((r) => ids.has(r.playerId))
}
