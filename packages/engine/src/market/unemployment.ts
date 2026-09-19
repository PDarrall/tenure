import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { bumpReputation } from '../tenure/exits.js'
import type { Manager, UnemployedActivity, World } from '../types.js'
import { monthsUnemployed } from './shortlist.js'
import { endCareer } from './retirement.js'
import { hasPending, queueActivity } from '../play/decisions.js'
import { rollKind } from '../play/bets.js'

/** What an AI manager does with another month out of work. */
export function chooseActivity(world: World, rng: Rng, manager: Manager): UnemployedActivity {
  if (manager.status.kind !== 'unemployed') return 'wait'
  const months = monthsUnemployed(world, manager)
  const current = manager.status.activity
  if (current === 'assistant') return 'assistant'
  if (months >= T.AI_ASSISTANT_AFTER_MONTHS && manager.reputation < T.AI_ASSISTANT_MAX_REP) return 'assistant'
  if (months >= T.AI_PUNDITRY_AFTER_MONTHS && manager.reputation >= T.AI_PUNDITRY_MIN_REP) return 'punditry'
  return current === 'punditry' ? 'punditry' : 'wait'
}

/** Change what an unemployed manager does with their months; stepping down costs reputation once. */
export function setActivity(world: World, manager: Manager, next: UnemployedActivity): void {
  if (manager.status.kind !== 'unemployed') return
  const status = manager.status
  if (next === status.activity) return
  status.activity = next
  emit(world, 'unemployed.activity', { managerId: manager.id, activity: next, months: monthsUnemployed(world, manager), season: world.season })
  if (next === 'assistant' && !manager.history.steppedDown) {
    manager.history.steppedDown = true
    bumpReputation(world, manager.id, T.REP_STEP_DOWN, 'stepped down to assistant')
  }
}

/** Monthly bookkeeping for one unemployed manager: activity, income, decay, the 24-month clock. */
export function monthlyUnemployed(world: World, rng: Rng, manager: Manager): void {
  if (manager.status.kind !== 'unemployed') return
  const status = manager.status
  if (manager.isHuman) {
    if (!hasPending(world, 'activity')) queueActivity(world)
  } else {
    setActivity(world, manager, chooseActivity(world, rng, manager))
  }
  // Waiting is a bet: the month's dice on reputation, on whatever the manager is doing.
  rollKind(world, rng, 'activity', status.activity, { managerId: manager.id, label: status.activity === 'wait' ? 'wait for the right job' : status.activity })
  const income = status.activity === 'punditry' ? T.PUNDITRY_INCOME_PER_MONTH : status.activity === 'assistant' ? T.ASSISTANT_INCOME_PER_MONTH : 0
  if (income > 0) {
    manager.history.earnings += income
    emit(world, 'earnings.income', { managerId: manager.id, activity: status.activity, amount: income, season: world.season })
  }
  const months = monthsUnemployed(world, manager)
  if (months > T.UNEMPLOYED_DECAY_AFTER_MONTHS && status.activity !== 'assistant') {
    const decay = status.activity === 'punditry' ? T.UNEMPLOYED_DECAY * T.PUNDITRY_DECAY_SHARE : T.UNEMPLOYED_DECAY
    bumpReputation(world, manager.id, decay, 'unemployed')
  }
  status.monthsSinceShortlisted++
  if (status.monthsSinceShortlisted >= T.NO_SHORTLIST_MONTHS) {
    endCareer(world, manager, 'no-offers')
    return
  }
  if (rng.chance(T.SCANDAL_P)) endCareer(world, manager, 'scandal')
}
