/**
 * Decisions the engine raises for the human and how each answer lands.
 * Everything here is data in the state; the CLI or web shell only shows the
 * options and passes back a key.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { clubById, foreignClubById, managerById, spellOf } from '../lookup.js'
import type { Decision, DecisionKind, DecisionOption, HumanState, Manager, Promise, Spell, Vacancy, World } from '../types.js'
import { expectationAtHire } from '../tenure/expectation.js'
import { salaryFor } from '../tenure/spell.js'
import { addCredit } from '../tenure/credit.js'
import { leaveByMutualConsent, renewContract, leaveAtExpiry } from '../tenure/exits.js'
import { resolveFallout } from '../tenure/shocks.js'
import { salaryForYears } from '../market/vacancies.js'
import { acceptApproach, declineApproach, hire } from '../market/hiring.js'
import { setActivity } from '../market/unemployment.js'
import { ordinal, renderText } from '../text/render.js'

export function human(world: World): Manager {
  if (!world.human) throw new Error('no human in this world')
  return managerById(world, world.human.managerId)
}

export function humanState(world: World): HumanState {
  if (!world.human) throw new Error('no human in this world')
  return world.human
}

export function pendingDecisions(world: World): Decision[] {
  return world.human ? world.human.pending : []
}

export function hasPending(world: World, kind: DecisionKind, match?: (d: Decision) => boolean): boolean {
  return pendingDecisions(world).some((d) => d.kind === kind && (!match || match(d)))
}

export interface DecisionDraft {
  kind: DecisionKind
  from: Decision['from']
  title: string
  body: string
  options: DecisionOption[]
  defaultKey: string
  blocking: boolean
  payload?: Record<string, unknown>
}

export function queueDecision(world: World, draft: DecisionDraft): Decision {
  const state = humanState(world)
  const decision: Decision = {
    id: state.nextDecisionId++,
    kind: draft.kind,
    week: world.week,
    deadlineWeek: world.week + T.HUMAN_DECISION_DEADLINE_WEEKS,
    from: draft.from,
    title: draft.title,
    body: draft.body,
    options: draft.options,
    defaultKey: draft.defaultKey,
    blocking: draft.blocking,
    payload: draft.payload ?? {},
  }
  state.pending.push(decision)
  emit(world, 'human.decision', { decisionId: decision.id, kind: decision.kind, from: decision.from, title: decision.title, body: decision.body, options: decision.options, blocking: decision.blocking, ...decision.payload })
  return decision
}

function postName(world: World, vacancy: Vacancy): string {
  return vacancy.post.kind === 'home' ? clubById(world, vacancy.post.clubId).name : (foreignClubById(world, vacancy.post.clubId)?.name ?? 'a club abroad')
}

function postTier(world: World, vacancy: Vacancy): string {
  return vacancy.post.kind === 'home' ? `tier ${clubById(world, vacancy.post.clubId).tier}` : `${vacancy.post.league} league abroad`
}

/** The interview: promise and contract length set the terms. */
export function queueOffer(world: World, vacancy: Vacancy): Decision {
  const manager = human(world)
  const base = salaryFor(world, vacancy.post, manager.reputation)
  const options: DecisionOption[] = []
  for (const promise of ['top-half', 'promotion', 'stability'] as Promise[]) {
    const effect = T.PROMISE_EFFECTS[promise]
    const expectation = expectationAtHire(world, vacancy.post, promise)
    for (const years of T.HUMAN_CONTRACT_YEARS_OPTIONS) {
      const salary = salaryForYears(base, years)
      options.push({
        key: `${promise}:${years}`,
        label: `Promise ${promise}, ${years}-year deal`,
        detail: `target ${ordinal(expectation)}, budget ×${effect.budget}, £${salary}m a season`,
      })
    }
  }
  options.push({ key: 'decline', label: 'Turn the job down' })
  return queueDecision(world, {
    kind: 'offer',
    from: 'agent',
    title: `${postName(world, vacancy)} want to talk`,
    body: `${postTier(world, vacancy)}, ${vacancy.ownerType} owner, ${vacancy.crisis ? 'a crisis appointment' : 'a planned appointment'}. They are offering ${vacancy.contract.years} years; ask for more or less.`,
    options,
    defaultKey: 'decline',
    blocking: true,
    payload: { vacancyId: vacancy.id, post: vacancy.post },
  })
}

export function queueApproach(world: World, vacancy: Vacancy, buyout: number, paid: boolean): Decision {
  return queueDecision(world, {
    kind: 'approach',
    from: 'agent',
    title: `${postName(world, vacancy)} have called`,
    body: paid
      ? `They will pay the £${buyout}m buy-out. Accepting makes you "in demand"; declining earns credit and loyalty at your club.`
      : `They will not pay the £${buyout}m buy-out: you would have to walk out, which costs reputation and counts toward "mercenary".`,
    options: [
      { key: 'accept', label: paid ? 'Accept the move' : 'Walk out and go' },
      { key: 'decline', label: 'Stay where you are' },
    ],
    defaultKey: 'decline',
    blocking: true,
    payload: { vacancyId: vacancy.id, post: vacancy.post, buyout, buyoutPaid: paid },
  })
}

