/**
 * The minute engine (DESIGN.md "Match"): 0 to 90 plus stoppage, a pressure
 * lean from −100 to +100, chances from pressure and the bands resolved on
 * ratings and traits, fouls, cards, injuries, substitutions by rule, stats,
 * ratings, and a commentary line for every event. The state is plain data
 * with its own generator, so a watched match can pause, be saved and
 * resume; factsOf() turns the finished match into facts for the players.
 */
import { rngFromState, seedState, type Rng, type RngState } from '../rng.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { playerById } from '../lookup.js'
import { slotsOf, structureOf } from '../players/formations.js'
import { assisterWeight, effectiveRating, scorerWeight, type Rateable, type XiBands } from '../players/select.js'
import { renderText } from '../text/render.js'
import { cardChance, emptyStats, injuryChance, injuryWeeks, matchRating, type PlayerFacts, type Scorer, type SideFacts, type SideStats } from './aftermath.js'
import { chanceGate, chanceProfile, chanceRate, chanceShare, drawMatchDays, goalChance, keeperEffOf, mismatchScale, pressureLean, sideRating, type SideView } from './model.js'
import type { Formation, FormationSlot, Mentality, PlayerId, Result, Style, Trait, World } from '../types.js'
import type { Participant } from '../season/match.js'

export interface MatchPlayer extends Rateable {
  id: PlayerId
  name: string
  age: number
  traits: Trait[]
  /** The slot he plays; null on the bench. */
  slot: FormationSlot | null
  /** Condition at kick-off, the baseline for his rating. */
  startCondition: number
  on: boolean
  started: boolean
  minutes: number
  sentOff: boolean
  yellows: number
  injured: boolean
  injuryWeeks: number
  goals: number
  assists: number
  saves: number
  shots: number
  fouls: number
  /** Live rating in the match view; the record gets the full rating at full time. */
  live: number
}

export interface MatchSide {
  clubId: number
  name: string
  isHuman: boolean
  managerId: number | null
  tactical: number
  form: Result[]
  formation: Formation
  mentality: Mentality
  style: Style
  players: MatchPlayer[]
  subsUsed: number
  /** The side's last change, for the gap between voluntary substitutions. */
  lastSubMinute: number
  goals: number
  scorers: Scorer[]
  stats: SideStats
  /** The club's tier, for the width of the day's draw. */
  tier: number | null
  /** The day this side has and its keeper's form, drawn once at kick-off (DESIGN.md "Match": mismatch and upsets). */
  day: number
  keeperDay: number
}

export type EventKind = 'kickoff' | 'goal' | 'save' | 'miss' | 'block' | 'foul' | 'yellow' | 'red' | 'injury' | 'sub' | 'halftime' | 'secondhalf' | 'fulltime' | 'shootout' | 'mentality' | 'pressure'

export interface MatchEvent {
  minute: number
  kind: EventKind
  side: 'home' | 'away' | null
  playerId?: PlayerId
  text: string
  /** The match view stops here on its own. */
  pause: boolean
}

export interface MatchState {
  knockout: boolean
  bigGame: boolean
  minute: number
  /** Minutes actually played, both halves' stoppage included. */
  played: number
  half: 1 | 2
  /** Added time of the half in play, drawn at its start. */
  stoppage: number
  over: boolean
  /** −100 (away on top) to +100 (home on top). */
  pressure: number
  momentum: number
  home: MatchSide
  away: MatchSide
  events: MatchEvent[]
  rng: RngState
  shootoutWinnerId: number | null
  /** Minutes with the home side on top, for possession. */
  homeMinutes: number
  /** A neutral ground: no home lean. */
  neutral?: boolean
  /** The first leg's score carried into a second leg, from the home side's view. */
  aggregate?: { home: number; away: number }
}

function copyPlayer(world: World, id: PlayerId, slot: FormationSlot | null): MatchPlayer | null {
  const p = playerById(world, id)
  if (!p) return null
  return {
    id: p.id,
    name: p.name,
    age: p.age,
    rating: p.rating,
    condition: p.condition,
    morale: p.morale,
    traits: [...p.traits],
    position: p.position,
    side: p.side,
    slot,
    startCondition: p.condition,
    on: slot !== null,
    started: slot !== null,
    minutes: 0,
    sentOff: false,
    yellows: 0,
    injured: false,
    injuryWeeks: 0,
    goals: 0,
    assists: 0,
    saves: 0,
    shots: 0,
    fouls: 0,
    live: T.LIVE_RATING_START,
  }
}

