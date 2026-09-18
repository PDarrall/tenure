import type { Rng } from '../rng.js'
import { T } from '../tunables.js'
import { clamp } from '../world/gen.js'
import type { Ability, Background, Formation, Manager, Nationality, Post, Style, World } from '../types.js'
import { FORMATION_NAMES } from '../players/formations.js'
import { ManagerNamer } from './names.js'

function drawBackground(rng: Rng): Background {
  const kinds = Object.keys(T.BACKGROUND_WEIGHTS) as Background[]
  return rng.weighted(kinds, kinds.map((k) => T.BACKGROUND_WEIGHTS[k]))
}

function drawNationality(rng: Rng, native: Nationality, nativeShare: number): Nationality {
  if (rng.chance(nativeShare)) return native
  const others = (['home', 'big', 'mid', 'small'] as Nationality[]).filter((n) => n !== native)
  return rng.pick(others)
}

function drawAbility(rng: Rng, bonus: number): Ability {
  const draw = () => clamp(rng.int(T.ABILITY_RANGE[0], T.ABILITY_RANGE[1]) + bonus, 0, 100)
  return { tactical: draw(), motivation: draw(), development: draw(), dealing: draw() }
}

interface Draft {
  nationality: Nationality
  age: number
  reputation: number
  abilityBonus: number
  /** Fixed by the player rather than drawn. */
  name?: string
  background?: Background
}

function makeManager(rng: Rng, namer: ManagerNamer, id: number, draft: Draft, cohortSeason: number): Manager {
  const background = draft.background ?? drawBackground(rng)
  const offsets = T.BACKGROUND_OFFSETS[background]
  const ability = drawAbility(rng, draft.abilityBonus)
  ability.tactical = clamp(ability.tactical + offsets.tactical, 0, 100)
  ability.development = clamp(ability.development + offsets.development, 0, 100)
  ability.dealing = clamp(ability.dealing + offsets.dealing, 0, 100)
  const styles: Style[] = ['possession', 'direct', 'counter', 'pressing']
  const preferredFormation: Formation = rng.weighted(FORMATION_NAMES, T.FORMATION_WEIGHTS)
  const style = rng.weighted(styles, T.STYLE_WEIGHTS)
  const youthLean = rng.chance(T.AI_YOUTH_FIRST_SHARE) ? 'youth-first' : 'results-first'
  return {
    id,
    name: draft.name ?? namer.next(draft.nationality),
    nationality: draft.nationality,
    age: draft.age,
    seasonGames: 0,
    background,
    reputation: clamp(draft.reputation + offsets.reputation, 0, 100),
    agent: rng.int(T.AGENT_RANGE[0], T.AGENT_RANGE[1]),
    tags: [],
    ability,
    trust: {
      players: clamp(T.TRUST_BASE + offsets.playersTrust, 0, 100),
      board: clamp(T.TRUST_BASE + offsets.boardTrust, 0, 100),
    },
    preferredFormation,
    style,
    youthLean,
    history: {
      spellIds: [],
      honours: [],
      earnings: 0,
      games: 0,
      trophyPoints: 0,
      playersMade: 0,
      walkouts: 0,
      steppedDown: false,
      seasons: [],
    },
    status: { kind: 'unemployed', sinceWeek: 0, activity: 'wait', monthsSinceShortlisted: 0 },
    cohortSeason,
    isHuman: false,
  }
}

/** A brand-new entrant: no record, small reputation, starting age. */
export function makeEntrant(
  rng: Rng,
  namer: ManagerNamer,
  id: number,
  cohortSeason: number,
  fixed: { name?: string; background?: Background; nationality?: Nationality } = {},
): Manager {
  const draft: Draft = {
    nationality: fixed.nationality ?? drawNationality(rng, 'home', T.HOME_NATIONAL_SHARE),
    age: rng.int(T.START_AGE_RANGE[0], T.START_AGE_RANGE[1]),
    reputation: rng.int(T.ENTRY_REPUTATION_RANGE[0], T.ENTRY_REPUTATION_RANGE[1]),
    abilityBonus: 0,
  }
  if (fixed.name !== undefined) draft.name = fixed.name
  if (fixed.background !== undefined) draft.background = fixed.background
  return makeManager(rng, namer, id, draft, cohortSeason)
}

export interface Assignment {
  managerId: number
  post: Post
}

/**
 * Populate the world at genesis: an incumbent for every club (returned as
 * assignments for the tenure system to seat), then entrants up to
 * POPULATION. Everyone starts unemployed here.
 */
export function createManagers(world: World, rng: Rng): Assignment[] {
  const namer = new ManagerNamer(rng)
  const assignments: Assignment[] = []
  let id = 1

  for (const club of world.clubs) {
    const range = T.INCUMBENT_REPUTATION_BY_TIER[club.tier - 1]
    if (!range) throw new Error(`no incumbent reputation range for tier ${club.tier}`)
    const manager = makeManager(
      rng,
      namer,
      id++,
      {
        nationality: drawNationality(rng, 'home', T.HOME_NATIONAL_SHARE),
        age: rng.int(T.INCUMBENT_AGE_RANGE[0], T.INCUMBENT_AGE_RANGE[1]),
        reputation: rng.int(range[0], range[1]),
        abilityBonus: (5 - club.tier) * T.INCUMBENT_ABILITY_PER_TIER,
      },
      0,
    )
    assignments.push({ managerId: manager.id, post: { kind: 'home', clubId: club.id } })
    world.managers.push(manager)
  }

  while (world.managers.length < T.POPULATION) {
    world.managers.push(makeEntrant(rng, namer, id++, 0))
  }

  return assignments
}
