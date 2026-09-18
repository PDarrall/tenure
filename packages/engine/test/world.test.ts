import { describe, expect, it } from 'vitest'
import { createWorld } from '../src/world/gen.js'
import { runWeeks } from '../src/sim/advance.js'
import { digestWorld } from '../src/digest.js'
import { T } from '../src/tunables.js'

describe('world generation', () => {
  it('seed 1 always produces the same world', () => {
    const world = createWorld(1)
    expect(digestWorld(world)).toMatchSnapshot()
  })

  it('is deterministic across two builds and a JSON round-trip', () => {
    const a = createWorld(1)
    const b = createWorld(1)
    expect(a).toEqual(b)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
  })

  it('differs for a different seed', () => {
    expect(createWorld(1).clubs.map((c) => c.name)).not.toEqual(createWorld(2).clubs.map((c) => c.name))
  })

  it('builds the pyramid with the right tier sizes', () => {
    const world = createWorld(1)
    T.TIER_SIZES.forEach((size, i) => {
      expect(world.clubs.filter((c) => c.tier === i + 1)).toHaveLength(size)
    })
    expect(world.clubs.length).toBe(T.TIER_SIZES.reduce((a, b) => a + b, 0))
  })

  it('gives every club a unique id and name and every field in range', () => {
    const world = createWorld(3)
    const ids = new Set(world.clubs.map((c) => c.id))
    const names = new Set(world.clubs.map((c) => c.name))
    expect(ids.size).toBe(world.clubs.length)
    expect(names.size).toBe(world.clubs.length)
    for (const club of world.clubs) {
      const [lo, hi] = T.PRESTIGE_BY_TIER[club.tier - 1] as [number, number]
      expect(club.prestige).toBeGreaterThanOrEqual(lo)
      expect(club.prestige).toBeLessThanOrEqual(hi)
      expect(club.wealth).toBeGreaterThanOrEqual(0)
      expect(club.wealth).toBeLessThanOrEqual(100)
      expect(club.squad.strength).toBeGreaterThan(0)
      expect(club.squad.strength).toBeLessThanOrEqual(100)
      expect(club.owner.ambition).toBeGreaterThanOrEqual(T.AMBITION_RANGE[0])
      expect(club.owner.ambition).toBeLessThanOrEqual(T.AMBITION_RANGE[1])
      expect(['patient', 'normal', 'impatient', 'erratic']).toContain(club.owner.type)
      expect(club.honours).toEqual([])
    }
  })

  it('keeps rivalries symmetric, within a region, and capped', () => {
    const world = createWorld(1)
    const byId = new Map(world.clubs.map((c) => [c.id, c]))
    let withRivals = 0
    for (const club of world.clubs) {
      expect(club.rivals.length).toBeLessThanOrEqual(T.RIVALS_PER_CLUB)
      if (club.rivals.length > 0) withRivals++
      for (const rid of club.rivals) {
        const rival = byId.get(rid)
        expect(rival).toBeDefined()
        expect(rival!.region).toBe(club.region)
        expect(rival!.rivals).toContain(club.id)
      }
    }
    expect(withRivals).toBeGreaterThan(world.clubs.length * 0.8)
  })

  it('has no foreign leagues: every post is a home club, and the European field is generated with the season', () => {
    const world = createWorld(1)
    expect(world.europeanOpponents).toEqual([])
    runWeeks(world, 1)
    expect(world.europeanOpponents).toHaveLength(T.EUROPEAN_OPPONENTS)
    const names = new Set(world.europeanOpponents.map((o) => o.name))
    expect(names.size).toBe(T.EUROPEAN_OPPONENTS)
    for (const o of world.europeanOpponents) {
      expect(o.id).toBeGreaterThanOrEqual(T.EUROPEAN_OPPONENT_ID_BASE)
      expect(o.strength).toBeGreaterThan(20)
      expect(o.playerIds).toEqual([])
    }
    const european = world.cups.find((c) => c.competition === 'european')!
    expect(european.remaining).toHaveLength(T.EUROPEAN_LEAGUE_PLACES + 1 + T.EUROPEAN_OPPONENTS)
  })

  it('logs a world.created event at week 0', () => {
    const world = createWorld(1)
    expect(world.log[0]).toMatchObject({ week: 0, type: 'world.created', payload: { seed: 1 } })
  })
})
