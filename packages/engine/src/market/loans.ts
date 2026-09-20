/**
 * The market with no budget (DESIGN.md "Transfers"): a club with nothing to
 * spend still has three routes, and the director leads with them when the pot
 * is empty — free agents for wages alone, loans with the parent club paying
 * part of the wage, and exchanges, a player out for a player in. Wage room,
 * not cash, is the constraint on all three; a club with no wage room either
 * has only the academy.
 */
import { T } from '../tunables.js'
import type { Rng } from '../rng.js'
import type { Club, ClubId, Player, PlayerId, World } from '../types.js'
import { emit } from '../events.js'
import { clubById } from '../lookup.js'
import { round1 } from '../world/gen.js'
import { seasonWeek } from '../season/calendar.js'

/** The terms of a loan the director brings: how long, who pays what, and any fee. */
export interface LoanTerms {
  /** Half a season rather than the whole of it. */
  half: boolean
  /** The share of the wage the borrowing club pays; the parent pays the rest. */
  wageShare: number
  fee: number
}

/** A club with this little in the pot is buying nothing: the director leads with the three routes. */
export function noBudget(club: Club): boolean {
  return club.transferPot < T.NO_BUDGET_POT
}

/** What a loan costs the borrower a week: his wage, less the parent's share. */
export function loanWage(wage: number, terms: LoanTerms): number {
  return Math.round(wage * terms.wageShare)
}

/** The week a loan runs to: the January deadline for half a season, the last match week for a whole one. */
export function loanUntil(world: World, half: boolean): number {
  const sw = seasonWeek(world.week)
  const end = half && sw < T.JANUARY_WINDOW_WEEKS[1] ? T.JANUARY_WINDOW_WEEKS[1] : T.MATCH_WEEKS - 1
  return world.week - sw + end
}

/** Terms the director asks for: half a season or a whole one, the parent's share of the wage, a fee when he is worth one. */
export function loanTermsFor(rng: Rng, p: Player, world: World): LoanTerms {
  const half = seasonWeek(world.week) >= T.JANUARY_WINDOW_WEEKS[0] || rng.chance(T.LOAN_HALF_SEASON_P)
  const wageShare = round1(T.LOAN_WAGE_SHARE_RANGE[0] + rng.float() * (T.LOAN_WAGE_SHARE_RANGE[1] - T.LOAN_WAGE_SHARE_RANGE[0]))
  const fee = rng.chance(T.LOAN_FEE_P) ? round1(p.value * T.LOAN_FEE_SHARE) : 0
  return { half, wageShare, fee }
}

/**
 * Would a club lend him? A squad player rather than a starter, and not one
 * the club has already lent out.
 */
export function lendable(world: World, p: Player): boolean {
  if (p.clubId <= 0 || p.loan) return false
  const parent = world.clubs[p.clubId - 1]
  if (!parent || parent.id !== p.clubId) return false
  return p.rating <= parent.squad.strength - T.LOAN_BENCH_GAP
}

/** He joins on loan: the parent keeps him on the books, the borrower gets the player and part of the wage. */
export function loanIn(world: World, p: Player, from: Club, to: Club, terms: LoanTerms, managerId: number | null): void {
  from.playerIds = from.playerIds.filter((id) => id !== p.id)
  to.playerIds.push(p.id)
  p.clubId = to.id
  p.loan = { fromClubId: from.id, toClubId: to.id, season: world.season, untilWeek: loanUntil(world, terms.half), wageShare: terms.wageShare, fee: terms.fee, startApps: p.season.apps }
  p.season = { ...p.season, clubId: to.id, tier: to.tier }
  if (terms.fee > 0) to.transferPot = round1(Math.max(0, to.transferPot - terms.fee))
  emit(world, 'player.loanedIn', { playerId: p.id, name: p.name, clubId: to.id, fromClubId: from.id, managerId, half: terms.half, wageShare: terms.wageShare, wage: Math.round(p.contract.wage * terms.wageShare), fee: terms.fee, until: p.loan.untilWeek, season: world.season })
}

