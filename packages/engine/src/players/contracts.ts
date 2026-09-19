/**
 * Player contracts (DESIGN.md "Players"): renew or release; a player whose
 * rating has outgrown his wage asks for a new deal; one short of playing
 * time asks to leave. Both are decisions for the human with morale
 * consequences that feed the tenure model's fallout count. AI clubs settle
 * contracts in the summer by rule.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, playerById, spellOf } from '../lookup.js'
import { human, hasPending, queueDecision } from '../play/decisions.js'
import { betFor, betOption, resolveBet } from '../play/bets.js'
import { squadOf } from './select.js'
import { hasTrait } from './traits.js'
import { releasePlayer, valueFor } from './gen.js'
import { moveOn } from '../season/squad.js'
import type { Club, Decision, DecisionOption, Manager, ManagerId, Player, World } from '../types.js'

/** What a player asks for a week: rating and age; the loyal ask less of a manager they are bonded to (the loyal rule). */
export function wageDemand(p: Player, managerId: ManagerId | null = null): number {
  const base = T.WAGE_BASE_K * Math.exp(T.WAGE_RATING_EXP * p.rating)
  const ageFactor = p.age >= T.WAGE_VETERAN_AGE ? T.WAGE_VETERAN_SHARE : 1
  let demand = base * ageFactor
  if (managerId !== null && hasTrait(p, 'loyal')) {
    const tag = p.madeBy.find((m) => m.managerId === managerId)
    if (tag && tag.bond >= T.BOND_LOYAL_THRESHOLD) demand *= T.LOYAL_WAGE_SHARE
  }
  return Math.max(T.WAGE_MIN_K, Math.round(demand))
}

/** Has the rating outgrown the wage? */
export function wantsNewDeal(p: Player, managerId: ManagerId | null): boolean {
  return wageDemand(p, managerId) > p.contract.wage * (1 + T.NEW_DEAL_GAP)
}

/** A starter-level player who is not starting. */
export function wantsAway(p: Player, club: Club, clubGames: number): boolean {
  if (clubGames < T.WANTS_AWAY_MIN_GAMES) return false
  if (p.rating < club.squad.strength - T.WANTS_AWAY_RATING_BELOW) return false
  return p.season.starts / clubGames < T.WANTS_AWAY_START_SHARE
}

function humanClub(world: World): Club | null {
  const player = human(world)
  if (player.status.kind !== 'employed' || player.status.post.kind !== 'home') return null
  return clubById(world, player.status.post.clubId)
}

export function queueNewDeal(world: World, p: Player, demand: number): Decision {
  return queueDecision(world, {
    kind: 'newDeal',
    from: 'staff',
    title: `${p.name} wants a new deal`,
    body: `${p.name} (${p.position}, ${p.age}, rated ${Math.round(p.rating)}) is on £${p.contract.wage}k a week and asks for £${demand}k. Refuse and he will not take it well.`,
    options: [
      betOption('newDeal', 'accept', 'Give him the new deal', betFor('newDeal', 'accept'), { name: p.name }, world.week, `£${demand}k a week for ${T.NEW_DEAL_YEARS} years`),
      betOption('newDeal', 'refuse', 'Refuse', betFor('newDeal', 'refuse'), { name: p.name }, world.week, 'morale down, the dressing room notices'),
    ],
    blocking: false,
    payload: { playerId: p.id, demand },
  })
}

export function queueWantsAway(world: World, p: Player): Decision {
  return queueDecision(world, {
    kind: 'wantsAway',
    from: 'staff',
    title: `${p.name} wants to leave`,
    body: `${p.name} (${p.position}, ${p.age}, rated ${Math.round(p.rating)}) has started ${p.season.starts} of the season's games and wants first-team football elsewhere. His value is about £${p.value}m.`,
    options: [
      betOption('wantsAway', 'keep', 'Keep him', betFor('wantsAway', 'keep'), { name: p.name }, world.week, 'he stays, unhappy'),
      betOption('wantsAway', 'sell', 'Let him go', betFor('wantsAway', 'sell'), { name: p.name }, world.week, `£${p.value}m into the club's cash`),
    ],
    blocking: false,
    payload: { playerId: p.id, value: p.value },
  })
}

/** Does the club's rule keep this player at the end of his contract? The assistant's advice, and the AI's rule. */
export function ruleKeeps(world: World, p: Player): boolean {
  return p.rating >= strengthOf(world, p.clubId) - T.RELEASE_BELOW_STRENGTH
}

