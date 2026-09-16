/**
 * The game controller: a session is the world plus the inputs queued for
 * the coming week. Pure functions, no DOM, so it can be tested directly.
 */
import {
  advanceWeek,
  createCareer,
  pendingDecisions,
  type Background,
  type Decision,
  type HumanInputs,
  type Mentality,
  type Shape,
  type UnemployedActivity,
  type World,
} from '@tenure/engine'

export interface Session {
  world: World
  inputs: HumanInputs
  /** Inbox shows weeks from here up to the current week. */
  shownFromWeek: number
  /** Bumped every advance so React re-renders the mutated world. */
  turn: number
}

export function newSession(seed: number, name: string, background: Background): Session {
  const world = createCareer(seed, { name: name.trim() || 'You', background })
  return { world, inputs: { answers: {} }, shownFromWeek: 0, turn: 0 }
}

export function sessionFromWorld(world: World): Session {
  return { world, inputs: { answers: {} }, shownFromWeek: Math.max(0, world.week - 1), turn: 0 }
}

function bump(s: Session, inputs: HumanInputs): Session {
  return { ...s, inputs }
}

export function withAnswer(s: Session, decisionId: number, key: string): Session {
  return bump(s, { ...s.inputs, answers: { ...(s.inputs.answers ?? {}), [decisionId]: key } })
}

export function withApply(s: Session, vacancyId: number): Session {
  const apply = [...(s.inputs.apply ?? []).filter((id) => id !== vacancyId), vacancyId]
  const withdraw = (s.inputs.withdraw ?? []).filter((id) => id !== vacancyId)
  return bump(s, { ...s.inputs, apply, withdraw })
}

export function withWithdraw(s: Session, vacancyId: number): Session {
  const withdraw = [...(s.inputs.withdraw ?? []).filter((id) => id !== vacancyId), vacancyId]
  const apply = (s.inputs.apply ?? []).filter((id) => id !== vacancyId)
  return bump(s, { ...s.inputs, apply, withdraw })
}

export function withShape(s: Session, shape: Shape): Session {
  return bump(s, { ...s.inputs, shape })
}

export function withMentality(s: Session, mentality: Mentality): Session {
  return bump(s, { ...s.inputs, mentality })
}

export function withActivity(s: Session, activity: UnemployedActivity): Session {
  return bump(s, { ...s.inputs, activity })
}

export function withResign(s: Session, resign: boolean): Session {
  return bump(s, { ...s.inputs, resign })
}

export function withRetire(s: Session, retire: boolean): Session {
  return bump(s, { ...s.inputs, retire })
}

/** Is the human already applying (queued this week or lodged earlier) for a vacancy? */
export function isApplying(s: Session, vacancyId: number): boolean {
  if ((s.inputs.withdraw ?? []).includes(vacancyId)) return false
  if ((s.inputs.apply ?? []).includes(vacancyId)) return true
  const vacancy = s.world.vacancies[vacancyId - 1]
  return vacancy !== undefined && s.world.human !== null && vacancy.applicants.includes(s.world.human.managerId)
}

/** Starred decisions with no answer queued. */
export function blockingUnanswered(s: Session): Decision[] {
  const answers = s.inputs.answers ?? {}
  return pendingDecisions(s.world).filter((d) => d.blocking && answers[d.id] === undefined)
}

export function canAdvance(s: Session): boolean {
  return blockingUnanswered(s).length === 0
}

/** Play the week with the queued inputs. */
export function nextWeek(s: Session): Session {
  const from = s.world.week
  advanceWeek(s.world, s.inputs)
  return { world: s.world, inputs: { answers: {} }, shownFromWeek: from, turn: s.turn + 1 }
}

export function serialize(world: World): string {
  return JSON.stringify(world)
}

/** Parse a save, checking just enough shape to be a career world. */
export function parseSave(text: string): World {
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== 'object' || parsed === null) throw new Error('not a save file')
  const w = parsed as Partial<World>
  if (typeof w.week !== 'number' || !Array.isArray(w.managers) || !Array.isArray(w.clubs) || !Array.isArray(w.rng)) {
    throw new Error('not a Tenure save')
  }
  if (!w.human || typeof w.human !== 'object') throw new Error('this save has no human manager')
  return parsed as World
}
