/**
 * The game controller: a session is the world plus the inputs queued for
 * the coming turn. Pure functions, no DOM, so it can be tested directly.
 */
import {
  advanceTurn,
  createCareer,
  discardWatched,
  inboxMark,
  pendingDecisions,
  runToEnd,
  setMentality,
  substitute,
  tick,
  type Background,
  type Decision,
  type HumanInputs,
  type InboxMark,
  type Formation,
  type MatchEvent,
  type MatchState,
  type Mentality,
  type PlayerId,
  type Selection,
  type Style,
  type UnemployedActivity,
  type WatchedWeek,
  type World,
} from '@tenure/engine'

export interface Session {
  world: World
  inputs: HumanInputs
  /** Where the last turn's post starts in the log. */
  shownFrom: InboxMark
  /** Where earlier turns started, most recent first, for reading back. */
  earlier: InboxMark[]
  /** Bumped every turn so React re-renders the mutated world. */
  turn: number
}

const EARLIER_KEPT = 30

export function newSession(seed: number, name: string, background: Background): Session {
  const world = createCareer(seed, { name: name.trim() || 'You', background })
  return { world, inputs: { answers: {} }, shownFrom: { index: 0, week: 0 }, earlier: [], turn: 0 }
}

/** A restored or imported world: show the most recent week's post. */
export function sessionFromWorld(world: World): Session {
  const week = Math.max(0, world.week - 1)
  const found = world.log.findIndex((e) => e.week >= week)
  const index = found < 0 ? world.log.length : found
  return { world, inputs: { answers: {} }, shownFrom: { index, week }, earlier: [], turn: 0 }
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

export function withFormation(s: Session, formation: Formation): Session {
  return bump(s, { ...s.inputs, tactic: { ...(s.inputs.tactic ?? {}), formation } })
}

export function withStyle(s: Session, style: Style): Session {
  return bump(s, { ...s.inputs, tactic: { ...(s.inputs.tactic ?? {}), style } })
}

export function withMentality(s: Session, mentality: Mentality): Session {
  return bump(s, { ...s.inputs, tactic: { ...(s.inputs.tactic ?? {}), mentality } })
}

export function withSelection(s: Session, selection: Partial<Selection>): Session {
  return bump(s, { ...s.inputs, selection: { ...(s.inputs.selection ?? {}), ...selection } })
}

/** Talk terms with one of your players: a contract decision arrives next turn. */
export function withContractOffer(s: Session, playerId: PlayerId): Session {
  const contractOffers = [...(s.inputs.contractOffers ?? []).filter((id) => id !== playerId), playerId]
  return bump(s, { ...s.inputs, contractOffers })
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

/** Is the human already applying (queued this turn or lodged earlier) for a vacancy? */
export function isApplying(s: Session, vacancyId: number): boolean {
  if ((s.inputs.withdraw ?? []).includes(vacancyId)) return false
  if ((s.inputs.apply ?? []).includes(vacancyId)) return true
  const vacancy = s.world.vacancies[vacancyId - 1]
  if (s.world.human?.declinedVacancies.includes(vacancyId)) return false
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

/** Continue: play the next fixture, or take the next step, with the queued inputs. A fixture of the human's stops first for the match view. */
export function nextTurn(s: Session): Session {
  const mark = inboxMark(s.world)
  advanceTurn(s.world, s.inputs, { watch: true })
  return {
    world: s.world,
    inputs: { answers: {} },
    shownFrom: mark,
    earlier: [s.shownFrom, ...s.earlier].slice(0, EARLIER_KEPT),
    turn: s.turn + 1,
  }
}

// --- The match view: a watched week lives in the world, so a save mid-match resumes at the same minute.

export function watched(s: Session): WatchedWeek | null {
  return s.world.human?.watched ?? null
}

/** The human's match, first in the watched week. */
export function humanMatch(s: Session): MatchState | null {
  return watched(s)?.matches[0] ?? null
}

/** Which side the human's club is on in the watched match. */
export function humanSide(s: Session): 'home' | 'away' {
  const m = humanMatch(s)
  const clubId = humanClubOf(s.world)
  return m && m.away.clubId === clubId ? 'away' : 'home'
}

function humanClubOf(world: World): number | null {
  const me = world.human ? world.managers[world.human.managerId - 1] : undefined
  if (!me || me.status.kind !== 'employed' || me.status.post.kind !== 'home') return null
  return me.status.post.clubId
}

/** One minute for every match in the watched week, in step. Returns the human match's new events. */
export function tickWatched(s: Session): MatchEvent[] {
  const w = watched(s)
  if (!w) return []
  let mine: MatchEvent[] = []
  w.matches.forEach((m, i) => {
    const events = tick(m)
    if (i === 0) mine = events
  })
  return mine
}

/** Straight to full time for every match in the week. */
export function skipWatched(s: Session): void {
  const w = watched(s)
  if (!w) return
  for (const m of w.matches) runToEnd(m)
}

export function substituteWatched(s: Session, offId: PlayerId, onId: PlayerId): boolean {
  const m = humanMatch(s)
  return m ? substitute(m, humanSide(s), offId, onId) : false
}

export function mentalityWatched(s: Session, mentality: Mentality): void {
  const m = humanMatch(s)
  if (m) setMentality(m, humanSide(s), mentality)
}

/** Back to the tactics screen: the prepared week is forgotten and read again on the next Continue. */
export function backFromPreMatch(s: Session): Session {
  discardWatched(s.world)
  return { ...s, turn: s.turn + 1 }
}

/** The mark to read from when the player has stepped back `turnsBack` turns. */
export function markFor(s: Session, turnsBack: number): InboxMark {
  if (turnsBack <= 0) return s.shownFrom
  return s.earlier[Math.min(turnsBack, s.earlier.length) - 1] ?? s.shownFrom
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
