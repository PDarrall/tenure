/**
 * What a match does to the players who played it (DESIGN.md "Players"):
 * goals and assists drawn by position and trait, a rating out of ten, minutes
 * and condition, injuries, cards and the bans they bring, morale. The
 * one-shot model calls this after the score; the minute engine (phase 3c)
 * produces the same facts minute by minute.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { playerById } from '../lookup.js'
import { slotsOf } from '../players/formations.js'
import { effectiveRating } from '../players/select.js'
import { hasTrait } from '../players/traits.js'
import { bondForStart, growWithMinutes, tagPlayer } from '../players/made.js'
import type { Fixture, Formation, Player, PlayerId, Position, Result, Style, World } from '../types.js'

export interface Scorer {
  playerId: PlayerId
  name: string
  assistId: PlayerId | null
  assist: string | null
}

export interface SideInput {
  clubId: number
  xi: readonly PlayerId[]
  bench: readonly PlayerId[]
  formation: Formation
  style: Style
  goalsFor: number
  goalsAgainst: number
  result: Result
  /** Manager's motivation ability for the morale move, or the caretaker figure. */
  motivation: number
  /** Manager in post, for the log. */
  managerId: number | null
  /** Manager's development ability, for growth. */
  development: number
  /** The club's tier, for the tag. */
  tier: import('../types.js').Tier | null
}

/** Draw one player from the XI by weight. */
function drawWeighted(rng: Rng, players: Player[], weight: (p: Player) => number): Player | null {
  const weights = players.map(weight)
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  return rng.weighted(players, weights)
}

/** Scorers by position, poachers weighted up (the poacher rule). */
export function scorerWeight(p: Player): number {
  const base = T.SCORER_POSITION_WEIGHTS[p.position]
  return base * (hasTrait(p, 'poacher') ? T.POACHER_SCORER_MULT : 1) * (p.rating / 100)
}

/** Assisters by position, playmakers weighted up (the playmaker rule). */
export function assisterWeight(p: Player): number {
  const base = T.ASSIST_POSITION_WEIGHTS[p.position]
  return base * (hasTrait(p, 'playmaker') ? T.PLAYMAKER_ASSIST_MULT : 1) * (p.rating / 100)
}

/** Who scored and who made it, for a side's goals. */
export function attributeGoals(rng: Rng, xi: Player[], goals: number): Scorer[] {
  const out: Scorer[] = []
  for (let g = 0; g < goals; g++) {
    const scorer = drawWeighted(rng, xi, scorerWeight)
    if (!scorer) break
    let assist: Player | null = null
    if (rng.chance(T.ASSIST_P)) assist = drawWeighted(rng, xi.filter((p) => p.id !== scorer.id), assisterWeight)
    out.push({ playerId: scorer.id, name: scorer.name, assistId: assist ? assist.id : null, assist: assist ? assist.name : null })
  }
  return out
}

/** Chance of a yellow this match: tough tacklers and the hot-headed pick up more, pressing sides foul more. */
export function cardChance(p: Player, style: Style): { yellow: number; red: number } {
  if (p.position === 'GK') return { yellow: T.YELLOW_P * T.GK_CARD_SHARE, red: T.RED_P * T.GK_CARD_SHARE }
  let yellow = T.YELLOW_P
  let red = T.RED_P
  if (hasTrait(p, 'tough tackler')) yellow *= T.TOUGH_TACKLER_CARD_MULT
  if (hasTrait(p, 'hot-headed')) {
    yellow *= T.HOT_HEADED_CARD_MULT
    red *= T.HOT_HEADED_RED_MULT
  }
  if (style === 'pressing') yellow *= T.STYLE_EFFECTS.pressing.fouls
  return { yellow, red }
}

/** Chance of an injury this match: low condition and the injury-prone raise it. */
export function injuryChance(p: Player): number {
  let chance = T.INJURY_P_PER_MATCH
  if (p.condition < T.CONDITION_INJURY_FROM) chance *= T.INJURY_LOW_CONDITION_MULT
  if (hasTrait(p, 'injury-prone')) chance *= T.INJURY_PRONE_MULT
  return chance
}

