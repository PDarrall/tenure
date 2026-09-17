/**
 * What a match does to the players who played it (DESIGN.md "Players").
 * A match produces facts: who played how long, who scored and assisted,
 * cards, injuries, a rating out of ten. The one-shot model draws those
 * facts here; the minute engine (match/minute.ts) produces them minute by
 * minute. applyFacts then writes them into the players: stats, condition,
 * bans, injuries, morale, growth, debut tags and bonds.
 */
import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { clamp, round1 } from '../world/gen.js'
import { playerById } from '../lookup.js'
import { slotsOf } from '../players/formations.js'
import { assisterWeight, effectiveRating, scorerWeight, type Rateable } from '../players/select.js'
import { hasTrait } from '../players/traits.js'
import { bondForStart, growWithMinutes, tagPlayer } from '../players/made.js'
import type { Fixture, Formation, Player, PlayerId, Position, Result, Style, Tier, World } from '../types.js'

export interface Scorer {
  playerId: PlayerId
  name: string
  assistId: PlayerId | null
  assist: string | null
  minute?: number
}

export interface PlayerFacts {
  playerId: PlayerId
  started: boolean
  minutes: number
  goals: number
  assists: number
  yellows: number
  red: boolean
  /** Weeks out from an injury picked up in this match, 0 for none. */
  injuryWeeks: number
  rating: number
}

export interface SideStats {
  shots: number
  onTarget: number
  possession: number
  corners: number
  fouls: number
  yellows: number
  reds: number
}

export interface SideFacts {
  clubId: number
  players: PlayerFacts[]
  scorers: Scorer[]
  stats: SideStats
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
  tier: Tier | null
}

/** Draw one player by weight. */
function drawWeighted<P extends Rateable>(rng: Rng, players: P[], weight: (p: P) => number): P | null {
  const weights = players.map(weight)
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  return rng.weighted(players, weights)
}

/** Who scored and who made it, for a side's goals. */
export function attributeGoals<P extends Rateable & { id: number; name: string }>(rng: Rng, xi: P[], goals: number): Scorer[] {
  const out: Scorer[] = []
  for (let g = 0; g < goals; g++) {
    const scorer = drawWeighted(rng, xi, scorerWeight)
    if (!scorer) break
    let assist: P | null = null
    if (rng.chance(T.ASSIST_P)) assist = drawWeighted(rng, xi.filter((p) => p.id !== scorer.id), assisterWeight)
    out.push({ playerId: scorer.id, name: scorer.name, assistId: assist ? assist.id : null, assist: assist ? assist.name : null })
  }
  return out
}

/** Chance of a yellow this match: tough tacklers and the hot-headed pick up more, pressing sides foul more. */
export function cardChance(p: Rateable, style: Style): { yellow: number; red: number } {
  if (p.position === 'GK') return { yellow: T.YELLOW_P * T.GK_CARD_SHARE, red: T.RED_P * T.GK_CARD_SHARE }
  let yellow = T.YELLOW_P
  let red = T.RED_P
  if (p.traits.includes('tough tackler')) yellow *= T.TOUGH_TACKLER_CARD_MULT
  if (p.traits.includes('hot-headed')) {
    yellow *= T.HOT_HEADED_CARD_MULT
    red *= T.HOT_HEADED_RED_MULT
  }
  if (style === 'pressing') yellow *= T.STYLE_EFFECTS.pressing.fouls
  return { yellow, red }
}

/** Chance of an injury this match: low condition and the injury-prone raise it. */
export function injuryChance(p: Rateable): number {
  let chance = T.INJURY_P_PER_MATCH
  if (p.condition < T.CONDITION_INJURY_FROM) chance *= T.INJURY_LOW_CONDITION_MULT
  if (p.traits.includes('injury-prone')) chance *= T.INJURY_PRONE_MULT
  return chance
}

/** Weeks out: mostly short, sometimes long. DESIGN: 1–20. */
export function injuryWeeks(rng: Rng): number {
  const u = rng.float()
  return clamp(Math.ceil(T.INJURY_MAX_WEEKS * u * u), T.INJURY_MIN_WEEKS, T.INJURY_MAX_WEEKS)
}

