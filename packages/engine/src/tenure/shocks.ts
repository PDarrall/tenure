import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, managerById } from '../lookup.js'
import type { OwnerType, Spell, World } from '../types.js'
import { addCredit } from './credit.js'
import { easeExpectation } from './expectation.js'
import { thresholdFor } from './spell.js'

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
    club.squad.strength = round1(clamp(club.squad.strength + T.STAR_SALE_STRENGTH, 1, 100))
    easeExpectation(world, spell, T.STAR_SALE_EXPECTATION_EASE)
    emit(world, 'shock.starSale', {
      clubId: club.id,
      managerId: spell.managerId,
      spellId: spell.id,
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

/** Dressing-room fallout after a losing run. AI backs down or sells by its motivation ability. */
export function maybeFallout(world: World, rng: Rng, spell: Spell): void {
  if (spell.post.kind !== 'home') return
  if (spell.consecutiveDefeats < T.FALLOUT_TRIGGER_DEFEATS || spell.falloutRolled) return
  spell.falloutRolled = true
  if (!rng.chance(T.FALLOUT_P)) return
  const club = clubById(world, spell.post.clubId)
  const manager = managerById(world, spell.managerId)
  spell.season.fallouts++
  const sell = manager.ability.motivation < T.AI_FALLOUT_SELL_BELOW_MOTIVATION
  emit(world, 'shock.fallout', { clubId: club.id, managerId: manager.id, spellId: spell.id, season: world.season })
  if (sell) {
    spell.ownership = round1(clamp(spell.ownership + T.FALLOUT_OWNERSHIP_GAIN, 0, 1) * 100) / 100
    club.squad.strength = round1(clamp(club.squad.strength - T.FALLOUT_STRENGTH_LOSS, 1, 100))
  } else {
    club.squad.morale = round1(clamp(club.squad.morale - T.FALLOUT_MORALE_LOSS, 0, 100))
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