export interface SideSetup {
  clubId: number
  name: string
  isHuman: boolean
  managerId: number | null
  participant: Participant
  xi: readonly PlayerId[]
  bench: readonly PlayerId[]
  formation: Formation
}

/** Build a match from two picked sides. One draw from the world's sequence seeds the match's own. */
export interface MatchOptions {
  neutral?: boolean
  aggregate?: { home: number; away: number } | null
  /** A cup tie: the day's draw is wider and the underdog is lifted (DESIGN.md "Match": mismatch and upsets). */
  cup?: boolean
}

export function createMatch(world: World, rng: Rng, home: SideSetup, away: SideSetup, knockout: boolean, bigGame = false, options: MatchOptions = {}): MatchState {
  const build = (s: SideSetup): MatchSide => {
    const slots = slotsOf(s.formation)
    const players: MatchPlayer[] = []
    s.xi.forEach((id, i) => {
      const p = copyPlayer(world, id, slots[i] ?? null)
      if (p) players.push(p)
    })
    for (const id of s.bench) {
      const p = copyPlayer(world, id, null)
      if (p) players.push(p)
    }
    return {
      clubId: s.clubId,
      name: s.name,
      isHuman: s.isHuman,
      managerId: s.managerId,
      tactical: s.participant.tactical,
      form: [...s.participant.form],
      formation: s.formation,
      mentality: s.participant.mentality,
      style: s.participant.style,
      players,
      subsUsed: 0,
      lastSubMinute: -T.SUB_MIN_GAP,
      goals: 0,
      scorers: [],
      stats: emptyStats(),
      tier: s.participant.tier ?? null,
      day: 0,
      keeperDay: 0,
    }
  }
  const seed = rng.int(1, 2147483647)
  const state: MatchState = {
    knockout,
    bigGame,
    minute: 0,
    played: 0,
    half: 1,
    stoppage: 0,
    over: false,
    pressure: 0,
    momentum: 0,
    home: build(home),
    away: build(away),
    events: [],
    rng: seedState(seed),
    shootoutWinnerId: null,
    homeMinutes: 0,
  }
  if (options.neutral) state.neutral = true
  if (options.aggregate) state.aggregate = { ...options.aggregate }
  const r = rngFromState(state.rng)
  state.stoppage = r.int(T.STOPPAGE_FIRST[0], T.STOPPAGE_FIRST[1])
  // The day both sides have, drawn once: variance the manager cannot see.
  const days = drawMatchDays(r, sideView(state, state.home), sideView(state, state.away), options.cup === true || knockout)
  state.home.day = days.home.day
  state.home.keeperDay = days.home.keeperDay
  state.away.day = days.away.day
  state.away.keeperDay = days.away.keeperDay
  push(state, 0, 'kickoff', null, undefined, false, {})
  return state
}

function onPitch(side: MatchSide): MatchPlayer[] {
  return side.players.filter((p) => p.on)
}

function scoreVars(state: MatchState): Record<string, string | number> {
  return { home: state.home.name, away: state.away.name, hg: state.home.goals, ag: state.away.goals }
}

function push(state: MatchState, minute: number, kind: EventKind, side: 'home' | 'away' | null, playerId: PlayerId | undefined, pause: boolean, vars: Record<string, string | number>, key: string = kind): MatchEvent {
  const text = renderText('commentary', key, { ...scoreVars(state), ...vars }, minute + state.events.length)
  const event: MatchEvent = { minute, kind, side, text, pause }
  if (playerId !== undefined) event.playerId = playerId
  state.events.push(event)
  return event
}

function slotOf(p: MatchPlayer): FormationSlot {
  return p.slot ?? { position: p.position, side: p.side === 'any' ? 'C' : p.side }
}

