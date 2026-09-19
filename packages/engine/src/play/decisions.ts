/**
 * Decisions the engine raises for the human and how each answer lands.
 * Everything here is data in the state; the CLI or web shell only shows the
 * options and passes back a key. Every option is a bet (DESIGN.md
 * "Decisions are bets"): words for the card, dice underneath, the default
 * the lowest-variance option.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clubById, managerById, spellOf } from '../lookup.js'
import type { Decision, DecisionKind, DecisionOption, HumanState, Manager, Promise, Spell, Vacancy, World } from '../types.js'
import { expectationAtHire } from '../tenure/expectation.js'
import { salaryFor } from '../tenure/spell.js'
import { addCredit } from '../tenure/credit.js'
import { answerMutualConsent, answerRenewal } from '../tenure/exits.js'
import { resolveFallout } from '../tenure/shocks.js'
import { salaryForYears } from '../market/vacancies.js'
import { acceptApproach, declineApproach, hire } from '../market/hiring.js'
import { setActivity } from '../market/unemployment.js'
import { applyContract, applyNewDeal, applyWantsAway } from '../players/contracts.js'
import { ordinal, renderText } from '../text/render.js'
import { betFor, betOption, markDefault, plainOption, resolveBet } from './bets.js'
import { applyFollow, applySale, applySigning } from './transfers.js'

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
  /** The default is the lowest-variance option unless a draft names one (a repeated question keeps its standing answer). */
  defaultKey?: string
  blocking: boolean
  payload?: Record<string, unknown>
}

export function queueDecision(world: World, draft: DecisionDraft): Decision {
  const state = humanState(world)
  const defaultKey = markDefault(draft.options, draft.defaultKey)
  const decision: Decision = {
    id: state.nextDecisionId++,
    kind: draft.kind,
    week: world.week,
    deadlineWeek: world.week + T.HUMAN_DECISION_DEADLINE_WEEKS,
    from: draft.from,
    title: draft.title,
    body: draft.body,
    options: draft.options,
    defaultKey,
    blocking: draft.blocking,
    payload: draft.payload ?? {},
  }
  state.pending.push(decision)
  emit(world, 'human.decision', { decisionId: decision.id, kind: decision.kind, from: decision.from, title: decision.title, body: decision.body, options: decision.options, blocking: decision.blocking, ...decision.payload })
  return decision
}

function postName(world: World, vacancy: Vacancy): string {
  return clubById(world, vacancy.post.clubId).name
}

function postTier(world: World, vacancy: Vacancy): string {
  return `tier ${clubById(world, vacancy.post.clubId).tier}`
}

/** The interview: promise and contract length set the terms. The promise is the bet, rolled onto credit at hire. */
export function queueOffer(world: World, vacancy: Vacancy, firstOffer = false): Decision {
  const manager = human(world)
  const base = salaryFor(world, vacancy.post, manager.reputation)
  const options: DecisionOption[] = []
  for (const promise of ['top-half', 'promotion', 'stability'] as Promise[]) {
    const effect = T.PROMISE_EFFECTS[promise]
    const expectation = expectationAtHire(world, vacancy.post, promise)
    for (const years of T.HUMAN_CONTRACT_YEARS_OPTIONS) {
      const salary = salaryForYears(base, years)
      options.push(betOption('offer', `${promise}:${years}`, `Promise ${promise}, ${years}-year deal`, betFor('offer', promise), {}, world.week, `target ${ordinal(expectation)}, budget ×${effect.budget}, £${salary}m a season`, promise))
    }
  }
  options.push(plainOption('offer', 'decline', 'Turn the job down', 'sure thing', {}, world.week))
  return queueDecision(world, {
    kind: 'offer',
    from: 'agent',
    title: firstOffer ? `Your agent has an offer ready: ${postName(world, vacancy)}` : `${postName(world, vacancy)} want to talk`,
    body: `${postTier(world, vacancy)}, ${vacancy.ownerType} owner, ${vacancy.crisis ? 'a crisis appointment' : 'a planned appointment'}. They are offering ${vacancy.contract.years} years; ask for more or less.${firstOffer ? ' Take it and manage from the first turn, or start out of work with your agent applying every week.' : ''}`,
    options,
    blocking: true,
    payload: { vacancyId: vacancy.id, post: vacancy.post, firstOffer, years: vacancy.contract.years, salary: vacancy.contract.salary, budget: vacancy.budget, expectation: vacancy.expectation },
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
      betOption('approach', 'accept', paid ? 'Accept the move' : 'Walk out and go', betFor('approach', 'accept'), {}, world.week),
      betOption('approach', 'decline', 'Stay where you are', betFor('approach', 'decline'), {}, world.week),
    ],
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
      betOption('mutualConsent', 'accept', 'Accept and leave', betFor('mutualConsent', 'accept'), {}, world.week),
      betOption('mutualConsent', 'decline', 'Refuse and fight on', betFor('mutualConsent', 'decline'), {}, world.week),
    ],
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
      betOption('renewal', 'accept', 'Sign the renewal', betFor('renewal', 'accept'), {}, world.week),
      betOption('renewal', 'decline', 'Let the contract run out', betFor('renewal', 'decline'), {}, world.week),
    ],
    blocking: true,
    payload: { spellId: spell.id, years, salary },
  })
}

