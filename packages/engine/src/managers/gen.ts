import type { Rng } from '../rng.js'
import { emit } from '../events.js'
import * as T from '../tunables.js'
import { clamp } from '../world/gen.js'
import type {
  Ability,
  Background,
  ForeignLeagueKind,
  Manager,
  Nationality,
  Post,
  Shape,
  Tier,
  World,
} from '../types.js'
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
}

function makeManager(rng: Rng, namer: ManagerNamer, id: number, draft: Draft, cohortSeason: number): Manager {
  const background = drawBackground(rng)
  const offsets = T.BACKGROUND_OFFSETS[background]
  const ability = drawAbility(rng, draft.abilityBonus)
  ability.tactical = clamp(ability.tactical + offsets.tactical, 0, 100)
  ability.development = clamp(ability.development + offsets.development, 0, 100)
  ability.dealing = clamp(ability.dealing + offsets.dealing, 0, 100)
  const shapes: Shape[] = ['A', 'B', 'C']
  return {
    id,
    name: namer.next(draft.nationality),
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
    preferredShape: rng.pick(shapes),
    history: {
      spellIds: [],
      honours: [],
      earnings: 0,
      games: 0,
      trophyPoints: 0,
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
export function makeEntrant(rng: Rng, namer: ManagerNamer, id: number, cohortSeason: number): Manager {
  return makeManager(
    rng,
    namer,
    id,
    {
      nationality: drawNationality(rng, 'home', T.HOME_NATIONAL_SHARE),
      age: rng.int(T.START_AGE_RANGE[0], T.START_AGE_RANGE[1]),
      reputation: rng.int(T.ENTRY_REPUTATION_RANGE[0], T.ENTRY_REPUTATION_RANGE[1]),
      abilityBonus: 0,
    },
    cohortSeason,
  )
}

/**
 * Populate the world at genesis: an incumbent at every home and foreign club,
 * then entrants up to POPULATION, all unemployed.
 */
export function createManagers(world: World, rng: Rng): void {
  const namer = new ManagerNamer(rng)
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
    seat(world, manager, { kind: 'home', clubId: club.id })
    world.managers.push(manager)
  }

  for (const league of world.foreign) {
    const range = T.INCUMBENT_REPUTATION_ABROAD[league.kind]
    for (const club of league.clubs) {
      const manager = makeManager(
        rng,
        namer,
        id++,
        {
          nationality: drawNationality(rng, league.kind, T.FOREIGN_NATIONAL_SHARE),
          age: rng.int(T.INCUMBENT_AGE_RANGE[0], T.INCUMBENT_AGE_RANGE[1]),
          reputation: rng.int(range[0], range[1]),
          abilityBonus: 0,
        },
        0,
      )
      seat(world, manager, { kind: 'abroad', league: league.kind, clubId: club.id })
      world.managers.push(manager)
    }
  }

  while (world.managers.length < T.POPULATION) {
    world.managers.push(makeEntrant(rng, namer, id++, 0))
  }

  emit(world, 'managers.created', {
    total: world.managers.length,
    employed: world.managers.filter((m) => m.status.kind === 'employed').length,
  })
}

/** Put a manager in a post and point the club back at them. */
export function seat(world: World, manager: Manager, post: Post): void {
  manager.status = { kind: 'employed', post }
  if (post.kind === 'home') {
    const club = world.clubs.find((c) => c.id === post.clubId)
    if (!club) throw new Error(`seat: no home club ${post.clubId}`)
    club.managerId = manager.id
  } else {
    const club = foreignClub(world, post.league, post.clubId)
    club.managerId = manager.id
  }
}

export function foreignClub(world: World, league: ForeignLeagueKind, clubId: number) {
  const found = world.foreign.find((l) => l.kind === league)?.clubs.find((c) => c.id === clubId)
  if (!found) throw new Error(`no foreign club ${clubId} in ${league}`)
  return found
}

export function tierOf(post: Post, world: World): Tier | null {
  if (post.kind !== 'home') return null
  const club = world.clubs.find((c) => c.id === post.clubId)
  return club ? club.tier : null
}