/** The side as it stands now: effective ratings of everyone on the pitch, read in bands as the pre-match model reads an XI. */
export function liveBands(state: MatchState, side: MatchSide): XiBands {
  const st = structureOf(side.formation)
  const ctx = { bigGame: state.bigGame }
  let total = 0
  let n = 0
  let defence = 0
  let midfield = 0
  let attack = 0
  let pace = 0
  let aerial = 0
  let leaders = 0
  let attackerWeight = 0
  let attackerSum = 0
  let keeperEff: number | null = null
  let defenderSum = 0
  let defenders = 0
  for (const p of onPitch(side)) {
    const slot = slotOf(p)
    const eff = effectiveRating(p, slot, ctx)
    total += eff
    n++
    if (slot.position === 'GK') keeperEff = eff
    if (slot.position === 'GK' || slot.position === 'D') defence += eff / 100
    else if (slot.position === 'M') midfield += eff / 100
    else attack += eff / 100
    if (slot.position === 'D') {
      defenderSum += eff
      defenders++
    }
    if (slot.position !== 'GK') {
      const w = scorerWeight(p)
      attackerWeight += w
      attackerSum += eff * w
    }
    if (p.traits.includes('pace')) pace++
    if (p.traits.includes('aerial')) aerial++
    if (p.traits.includes('leader')) leaders++
  }
  const strength = n ? total / n : 0
  return {
    strength,
    defence,
    midfield,
    attack,
    width: st.width,
    defenceWidth: st.defenceWidth,
    pace,
    aerial,
    leaders,
    attackerEff: attackerWeight > 0 ? attackerSum / attackerWeight : strength,
    keeperEff: keeperEff ?? strength - T.NO_KEEPER_PENALTY,
    defenderEff: defenders ? defenderSum / defenders : strength - T.NO_KEEPER_PENALTY,
    backLine: st.defence,
  }
}

/** The side as the shared model reads it, this minute. */
export function sideView(state: MatchState, side: MatchSide): SideView {
  const on = onPitch(side)
  const morale = on.length ? on.reduce((s, p) => s + p.morale, 0) / on.length : T.MORALE_INITIAL
  return { strength: 0, tactical: side.tactical, form: side.form, morale, mentality: side.mentality, style: side.style, bands: liveBands(state, side), tier: side.tier, day: side.day, keeperDay: side.keeperDay }
}

function withStrength(v: SideView): SideView {
  v.strength = v.bands.strength
  return v
}

/** Where pressure is heading this minute. */
export function pressureTarget(state: MatchState, home: SideView, away: SideView): number {
  return pressureLean(home, away, state.home.goals, state.away.goals, state.momentum, state.neutral === true)
}

function keeperOf(side: MatchSide): MatchPlayer | null {
  return onPitch(side).find((p) => p.slot?.position === 'GK') ?? null
}

function draw<P>(rng: Rng, items: P[], weight: (p: P) => number): P | null {
  const weights = items.map(weight)
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || items.length === 0) return null
  return rng.weighted(items, weights)
}

/** A chance for `us`: who takes it, and what comes of it. */
function chance(state: MatchState, rng: Rng, usKey: 'home' | 'away', themView: SideView, quality: number, scale: number): void {
  const us = state[usKey]
  const them = state[usKey === 'home' ? 'away' : 'home']
  const ctx = { bigGame: state.bigGame }
  const attackers = onPitch(us).filter((p) => p.slot?.position !== 'GK')
  const attacker = draw(rng, attackers, scorerWeight)
  if (!attacker) return
  const keeper = keeperOf(them)
  const defenders = onPitch(them).filter((p) => p.slot?.position === 'D')
  const attEff = effectiveRating(attacker, slotOf(attacker), ctx)
  // The governor: the same saturating curve the fast path reads, applied to the minute (DESIGN.md "Match": mismatch and upsets).
  const pGoal = Math.min(T.GOAL_P_MAX, goalChance(attEff, keeperEffOf(themView), themView.bands.defenderEff, quality) * scale)
  us.stats.shots++
  attacker.shots++
  const vars: Record<string, string | number> = { player: attacker.name, club: us.name, keeper: keeper ? keeper.name : 'the keeper' }
  if (rng.chance(pGoal)) {
    us.goals++
    us.stats.onTarget++
    attacker.goals++
    attacker.live += T.RATING_PER_GOAL
    let assist: MatchPlayer | null = null
    if (rng.chance(T.ASSIST_P)) assist = draw(rng, attackers.filter((p) => p.id !== attacker.id), assisterWeight)
    if (assist) {
      assist.assists++
      assist.live += T.RATING_PER_ASSIST
    }
    us.scorers.push({ playerId: attacker.id, name: attacker.name, assistId: assist ? assist.id : null, assist: assist ? assist.name : null, minute: state.minute })
    state.momentum += usKey === 'home' ? T.MOMENTUM_GOAL : -T.MOMENTUM_GOAL
    push(state, state.minute, 'goal', usKey, attacker.id, true, assist ? { ...vars, assist: assist.name } : vars, assist ? 'goal_assist' : 'goal')
    return
  }
  if (rng.chance(T.CORNER_SHARE)) us.stats.corners++
  const r = rng.float()
  if (r < T.SAVE_SHARE) {
    us.stats.onTarget++
    if (keeper) {
      keeper.saves++
      keeper.live += T.LIVE_RATING_SAVE
    }
    push(state, state.minute, 'save', usKey, attacker.id, false, vars)
  } else if (r < T.SAVE_SHARE + T.MISS_SHARE) {
    push(state, state.minute, 'miss', usKey, attacker.id, false, vars)
  } else {
    const defender = draw(rng, defenders, () => 1)
    push(state, state.minute, 'block', usKey, attacker.id, false, { ...vars, defender: defender ? defender.name : 'a defender' })
  }
}