/** Weeks out: mostly short, sometimes long. DESIGN: 1–20. */
export function injuryWeeks(rng: Rng): number {
  const u = rng.float()
  return clamp(Math.ceil(T.INJURY_MAX_WEEKS * u * u), T.INJURY_MIN_WEEKS, T.INJURY_MAX_WEEKS)
}

/** A match rating out of ten from the player's events, his side's result and his level against the XI's. */
export function matchRating(rng: Rng, p: Player, eff: number, xiMean: number, result: Result, goals: number, assists: number, goalsAgainst: number, slot: Position): number {
  let r = T.RATING_BASE
  r += result === 'W' ? T.RATING_WIN : result === 'D' ? T.RATING_DRAW : T.RATING_LOSS
  r += (eff - xiMean) / T.RATING_PER_POINT
  r += goals * T.RATING_PER_GOAL + assists * T.RATING_PER_ASSIST
  if (slot === 'GK' || slot === 'D') r += goalsAgainst === 0 ? T.RATING_CLEAN_SHEET : -T.RATING_PER_GOAL_CONCEDED * goalsAgainst
  if (!hasTrait(p, 'consistent')) r += rng.normal(0, T.RATING_NOISE_SD)
  return round1(clamp(r, T.RATING_MIN, T.RATING_MAX))
}

/** Morale after a match for everyone in the squad: the result, playing time, a leader in the side. */
export function moraleAfterMatch(squad: Player[], xi: Set<PlayerId>, result: Result, motivation: number, leaderPlayed: boolean): void {
  const resultMove = result === 'W' ? T.PLAYER_MORALE_WIN * (T.MORALE_WIN_MOTIVATION_BASE + motivation / 100) : result === 'L' ? T.PLAYER_MORALE_LOSS * (T.MORALE_LOSS_MOTIVATION_BASE - motivation / 100) : 0
  for (const p of squad) {
    let delta = resultMove
    delta += xi.has(p.id) ? T.PLAYER_MORALE_STARTED : T.PLAYER_MORALE_LEFT_OUT
    if (leaderPlayed && xi.has(p.id)) delta += T.LEADER_MORALE_LIFT
    p.morale = round1(clamp(p.morale + delta, 0, 100))
  }
}

export interface SideAftermath {
  scorers: Scorer[]
  injured: { playerId: PlayerId; name: string; weeks: number }[]
  yellows: number
  reds: number
  banned: { playerId: PlayerId; name: string; matches: number }[]
  ratings: Record<number, number>
}

