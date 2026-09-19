import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, managerById, playerById } from '../lookup.js'
import type { OwnerType, Spell, World } from '../types.js'
import { addCredit } from './credit.js'
import { easeExpectation } from './expectation.js'
import { thresholdFor } from './spell.js'
import { queueFallout } from '../play/decisions.js'
import { rollKind } from '../play/bets.js'
import { squadOf } from '../players/select.js'
import { refreshStrength } from '../season/squad.js'
import { sellPlayer } from '../market/director.js'
import { tagOf } from '../players/made.js'

function drawOwnerType(rng: Rng): OwnerType {
  const types = Object.keys(T.OWNER_TYPE_WEIGHTS) as OwnerType[]
  return rng.weighted(types, types.map((t) => T.OWNER_TYPE_WEIGHTS[t]))
}

/** Monthly shocks for a home spell: takeover, financial crisis, forced sale, board row. */
export function monthlyShocks(world: World, rng: Rng, spell: Spell): void {
  if (spell.post.kind !== 'home') return
  const club = clubById(world, spell.post.clubId)
  const lowWealth = club.wealth < T.LOW_WEALTH

  if (rng.chance(T.TAKEOVER_P * (lowWealth ? T.TAKEOVER_LOW_WEALTH_MULT : 1))) {
    const previous = club.owner.type
    club.owner = {
      type: drawOwnerType(rng),
      ambition: round1(rng.float() * (T.AMBITION_RANGE[1] - T.AMBITION_RANGE[0]) + T.AMBITION_RANGE[0]),
    }
    spell.threshold = thresholdFor(rng, club.owner.type)
    const replace = rng.chance(T.TAKEOVER_REPLACE_P)
    spell.takeover = replace
      ? { week: world.week, replaceWeek: world.week + rng.int(1, T.TAKEOVER_REPLACE_MONTHS * T.MONTH_WEEKS) }
      : null
    emit(world, 'shock.takeover', {
      clubId: club.id,
      managerId: spell.managerId,
      spellId: spell.id,
      from: previous,
      to: club.owner.type,
      ambition: club.owner.ambition,
      threshold: spell.threshold,
      willReplace: replace,
      season: world.season,
    })
  }

  if (rng.chance(T.CRISIS_P * (lowWealth ? T.CRISIS_LOW_WEALTH_MULT : 1))) {
    spell.budgetMultiplier = round1(spell.budgetMultiplier * (1 - T.CRISIS_BUDGET_CUT) * 100) / 100
    easeExpectation(world, spell, T.CRISIS_EXPECTATION_EASE)
    emit(world, 'shock.crisis', {
      clubId: club.id,
      managerId: spell.managerId,
      spellId: spell.id,
      budgetMultiplier: spell.budgetMultiplier,
      expectation: spell.expectation,
      season: world.season,
    })
  }

  if (lowWealth && rng.chance(T.STAR_SALE_P)) {
    // The owner sells the best outfielder over the board's head: the fee lands in the pot, the side is what is left.
    const star = squadOf(world, club).filter((p) => p.position !== 'GK').sort((a, b) => b.rating - a.rating || a.id - b.id)[0]
    if (star) sellPlayer(world, rng, star, club, star.value, null, null)
    refreshStrength(world, club)
    easeExpectation(world, spell, T.STAR_SALE_EXPECTATION_EASE)
    emit(world, 'shock.starSale', {
      clubId: club.id,
      managerId: spell.managerId,
      spellId: spell.id,
      playerId: star ? star.id : null,
      name: star ? star.name : null,
      fee: star ? star.value : 0,
      strength: club.squad.strength,
      expectation: spell.expectation,
      season: world.season,
    })
  }

  if (spell.credit < spell.threshold + T.BOARD_ROW_MARGIN && rng.chance(T.BOARD_ROW_P)) {
    const applied = addCredit(spell, T.BOARD_ROW_CREDIT)
    spell.season.boardRows++
    emit(world, 'shock.boardRow', { clubId: club.id, managerId: spell.managerId, spellId: spell.id, credit: spell.credit, delta: applied, season: world.season })
  }
}

/** Dressing-room fallout after a losing run. AI backs down or sells by its motivation ability; the human is asked. */
export function maybeFallout(world: World, rng: Rng, spell: Spell): void {
  if (spell.post.kind !== 'home') return
  if (spell.consecutiveDefeats < T.FALLOUT_TRIGGER_DEFEATS || spell.falloutRolled) return
  spell.falloutRolled = true
  if (!rng.chance(T.FALLOUT_P)) return
  const club = clubById(world, spell.post.clubId)
  const manager = managerById(world, spell.managerId)
  spell.season.fallouts++
  // The senior player who turned: the highest-rated outfielder over the senior age.
  const seniors = squadOf(world, club).filter((p) => p.position !== 'GK' && p.age >= T.FALLOUT_SENIOR_AGE).sort((a, b) => b.rating - a.rating || a.id - b.id)
  const senior = seniors[0] ?? null
  spell.falloutPlayerId = senior ? senior.id : null
  emit(world, 'shock.fallout', { clubId: club.id, managerId: manager.id, spellId: spell.id, playerId: senior ? senior.id : null, name: senior ? senior.name : null, season: world.season })
  if (manager.isHuman) {
    queueFallout(world, spell, senior ? senior.name : null)
    return
  }
  resolveFallout(world, spell, rng, manager.ability.motivation < T.AI_FALLOUT_SELL_BELOW_MOTIVATION)
}

/** Settle a fallout: sell the player (ownership up, strength down) or back down; either way the dressing room's morale is the roll. */
export function resolveFallout(world: World, spell: Spell, rng: Rng, sell: boolean): void {
  if (spell.post.kind !== 'home') return
  const club = clubById(world, spell.post.clubId)
  const manager = managerById(world, spell.managerId)
  const senior = spell.falloutPlayerId === null || spell.falloutPlayerId === undefined ? undefined : playerById(world, spell.falloutPlayerId)
  spell.falloutPlayerId = null
  rollKind(world, rng, 'fallout', sell ? 'sell' : 'back-down', { managerId: manager.id, spellId: spell.id, clubId: club.id, label: sell ? 'sell him' : 'back down' })
  if (sell) {
    spell.ownership = round1(clamp(spell.ownership + T.FALLOUT_OWNERSHIP_GAIN, 0, 1) * 100) / 100
    if (senior && senior.clubId === club.id) sellPlayer(world, rng, senior, club, senior.value, manager.id, null)
    refreshStrength(world, club)
  } else {
    // Backing down is taking his side: the bond deepens if he is one of yours.
    if (senior) {
      const tag = tagOf(senior, manager.id)
      if (tag) tag.bond += T.BOND_BACKED
    }
  }
  emit(world, 'shock.falloutResolved', {
    clubId: club.id,
    managerId: manager.id,
    spellId: spell.id,
    choice: sell ? 'sell' : 'back-down',
    ownership: spell.ownership,
    strength: club.squad.strength,
    morale: club.squad.morale,
    season: world.season,
  })
}