/** Fouls and cards (DESIGN.md "Match": the pressing style, tough tacklers, the hot-headed). */
function fouls(state: MatchState, rng: Rng): void {
  const pHomeFouls = clamp(0.5 - state.pressure / 300, 0.2, 0.8)
  const pressingBoost = (side: MatchSide) => (side.style === 'pressing' ? T.STYLE_EFFECTS.pressing.fouls : 1)
  const p = T.FOUL_BASE * ((pressingBoost(state.home) + pressingBoost(state.away)) / 2)
  if (!rng.chance(p)) return
  const key: 'home' | 'away' = rng.float() < pHomeFouls ? 'home' : 'away'
  const side = state[key]
  const candidates = onPitch(side).filter((x) => x.slot?.position !== 'GK')
  // A booked player treads carefully (BOOKED_CAUTION), so second yellows stay rare.
  const fouler = draw(rng, candidates, (x) => cardChance(x, side.style).yellow * (x.yellows > 0 ? T.BOOKED_CAUTION : 1))
  if (!fouler) return
  side.stats.fouls++
  fouler.fouls++
  const cards = cardChance(fouler, side.style)
  const yellowP = (T.YELLOW_PER_FOUL * cards.yellow) / T.YELLOW_P
  const redP = (T.RED_PER_FOUL * cards.red) / T.RED_P
  const vars = { player: fouler.name, club: side.name }
  if (rng.chance(redP)) {
    sendOff(state, key, fouler, 'red', vars)
    return
  }
  if (rng.chance(yellowP)) {
    fouler.yellows++
    side.stats.yellows++
    fouler.live += T.LIVE_RATING_YELLOW
    if (fouler.yellows >= 2) {
      sendOff(state, key, fouler, 'second_yellow', vars)
      return
    }
    push(state, state.minute, 'yellow', key, fouler.id, false, vars)
    return
  }
  push(state, state.minute, 'foul', key, fouler.id, false, vars)
}

function sendOff(state: MatchState, key: 'home' | 'away', p: MatchPlayer, why: 'red' | 'second_yellow', vars: Record<string, string | number>): void {
  p.sentOff = true
  p.on = false
  p.live += T.LIVE_RATING_RED
  state[key].stats.reds++
  push(state, state.minute, 'red', key, p.id, true, vars, why)
}

/** Injuries by the injury rule; the injured needs a change. */
function injuries(state: MatchState, rng: Rng): void {
  for (const key of ['home', 'away'] as const) {
    if (!rng.chance(T.INJURY_MINUTE_P)) continue
    const side = state[key]
    const victim = draw(rng, onPitch(side), injuryChance)
    if (!victim) continue
    victim.injured = true
    victim.injuryWeeks = injuryWeeks(rng)
    victim.on = false
    // The AI replaces its own at once; only the human's injury is a pause, and a change to make.
    push(state, state.minute, 'injury', key, victim.id, side.isHuman, { player: victim.name, club: side.name })
    if (!side.isHuman) aiReplace(state, key, victim)
  }
}