export function queueMutualConsent(world: World, spell: Spell): Decision {
  return queueDecision(world, {
    kind: 'mutualConsent',
    from: 'board',
    title: 'The board propose parting by mutual consent',
    body: 'Half your remaining contract, and a smaller mark on your record than a sacking.',
    options: [
      { key: 'accept', label: 'Accept and leave' },
      { key: 'decline', label: 'Refuse and fight on' },
    ],
    defaultKey: 'decline',
    blocking: true,
    payload: { spellId: spell.id, credit: spell.credit },
  })
}

export function queueRenewal(world: World, spell: Spell, years: number, salary: number): Decision {
  return queueDecision(world, {
    kind: 'renewal',
    from: 'board',
    title: 'Contract renewal on the table',
    body: `${years} more years at £${salary}m a season. Decline and you leave when the contract ends, with nothing owed.`,
    options: [
      { key: 'accept', label: 'Sign the renewal' },
      { key: 'decline', label: 'Let the contract run out' },
    ],
    defaultKey: 'accept',
    blocking: true,
    payload: { spellId: spell.id, years, salary },
  })
}

export function queueFallout(world: World, spell: Spell): Decision {
  return queueDecision(world, {
    kind: 'fallout',
    from: 'staff',
    title: 'A senior player has turned on you',
    body: 'Back down and the dressing room loses heart. Sell him and the squad is weaker but yours.',
    options: [
      { key: 'back-down', label: 'Back down' },
      { key: 'sell', label: 'Sell him' },
    ],
    defaultKey: human(world).ability.motivation < T.AI_FALLOUT_SELL_BELOW_MOTIVATION ? 'sell' : 'back-down',
    blocking: true,
    payload: { spellId: spell.id },
  })
}

export function queueWindow(world: World, summer: boolean, budget: number): Decision {
  const options: DecisionOption[] = summer
    ? [
        { key: 'spend', label: 'Spend the budget', detail: `£${budget}m on senior signings` },
        { key: 'rebuild', label: 'Rebuild', detail: 'spend the budget and promote the academy' },
        { key: 'youth', label: 'Youth first', detail: 'half the budget, promote the academy' },
        { key: 'sell', label: 'Sell a senior player', detail: 'cash in, strength down, more of the XI yours' },
        { key: 'hold', label: 'Hold', detail: 'keep the squad as it is' },
      ]
    : [
        { key: 'spend', label: 'Spend the winter pot', detail: `£${budget}m` },
        { key: 'hold', label: 'Hold' },
      ]
  return queueDecision(world, {
    kind: summer ? 'summerWindow' : 'winterWindow',
    from: 'staff',
    title: summer ? 'Summer window: the plan' : 'Winter window: the plan',
    body: summer ? 'A big turnover resets your standing with the board; youth is cheap and slow.' : 'A small pot to top up the squad.',
    options,
    defaultKey: 'spend',
    blocking: true,
    payload: { summer, budget },
  })
}

export function queuePress(world: World, spell: Spell, templateKey: string): Decision {
  const club = spell.post.kind === 'home' ? clubById(world, spell.post.clubId).name : 'the club'
  const body = renderText('press', templateKey.split(':')[0] ?? 'draw', { club, defeats: spell.consecutiveDefeats }, world.week)
  return queueDecision(world, {
    kind: 'press',
    from: 'press',
    title: 'The press want a word',
    body,
    options: [
      { key: 'confident', label: 'Confident' },
      { key: 'measured', label: 'Measured' },
      { key: 'defiant', label: 'Defiant' },
    ],
    defaultKey: 'measured',
    blocking: false,
    payload: { spellId: spell.id, template: templateKey },
  })
}

export function queueBoard(world: World, spell: Spell): Decision {
  return queueDecision(world, {
    kind: 'board',
    from: 'board',
    title: 'The board are uneasy',
    body: 'Results are below what they expect. How do you answer?',
    options: [
      { key: 'accept', label: 'Take it on the chin' },
      { key: 'pushBack', label: 'Push back', detail: 'a gamble on their patience' },
      { key: 'promise', label: 'Promise improvement', detail: 'credit now, a harder target' },
    ],
    defaultKey: 'accept',
    blocking: false,
    payload: { spellId: spell.id, credit: spell.credit, threshold: spell.threshold },
  })
}

export function queueActivity(world: World): Decision {
  const manager = human(world)
  const current = manager.status.kind === 'unemployed' ? manager.status.activity : 'wait'
  return queueDecision(world, {
    kind: 'activity',
    from: 'agent',
    title: 'Another month out of work',
    body: 'Waiting is a bet. Punditry halves the slide; an assistant role stops it, at a price; abroad opens foreign vacancies.',
    options: [
      { key: 'wait', label: 'Wait for the right job' },
      { key: 'punditry', label: 'Punditry' },
      { key: 'assistant', label: 'Take an assistant role' },
      { key: 'abroad', label: 'Look abroad' },
    ],
    defaultKey: current,
    blocking: false,
    payload: { current },
  })
}

