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
    shape: player.preferredShape,
    mentality: 'balanced',
    declinedVacancies: [],
    windowChoice: null,
  }
  world.logPolicy = 'career'
  emit(world, 'career.started', { managerId: player.id, name: player.name, background: player.background, age: player.age, reputation: player.reputation, seed })
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
}

function postLabel(world: World, spell: Spell): { club: string; where: string } {
  const post = spell.post
  if (post.kind === 'home') {
    const club = world.clubs[post.clubId - 1]
    return { club: club ? club.name : `Club ${post.clubId}`, where: `tier ${club ? club.tier : '?'}` }
  }
  const league = world.foreign.find((l) => l.kind === post.league)
  const club = league?.clubs.find((c) => c.id === post.clubId)
  return { club: club ? club.name : `Club ${post.clubId}`, where: league ? league.name : 'abroad' }
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
  }
}