/** Injured players off the pitch with nobody in their slot, while the side still has a change to make. */
export function injuredNeedingChange(state: MatchState, key: 'home' | 'away'): MatchPlayer[] {
  const side = state[key]
  if (state.over || side.subsUsed >= T.SUBS_MAX) return []
  if (!side.players.some((p) => !p.on && !p.sentOff && !p.injured && !p.started && p.minutes === 0)) return []
  return side.players.filter((p) => p.injured && !p.on && p.slot !== null && !side.players.some((q) => q.on && q.slot === p.slot))
}

/** The best bench player for a slot, or null. */
function bestBench(state: MatchState, side: MatchSide, slot: FormationSlot): MatchPlayer | null {
  const ctx = { bigGame: state.bigGame }
  let best: MatchPlayer | null = null
  let score = -Infinity
  for (const p of side.players) {
    if (p.on || p.sentOff || p.injured || p.started || p.minutes > 0) continue
    const s = effectiveRating(p, slot, ctx)
    if (s > score) {
      best = p
      score = s
    }
  }
  return best
}

/** A substitution: `off` leaves, `on` takes his slot. False if not allowed. */
export function substitute(state: MatchState, key: 'home' | 'away', offId: PlayerId, onId: PlayerId): boolean {
  const side = state[key]
  if (state.over) return false
  if (side.subsUsed >= T.SUBS_MAX) return false
  const off = side.players.find((p) => p.id === offId)
  const on = side.players.find((p) => p.id === onId)
  if (!off || !on) return false
  if (!(off.on || off.injured) || on.on || on.sentOff || on.injured || on.minutes > 0 || on.started) return false
  const slot = off.slot ?? slotOf(on)
  off.on = false
  on.on = true
  on.slot = slot
  side.subsUsed++
  side.lastSubMinute = state.minute
  push(state, state.minute, 'sub', key, on.id, false, { club: side.name, off: off.name, on: on.name })
  return true
}

function aiReplace(state: MatchState, key: 'home' | 'away', off: MatchPlayer): void {
  const side = state[key]
  if (side.subsUsed >= T.SUBS_MAX) return
  const slot = off.slot ?? slotOf(off)
  const on = bestBench(state, side, slot)
  if (on) substitute(state, key, off.id, on.id)
}

/** The best replacement on the bench for a player leaving the pitch, or null. */
export function bestReplacement(state: MatchState, key: 'home' | 'away', offId: PlayerId): PlayerId | null {
  const side = state[key]
  const off = side.players.find((p) => p.id === offId)
  if (!off) return null
  const on = bestBench(state, side, off.slot ?? slotOf(off))
  return on ? on.id : null
}

/**
 * AI managers by rule (DESIGN.md "Match"): chasing from SUB_CHASE_FROM goes
 * to attack and swaps a defender for a forward; holding a lead, or a point
 * against a better side, from SUB_HOLD_FROM goes to defend; a tired player
 * (condition below SUB_TIRED_BELOW) comes off from SUB_TIRED_FROM. Injuries
 * are replaced as they happen. Voluntary changes keep SUB_MIN_GAP apart.
 */
function aiDecisions(state: MatchState, rng: Rng, key: 'home' | 'away', views: { home: SideView; away: SideView }): void {
  const side = state[key]
  if (side.isHuman) return
  const other = state[key === 'home' ? 'away' : 'home']
  const canSub = side.subsUsed < T.SUBS_MAX && state.minute - side.lastSubMinute >= T.SUB_MIN_GAP
  if (state.minute >= T.SUB_CHASE_FROM && side.goals < other.goals && side.mentality !== 'attack') {
    side.mentality = 'attack'
    push(state, state.minute, 'mentality', key, undefined, false, { club: side.name, mentality: 'attack' })
    if (canSub) {
      const defender = onPitch(side).filter((p) => p.slot?.position === 'D').sort((a, b) => a.rating - b.rating)[0]
      const forward = side.players.find((p) => !p.on && !p.sentOff && !p.injured && !p.started && p.minutes === 0 && p.position === 'F')
      if (defender && forward && substitute(state, key, defender.id, forward.id)) forward.slot = { position: 'F', side: 'C' }
    }
    return
  }
  const better = sideRating(key === 'home' ? views.away : views.home) > sideRating(key === 'home' ? views.home : views.away)
  if (state.minute >= T.SUB_HOLD_FROM && (side.goals > other.goals || (side.goals === other.goals && better)) && side.mentality !== 'defend') {
    side.mentality = 'defend'
    push(state, state.minute, 'mentality', key, undefined, false, { club: side.name, mentality: 'defend' })
    return
  }
  // Three clear and the changes turn to rest: the freshest legs come off, not the tiredest on (DESIGN.md "Match": mismatch and upsets).
  const clear = side.goals - other.goals >= T.REST_LEAD
  if (canSub && (clear || state.minute >= T.SUB_TIRED_FROM)) {
    const outfield = onPitch(side).filter((p) => p.slot?.position !== 'GK')
    const tired = clear ? outfield.sort((a, b) => b.minutes - a.minutes)[0] : outfield.filter((p) => p.condition < T.SUB_TIRED_BELOW).sort((a, b) => a.condition - b.condition)[0]
    if (tired) aiReplace(state, key, tired)
  }
}