/** An expiring contract: the assistant's advice is the safe path, the other way the gamble, so the default follows the advice. */
export function queueContract(world: World, p: Player, managerId: ManagerId): Decision {
  const demand = wageDemand(p, managerId)
  const keep = ruleKeeps(world, p)
  const options: DecisionOption[] = T.HUMAN_CONTRACT_YEARS_OPTIONS.filter((y) => y <= T.PLAYER_CONTRACT_YEARS[1]).map((years) =>
    betOption('playerContract', `renew:${years}`, `Renew for ${years} year${years === 1 ? '' : 's'}`, betFor('playerContract', keep ? 'safe' : 'risky'), { name: p.name }, world.week, `£${demand}k a week`, 'renew'),
  )
  options.push(betOption('playerContract', 'release', 'Release him', betFor('playerContract', keep ? 'risky' : 'safe'), { name: p.name }, world.week, 'gone in the summer'))
  return queueDecision(world, {
    kind: 'playerContract',
    from: 'staff',
    title: `${p.name} is out of contract this summer`,
    body: `${p.name} (${p.position}, ${p.age}, rated ${Math.round(p.rating)}) asks £${demand}k a week. The assistant would ${keep ? 'keep him' : 'let him go'}.`,
    options,
    defaultKey: keep ? `renew:${T.RENEW_YEARS_PLAYER}` : 'release',
    blocking: false,
    payload: { playerId: p.id, demand, keep },
  })
}

function strengthOf(world: World, clubId: number): number {
  const club = world.clubs[clubId - 1]
  return club && club.id === clubId ? club.squad.strength : 50
}

/** Once a month the human's players may ask for a new deal or to leave. */
export function queuePlayerRequests(world: World, rng: Rng): void {
  const club = humanClub(world)
  if (!club) return
  const me = human(world)
  const spell = spellOf(world, me)
  if (!spell) return
  const clubGames = spell.season.games
  for (const p of squadOf(world, club)) {
    if (hasPending(world, 'newDeal', (d) => d.payload['playerId'] === p.id) || hasPending(world, 'wantsAway', (d) => d.payload['playerId'] === p.id)) continue
    if (wantsNewDeal(p, me.id) && rng.chance(T.REQUEST_P)) {
      queueNewDeal(world, p, wageDemand(p, me.id))
      continue
    }
    if (wantsAway(p, club, clubGames) && rng.chance(T.REQUEST_P)) queueWantsAway(world, p)
  }
}

/**
 * AI clubs answer their players too, so the population rolls the same dice:
 * a new deal is given when the wage bill allows, a wants-away is sold with
 * AI_SELL_WANTS_AWAY_P. One request per club a month, the first found.
 */
export function aiPlayerRequests(world: World, rng: Rng): void {
  for (const club of world.clubs) {
    if (club.managerId === null) continue
    const manager = world.managers[club.managerId - 1]
    if (!manager || manager.isHuman) continue
    const spell = spellOf(world, manager)
    if (!spell) continue
    const squad = squadOf(world, club)
    // £k a week across the squad; the budget is £m a season.
    const wageBill = squad.reduce((sum, p) => sum + p.contract.wage, 0)
    for (const p of squad) {
      if (wantsNewDeal(p, manager.id) && rng.chance(T.REQUEST_P)) {
        const demand = wageDemand(p, manager.id)
        const accept = ((wageBill - p.contract.wage + demand) * T.WAGE_WEEKS_PER_YEAR) / 1000 <= club.wageBudget
        settleNewDeal(world, rng, p, demand, accept, manager.id)
        break
      }
      if (wantsAway(p, club, spell.season.games) && rng.chance(T.REQUEST_P)) {
        settleWantsAway(world, rng, p, club, rng.chance(T.AI_SELL_WANTS_AWAY_P), manager.id)
        break
      }
    }
  }
}

/** Before the last match week closes, every expiring contract at the human's club becomes a decision. */
export function queueExpiringContracts(world: World): void {
  const club = humanClub(world)
  if (!club) return
  const me = human(world)
  for (const p of squadOf(world, club)) {
    if (p.contract.years !== 1) continue
    if (hasPending(world, 'playerContract', (d) => d.payload['playerId'] === p.id)) continue
    queueContract(world, p, me.id)
  }
}

/** A refusal feeds the fallout count: the dressing room noticed (DESIGN: consequences feed the tenure model's fallout events). */
function refusalFallout(world: World, p: Player, reason: string, managerId: ManagerId): void {
  const spell = spellOf(world, world.managers[managerId - 1] as Manager)
  p.morale = round1(clamp(p.morale - T.REFUSAL_MORALE_LOSS, 0, 100))
  if (spell) spell.season.fallouts++
  const tag = p.madeBy.find((m) => m.managerId === managerId)
  if (tag) tag.bond = Math.max(0, tag.bond - T.BOND_REFUSAL_LOSS)
  emit(world, 'player.refused', { playerId: p.id, clubId: p.clubId, managerId, name: p.name, reason, morale: p.morale, season: world.season })
}

