/**
 * A career: a world with one human manager in it. The human starts with no
 * record, unemployed, in the same pool as the AI entrants.
 */
import { rngFromState } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import { createWorld } from '../world/gen.js'
import { makeEntrant } from '../managers/gen.js'
import { ManagerNamer } from '../managers/names.js'
import { spellById } from '../lookup.js'
import { careerScore, type Score } from '../scoring/score.js'
import type { Background, Honour, ManagerTag, Nationality, Spell, World } from '../types.js'
import { human } from './decisions.js'
import { madePlayers, type MadePlayerSummary } from '../players/made.js'
import { firstOffer } from '../market/agent.js'
import { rollOutcome } from './bets.js'

export interface CareerOptions {
  name: string
  background: Background
  nationality?: Nationality
}

export function createCareer(seed: number, options: CareerOptions): World {
  const world = createWorld(seed)
  const rng = rngFromState(world.rng)
  const namer = new ManagerNamer(rng, world.managers.map((m) => m.name))
  const fixed: { name: string; background: Background; nationality?: Nationality } = { name: options.name, background: options.background }
  if (options.nationality) fixed.nationality = options.nationality
  const player = makeEntrant(rng, namer, world.nextManagerId++, 0, fixed)
  player.isHuman = true
  world.managers.push(player)
  world.human = {
    managerId: player.id,
    pending: [],
    nextDecisionId: 1,
    tactic: { formation: player.preferredFormation, mentality: 'balanced', style: player.style },
    selection: { xi: [], bench: [], captain: null, autoPick: true },
    declinedVacancies: [],
    windowChoice: null,
    contractChoices: {},
    watched: null,
    agentWithdrawn: [],
  }
  world.logPolicy = 'career'
  emit(world, 'career.started', { managerId: player.id, name: player.name, background: player.background, age: player.age, reputation: player.reputation, seed })
  // Day one: one offer on the table (DESIGN.md "Job market", the start).
  firstOffer(world, rng)
  return world
}

export interface SpellSummary {
  spellId: number
  club: string
  where: string
  fromSeason: number
  toSeason: number | null
  seasons: number
  endReason: string | null
  finishes: number[]
}

export interface CareerSummary {
  name: string
  age: number
  background: Background
  status: string
  reputation: number
  score: Score
  spells: SpellSummary[]
  honours: Honour[]
  tags: ManagerTag[]
  seasonsManaged: number
  /** Players made, ordered by points under the manager, with what became of each. */
  playersMade: MadePlayerSummary[]
  /** The gambles (DESIGN.md "Decisions are bets"): bold options taken, how many paid, and the net of every roll by unit. */
  gambles: Gambles
}

export interface Gambles {
  taken: number
  paid: number
  cost: number
  net: { credit: number; reputation: number; morale: number }
  /** The last few rolls, newest first, for the career page. */
  recent: { week: number; kind: string; label: string; unit: string; effect: number; bold: boolean }[]
}

/** Every roll of the human's dice, from the log. */
export function gamblesFromLog(world: World, managerId: number): Gambles {
  const out: Gambles = { taken: 0, paid: 0, cost: 0, net: { credit: 0, reputation: 0, morale: 0 }, recent: [] }
  for (const e of world.log) {
    if (e.type !== 'decision.rolled' || e.payload['managerId'] !== managerId) continue
    const unit = e.payload['unit'] as keyof Gambles['net']
    const effect = e.payload['effect'] as number
    const bold = e.payload['bold'] === true
    out.net[unit] = Math.round((out.net[unit] + effect) * 10) / 10
    if (bold) {
      out.taken++
      const outcome = rollOutcome(effect, unit)
      if (outcome === 'paid') out.paid++
      else if (outcome === 'cost') out.cost++
    }
    out.recent.unshift({ week: e.week, kind: String(e.payload['kind']), label: String(e.payload['label'] ?? e.payload['key']), unit, effect, bold })
    if (out.recent.length > T.CAREER_RECENT_ROLLS) out.recent.pop()
  }
  return out
}

function postLabel(world: World, spell: Spell): { club: string; where: string } {
  const club = world.clubs[spell.post.clubId - 1]
  return { club: club ? club.name : `Club ${spell.post.clubId}`, where: `tier ${club ? club.tier : '?'}` }
}

/** The career page: who they were, where they went, what they won. */
export function careerSummary(world: World): CareerSummary {
  const player = human(world)
  const spells = player.history.spellIds.map((id) => {
    const spell = spellById(world, id)
    const { club, where } = postLabel(world, spell)
    const end = spell.endWeek ?? world.week
    return {
      spellId: spell.id,
      club,
      where,
      fromSeason: Math.floor(spell.startWeek / T.SEASON_WEEKS) + 1,
      toSeason: spell.endWeek === null ? null : Math.floor(spell.endWeek / T.SEASON_WEEKS) + 1,
      seasons: Math.round(((end - spell.startWeek) / T.SEASON_WEEKS) * 10) / 10,
      endReason: spell.endReason,
      finishes: player.history.seasons.filter((s) => s.post.kind === spell.post.kind && s.post.clubId === spell.post.clubId).map((s) => s.finish),
    }
  })
  const status =
    player.status.kind === 'employed'
      ? `managing ${postLabel(world, spellById(world, player.status.spellId)).club}`
      : player.status.kind === 'unemployed'
        ? `out of work (${player.status.activity})`
        : `career over (${player.status.reason})`
  return {
    name: player.name,
    age: player.age,
    background: player.background,
    status,
    reputation: player.reputation,
    score: careerScore(player),
    spells,
    honours: player.history.honours,
    tags: player.tags,
    seasonsManaged: Math.round(spells.reduce((s, sp) => s + sp.seasons, 0) * 10) / 10,
    playersMade: madePlayers(world, player.id),
    gambles: gamblesFromLog(world, player.id),
  }
}
