import { rngFromState, seedState, type Rng } from '../rng.js'
import { emit } from '../events.js'
import { T } from '../tunables.js'
import type { Club, OwnerType, Tier, World } from '../types.js'
import { clubName, TownNamer } from './names.js'
import { createManagers } from '../managers/gen.js'
import { seatIncumbents } from '../tenure/spell.js'
import { resetTables } from '../season/table.js'
import { generateHomeSquads } from '../players/gen.js'

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10
}

/** Strength a squad drifts toward, set by wealth. */
export function gravityTarget(wealth: number): number {
  return clamp(T.GRAVITY_INTERCEPT + T.GRAVITY_SLOPE * wealth, 0, 100)
}

function drawOwnerType(rng: Rng): OwnerType {
  const types = Object.keys(T.OWNER_TYPE_WEIGHTS) as OwnerType[]
  return rng.weighted(types, types.map((t) => T.OWNER_TYPE_WEIGHTS[t]))
}

function makeClub(rng: Rng, id: number, tier: Tier, town: string): Club {
  const prestigeRange = T.PRESTIGE_BY_TIER[tier - 1]
  if (!prestigeRange) throw new Error(`no prestige range for tier ${tier}`)
  const prestige = rng.int(prestigeRange[0], prestigeRange[1])
  const wealth = Math.round(clamp(prestige + rng.normal(0, T.WEALTH_NOISE_SD), 0, 100))
  const strength = round1(clamp(gravityTarget(wealth) + rng.normal(0, T.STRENGTH_INITIAL_NOISE_SD), 1, 100))
  return {
    id,
    name: clubName(rng, town, T.CLUB_PLAIN_NAME_SHARE),
    city: town,
    region: rng.int(0, T.REGIONS - 1),
    tier,
    prestige,
    wealth,
    cash: 0,
    owner: {
      type: drawOwnerType(rng),
      ambition: round1(rng.float() * (T.AMBITION_RANGE[1] - T.AMBITION_RANGE[0]) + T.AMBITION_RANGE[0]),
    },
    fanPatience: rng.int(T.FAN_PATIENCE_RANGE[0], T.FAN_PATIENCE_RANGE[1]),
    squad: {
      strength,
      avgAge: rng.int(T.SQUAD_AGE_INITIAL_RANGE[0], T.SQUAD_AGE_INITIAL_RANGE[1]),
      size: rng.int(T.SQUAD_SIZE_RANGE[0], T.SQUAD_SIZE_RANGE[1]),
      morale: T.MORALE_INITIAL,
      academyInXi: 0,
    },
    wageBudget: round1(T.WAGE_BUDGET_PER_WEALTH_SQ * wealth * wealth),
    honours: [],
    rivals: [],
    managerId: null,
    form: [],
    formation: T.DEFAULT_FORMATION,
    style: 'possession',
    mentality: 'balanced',
    playerIds: [],
    netSpendThisSeason: 0,
    thisSeason: { cupFinals: 0, inBottomZone: false, academyPromoted: 0 },
    lastRelegatedSeason: null,
    pendingYouthGain: 0,
  }
}

/** Pair clubs with rivals inside their region, nearest tier first, symmetric. */
function assignRivals(rng: Rng, clubs: Club[]): void {
  const byRegion = new Map<number, Club[]>()
  for (const club of clubs) {
    const list = byRegion.get(club.region) ?? []
    list.push(club)
    byRegion.set(club.region, list)
  }
  for (const club of clubs) {
    if (club.rivals.length >= T.RIVALS_PER_CLUB) continue
    const candidates = (byRegion.get(club.region) ?? [])
      .filter((c) => c.id !== club.id && !club.rivals.includes(c.id) && c.rivals.length < T.RIVALS_PER_CLUB)
      .sort((a, b) => Math.abs(a.tier - club.tier) - Math.abs(b.tier - club.tier) || a.id - b.id)
    // Take the closest-tier candidates, breaking ties by seed order.
    const wanted = T.RIVALS_PER_CLUB - club.rivals.length
    const pool = candidates.slice(0, wanted + 2)
    rng.shuffle(pool)
    for (const rival of pool.slice(0, wanted)) {
      club.rivals.push(rival.id)
      rival.rivals.push(club.id)
    }
  }
  for (const club of clubs) club.rivals.sort((a, b) => a - b)
}

/** Build a fresh world from a seed. Same seed, same world. */
export function createWorld(seed: number): World {
  const world: World = {
    seed,
    rng: seedState(seed),
    week: 0,
    season: 1,
    clubs: [],
    europeanOpponents: [],
    managers: [],
    fixtures: [],
    tables: [],
    cups: [],
    europeanEntrants: [],
    spells: [],
    nextSpellId: 1,
    vacancies: [],
    nextVacancyId: 1,
    nextManagerId: 1,
    players: [],
    nextPlayerId: 1,
    human: null,
    logPolicy: 'full',
    log: [],
  }
  const rng = rngFromState(world.rng)
  const towns = new TownNamer(rng)
  let id = 1
  T.TIER_SIZES.forEach((count, index) => {
    const tier = (index + 1) as Tier
    for (let i = 0; i < count; i++) world.clubs.push(makeClub(rng, id++, tier, towns.next()))
  })
  assignRivals(rng, world.clubs)
  resetTables(world)
  emit(world, 'world.created', { seed, clubs: world.clubs.length })
  const assignments = createManagers(world, rng)
  world.nextManagerId = world.managers.length + 1
  seatIncumbents(world, rng, assignments)
  generateHomeSquads(world, rng)
  emit(world, 'managers.created', {
    total: world.managers.length,
    employed: world.managers.filter((m) => m.status.kind === 'employed').length,
  })
  // Season one's European places go to the most prestigious tier-1 clubs.
  world.europeanEntrants = world.clubs
    .filter((c) => c.tier === 1)
    .sort((a, b) => b.prestige - a.prestige || a.id - b.id)
    .slice(0, T.EUROPEAN_LEAGUE_PLACES + 1)
    .map((c) => c.id)
  return world
}