/** The human changes mentality while paused. */
export function setMentality(state: MatchState, key: 'home' | 'away', mentality: Mentality): void {
  const side = state[key]
  if (side.mentality === mentality) return
  side.mentality = mentality
  push(state, state.minute, 'mentality', key, undefined, false, { club: side.name, mentality })
}

/** Play one minute. Returns the events it produced. */
export function tick(state: MatchState): MatchEvent[] {
  if (state.over) return []
  const rng = rngFromState(state.rng)
  const before = state.events.length
  state.minute++
  state.played++
  const home = withStrength(sideView(state, state.home))
  const away = withStrength(sideView(state, state.away))
  // Pressure.
  const target = pressureTarget(state, home, away)
  state.pressure = clamp(state.pressure + T.PRESSURE_DRIFT * (target - state.pressure) + rng.normal(0, T.PRESSURE_NOISE_SD), -100, 100)
  state.momentum *= T.MOMENTUM_DECAY
  const share = chanceShare(state.pressure)
  if (rng.float() < share) state.homeMinutes++
  // Condition drains for everyone on the pitch.
  for (const key of ['home', 'away'] as const) {
    const side = state[key]
    const drain = (T.CONDITION_DRAIN_PER_90 / T.MATCH_MINUTES) * (side.style === 'pressing' ? T.STYLE_EFFECTS.pressing.drain : 1)
    for (const p of onPitch(side)) {
      p.minutes++
      p.condition = Math.max(0, p.condition - drain)
    }
  }
  // A chance?
  const chase = Math.abs(state.home.goals - state.away.goals)
  if (rng.chance(chanceRate(state.pressure, state.home.mentality, state.away.mentality, chase))) {
    const homeChance = rng.float() < share
    const usKey: 'home' | 'away' = homeChance ? 'home' : 'away'
    const us = homeChance ? home : away
    const them = homeChance ? away : home
    const underPressure = homeChance ? state.pressure < 0 : state.pressure > 0
    // A side this far clear is seeing the game out: it creates nothing else (DESIGN.md "Match": a leading side eases off).
    const clearBy = state[usKey].goals - state[usKey === 'home' ? 'away' : 'home'].goals
    if (clearBy < T.MARGIN_CEILING) {
      const profile = chanceProfile(us, them, underPressure)
      const scale = mismatchScale(home, away, state.pressure, chase)
      if (rng.chance(chanceGate(profile.frequency))) chance(state, rng, usKey, them, profile.quality, homeChance ? scale.home : scale.away)
    }
  }
  fouls(state, rng)
  injuries(state, rng)
  aiDecisions(state, rng, 'home', { home, away })
  aiDecisions(state, rng, 'away', { home, away })
  // The clock.
  if (state.half === 1 && state.minute >= 45 + state.stoppage) {
    state.half = 2
    state.stoppage = rng.int(T.STOPPAGE_SECOND[0], T.STOPPAGE_SECOND[1])
    state.minute = 45
    push(state, 45, 'halftime', null, undefined, true, {})
    push(state, 45, 'secondhalf', null, undefined, false, {})
  } else if (state.half === 2 && state.minute >= 90 + state.stoppage) {
    finish(state, rng)
  }
  return state.events.slice(before)
}