/** Apply one side's aftermath. `squadIds` is everyone at the club, played or not. */
export function applySide(world: World, rng: Rng, fixture: Fixture, side: SideInput, squadIds: readonly PlayerId[]): SideAftermath {
  const xiPlayers: Player[] = []
  const slots = slotsOf(side.formation)
  side.xi.forEach((id) => {
    const p = playerById(world, id)
    if (p) xiPlayers.push(p)
  })
  const xiSet = new Set(side.xi)
  const scorers = attributeGoals(rng, xiPlayers, side.goalsFor)
  const goalsBy = new Map<PlayerId, number>()
  const assistsBy = new Map<PlayerId, number>()
  for (const s of scorers) {
    goalsBy.set(s.playerId, (goalsBy.get(s.playerId) ?? 0) + 1)
    if (s.assistId !== null) assistsBy.set(s.assistId, (assistsBy.get(s.assistId) ?? 0) + 1)
  }
  const effs = xiPlayers.map((p, i) => effectiveRating(p, slots[i] ?? { position: p.position, side: p.side === 'any' ? 'C' : p.side }))
  const xiMean = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0
  const out: SideAftermath = { scorers, injured: [], yellows: 0, reds: 0, banned: [], ratings: {} }
  const drain = T.CONDITION_DRAIN_PER_90 * (side.style === 'pressing' ? T.STYLE_EFFECTS.pressing.drain : 1)

  xiPlayers.forEach((p, i) => {
    const slot = slots[i]
    const position: Position = slot ? slot.position : p.position
    // Minutes and the record.
    p.season.apps++
    p.season.starts++
    p.season.minutes += T.MATCH_MINUTES
    const manager = side.managerId === null ? undefined : world.managers[side.managerId - 1]
    if (!p.debuted) {
      p.debuted = true
      if (manager && manager.id === side.managerId) tagPlayer(world, p, manager, { id: side.clubId, ...(side.tier === null ? {} : { tier: side.tier }) }, 'debut')
    }
    bondForStart(p, side.managerId)
    growWithMinutes(p, T.MATCH_MINUTES, side.development, side.managerId)
    const goals = goalsBy.get(p.id) ?? 0
    const assists = assistsBy.get(p.id) ?? 0
    p.season.goals += goals
    p.season.assists += assists
    const rating = matchRating(rng, p, effs[i] as number, xiMean, side.result, goals, assists, side.goalsAgainst, position)
    p.season.ratingSum += rating
    p.season.rated++
    out.ratings[p.id] = rating
    // Condition.
    p.condition = round1(clamp(p.condition - drain, 0, T.CONDITION_MAX))
    // Cards.
    const cards = cardChance(p, side.style)
    if (rng.chance(cards.red)) {
      p.season.reds++
      out.reds++
      p.suspension += rng.int(T.RED_BAN[0], T.RED_BAN[1])
      out.banned.push({ playerId: p.id, name: p.name, matches: p.suspension })
      emit(world, 'player.suspended', { playerId: p.id, clubId: side.clubId, name: p.name, matches: p.suspension, reason: 'red', season: world.season })
    } else if (rng.chance(cards.yellow)) {
      p.season.yellows++
      p.yellows++
      out.yellows++
      const ban = T.YELLOW_BANS[String(p.yellows)]
      if (ban !== undefined) {
        p.suspension += ban
        out.banned.push({ playerId: p.id, name: p.name, matches: ban })
        emit(world, 'player.suspended', { playerId: p.id, clubId: side.clubId, name: p.name, matches: ban, reason: 'yellows', yellows: p.yellows, season: world.season })
      }
    }
    // Injuries.
    if (rng.chance(injuryChance(p))) {
      const weeks = injuryWeeks(rng)
      p.injuryWeeks = weeks
      out.injured.push({ playerId: p.id, name: p.name, weeks })
      emit(world, 'player.injured', { playerId: p.id, clubId: side.clubId, name: p.name, weeks, season: world.season })
    }
  })
  // Everyone else: a ban served is a match sat out.
  const squad: Player[] = []
  for (const id of squadIds) {
    const p = playerById(world, id)
    if (!p || p.retired) continue
    squad.push(p)
    if (!xiSet.has(p.id) && p.suspension > 0) p.suspension--
  }
  moraleAfterMatch(squad, xiSet, side.result, side.motivation, xiPlayers.some((p) => hasTrait(p, 'leader')))
  return out
}

/** Weekly upkeep for every live player: condition recovers, injuries heal, morale settles. No randomness. */
export function playersWeekly(world: World): void {
  for (const p of world.players) {
    if (!p || p.retired) continue
    if (p.condition < T.CONDITION_MAX) p.condition = round1(Math.min(T.CONDITION_MAX, p.condition + T.CONDITION_RECOVERY_PER_WEEK))
    if (p.injuryWeeks > 0) p.injuryWeeks--
    p.morale = round1(p.morale + T.PLAYER_MORALE_DECAY * (T.MORALE_INITIAL - p.morale))
  }
}

/** Average rating over a season's record. */
export function averageRating(stats: { ratingSum: number; rated: number }): number | null {
  return stats.rated ? Math.round((stats.ratingSum / stats.rated) * 100) / 100 : null
}
