import { emit } from '../events.js'
import { T } from '../tunables.js'
import { spellOf } from '../lookup.js'
import type { Manager, Tag, World } from '../types.js'

export function hasTag(manager: Manager, tag: Tag): boolean {
  return manager.tags.some((t) => t.tag === tag)
}

/** Assign or renew a tag, expiring `expiry` seasons after the current one. */
export function assignTag(world: World, manager: Manager, tag: Tag): void {
  const expiry = (T.TAG_RULES[tag] as { expiry: number }).expiry
  const expiresSeason = world.season + expiry
  const existing = manager.tags.find((t) => t.tag === tag)
  if (existing) {
    if (expiresSeason > existing.expiresSeason) existing.expiresSeason = expiresSeason
    return
  }
  manager.tags.push({ tag, expiresSeason })
  emit(world, 'tag.assigned', { managerId: manager.id, tag, expiresSeason, season: world.season })
}

/** Season-end press review: award every tag whose window is met, drop the lapsed. */
export function reviewTags(world: World, manager: Manager): void {
  const seasons = manager.history.seasons
  const recent = (window: number) => seasons.filter((s) => s.season > world.season - window)
  const rules = T.TAG_RULES

  if (recent(rules['promotion specialist'].window).filter((s) => s.promoted).length >= rules['promotion specialist'].count) {
    assignTag(world, manager, 'promotion specialist')
  }
  if (recent(rules['survival specialist'].window).filter((s) => s.bottomFourEscape).length >= rules['survival specialist'].count) {
    assignTag(world, manager, 'survival specialist')
  }
  const last = seasons[seasons.length - 1]
  if (last && last.season === world.season) {
    if (last.academyInXi >= rules['youth developer'].academyInXi) assignTag(world, manager, 'youth developer')
    const spenders = recent(rules['big spender'].seasons)
    if (spenders.length >= rules['big spender'].seasons && spenders.every((s) => s.netSpendRank !== null && s.netSpendRank <= rules['big spender'].rank)) {
      assignTag(world, manager, 'big spender')
    }
    if (last.post.kind === 'abroad') assignTag(world, manager, 'abroad')
  }
  if (recent(rules.overachiever.window).filter((s) => s.expectation - s.finish >= rules.overachiever.places).length >= rules.overachiever.seasons) {
    assignTag(world, manager, 'overachiever')
  }
  if (recent(rules['cup manager'].window).reduce((n, s) => n + s.cupFinals, 0) >= rules['cup manager'].finals) {
    assignTag(world, manager, 'cup manager')
  }
  const spell = spellOf(world, manager)
  if (spell && spell.seasonsCompleted + spell.loyaltyBonus >= rules.loyal.seasons) assignTag(world, manager, 'loyal')
  if (manager.history.walkouts >= rules.mercenary.walkouts) assignTag(world, manager, 'mercenary')
  if (recent(rules.difficult.window).reduce((n, s) => n + s.fallouts + s.boardRows, 0) >= rules.difficult.count) {
    assignTag(world, manager, 'difficult')
  }

  const kept = manager.tags.filter((t) => t.expiresSeason >= world.season + 1)
  for (const gone of manager.tags.filter((t) => t.expiresSeason < world.season + 1)) {
    emit(world, 'tag.expired', { managerId: manager.id, tag: gone.tag, season: world.season })
  }
  manager.tags = kept
}
