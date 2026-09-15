import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp } from '../world/gen.js'
import { clubById } from '../lookup.js'
import type { Post, Promise, Spell, World } from '../types.js'

export function divisionSize(world: World, post: Post): number {
  if (post.kind === 'home') return T.TIER_SIZES[clubById(world, post.clubId).tier - 1] as number
  return world.foreign.find((l) => l.kind === post.league)?.clubs.length ?? 1
}

/** Finish the squad's strength rank implies: 1 = strongest in the division. */
export function structuralTarget(world: World, post: Post): number {
  if (post.kind === 'home') {
    const club = clubById(world, post.clubId)
    const stronger = world.clubs.filter(
      (c) => c.tier === club.tier && (c.squad.strength > club.squad.strength || (c.squad.strength === club.squad.strength && c.id < club.id)),
    ).length
    return stronger + 1
  }
  const league = world.foreign.find((l) => l.kind === post.league)
  if (!league) throw new Error(`no foreign league ${post.league}`)
  const club = league.clubs.find((c) => c.id === post.clubId)
  if (!club) throw new Error(`no foreign club ${post.clubId}`)
  return league.clubs.filter((c) => c.strength > club.strength || (c.strength === club.strength && c.id < club.id)).length + 1
}

function ambitionOf(world: World, post: Post): number {
  return post.kind === 'home' ? clubById(world, post.clubId).owner.ambition : T.ABROAD_AMBITION
}

/** Board target at hire: structural rank, lifted by ambition, shifted by the promise. */
export function expectationAtHire(world: World, post: Post, promise: Promise): number {
  const target =
    structuralTarget(world, post) - Math.round(ambitionOf(world, post) * T.EXPECT_AMBITION_PLACES) + T.PROMISE_EFFECTS[promise].places
  return clamp(target, 1, divisionSize(world, post))
}

/**
 * The rule itself: beat or meet the target and the bar rises to your
 * finish; miss it and it eases one place, but never past the structural
 * target and never tighter.
 */
export function nextExpectation(current: number, structural: number, finish: number): number {
  if (finish <= current) return finish
  if (current < structural) return Math.min(structural, current + T.EXPECT_EASE_PER_MISS)
  return current
}

/**
 * Summer reset against last season, with the structural target recomputed
 * from the squads as they stand after the window. A club that changed tier
 * starts again from the structural target and ambition.
 */
export function resetExpectation(world: World, spell: Spell): void {
  const pending = spell.pendingReset
  if (!pending) return
  spell.pendingReset = null
  const before = spell.expectation
  spell.structuralTarget = structuralTarget(world, spell.post)
  if (pending.movedTier) {
    spell.expectation = spell.structuralTarget - Math.round(ambitionOf(world, spell.post) * T.EXPECT_AMBITION_PLACES)
  } else {
    spell.expectation = nextExpectation(spell.expectation, spell.structuralTarget, pending.finish)
  }
  spell.expectation = clamp(spell.expectation, 1, divisionSize(world, spell.post))
  spell.budgetMultiplier = T.PROMISE_EFFECTS[spell.contract.promise].budget
  emit(world, 'expectation.reset', {
    spellId: spell.id,
    managerId: spell.managerId,
    from: before,
    to: spell.expectation,
    structural: spell.structuralTarget,
    finish: pending.finish,
    movedTier: pending.movedTier,
    season: world.season,
  })
}

/** Ease the target by some places (shocks). Positive = easier. */
export function easeExpectation(world: World, spell: Spell, places: number): void {
  spell.expectation = clamp(spell.expectation + places, 1, divisionSize(world, spell.post))
}
