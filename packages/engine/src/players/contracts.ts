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
import { squadOf } from './select.js'
import { hasTrait } from './traits.js'
import { forgetPlayer, releasePlayer, valueFor } from './gen.js'
import type { Club, Decision, ManagerId, Player, World } from '../types.js'

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
      { key: 'accept', label: 'Give him the new deal', detail: `£${demand}k a week for ${T.NEW_DEAL_YEARS} years` },
      { key: 'refuse', label: 'Refuse', detail: 'morale down, the dressing room notices' },
    ],
    defaultKey: 'accept',
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
      { key: 'keep', label: 'Keep him', detail: 'he stays, unhappy' },
      { key: 'sell', label: 'Let him go', detail: `£${p.value}m into the club's cash` },
    ],
    defaultKey: 'keep',
    blocking: false,
    payload: { playerId: p.id, value: p.value },
  })
}

export function queueContract(world: World, p: Player, managerId: ManagerId): Decision {
  const demand = wageDemand(p, managerId)
  const options = T.HUMAN_CONTRACT_YEARS_OPTIONS.filter((y) => y <= T.PLAYER_CONTRACT_YEARS[1]).map((years) => ({
    key: `renew:${years}`,
    label: `Renew for ${years} year${years === 1 ? '' : 's'}`,
    detail: `£${demand}k a week`,
  }))
  options.push({ key: 'release', label: 'Release him', detail: 'gone in the summer' })
  const keep = p.rating >= strengthOf(world, p.clubId) - T.RELEASE_BELOW_STRENGTH
  return queueDecision(world, {
    kind: 'playerContract',
    from: 'staff',
    title: `${p.name} is out of contract this summer`,
    body: `${p.name} (${p.position}, ${p.age}, rated ${Math.round(p.rating)}) asks £${demand}k a week. The assistant would ${keep ? 'keep him' : 'let him go'}.`,
    options,
    defaultKey: keep ? `renew:${T.RENEW_YEARS_PLAYER}` : 'release',
    blocking: false,
    payload: { playerId: p.id, demand },
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
function refusalFallout(world: World, p: Player, reason: string): void {
  const me = human(world)
  const spell = spellOf(world, me)
  p.morale = round1(clamp(p.morale - T.REFUSAL_MORALE_LOSS, 0, 100))
  if (spell) spell.season.fallouts++
  const tag = p.madeBy.find((m) => m.managerId === me.id)
  if (tag) tag.bond = Math.max(0, tag.bond - T.BOND_REFUSAL_LOSS)
  emit(world, 'player.refused', { playerId: p.id, clubId: p.clubId, managerId: me.id, name: p.name, reason, morale: p.morale, season: world.season })
}

export function applyNewDeal(world: World, decision: Decision, accept: boolean): void {
  const p = playerById(world, decision.payload['playerId'] as number)
  if (!p || p.retired) return
  const me = human(world)
  if (accept) {
    p.contract = { years: T.NEW_DEAL_YEARS, wage: decision.payload['demand'] as number }
    p.morale = round1(clamp(p.morale + T.NEW_DEAL_MORALE_GAIN, 0, 100))
    const tag = p.madeBy.find((m) => m.managerId === me.id)
    if (tag) tag.bond += T.BOND_RENEWAL
    emit(world, 'player.renewed', { playerId: p.id, clubId: p.clubId, managerId: me.id, name: p.name, years: p.contract.years, wage: p.contract.wage, season: world.season })
  } else refusalFallout(world, p, 'new deal')
}

export function applyWantsAway(world: World, decision: Decision, sell: boolean): void {
  const p = playerById(world, decision.payload['playerId'] as number)
  if (!p || p.retired) return
  const club = humanClub(world)
  if (!club || p.clubId !== club.id) return
  if (sell) {
    const fee = valueFor(p.rating, p.age)
    club.cash = round1(club.cash + fee)
    releasePlayer(world, p, club)
    emit(world, 'player.left', { playerId: p.id, clubId: club.id, managerId: human(world).id, name: p.name, rating: p.rating, fee, reason: 'sold', season: world.season })
    forgetPlayer(world, p)
  } else refusalFallout(world, p, 'wants away')
}

export function applyContract(world: World, decision: Decision, key: string): void {
  const state = world.human
  if (!state) return
  const playerId = decision.payload['playerId'] as number
  if (key === 'release') state.contractChoices[playerId] = 'release'
  else {
    const years = Number(key.split(':')[1] ?? T.RENEW_YEARS_PLAYER)
    state.contractChoices[playerId] = { years: clamp(years, 1, T.PLAYER_CONTRACT_YEARS[1]), wage: decision.payload['demand'] as number }
  }
}
