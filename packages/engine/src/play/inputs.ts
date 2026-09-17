/**
 * Turn the human's inputs for the week into state: decisions answered,
 * applications lodged, a shape and mentality, resigning or retiring.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { spellOf } from '../lookup.js'
import type { HumanInputs, World } from '../types.js'
import { resign } from '../tenure/exits.js'
import { endCareer } from '../market/retirement.js'
import { setActivity } from '../market/unemployment.js'
import { human, humanState, resolveDecisions } from './decisions.js'

export function applyInputs(world: World, rng: Rng, inputs: HumanInputs): void {
  const state = humanState(world)
  const player = human(world)
  if (player.status.kind === 'retired') return
  emit(world, 'human.input', { ...inputs, week: world.week })

  if (inputs.tactic) state.tactic = { ...state.tactic, ...inputs.tactic }
  if (inputs.selection) state.selection = { ...state.selection, ...inputs.selection }

  for (const id of inputs.withdraw ?? []) {
    const vacancy = world.vacancies[id - 1]
    if (vacancy) vacancy.applicants = vacancy.applicants.filter((a) => a !== player.id)
  }
  for (const id of inputs.apply ?? []) {
    const vacancy = world.vacancies[id - 1]
    if (!vacancy || vacancy.filledWeek !== null) continue
    if (!vacancy.applicants.includes(player.id)) {
      vacancy.applicants.push(player.id)
      emit(world, 'vacancy.applied', { vacancyId: vacancy.id, managerId: player.id, post: vacancy.post, season: world.season })
    }
  }

  resolveDecisions(world, rng, inputs.answers ?? {})

  if (inputs.activity && player.status.kind === 'unemployed') setActivity(world, player, inputs.activity)

  if (inputs.resign) {
    const spell = spellOf(world, player)
    if (spell) resign(world, spell)
  }
  if (inputs.retire) endCareer(world, player, 'voluntary')
}
