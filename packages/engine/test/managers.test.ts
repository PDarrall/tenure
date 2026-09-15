import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { bandIndex, clubBandIndex, foreignBandIndex, isElite, tiersForReputation } from '../src/managers/reputation.js'
import * as T from '../src/tunables.js'

describe('manager population', () => {
  const world = createWorld(1)

  it('has the population size with unique ids and names', () => {
    expect(world.managers).toHaveLength(T.POPULATION)
    expect(new Set(world.managers.map((m) => m.id)).size).toBe(T.POPULATION)
    expect(new Set(world.managers.map((m) => m.name)).size).toBe(T.POPULATION)
  })

  it('seats exactly one incumbent at every home and foreign club', () => {
    for (const club of world.clubs) {
      const manager = world.managers.find((m) => m.id === club.managerId)
      expect(manager).toBeDefined()
      expect(manager!.status).toMatchObject({ kind: 'employed', post: { kind: 'home', clubId: club.id } })
    }
    for (const league of world.foreign) {
      for (const club of league.clubs) {
        const manager = world.managers.find((m) => m.id === club.managerId)
        expect(manager).toBeDefined()
        expect(manager!.status).toMatchObject({
          kind: 'employed',
          post: { kind: 'abroad', league: league.kind, clubId: club.id },
        })
      }
    }
    const employed = world.managers.filter((m) => m.status.kind === 'employed')
    const posts = world.clubs.length + world.foreign.reduce((n, l) => n + l.clubs.length, 0)
    expect(employed).toHaveLength(posts)
  })

  it('starts everyone else unemployed at entry age with no record', () => {
    const entrants = world.managers.filter((m) => m.status.kind === 'unemployed')
    expect(entrants.length).toBe(T.POPULATION - world.clubs.length - world.foreign.reduce((n, l) => n + l.clubs.length, 0))
    for (const m of entrants) {
      expect(m.age).toBeGreaterThanOrEqual(T.START_AGE_RANGE[0])
      expect(m.age).toBeLessThanOrEqual(T.START_AGE_RANGE[1])
      expect(m.history.spellIds).toEqual([])
      expect(m.history.games).toBe(0)
      expect(m.status.kind).toBe('unemployed')
      expect(m.tags).toEqual([])
      // Entry reputation plus the widest background offset stays inside the bottom two bands.
      expect(m.reputation).toBeLessThan(40)
    }
  })

  it('gives incumbents a reputation matching their tier band', () => {
    for (const club of world.clubs) {
      const manager = world.managers.find((m) => m.id === club.managerId)!
      const [lo, hi] = T.INCUMBENT_REPUTATION_BY_TIER[club.tier - 1] as [number, number]
      const widest = Math.max(...Object.values(T.BACKGROUND_OFFSETS).map((o) => Math.abs(o.reputation)))
      expect(manager.reputation).toBeGreaterThanOrEqual(lo - widest)
      expect(manager.reputation).toBeLessThanOrEqual(hi + widest)
    }
  })

  it('applies background offsets to trust and ability', () => {
    for (const m of world.managers) {
      const o = T.BACKGROUND_OFFSETS[m.background]
      expect(m.trust.players).toBe(Math.max(0, Math.min(100, T.TRUST_BASE + o.playersTrust)))
      expect(m.trust.board).toBe(Math.max(0, Math.min(100, T.TRUST_BASE + o.boardTrust)))
      for (const v of Object.values(m.ability)) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(100)
      }
    }
    const byBackground = (b: string) => world.managers.filter((m) => m.background === b)
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean(byBackground('coach').map((m) => m.ability.tactical))).toBeGreaterThan(
      mean(byBackground('ex-pro').map((m) => m.ability.tactical)),
    )
    expect(mean(byBackground('analyst').map((m) => m.ability.dealing))).toBeGreaterThan(
      mean(byBackground('coach').map((m) => m.ability.dealing)),
    )
  })

  it('is deterministic and JSON-safe', () => {
    const again = createWorld(1)
    expect(again.managers).toEqual(world.managers)
    expect(JSON.parse(JSON.stringify(world.managers))).toEqual(world.managers)
  })

  it('logs managers.created', () => {
    expect(world.log.some((e) => e.type === 'managers.created')).toBe(true)
  })
})

describe('reputation bands', () => {
  it('maps reputation to the DESIGN bands', () => {
    expect(tiersForReputation(0)).toEqual([5])
    expect(tiersForReputation(19)).toEqual([5])
    expect(tiersForReputation(20)).toEqual([4])
    expect(tiersForReputation(40)).toEqual([3])
    expect(tiersForReputation(60)).toEqual([2])
    expect(tiersForReputation(75)).toEqual([1])
    expect(tiersForReputation(95)).toEqual([1])
    expect(bandIndex(95)).toBe(5)
    expect(T.REPUTATION_BANDS[bandIndex(95)]!.elite).toBe(true)
  })

  it('maps foreign leagues to bands', () => {
    expect(foreignBandIndex('small')).toBe(0)
    expect(foreignBandIndex('mid')).toBe(3)
    expect(foreignBandIndex('big')).toBe(5)
  })

  it('marks the top tier-1 clubs by prestige as elite', () => {
    const world = createWorld(1)
    const elite = world.clubs.filter((c) => isElite(world, c))
    expect(elite).toHaveLength(T.ELITE_PRESTIGE_RANK)
    for (const c of elite) {
      expect(c.tier).toBe(1)
      expect(clubBandIndex(world, c)).toBe(5)
    }
    const ordinaryTop = world.clubs.find((c) => c.tier === 1 && !isElite(world, c))!
    expect(clubBandIndex(world, ordinaryTop)).toBe(4)
    const tierFour = world.clubs.find((c) => c.tier === 4)!
    expect(clubBandIndex(world, tierFour)).toBe(1)
  })
})
