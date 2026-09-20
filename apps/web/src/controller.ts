/**
 * The game controller: a session is the world plus the inputs queued for
 * the coming turn. Pure functions, no DOM, so it can be tested directly.
 */
import {
  tunables,
  advanceTurn,
  createCareer,
  discardWatched,
  inboxMark,
  injuredNeedingChange,
  matchPlayOf,
  pendingDecisions,
  runToEnd,
  runToEndWithDefaults,
  runToNextPause,
  setMatchPlay,
  setMentality,
  substitute,
  tick,
  type Background,
  type Decision,
  type HumanInputs,
  type InboxMark,
  type Formation,
  type MatchEvent,
  type MatchPlay,
  type MatchPlayer,
  type MatchState,
  type Mentality,
  type PlayerId,
  type Request,
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
/** Queue an ask of the board, the director or a player for the coming turn (DESIGN.md "Requests"); one of each kind per player. */
export function withRequest(s: Session, req: Request): Session {
  const same = (r: Request) => r.to === req.to && r.ask === req.ask && (r.playerId ?? null) === (req.playerId ?? null)
  const requests = [...(s.inputs.requests ?? []).filter((r) => !same(r)), req]
  return bump(s, { ...s.inputs, requests })
}

export function withoutRequest(s: Session, req: Request): Session {
  const requests = (s.inputs.requests ?? []).filter((r) => !(r.to === req.to && r.ask === req.ask && (r.playerId ?? null) === (req.playerId ?? null)))
  return bump(s, { ...s.inputs, requests })
}

export function requested(s: Session, req: Pick<Request, 'to' | 'ask'> & { playerId?: PlayerId }): boolean {
  return (s.inputs.requests ?? []).some((r) => r.to === req.to && r.ask === req.ask && (r.playerId ?? null) === (req.playerId ?? null))
}

/** Add to or take off the shortlist for the coming turn. */
export function withShortlist(s: Session, add: PlayerId[], remove: PlayerId[]): Session {
  const shortlistAdd = [...new Set([...(s.inputs.shortlistAdd ?? []).filter((id) => !remove.includes(id)), ...add])]
  const shortlistRemove = [...new Set([...(s.inputs.shortlistRemove ?? []).filter((id) => !add.includes(id)), ...remove])]
  return bump(s, { ...s.inputs, shortlistAdd, shortlistRemove })
}

/** The shortlist as it will stand after the turn: the saved one plus the queued changes. */
export function shortlistOf(s: Session): PlayerId[] {
  const ids = new Set(s.world.human?.shortlist ?? [])
  for (const id of s.inputs.shortlistAdd ?? []) ids.add(id)
  for (const id of s.inputs.shortlistRemove ?? []) ids.delete(id)
  return [...ids]
}

/** Call off a target agreed in principle before the window opens (DESIGN.md "Transfers", On arrival). */
export function withCancelAgreed(s: Session, playerId: PlayerId): Session {
  const cancelAgreed = [...(s.inputs.cancelAgreed ?? []).filter((id) => id !== playerId), playerId]
  return bump(s, { ...s.inputs, cancelAgreed })
}

export function withKeepAgreed(s: Session, playerId: PlayerId): Session {
  return bump(s, { ...s.inputs, cancelAgreed: (s.inputs.cancelAgreed ?? []).filter((id) => id !== playerId) })
}

export function cancellingAgreed(s: Session, playerId: PlayerId): boolean {
  return (s.inputs.cancelAgreed ?? []).includes(playerId)
}

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

/** To key events: the human's match to its next pause, the rest of the division kept in step. Returns the events produced. */
export function playToNextPause(s: Session): MatchEvent[] {
  const w = watched(s)
  const m = humanMatch(s)
  if (!w || !m) return []
  const events = runToNextPause(m)
  for (const other of w.matches.slice(1)) while (!other.over && other.played < m.played) tick(other)
  return events
}

/** To full time: the human's match to the whistle with the assistant's defaults, and the rest of the division with it. */
export function playToFullTime(s: Session): void {
  const w = watched(s)
  if (!w) return
  w.matches.forEach((m, i) => (i === 0 ? runToEndWithDefaults(m) : runToEnd(m)))
}

/** How Continue plays a match from the match screen (DESIGN.md "Interface", Result first). */
export function matchPlay(s: Session): MatchPlay {
  return matchPlayOf(s.world)
}

/** The toggle: a preference saved with the career. A new session object, so the shell re-renders and autosaves. */
export function withMatchPlay(s: Session, mode: MatchPlay): Session {
  setMatchPlay(s.world, mode)
  return { ...s }
}

/** In To key events an injury needing a change is a forced decision: the first such player, or null. */
export function forcedChange(s: Session): MatchPlayer | null {
  const m = humanMatch(s)
  if (!m) return null
  return injuredNeedingChange(m, humanSide(s))[0] ?? null
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
  // The calendar changed under phase 4 (DESIGN.md v0.10: 52 weeks); a week number from the old year means something else now.
  if (w.calendar !== tunables.SEASON_WEEKS) throw new Error(`this save is from an earlier calendar (${w.calendar ?? 46}-week seasons); start a new career`)
  return parsed as World
}