/** Apply an answer. Unknown keys fall back to the default. */
export function applyAnswer(world: World, rng: Rng, decision: Decision, rawKey: string): void {
  const key = decision.options.some((o) => o.key === rawKey) ? rawKey : decision.defaultKey
  const manager = human(world)
  const state = humanState(world)
  switch (decision.kind) {
    case 'offer': {
      const vacancy = world.vacancies[(decision.payload['vacancyId'] as number) - 1]
      if (!vacancy) break
      if (key === 'decline' || vacancy.filledWeek !== null || manager.status.kind !== 'unemployed') {
        state.declinedVacancies.push(vacancy.id)
        break
      }
      const [promise, yearsText] = key.split(':') as [Promise, string]
      hire(world, rng, manager, vacancy, { promise, years: Number(yearsText) })
      break
    }
    case 'approach': {
      const vacancy = world.vacancies[(decision.payload['vacancyId'] as number) - 1]
      const spell = spellOf(world, manager)
      if (!vacancy || !spell) break
      if (key === 'accept' && vacancy.filledWeek === null) {
        acceptApproach(world, rng, manager, vacancy, decision.payload['buyoutPaid'] === true)
        break
      }
      // Recorded like a declined offer so the club works down its shortlist instead of calling again next week.
      state.declinedVacancies.push(vacancy.id)
      declineApproach(world, spell, vacancy)
      break
    }
    case 'mutualConsent': {
      const spell = spellOf(world, manager)
      if (spell && key === 'accept') leaveByMutualConsent(world, spell)
      break
    }
    case 'renewal': {
      const spell = spellOf(world, manager)
      if (!spell) break
      if (key === 'accept') renewContract(world, spell, decision.payload['years'] as number)
      else leaveAtExpiry(world, spell)
      break
    }
    case 'fallout': {
      const spell = spellOf(world, manager)
      if (spell) resolveFallout(world, spell, key === 'sell')
      break
    }
    case 'summerWindow':
    case 'winterWindow': {
      const plans: Record<string, { spend: number; youth: number; sell: number }> = {
        spend: { spend: 1, youth: 0, sell: 0 },
        rebuild: { spend: 1, youth: T.YOUTH_MAX_PER_SUMMER, sell: 0 },
        youth: { spend: 0.5, youth: T.YOUTH_MAX_PER_SUMMER, sell: 0 },
        sell: { spend: 0, youth: 0, sell: 1 },
        hold: { spend: 0, youth: 0, sell: 0 },
      }
      state.windowChoice = plans[key] ?? plans['spend'] ?? null
      break
    }
    case 'press': {
      const spell = spellOf(world, manager)
      if (!spell || spell.post.kind !== 'home') break
      const effect = T.PRESS_RESPONSE_EFFECTS[key as keyof typeof T.PRESS_RESPONSE_EFFECTS] ?? T.PRESS_RESPONSE_EFFECTS.measured
      const club = clubById(world, spell.post.clubId)
      club.squad.morale = round1(clamp(club.squad.morale + effect.morale, 0, 100))
      const credit = effect.credit ? addCredit(spell, effect.credit) : 0
      emit(world, 'press.answered', { spellId: spell.id, managerId: manager.id, response: key, morale: club.squad.morale, creditDelta: credit })
      break
    }
    case 'board': {
      const spell = spellOf(world, manager)
      if (!spell) break
      let delta = 0
      if (key === 'pushBack') delta = addCredit(spell, rng.chance(0.5) ? T.BOARD_RESPONSE_EFFECTS.pushBackSwing : -T.BOARD_RESPONSE_EFFECTS.pushBackSwing)
      if (key === 'promise') {
        delta = addCredit(spell, T.BOARD_RESPONSE_EFFECTS.promiseCredit)
        spell.expectation = Math.max(1, spell.expectation - T.BOARD_RESPONSE_EFFECTS.promisePlaces)
      }
      emit(world, 'board.answered', { spellId: spell.id, managerId: manager.id, response: key, creditDelta: delta, credit: spell.credit, expectation: spell.expectation })
      break
    }
    case 'activity': {
      setActivity(world, manager, key as 'wait' | 'punditry' | 'assistant' | 'abroad')
      break
    }
  }
}

/** Resolve answered decisions, and apply defaults to any past their deadline. */
export function resolveDecisions(world: World, rng: Rng, answers: Record<number, string> = {}): void {
  if (!world.human) return
  const state = world.human
  const remaining: Decision[] = []
  for (const decision of state.pending) {
    const answer = answers[decision.id]
    if (answer !== undefined) {
      applyAnswer(world, rng, decision, answer)
      emit(world, 'human.decided', { decisionId: decision.id, kind: decision.kind, key: answer, byDefault: false })
    } else if (world.week >= decision.deadlineWeek) {
      applyAnswer(world, rng, decision, decision.defaultKey)
      emit(world, 'human.decided', { decisionId: decision.id, kind: decision.kind, key: decision.defaultKey, byDefault: true })
    } else {
      remaining.push(decision)
    }
  }
  state.pending = remaining
}