/** An exchange: one out, one in, and the difference in cash. */
export function exchange(world: World, out: Player, incoming: Player, club: Club, other: Club, cash: number, managerId: number | null): void {
  club.playerIds = club.playerIds.filter((id) => id !== out.id)
  other.playerIds = other.playerIds.filter((id) => id !== incoming.id)
  club.playerIds.push(incoming.id)
  other.playerIds.push(out.id)
  incoming.clubId = club.id
  out.clubId = other.id
  incoming.season = { ...incoming.season, clubId: club.id, tier: club.tier }
  out.season = { ...out.season, clubId: other.id, tier: other.tier }
  club.transferPot = round1(Math.max(0, club.transferPot - Math.max(0, cash)))
  other.transferPot = round1(other.transferPot + Math.max(0, cash))
  emit(world, 'player.exchanged', { clubId: club.id, managerId, playerId: incoming.id, name: incoming.name, outId: out.id, outName: out.name, otherClubId: other.id, cash: round1(cash), season: world.season })
}

/**
 * Every week a loan is running: the parent can recall a man who is playing
 * well, which is the bet the borrower took. Returns him when his term is up.
 */
export function loanWeek(world: World, rng: Rng): void {
  for (const p of world.players) {
    if (!p || p.retired || !p.loan) continue
    const loan = p.loan
    const to = clubOf(world, loan.toClubId)
    const from = clubOf(world, loan.fromClubId)
    if (!to || !from) continue
    if (world.week >= loan.untilWeek) {
      endLoan(world, p, from, to, 'term')
      continue
    }
    // In form and past the earliest week: the parent may want him back.
    const apps = p.season.apps - loan.startApps
    const rating = p.season.rated > 0 ? p.season.ratingSum / p.season.rated : 0
    const inForm = apps >= T.LOAN_RECALL_APPS && rating >= T.LOAN_RECALL_RATING
    if (inForm && rng.chance(T.LOAN_RECALL_P)) {
      endLoan(world, p, from, to, 'recall')
    }
  }
}

function clubOf(world: World, id: ClubId): Club | undefined {
  const club = world.clubs[id - 1]
  return club && club.id === id ? club : undefined
}

/**
 * A loan ends. A loan that went well raises what the borrower must pay to
 * keep him: the parent has seen the same season everyone else has.
 */
export function endLoan(world: World, p: Player, from: Club, to: Club, reason: 'term' | 'recall'): void {
  const loan = p.loan
  if (!loan) return
  const apps = p.season.apps - loan.startApps
  const rating = p.season.rated > 0 ? p.season.ratingSum / p.season.rated : 0
  const wentWell = apps >= T.LOAN_GOOD_APPS && rating >= T.LOAN_GOOD_RATING
  to.playerIds = to.playerIds.filter((id) => id !== p.id)
  from.playerIds.push(p.id)
  p.clubId = from.id
  p.loan = null
  // A multiplier, kept to two places: a tenth would round a quarter up to a third.
  if (wentWell) p.loanPremium = Math.round((p.loanPremium ?? 1) * T.LOAN_GOOD_PREMIUM * 100) / 100
  emit(world, 'player.loanEnded', { playerId: p.id, name: p.name, clubId: to.id, fromClubId: from.id, managerId: to.managerId, reason, apps, rating: round1(rating), wentWell, season: world.season })
}

/** What it costs to buy a player who has been on loan at the club: his value, plus what the loan showed. */
export function buyPremium(p: Player): number {
  return p.loanPremium ?? 1
}

/** Wage room left at a club, in £k a week. */
export function wageRoom(club: Club, bill: number): number {
  return ((club.wageBudget - bill) * 1000) / T.WAGE_WEEKS_PER_YEAR
}

/** A player the club would let go in an exchange: its own surplus, worth about what comes back. */
export function exchangeOut(world: World, club: Club, incoming: Player, squad: Player[]): Player | null {
  let best: Player | null = null
  for (const p of squad) {
    if (p.id === incoming.id || p.loan) continue
    if (p.rating > club.squad.strength - T.LOAN_BENCH_GAP) continue
    if (Math.abs(p.value - incoming.value) > incoming.value * T.EXCHANGE_VALUE_WINDOW + T.EXCHANGE_VALUE_FLOOR) continue
    if (!best || p.rating < best.rating) best = p
  }
  return best
}