function finish(state: MatchState, rng: Rng): void {
  state.over = true
  const agg = state.aggregate ?? { home: 0, away: 0 }
  if (state.knockout && state.home.goals + agg.home === state.away.goals + agg.away) {
    const gap = (sideRating(withStrength(sideView(state, state.home))) - sideRating(withStrength(sideView(state, state.away)))) / 50
    const pHome = 0.5 + clamp(gap, -1, 1) * T.SHOOTOUT_STRENGTH_EDGE
    state.shootoutWinnerId = rng.chance(pHome) ? state.home.clubId : state.away.clubId
    push(state, state.minute, 'shootout', null, undefined, true, { winner: state.shootoutWinnerId === state.home.clubId ? state.home.name : state.away.name })
  }
  push(state, state.minute, 'fulltime', null, undefined, true, {})
  const total = state.played
  const onTop = total ? state.homeMinutes / total : 0.5
  state.home.stats.possession = Math.round(50 + T.POSSESSION_SWING * 100 * (onTop - 0.5))
  state.away.stats.possession = 100 - state.home.stats.possession
}

/** Play to the whistle. */
export function runToEnd(state: MatchState): void {
  let guard = 0
  while (!state.over && guard++ < 200) tick(state)
}

/**
 * To key events (DESIGN.md "Match"): play until an event the match screen
 * stops at — a goal, a red card, the human's injury needing a change, half
 * time, full time — or the whistle. Returns the events produced.
 */
export function runToNextPause(state: MatchState): MatchEvent[] {
  const before = state.events.length
  let guard = 0
  while (!state.over && guard++ < 200) {
    if (tick(state).some((e) => e.pause)) break
  }
  return state.events.slice(before)
}

/**
 * To full time (DESIGN.md "Match"): play to the whistle with the assistant
 * taking the human side's forced decisions on their defaults — an injured
 * player needing a change is replaced by the best on the bench.
 */
export function runToEndWithDefaults(state: MatchState): void {
  const assist = () => {
    for (const key of ['home', 'away'] as const) {
      if (!state[key].isHuman) continue
      for (const off of injuredNeedingChange(state, key)) aiReplace(state, key, off)
    }
  }
  assist()
  let guard = 0
  while (!state.over && guard++ < 200) {
    tick(state)
    assist()
  }
}

function resultFor(state: MatchState, key: 'home' | 'away'): Result {
  const us = state[key].goals
  const them = state[key === 'home' ? 'away' : 'home'].goals
  if (us > them) return 'W'
  if (us < them) return 'L'
  if (state.shootoutWinnerId === state[key].clubId) return 'W'
  if (state.shootoutWinnerId !== null) return 'L'
  return 'D'
}

/** The facts for the players' records, rated at full time. */
export function factsOf(state: MatchState, key: 'home' | 'away'): SideFacts {
  const side = state[key]
  const rng = rngFromState(state.rng)
  const result = resultFor(state, key)
  const ctx = { bigGame: state.bigGame }
  const played = side.players.filter((p) => p.minutes > 0)
  // Rated on what he brought at kick-off, not on how tired he finished.
  const effs = played.map((p) => effectiveRating({ ...p, condition: p.startCondition }, slotOf(p), ctx))
  const mean = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0
  const goalsAgainst = state[key === 'home' ? 'away' : 'home'].goals
  const players: PlayerFacts[] = played.map((p, i) => {
    const extra = p.saves * T.LIVE_RATING_SAVE + p.yellows * T.LIVE_RATING_YELLOW + (p.sentOff ? T.LIVE_RATING_RED : 0) + (p.minutes < T.MATCH_MINUTES / 2 ? T.LIVE_RATING_CAMEO : 0)
    return {
      playerId: p.id,
      started: p.started,
      minutes: p.minutes,
      goals: p.goals,
      assists: p.assists,
      yellows: p.yellows,
      red: p.sentOff,
      injuryWeeks: p.injuryWeeks,
      rating: matchRating(rng, p, effs[i] as number, mean, result, p.goals, p.assists, goalsAgainst, p.slot?.position ?? p.position, extra),
    }
  })
  return { clubId: side.clubId, players, scorers: [...side.scorers], stats: { ...side.stats } }
}

export function scoreline(state: MatchState): { homeGoals: number; awayGoals: number; shootoutWinnerId: number | null } {
  return { homeGoals: state.home.goals, awayGoals: state.away.goals, shootoutWinnerId: state.shootoutWinnerId }
}

export function playedMinutes(state: MatchState): number {
  return state.minute
}

export function roundPressure(state: MatchState): number {
  return round1(state.pressure)
}
