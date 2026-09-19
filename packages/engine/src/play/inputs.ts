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
import { queueContract } from '../players/contracts.js'
import { playerById } from '../lookup.js'
import { humanClubId } from '../sim/turn.js'
import { noteWithdrawal } from '../market/agent.js'
import { makeRequest } from './requests.js'

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
    noteWithdrawal(world, id)
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

  // Talking terms with a player of your own: the assistant puts his demand on the desk as a decision.
  const clubId = humanClubId(world)
  for (const id of inputs.contractOffers ?? []) {
    const p = playerById(world, id)
    if (!p || p.retired || clubId === null || p.clubId !== clubId) continue
    if (state.pending.some((d) => d.kind === 'playerContract' && d.payload['playerId'] === id)) continue
    queueContract(world, p, player.id)
  }

  // The shortlist, then the asks: each a roll at its stated likelihood (DESIGN.md "Requests").
  if (inputs.shortlistAdd || inputs.shortlistRemove) {
    const current = new Set(state.shortlist ?? [])
    for (const id of inputs.shortlistAdd ?? []) current.add(id)
    for (const id of inputs.shortlistRemove ?? []) current.delete(id)
    state.shortlist = [...current].sort((a, b) => a - b)
  }
  for (const req of inputs.requests ?? []) makeRequest(world, rng, req)

  if (inputs.activity && player.status.kind === 'unemployed') setActivity(world, player, inputs.activity)

  if (inputs.resign) {
    const spell = spellOf(world, player)
    if (spell) resign(world, spell)
  }
  if (inputs.retire) endCareer(world, player, 'voluntary')
}