/** A match rating out of ten from the player's events, his side's result and his level against the XI's. */
export function matchRating(rng: Rng, p: Rateable, eff: number, xiMean: number, result: Result, goals: number, assists: number, goalsAgainst: number, slot: Position, extra = 0): number {
  let r = T.RATING_BASE + extra
  r += result === 'W' ? T.RATING_WIN : result === 'D' ? T.RATING_DRAW : T.RATING_LOSS
  r += (eff - xiMean) / T.RATING_PER_POINT
  r += goals * T.RATING_PER_GOAL + assists * T.RATING_PER_ASSIST
  if (slot === 'GK' || slot === 'D') r += goalsAgainst === 0 ? T.RATING_CLEAN_SHEET : -T.RATING_PER_GOAL_CONCEDED * goalsAgainst
  if (!p.traits.includes('consistent')) r += rng.normal(0, T.RATING_NOISE_SD)
  return round1(clamp(r, T.RATING_MIN, T.RATING_MAX))
}

/** Morale after a match for everyone in the squad: the result, playing time, a leader in the side. */
export function moraleAfterMatch(squad: Player[], played: Set<PlayerId>, result: Result, motivation: number, leaderPlayed: boolean): void {
  const resultMove = result === 'W' ? T.PLAYER_MORALE_WIN * (T.MORALE_WIN_MOTIVATION_BASE + motivation / 100) : result === 'L' ? T.PLAYER_MORALE_LOSS * (T.MORALE_LOSS_MOTIVATION_BASE - motivation / 100) : 0
  for (const p of squad) {
    let delta = resultMove
    delta += played.has(p.id) ? T.PLAYER_MORALE_STARTED : T.PLAYER_MORALE_LEFT_OUT
    if (leaderPlayed && played.has(p.id)) delta += T.LEADER_MORALE_LIFT
    p.morale = round1(clamp(p.morale + delta, 0, 100))
  }
}

export function emptyStats(): SideStats {
  return { shots: 0, onTarget: 0, possession: 50, corners: 0, fouls: 0, yellows: 0, reds: 0 }
}

/** The one-shot model's facts: goals attributed, cards, injuries and ratings drawn for the eleven who played ninety minutes. */
export function oneShotFacts(world: World, rng: Rng, side: SideInput): SideFacts {
  const xiPlayers: Player[] = []
  const slots = slotsOf(side.formation)
  side.xi.forEach((id) => {
    const p = playerById(world, id)
    if (p) xiPlayers.push(p)
  })
  const scorers = attributeGoals(rng, xiPlayers, side.goalsFor)
  const goalsBy = new Map<PlayerId, number>()
  const assistsBy = new Map<PlayerId, number>()
  for (const s of scorers) {
    goalsBy.set(s.playerId, (goalsBy.get(s.playerId) ?? 0) + 1)
    if (s.assistId !== null) assistsBy.set(s.assistId, (assistsBy.get(s.assistId) ?? 0) + 1)
  }
  const effs = xiPlayers.map((p, i) => effectiveRating(p, slots[i] ?? { position: p.position, side: p.side === 'any' ? 'C' : p.side }))
  const xiMean = effs.length ? effs.reduce((a, b) => a + b, 0) / effs.length : 0
  const stats = emptyStats()
  const players: PlayerFacts[] = xiPlayers.map((p, i) => {
    const slot = slots[i]
    const position: Position = slot ? slot.position : p.position
    const goals = goalsBy.get(p.id) ?? 0
    const assists = assistsBy.get(p.id) ?? 0
    const rating = matchRating(rng, p, effs[i] as number, xiMean, side.result, goals, assists, side.goalsAgainst, position)
    let yellows = 0
    let red = false
    const cards = cardChance(p, side.style)
    if (rng.chance(cards.red)) red = true
    else if (rng.chance(cards.yellow)) yellows = 1
    const injury = rng.chance(injuryChance(p)) ? injuryWeeks(rng) : 0
    stats.yellows += yellows
    stats.reds += red ? 1 : 0
    return { playerId: p.id, started: true, minutes: T.MATCH_MINUTES, goals, assists, yellows, red, injuryWeeks: injury, rating }
  })
  stats.shots = side.goalsFor + Math.round(T.ONE_SHOT_SHOTS_PER_GOAL * side.goalsFor + T.ONE_SHOT_SHOTS_BASE)
  stats.onTarget = side.goalsFor + Math.round(T.ONE_SHOT_SHOTS_BASE / 2)
  return { clubId: side.clubId, players, scorers, stats }
}