/** A new deal given or refused: the fixed gain or loss, then the dice on his morale. Human and AI alike. */
export function settleNewDeal(world: World, rng: Rng, p: Player, demand: number, accept: boolean, managerId: ManagerId, decisionId?: number): void {
  if (accept) {
    p.contract = { years: T.NEW_DEAL_YEARS, wage: demand }
    p.morale = round1(clamp(p.morale + T.NEW_DEAL_MORALE_GAIN, 0, 100))
    const tag = p.madeBy.find((m) => m.managerId === managerId)
    if (tag) tag.bond += T.BOND_RENEWAL
    emit(world, 'player.renewed', { playerId: p.id, clubId: p.clubId, managerId, name: p.name, years: p.contract.years, wage: p.contract.wage, season: world.season })
  } else refusalFallout(world, p, 'new deal', managerId)
  resolveBet(world, rng, betFor('newDeal', accept ? 'accept' : 'refuse'), { kind: 'newDeal', key: accept ? 'accept' : 'refuse', managerId, playerId: p.id, bold: !accept, label: accept ? `a new deal for ${p.name}` : `refusing ${p.name}`, ...(decisionId !== undefined ? { decisionId } : {}) })
}

/** A wants-away kept or sold: the fee or the refusal, then the dice on the squad's morale. Human and AI alike. */
export function settleWantsAway(world: World, rng: Rng, p: Player, club: Club, sell: boolean, managerId: ManagerId, decisionId?: number): void {
  if (sell) {
    const fee = valueFor(p.rating, p.age)
    club.cash = round1(club.cash + fee)
    releasePlayer(world, p, club)
    emit(world, 'player.left', { playerId: p.id, clubId: club.id, managerId, name: p.name, rating: p.rating, fee, reason: 'sold', season: world.season })
    moveOn(world, rng, p, club)
  } else refusalFallout(world, p, 'wants away', managerId)
  resolveBet(world, rng, betFor('wantsAway', sell ? 'sell' : 'keep'), { kind: 'wantsAway', key: sell ? 'sell' : 'keep', managerId, clubId: club.id, bold: sell, label: sell ? `selling ${p.name}` : `keeping ${p.name}`, ...(decisionId !== undefined ? { decisionId } : {}) })
}

export function applyNewDeal(world: World, rng: Rng, decision: Decision, accept: boolean): void {
  const p = playerById(world, decision.payload['playerId'] as number)
  if (!p || p.retired) return
  settleNewDeal(world, rng, p, decision.payload['demand'] as number, accept, human(world).id, decision.id)
}

export function applyWantsAway(world: World, rng: Rng, decision: Decision, sell: boolean): void {
  const p = playerById(world, decision.payload['playerId'] as number)
  if (!p || p.retired) return
  const club = humanClub(world)
  if (!club || p.clubId !== club.id) return
  settleWantsAway(world, rng, p, club, sell, human(world).id, decision.id)
}

/** The human's answer on an expiring contract: recorded for the summer, and the dice roll now (the news gets out). */
export function applyContract(world: World, rng: Rng, decision: Decision, key: string): void {
  const state = world.human
  if (!state) return
  const playerId = decision.payload['playerId'] as number
  const p = playerById(world, playerId)
  const keep = decision.payload['keep'] === true
  if (key === 'release') state.contractChoices[playerId] = 'release'
  else {
    const years = Number(key.split(':')[1] ?? T.RENEW_YEARS_PLAYER)
    state.contractChoices[playerId] = { years: clamp(years, 1, T.PLAYER_CONTRACT_YEARS[1]), wage: decision.payload['demand'] as number }
  }
  if (p && !p.retired) rollContract(world, rng, p, key !== 'release', keep, human(world).id, decision.id)
}

/** The dice on an expiring contract: safe when the answer follows the rule, risky otherwise; on his morale if he stays, the squad's if he goes. */
export function rollContract(world: World, rng: Rng, p: Player, renew: boolean, ruleSaysKeep: boolean, managerId: ManagerId, decisionId?: number): void {
  const safe = renew === ruleSaysKeep
  const target = renew ? { playerId: p.id } : { clubId: p.clubId }
  resolveBet(world, rng, betFor('playerContract', safe ? 'safe' : 'risky'), { kind: 'playerContract', key: renew ? 'renew' : 'release', managerId, ...target, bold: !safe, label: renew ? `renewing ${p.name}` : `releasing ${p.name}`, ...(decisionId !== undefined ? { decisionId } : {}) })
}
