import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import type { World } from '../types.js'
import { openNewVacancies, openVacancies, vacancyPrestige } from './vacancies.js'
import { drawShortlist } from './shortlist.js'
import { tryToFill } from './hiring.js'
import { monthlyUnemployed } from './unemployment.js'
import { monthlyScandals, seasonRetirements } from './retirement.js'
import { reviewTags } from './tags.js'
import { joinCohort } from './cohorts.js'

/** Open vacancies for empty posts, shortlist, and hire, biggest club first. */
export function weekly(world: World, rng: Rng): void {
  openNewVacancies(world, rng)
  const open = openVacancies(world).sort((a, b) => vacancyPrestige(world, b) - vacancyPrestige(world, a) || a.id - b.id)
  for (const vacancy of open) {
    const age = world.week - vacancy.openedWeek
    if (age === T.VACANCY_SHORTLIST_DELAY_WEEKS) {
      drawShortlist(world, rng, vacancy)
      continue
    }
    if (age < T.VACANCY_HIRE_DELAY_WEEKS) continue
    if (tryToFill(world, rng, vacancy)) continue
    // Still empty: widen the net and try again next week.
    if (age >= T.VACANCY_WIDEN_AFTER_WEEKS) {
      vacancy.widened++
      emit(world, 'vacancy.widened', { vacancyId: vacancy.id, post: vacancy.post, widened: vacancy.widened, season: world.season })
    }
    drawShortlist(world, rng, vacancy)
  }
}

/** Unemployment bookkeeping and scandals. */
export function monthly(world: World, rng: Rng): void {
  for (const manager of world.managers) monthlyUnemployed(world, rng, manager)
  monthlyScandals(world, rng)
}

/** Season end: the press assigns tags, the old retire, and a new cohort arrives. */
export function seasonEnd(world: World, rng: Rng): void {
  for (const manager of world.managers) if (manager.status.kind !== 'retired') reviewTags(world, manager)
  seasonRetirements(world, rng)
  joinCohort(world, rng)
}