/** Write the facts into the players: stats, condition, cards and bans, injuries, growth, tags and bonds, morale. */
export function applyFacts(world: World, side: SideInput, facts: SideFacts, squadIds: readonly PlayerId[]): void {
  const played = new Set<PlayerId>()
  const manager = side.managerId === null ? undefined : world.managers[side.managerId - 1]
  const inPost = manager && manager.id === side.managerId ? manager : undefined
  const drain = T.CONDITION_DRAIN_PER_90 * (side.style === 'pressing' ? T.STYLE_EFFECTS.pressing.drain : 1)
  let leaderPlayed = false
  for (const f of facts.players) {
    const p = playerById(world, f.playerId)
    if (!p || p.retired || f.minutes <= 0) continue
    played.add(p.id)
    if (hasTrait(p, 'leader')) leaderPlayed = true
    p.season.apps++
    if (f.started) p.season.starts++
    p.season.minutes += f.minutes
    if (!p.debuted) {
      p.debuted = true
      if (inPost) tagPlayer(world, p, inPost, { id: side.clubId, ...(side.tier === null ? {} : { tier: side.tier }) }, 'debut')
    }
    if (f.started) bondForStart(p, side.managerId)
    growWithMinutes(p, f.minutes, side.development, side.managerId)
    p.season.goals += f.goals
    p.season.assists += f.assists
    p.season.ratingSum += f.rating
    p.season.rated++
    p.condition = round1(clamp(p.condition - (drain * f.minutes) / T.MATCH_MINUTES, 0, T.CONDITION_MAX))
    if (f.red) {
      p.season.reds++
      p.suspension += world.rng ? redBan(world, p.id) : T.RED_BAN[0]
      emit(world, 'player.suspended', { playerId: p.id, clubId: side.clubId, name: p.name, matches: p.suspension, reason: 'red', season: world.season })
    }
    for (let y = 0; y < f.yellows; y++) {
      p.season.yellows++
      p.yellows++
      const ban = T.YELLOW_BANS[String(p.yellows)]
      if (ban !== undefined) {
        p.suspension += ban
        emit(world, 'player.suspended', { playerId: p.id, clubId: side.clubId, name: p.name, matches: ban, reason: 'yellows', yellows: p.yellows, season: world.season })
      }
    }
    if (f.injuryWeeks > 0) {
      p.injuryWeeks = f.injuryWeeks
      emit(world, 'player.injured', { playerId: p.id, clubId: side.clubId, name: p.name, weeks: f.injuryWeeks, season: world.season })
    }
  }
  // Everyone else: a ban served is a match sat out.
  const squad: Player[] = []
  for (const id of squadIds) {
    const p = playerById(world, id)
    if (!p || p.retired) continue
    squad.push(p)
    if (!played.has(p.id) && p.suspension > 0) p.suspension--
  }
  moraleAfterMatch(squad, played, side.result, side.motivation, leaderPlayed)
}

/** A red card's ban, drawn from the world's own sequence so the one-shot and the minute engine agree on the range. */
function redBan(world: World, salt: number): number {
  const [lo, hi] = T.RED_BAN
  // Deterministic in the fact, not a fresh draw: the world's RNG state is not consumed here.
  const w = world.rng[0] ^ salt
  return lo + (Math.abs(w) % (hi - lo + 1))
}

/** The one-shot path: draw the facts and apply them. Returns the facts for the log. */
export function applySide(world: World, rng: Rng, _fixture: Fixture, side: SideInput, squadIds: readonly PlayerId[]): SideFacts {
  const facts = oneShotFacts(world, rng, side)
  applyFacts(world, side, facts, squadIds)
  return facts
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