export function queueFallout(world: World, spell: Spell, name: string | null = null): Decision {
  return queueDecision(world, {
    kind: 'fallout',
    from: 'staff',
    title: name ? `${name} has turned on you` : 'A senior player has turned on you',
    body: 'Back down and the dressing room loses heart. Sell him and the squad is weaker but yours.',
    options: [
      betOption('fallout', 'back-down', 'Back down', betFor('fallout', 'back-down'), {}, world.week),
      betOption('fallout', 'sell', 'Sell him', betFor('fallout', 'sell'), {}, world.week, 'ownership up, strength down'),
    ],
    blocking: true,
    payload: { spellId: spell.id },
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
      betOption('press', 'confident', 'Confident', betFor('press', 'confident'), {}, world.week),
      betOption('press', 'measured', 'Measured', betFor('press', 'measured'), {}, world.week),
      betOption('press', 'defiant', 'Defiant', betFor('press', 'defiant'), {}, world.week),
    ],
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
      betOption('board', 'accept', 'Take it on the chin', betFor('board', 'accept'), {}, world.week),
      betOption('board', 'pushBack', 'Push back', betFor('board', 'pushBack'), {}, world.week, 'a gamble on their patience'),
      betOption('board', 'promise', 'Promise improvement', betFor('board', 'promise'), {}, world.week, `credit +${T.BOARD_PROMISE.credit} now, the target ${T.BOARD_PROMISE.places} place harder`),
    ],
    blocking: false,
    payload: { spellId: spell.id, credit: spell.credit, threshold: spell.threshold },
  })
}

/** The month's choice out of work. A repeated question keeps its standing answer as the default; the dice roll monthly on whatever you are doing. */
export function queueActivity(world: World): Decision {
  const manager = human(world)
  const current = manager.status.kind === 'unemployed' ? manager.status.activity : 'wait'
  return queueDecision(world, {
    kind: 'activity',
    from: 'agent',
    title: 'Another month out of work',
    body: 'Waiting is a bet. Punditry halves the slide; an assistant role stops it, at a price.',
    options: [
      betOption('activity', 'wait', 'Wait for the right job', betFor('activity', 'wait'), {}, world.week),
      betOption('activity', 'punditry', 'Punditry', betFor('activity', 'punditry'), {}, world.week),
      betOption('activity', 'assistant', 'Take an assistant role', betFor('activity', 'assistant'), {}, world.week),
    ],
    defaultKey: current,
    blocking: false,
    payload: { current },
  })
}

/** The press answer: the dice on the squad's morale. Human and AI alike. */
export function answerPress(world: World, rng: Rng, spell: Spell, key: string, decisionId?: number): void {
  if (spell.post.kind !== 'home') return
  const club = clubById(world, spell.post.clubId)
  const option = ['confident', 'measured', 'defiant'].includes(key) ? key : 'measured'
  const bet = betFor('press', option)
  const effect = resolveBet(world, rng, bet, { kind: 'press', key: option, managerId: spell.managerId, spellId: spell.id, clubId: club.id, bold: option !== 'measured', label: option, ...(decisionId !== undefined ? { decisionId } : {}) })
  emit(world, 'press.answered', { spellId: spell.id, managerId: spell.managerId, clubId: club.id, response: option, morale: club.squad.morale, moraleDelta: effect })
}

/** The board's warning answered: the dice on credit; a promise also trades credit now for a harder target. Human and AI alike. */
export function answerBoard(world: World, rng: Rng, spell: Spell, key: string, decisionId?: number): void {
  const option = ['accept', 'pushBack', 'promise'].includes(key) ? key : 'accept'
  const bet = betFor('board', option)
  let delta = resolveBet(world, rng, bet, { kind: 'board', key: option, managerId: spell.managerId, spellId: spell.id, bold: option !== 'accept', label: option === 'pushBack' ? 'push back' : option, ...(decisionId !== undefined ? { decisionId } : {}) })
  if (option === 'promise') {
    delta += addCredit(spell, T.BOARD_PROMISE.credit)
    spell.expectation = Math.max(1, spell.expectation - T.BOARD_PROMISE.places)
  }
  emit(world, 'board.answered', { spellId: spell.id, managerId: spell.managerId, response: option, creditDelta: delta, credit: spell.credit, expectation: spell.expectation })
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
      declineApproach(world, rng, spell, vacancy)
      break
    }
    case 'mutualConsent': {
      const spell = spellOf(world, manager)
      if (spell) answerMutualConsent(world, rng, spell, key === 'accept')
      break
    }
    case 'renewal': {
      const spell = spellOf(world, manager)
      if (spell) answerRenewal(world, rng, spell, key === 'accept', decision.payload['years'] as number)
      break
    }
    case 'fallout': {
      const spell = spellOf(world, manager)
      if (spell) resolveFallout(world, spell, rng, key === 'sell')
      break
    }
    case 'summerWindow':
    case 'winterWindow':
      // The abstract window plan of phase 3: a card left pending in an old save does nothing now.
      break
    case 'signing':
      applySigning(world, decision, key)
      break
    case 'sale':
      applySale(world, rng, decision, key)
      break
    case 'follow':
      applyFollow(world, decision, key)
      break
    case 'press': {
      const spell = spellOf(world, manager)
      if (spell) answerPress(world, rng, spell, key, decision.id)
      break
    }
    case 'board': {
      const spell = spellOf(world, manager)
      if (spell) answerBoard(world, rng, spell, key, decision.id)
      break
    }
    case 'activity': {
      setActivity(world, manager, key as 'wait' | 'punditry' | 'assistant')
      break
    }
    case 'newDeal':
      applyNewDeal(world, rng, decision, key === 'accept')
      break
    case 'wantsAway':
      applyWantsAway(world, rng, decision, key === 'sell')
      break
    case 'playerContract':
      applyContract(world, rng, decision, key)
      break
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
